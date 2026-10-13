import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureWorkspace, editWorkspace, acknowledge, rebaseConflict, mergeRemote, deletedRemotely, mutationPriority, prepareCalendarMutation, type QueuedMutation } from '../lib/storage'
import { cloud, identityScope } from '../lib/cloud'
import { useAuth } from './Auth'
import { emptyWorkspace } from '../lib/program'
import { isDeletion, type MutationKind, type MutationPayload, type Workout, type Workspace } from '../lib/model'

interface WorkspaceValue {
  data: Workspace; loading: boolean; pending: QueuedMutation[]; syncing: boolean; online: boolean;
  error: string | null; clearError: () => void; scope: string; edit: (fn: (data: Workspace) => { kind: MutationKind; payload: MutationPayload }[]) => Promise<void>;
  sync: () => Promise<void>; resolve: (item: QueuedMutation, keepLocal: boolean) => Promise<void>
}
const WorkspaceContext = createContext<WorkspaceValue>(null!)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { identity, local } = useAuth(), scope = identityScope(identity!)
  const row = useLiveQuery(() => db.workspaces.get(scope), [scope])
  const pending = useLiveQuery(() => db.mutations.where('scope').equals(scope).sortBy('createdAt'), [scope]) || []
  const syncLock = useRef(false)
  const [error, setError] = useState<string | null>(null), [syncing, setSyncing] = useState(false), [online, setOnline] = useState(navigator.onLine)
  useEffect(() => { void ensureWorkspace(scope).catch(() => setError('Η αποθήκευση στη συσκευή απέτυχε. Ελέγξτε τον διαθέσιμο χώρο.')) }, [scope])
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) } }, [])
  const fetchRemote = async () => {
    const response = await cloud!.rpc('get_workspace')
    if (response.error) throw response.error
    return response.data as Workspace
  }
  const pull = async () => {
    const remote = await fetchRemote()
    await db.transaction('rw', db.workspaces, db.mutations, async () => {
      const saved = await db.workspaces.get(scope), queued = await db.mutations.where('scope').equals(scope).toArray()
      await db.mutations.bulkDelete(queued.filter(item => deletedRemotely(remote, item)).map(item => item.key))
      await db.workspaces.put({ scope, data: mergeRemote(saved?.data || emptyWorkspace(), remote, queued) })
    })
  }
  const sync = async () => {
    if (!cloud || local || !navigator.onLine || syncLock.current) return
    syncLock.current = true; setSyncing(true)
    try {
      const queued = await db.mutations.where('scope').equals(scope).sortBy('createdAt')
      queued.sort((a, b) => mutationPriority(a) - mutationPriority(b))
      for (const snapshot of queued) {
        const item = await db.mutations.get(snapshot.key)
        if (!item || item.conflict) continue
        // A workout deletion also cancels queued private notes. Do not send a
        // superseded mutation from the snapshot taken at the start of sync.
        const stored = await db.workspaces.get(scope), currentQueue = await db.mutations.where('scope').equals(scope).toArray()
        const payload = prepareCalendarMutation(stored?.data || emptyWorkspace(), item, currentQueue)
        if (!payload) continue
        const { data, error: saveError } = await cloud.rpc(isDeletion(payload) ? 'delete_record' : 'save_record', { kind: item.kind, payload, expected_revision: item.baseRevision, operation_id: item.operationId })
        if (saveError) {
          if (/revision_conflict|record_deleted|workout_finished|calendar_conflict|calendar_locked|calendar_link_changed|active_workout_exists/.test(saveError.message)) await db.mutations.update(item.key, { conflict: true })
          else { await db.mutations.update(item.key, { error: 'Η αλλαγή αποθηκεύτηκε τοπικά. Ο συγχρονισμός θα επαναληφθεί.' }); throw saveError }
        } else await acknowledge(scope, { ...item, payload }, data as number)
      }
      await pull()
    } catch {
      setError('Η σύνδεση με το cloud δεν ολοκληρώθηκε. Τα δεδομένα παραμένουν ασφαλή σε αυτή τη συσκευή.')
    } finally { syncLock.current = false; setSyncing(false) }
  }
  useEffect(() => {
    if (!row || !cloud || local) return
    const id = window.setInterval(() => { void sync() }, 12000)
    void sync()
    return () => window.clearInterval(id)
    // Sync is scheduled by account/connectivity, not by every field change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, online, Boolean(row), local])
  const resolve = async (item: QueuedMutation, keepLocal: boolean) => {
    try {
      const remote = await fetchRemote()
      if (deletedRemotely(remote, item)) { await db.mutations.delete(item.key); await pull(); setError(null); return }
      const record: MutationPayload | undefined = item.kind === 'program' ? remote.program : item.kind === 'workout' ? remote.workouts.find(w => w.id === item.entityId) : item.kind === 'calendar' ? remote.calendarSessions?.find(s => s.id === item.entityId) : item.kind === 'weighin' ? remote.weighIns.find(w => w.id === item.entityId) : item.kind === 'note' ? remote.notes.find(w => w.id === item.entityId) : remote.goals[item.entityId as 'anna' | 'dimitra']
      if (keepLocal && item.kind === 'calendar') {
        const session = remote.calendarSessions?.find(s => s.id === item.entityId)
        if (session?.workoutId) throw new Error('Η προγραμματισμένη προπόνηση έχει ήδη ξεκινήσει. Χρησιμοποιήστε την online έκδοση.')
      }
      if (keepLocal && item.kind === 'workout' && !record && !isDeletion(item.payload) && (item.payload as Workout).scheduleId) {
        // Preserve a competing local draft as unscheduled rather than overwrite
        // another device's calendar link or lose its entered sets.
        const workout = { ...(item.payload as Workout) }; delete workout.scheduleId; delete workout.scheduleRevision
        await db.transaction('rw', db.workspaces, db.mutations, async () => {
          const saved = await db.workspaces.get(scope)
          if (saved) { saved.data.workouts = saved.data.workouts.map(w => w.id === workout.id ? workout : w); await db.workspaces.put(saved) }
          await db.mutations.update(item.key, { payload: workout })
        })
      }
      if (keepLocal) await rebaseConflict(scope, item.key, record?.revision || 0)
      else await db.mutations.delete(item.key)
      await pull(); setError(null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Δεν ήταν δυνατή η ανάκτηση της online έκδοσης. Δοκιμάστε όταν υπάρχει σύνδεση.') }
  }
  return <WorkspaceContext.Provider value={{ data: row?.data || emptyWorkspace(), loading: !row, pending, syncing, online, scope, error, clearError: () => setError(null), sync, resolve, edit: async fn => {
    if (identity?.role === 'spectator') throw new Error('Ο λογαριασμός θεατή επιτρέπει μόνο προβολή.')
    try { await editWorkspace(scope, !local, workspace => {
      const changes = fn(workspace)
      if (changes.some(change => change.kind === 'calendar') && (identity?.role !== 'coach' || (!local && workspace.calendarEnabled !== true))) throw new Error('Ο προγραμματισμός προπονήσεων δεν είναι διαθέσιμος για αυτόν τον λογαριασμό.')
      for (const change of changes) if (isDeletion(change.payload)) {
        if (identity?.role !== 'coach' || (!local && !(change.payload.discard ? workspace.workoutDiscard : workspace.historyDeletion))) throw new Error(change.payload.discard ? 'Η διακοπή χωρίς αποθήκευση δεν έχει ενεργοποιηθεί για την ομάδα.' : 'Η διαγραφή ιστορικού δεν έχει ενεργοποιηθεί για αυτόν τον λογαριασμό.')
      }
      return changes
    }); setError(null) } catch (err) { const message = err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.'; setError(message); throw err }
  } }}>{children}</WorkspaceContext.Provider>
}
export const useWorkspace = () => useContext(WorkspaceContext)
