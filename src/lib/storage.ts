import Dexie, { type EntityTable } from 'dexie'
import { isDeletion, type CoachNote, type MutationKind, type MutationPayload, type Program, type Workspace } from './model'
import { emptyWorkspace } from './program'

export interface LocalWorkspace { scope: string; data: Workspace }
export interface QueuedMutation {
  key: string; scope: string; kind: MutationKind; entityId: string; payload: MutationPayload;
  baseRevision: number; operationId: string; createdAt: number; conflict?: boolean; error?: string
}
export class WorkoutDatabase extends Dexie {
  workspaces!: EntityTable<LocalWorkspace, 'scope'>
  mutations!: EntityTable<QueuedMutation, 'key'>
  constructor(name = 'workout-lab-v1') {
    super(name)
    this.version(1).stores({ workspaces: 'scope', mutations: 'key, scope, createdAt' })
  }
}
export const db = new WorkoutDatabase()
export const mutationEntityId = (kind: MutationKind, payload: MutationPayload) => kind === 'program' ? 'catalog' : payload.id
export async function ensureWorkspace(scope: string, database = db) {
  await database.transaction('rw', database.workspaces, async () => {
    if (!await database.workspaces.get(scope)) await database.workspaces.add({ scope, data: emptyWorkspace() })
  })
}
export async function editWorkspace(scope: string, synced: boolean, edit: (workspace: Workspace) => { kind: MutationKind; payload: MutationPayload }[], database = db) {
  await database.transaction('rw', database.workspaces, database.mutations, async () => {
    const data = (await database.workspaces.get(scope))?.data || emptyWorkspace()
    const changes = edit(data)
    await database.workspaces.put({ scope, data })
    if (!synced) return
    for (const { kind, payload } of changes) {
      const entityId = mutationEntityId(kind, payload), key = `${scope}:${kind}:${entityId}`
      if (kind === 'workout' && isDeletion(payload)) {
        const notes = await database.mutations.where('scope').equals(scope).toArray()
        await database.mutations.bulkDelete(notes.filter(n => n.kind === 'note' && (n.payload as CoachNote).workoutId === entityId).map(n => n.key))
      }
      const existing = await database.mutations.get(key)
      await database.mutations.put({ key, scope, kind, entityId, payload,
        baseRevision: existing?.baseRevision ?? payload.revision, operationId: crypto.randomUUID(),
        createdAt: existing?.createdAt ?? Date.now(), conflict: existing?.conflict,
      })
    }
  })
}
export function setRevision(data: Workspace, kind: MutationKind, id: string, revision: number) {
  if (kind === 'program') data.program.revision = revision
  if (kind === 'workout') { const value = data.workouts.find(x => x.id === id); if (value) value.revision = revision }
  if (kind === 'weighin') { const value = data.weighIns.find(x => x.id === id); if (value) value.revision = revision }
  if (kind === 'goal') data.goals[id as 'anna' | 'dimitra'].revision = revision
  if (kind === 'note') { const value = data.notes.find(x => x.id === id); if (value) value.revision = revision }
}
export async function acknowledge(scope: string, sent: QueuedMutation, revision: number, database = db) {
  await database.transaction('rw', database.workspaces, database.mutations, async () => {
    const row = await database.workspaces.get(scope)
    if (row) { setRevision(row.data, sent.kind, sent.entityId, revision); await database.workspaces.put(row) }
    const current = await database.mutations.get(sent.key)
    if (!current) return
    if (current.operationId === sent.operationId) await database.mutations.delete(sent.key)
    else await database.mutations.put({ ...current, baseRevision: revision, payload: { ...current.payload, revision } })
  })
}
export async function rebaseConflict(scope: string, key: string, revision: number, database = db) {
  await database.transaction('rw', database.workspaces, database.mutations, async () => {
    const current = await database.mutations.get(key)
    if (!current || current.scope !== scope) return
    const row = await database.workspaces.get(scope)
    // A program version may already exist on another device. Keeping local
    // creates a new immutable version rather than reusing that version's ID.
    const payload = current.kind === 'program'
      ? { ...(current.payload as Program), id: crypto.randomUUID(), revision, createdAt: new Date().toISOString() }
      : { ...current.payload, revision }
    if (row) {
      if (current.kind === 'program') row.data.program = payload as Program
      else setRevision(row.data, current.kind, current.entityId, revision)
      await database.workspaces.put(row)
    }
    await database.mutations.put({ ...current, payload, baseRevision: revision, conflict: false, error: undefined, operationId: crypto.randomUUID() })
  })
}
export function mergeRemote(local: Workspace, remote: Workspace, pending: QueuedMutation[]): Workspace {
  pending = pending.filter(p => !deletedRemotely(remote, p))
  const queued = (kind: MutationKind, id: string) => pending.some(p => p.kind === kind && p.entityId === id)
  return {
    program: queued('program', 'catalog') ? local.program : remote.program || local.program,
    workouts: [...remote.workouts.filter(x => !queued('workout', x.id)), ...local.workouts.filter(x => queued('workout', x.id))],
    weighIns: [...remote.weighIns.filter(x => !queued('weighin', x.id)), ...local.weighIns.filter(x => queued('weighin', x.id))],
    comparisons: remote.comparisons || [],
    notes: [...(remote.notes || []).filter(x => !queued('note', x.id)), ...local.notes.filter(x => queued('note', x.id))],
    goals: {
      anna: queued('goal', 'anna') ? local.goals.anna : remote.goals.anna,
      dimitra: queued('goal', 'dimitra') ? local.goals.dimitra : remote.goals.dimitra,
    },
    historyDeletion: remote.historyDeletion,
    deletedRecords: remote.deletedRecords || [],
  }
}
export function deletedRemotely(remote: Workspace, mutation: QueuedMutation) {
  return (remote.deletedRecords || []).some(r =>
    (r.kind === mutation.kind && r.id === mutation.entityId) ||
    (r.kind === 'workout' && mutation.kind === 'note' && (mutation.payload as CoachNote).workoutId === r.id))
}
