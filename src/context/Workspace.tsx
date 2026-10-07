import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureWorkspace, editWorkspace, acknowledge, rebaseConflict, mergeRemote, type QueuedMutation } from '../lib/storage'
import { cloud, identityScope } from '../lib/cloud'
import { useAuth } from './Auth'
import { emptyWorkspace } from '../lib/program'
import type { MutationKind, MutationPayload, Workspace } from '../lib/model'

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
      await db.workspaces.put({ scope, data: mergeRemote(saved?.data || emptyWorkspace(), remote, queued) })
    })
  }
  const sync = async () => {
    if (!cloud || local || !navigator.onLine || syncLock.current) return
    syncLock.current = true; setSyncing(true)
    try {
      const queued = await db.mutations.where('scope').equals(scope).sortBy('createdAt')
      queued.sort((a, b) => (a.kind === 'program' ? -1 : 0) - (b.kind === 'program' ? -1 : 0))
      for (const item of queued) {
        if (item.conflict) continue
        const { data, error: saveError } = await cloud.rpc('save_record', { kind: item.kind, payload: item.payload, expected_revision: item.baseRevision, operation_id: item.operationId })
        if (saveError) {
          if (saveError.message.includes('revision_conflict')) await db.mutations.update(item.key, { conflict: true })
          else { await db.mutations.update(item.key, { error: 'Η αλλαγή αποθηκεύτηκε τοπικά. Ο συγχρονισμός θα επαναληφθεί.' }); throw saveError }
        } else await acknowledge(scope, item, data as number)
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
      const record: MutationPayload | undefined = item.kind === 'program' ? remote.program : item.kind === 'workout' ? remote.workouts.find(w => w.id === item.entityId) : item.kind === 'weighin' ? remote.weighIns.find(w => w.id === item.entityId) : item.kind === 'note' ? remote.notes.find(w => w.id === item.entityId) : remote.goals[item.entityId as 'anna' | 'dimitra']
      if (keepLocal) await rebaseConflict(scope, item.key, record?.revision || 0)
      else await db.mutations.delete(item.key)
      await pull(); setError(null)
    } catch { setError('Δεν ήταν δυνατή η ανάκτηση της online έκδοσης. Δοκιμάστε όταν υπάρχει σύνδεση.') }
  }
  return <WorkspaceContext.Provider value={{ data: row?.data || emptyWorkspace(), loading: !row, pending, syncing, online, scope, error, clearError: () => setError(null), sync, resolve, edit: async fn => {
    try { await editWorkspace(scope, !local, fn); setError(null) } catch (err) { const message = err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.'; setError(message); throw err }
  } }}>{children}</WorkspaceContext.Provider>
}
export const useWorkspace = () => useContext(WorkspaceContext)
