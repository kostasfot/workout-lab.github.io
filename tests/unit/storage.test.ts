import 'fake-indexeddb/auto'
import { afterEach, expect, test } from 'vitest'
import { WorkoutDatabase, acknowledge, editWorkspace, ensureWorkspace, mergeRemote, rebaseConflict, deletedRemotely } from '../../src/lib/storage'
import { emptyWorkspace } from '../../src/lib/program'
import { createWorkout, finishWorkout } from '../../src/lib/model'

const database = new WorkoutDatabase('workout-tests')
afterEach(async () => { await database.workspaces.clear(); await database.mutations.clear() })
test('offline drafts survive reopening and remain isolated between accounts', async () => {
  await ensureWorkspace('coach', database)
  const workout = createWorkout(emptyWorkspace().program.routines[0], 'program')
  await editWorkspace('coach', true, w => { w.workouts.push(workout); return [{ kind: 'workout', payload: workout }] }, database)
  database.close(); await database.open()
  expect((await database.workspaces.get('coach'))!.data.workouts[0].id).toBe(workout.id)
  await ensureWorkspace('athlete', database)
  expect((await database.workspaces.get('athlete'))!.data.workouts).toEqual([])
  expect(await database.mutations.where('scope').equals('coach').count()).toBe(1)
})
test('an acknowledgement of an older in-flight value cannot discard a newer local change', async () => {
  await ensureWorkspace('coach', database)
  await editWorkspace('coach', true, w => { w.goals.anna.value = 90; return [{ kind: 'goal', payload: w.goals.anna }] }, database)
  const sent = (await database.mutations.toArray())[0]
  await editWorkspace('coach', true, w => { w.goals.anna.value = 85; return [{ kind: 'goal', payload: w.goals.anna }] }, database)
  await acknowledge('coach', sent, 1, database)
  const newer = (await database.mutations.toArray())[0]
  expect((newer.payload as { value: number }).value).toBe(85)
  expect(newer.baseRevision).toBe(1)
  expect((await database.workspaces.get('coach'))!.data.goals.anna.value).toBe(85)
  await acknowledge('coach', newer, 2, database)
  expect(await database.mutations.count()).toBe(0)
  expect((await database.workspaces.get('coach'))!.data.goals.anna.revision).toBe(2)
})
test('remote refresh preserves pending edits while accepting other cloud records', async () => {
  const local = emptyWorkspace(), remote = emptyWorkspace()
  local.goals.anna.value = 85; remote.goals.anna.value = 90; remote.goals.dimitra.value = 88
  const merged = mergeRemote(local, remote, [{ key: 'key', scope: 'coach', kind: 'goal', entityId: 'anna', payload: local.goals.anna, baseRevision: 0, operationId: 'op', createdAt: 0 }])
  expect(merged.goals.anna.value).toBe(85)
  expect(merged.goals.dimitra.value).toBe(88)
})
test('keeping a conflicting program creates a new immutable version and retains the latest local edit', async () => {
  await ensureWorkspace('coach', database)
  await editWorkspace('coach', true, w => [{ kind: 'program', payload: w.program }], database)
  const original = (await database.mutations.toArray())[0]
  await database.mutations.update(original.key, { conflict: true })
  await editWorkspace('coach', true, w => { w.program.routines[0].stations[0].rounds = 4; return [{ kind: 'program', payload: w.program }] }, database)
  await rebaseConflict('coach', original.key, 2, database)
  const queued = (await database.mutations.toArray())[0]
  const program = (await database.workspaces.get('coach'))!.data.program
  expect(program.id).not.toBe(original.payload.id)
  expect(program.routines[0].stations[0].rounds).toBe(4)
  expect(queued.payload).toEqual(program)
  expect(queued.baseRevision).toBe(2)
  expect(queued.conflict).toBe(false)
  expect(queued.operationId).not.toBe(original.operationId)
})
test('offline deletion survives reload, hides the old cloud copy, and replaces an unsent upload', async () => {
  await ensureWorkspace('coach', database)
  const measurement = { id: crypto.randomUUID(), athlete: 'anna' as const, date: '2026-10-01', weight: 100, revision: 0, createdAt: new Date().toISOString() }
  await editWorkspace('coach', true, w => { w.weighIns.push(measurement); return [{ kind: 'weighin', payload: measurement }] }, database)
  await editWorkspace('coach', true, w => { w.weighIns = []; return [{ kind: 'weighin', payload: { id: measurement.id, revision: 0, deleted: true } }] }, database)
  database.close(); await database.open()
  const local = (await database.workspaces.get('coach'))!.data, pending = await database.mutations.toArray(), remote = emptyWorkspace()
  remote.weighIns.push(measurement)
  expect(pending).toHaveLength(1)
  expect(pending[0].payload).toEqual({ id: measurement.id, revision: 0, deleted: true })
  expect(local.weighIns).toEqual([])
  expect(mergeRemote(local, remote, pending).weighIns).toEqual([])
})
test('an upload response cannot discard a deletion queued while that upload was in flight', async () => {
  await ensureWorkspace('coach', database)
  const workout = finishWorkout(createWorkout(emptyWorkspace().program.routines[0], 'program'))
  await editWorkspace('coach', true, w => { w.workouts.push(workout); return [{ kind: 'workout', payload: workout }] }, database)
  const sent = (await database.mutations.toArray())[0]
  await editWorkspace('coach', true, w => { w.workouts = []; return [{ kind: 'workout', payload: { id: workout.id, revision: 0, deleted: true } }] }, database)
  await acknowledge('coach', sent, 1, database)
  const deletion = (await database.mutations.toArray())[0]
  expect(deletion.payload).toEqual({ id: workout.id, revision: 1, deleted: true })
  expect(deletion.baseRevision).toBe(1)
  expect((await database.workspaces.get('coach'))!.data.workouts).toEqual([])
  await acknowledge('coach', deletion, 2, database)
  expect(await database.mutations.count()).toBe(0)
})
test('workout deletion cancels queued private notes, and remote deletion overrides stale local edits', async () => {
  await ensureWorkspace('coach', database)
  const workout = finishWorkout(createWorkout(emptyWorkspace().program.routines[0], 'program'))
  const note = { id: crypto.randomUUID(), workoutId: workout.id, athlete: 'anna' as const, text: 'private', revision: 0 }
  await editWorkspace('coach', true, w => { w.workouts.push(workout); w.notes.push(note); return [{ kind: 'workout', payload: workout }, { kind: 'note', payload: note }] }, database)
  const stale = await database.mutations.toArray(), remote = emptyWorkspace()
  remote.deletedRecords = [{ kind: 'workout', id: workout.id, revision: 2 }]
  expect(stale.every(p => deletedRemotely(remote, p))).toBe(true)
  const merged = mergeRemote((await database.workspaces.get('coach'))!.data, remote, stale)
  expect(merged.workouts).toEqual([]); expect(merged.notes).toEqual([])
  await editWorkspace('coach', true, w => { w.workouts = []; w.notes = []; return [{ kind: 'workout', payload: { id: workout.id, revision: 0, deleted: true } }] }, database)
  expect((await database.mutations.toArray()).map(p => p.kind)).toEqual(['workout'])
})
