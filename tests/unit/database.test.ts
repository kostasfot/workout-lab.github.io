import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, expect, test } from 'vitest'
import { emptyWorkspace } from '../../src/lib/program'
import { allExpected, createWorkout, deleteLoggedSet, finishWorkout } from '../../src/lib/model'

const database = new PGlite()
const users = { coach: '10000000-0000-0000-0000-000000000001', anna: '10000000-0000-0000-0000-000000000002', dimitra: '10000000-0000-0000-0000-000000000003', outsider: '10000000-0000-0000-0000-000000000004' }
const team = '20000000-0000-0000-0000-000000000001'
const state = emptyWorkspace(), workout = finishWorkout(createWorkout(state.program.routines[0], state.program.id))
const asUser = async (user: keyof typeof users) => { await database.exec('reset role'); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [users[user]]); await database.exec('set role authenticated') }
const save = (kind: string, payload: unknown, revision = 0, op = crypto.randomUUID()) => database.query<{ save_record: number }>('select public.save_record($1, $2::jsonb, $3, $4::uuid)', [kind, JSON.stringify(payload), revision, op])
const remove = (kind: string, id: string, revision = 0, op = crypto.randomUUID()) => database.query<{ delete_record: number }>('select public.delete_record($1, $2::jsonb, $3, $4::uuid)', [kind, JSON.stringify({ id }), revision, op])
beforeAll(async () => {
  await database.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;")
  await database.exec(readFileSync('supabase/migrations/202610070001_workout_lab.sql', 'utf8'))
  for (const id of Object.values(users)) await database.query('insert into auth.users(id) values ($1)', [id])
  await database.query('insert into public.teams(id) values ($1)', [team])
  for (const [name, id] of Object.entries(users).filter(([name]) => name !== 'outsider')) await database.query('insert into public.profiles(id,team_id,role,athlete_id) values ($1,$2,$3,$4)', [id, team, name === 'coach' ? 'coach' : 'athlete', name === 'coach' ? null : name])
  await asUser('coach')
  await save('program', state.program)
  await save('workout', workout)
  await save('note', { id: '30000000-0000-0000-0000-000000000001', workoutId: workout.id, athlete: 'anna', text: 'private coaching note', revision: 0 })
  await database.exec('reset role')
  const deletionMigration = readFileSync('supabase/migrations/202610070002_history_deletion.sql', 'utf8')
  await database.exec(deletionMigration)
  await database.exec(deletionMigration) // Re-running this additive update is safe.
  const workoutMigration = readFileSync('supabase/migrations/202610070003_workout_editing_and_discard.sql', 'utf8')
  await database.exec(workoutMigration)
  await database.exec(workoutMigration)
  await asUser('coach')
})
afterAll(async () => { await database.close() })
test('migration runs in PostgreSQL and coach can access the group and private notes', async () => {
  await asUser('coach')
  const { rows } = await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')
  expect(rows[0].get_workspace.workouts).toHaveLength(1)
  expect(rows[0].get_workspace.notes).toHaveLength(1)
  expect(rows[0].get_workspace.weighIns).toEqual([])
  expect(rows[0].get_workspace.goals.anna.value).toBeNull()
})
test('athletes get own details and shared comparisons, but cannot read private notes or raw group workouts', async () => {
  await asUser('anna')
  const { rows } = await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')
  expect(rows[0].get_workspace.notes).toEqual([])
  expect(rows[0].get_workspace.comparisons).toHaveLength(1)
  expect(Object.values(rows[0].get_workspace.workouts[0].results).every(r => r.athlete === 'anna')).toBe(true)
  expect((await database.query('select * from public.coach_notes')).rows).toEqual([])
  expect((await database.query('select * from public.workouts')).rows).toEqual([])
  await expect(save('workout', workout, 1)).rejects.toThrow(/not_authorized/)
  await expect(database.query('update public.profiles set role = $1 where id = $2', ['coach', users.anna])).rejects.toThrow(/permission denied/)
})
test('athletes can add only their own weigh-ins and cannot edit a stored measurement', async () => {
  await asUser('anna')
  const measurement = { id: crypto.randomUUID(), athlete: 'anna', date: '2026-10-01', weight: 105, revision: 0 }
  await expect(save('weighin', { ...measurement, athlete: 'dimitra' })).rejects.toThrow(/not_authorized/)
  expect((await save('weighin', measurement)).rows[0].save_record).toBe(1)
  await expect(save('weighin', { ...measurement, weight: 99 }, 1)).rejects.toThrow(/not_authorized/)
  await asUser('dimitra')
  expect((await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')).rows[0].get_workspace.weighIns).toHaveLength(1)
})
test('lost-response retries are idempotent and stale revisions are rejected', async () => {
  await asUser('coach')
  const op = crypto.randomUUID(), payload = { id: 'anna', value: 95, revision: 0 }
  expect((await save('goal', payload, 0, op)).rows[0].save_record).toBe(1)
  expect((await save('goal', payload, 0, op)).rows[0].save_record).toBe(1)
  await expect(save('goal', { ...payload, value: 90 }, 0)).rejects.toThrow(/revision_conflict/)
  expect((await save('goal', { ...payload, value: 92 }, 1)).rows[0].save_record).toBe(2)
})
test('a user without group membership has no data or write access', async () => {
  await asUser('outsider')
  await expect(database.query('select public.get_workspace()')).rejects.toThrow(/not_authorized/)
  await expect(save('goal', { id: 'anna', value: 95 }, 0)).rejects.toThrow(/not_authorized/)
  expect((await database.query('select * from public.weighins')).rows).toEqual([])
})
test('only the coach can delete history, including across team boundaries', async () => {
  for (const user of ['anna', 'dimitra', 'outsider'] as const) {
    await asUser(user)
    await expect(remove('workout', workout.id, 1)).rejects.toThrow(/not_authorized/)
    await expect(remove('weighin', crypto.randomUUID())).rejects.toThrow(/not_authorized/)
  }
  await database.exec('reset role')
  const otherCoach = crypto.randomUUID(), otherTeam = crypto.randomUUID()
  await database.query('insert into auth.users(id) values ($1)', [otherCoach])
  await database.query('insert into public.teams(id) values ($1)', [otherTeam])
  await database.query("insert into public.profiles(id,team_id,role) values ($1,$2,'coach')", [otherCoach, otherTeam])
  await database.query("select set_config('request.jwt.claim.sub', $1, false)", [otherCoach])
  await database.exec('set role authenticated')
  await expect(remove('workout', workout.id, 1)).rejects.toThrow(/not_authorized/)
  await expect(database.query('delete from public.workouts where id = $1', [workout.id])).rejects.toThrow(/permission denied/)
  await database.exec('reset role; set role anon')
  await expect(remove('workout', workout.id, 1)).rejects.toThrow(/permission denied/)
})
test('coach deletes athlete weigh-ins with revision checks and idempotent retries', async () => {
  const id = crypto.randomUUID(), op = crypto.randomUUID()
  const measurement = { id, athlete: 'anna', date: '2026-10-01', weight: 104, revision: 0 }
  await asUser('anna'); await save('weighin', measurement)
  await asUser('coach')
  await expect(remove('weighin', id, 0)).rejects.toThrow(/revision_conflict/)
  expect((await remove('weighin', id, 1, op)).rows[0].delete_record).toBe(2)
  expect((await remove('weighin', id, 1, op)).rows[0].delete_record).toBe(2)
  expect((await remove('weighin', id, 1)).rows[0].delete_record).toBe(2)
  await expect(save('weighin', measurement, 0)).rejects.toThrow(/record_deleted/)
  await asUser('anna')
  const remote = (await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')).rows[0].get_workspace
  expect(remote.weighIns.some(w => w.id === id)).toBe(false)
  expect(remote.historyDeletion).toBe(true)
  expect(remote.deletedRecords).toContainEqual({ kind: 'weighin', id, revision: 2 })
})
test('deleting a logged set changes comparisons without removing the other athlete or workout', async () => {
  await asUser('coach')
  let logged = createWorkout(state.program.routines[0], state.program.id)
  const anna = allExpected(logged).find(r => r.athlete === 'anna')!, dimitra = allExpected(logged).find(r => r.athlete === 'dimitra')!
  for (const r of [anna, dimitra]) logged.results[r.key] = { ...r, status: 'completed', value: 10, weight: r.movement.loaded ? 5 : null }
  logged = finishWorkout(logged)
  await save('workout', logged)
  await save('workout', deleteLoggedSet({ ...logged, revision: 1 }, anna.key), 1)
  await asUser('anna')
  const remote = (await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')).rows[0].get_workspace
  expect(remote.workouts.find(w => w.id === logged.id)!.results[anna.key]).toBeUndefined()
  expect(remote.comparisons.find(w => w.id === logged.id)!.results).toEqual({ anna: { completed: 0, skipped: 21 }, dimitra: { completed: 1, skipped: 21 } })
})
test('workout deletion removes notes and comparisons and prevents stale offline resurrection', async () => {
  await asUser('coach')
  const completed = finishWorkout(createWorkout(state.program.routines[0], state.program.id))
  const note = { id: crypto.randomUUID(), workoutId: completed.id, athlete: 'anna', text: 'remove with workout', revision: 0 }
  await save('workout', completed); await save('note', note)
  expect((await remove('workout', completed.id, 1)).rows[0].delete_record).toBe(2)
  const remote = (await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')).rows[0].get_workspace
  expect(remote.workouts.some(w => w.id === completed.id)).toBe(false)
  expect(remote.notes.some(n => n.workoutId === completed.id)).toBe(false)
  expect(remote.comparisons.some(w => w.id === completed.id)).toBe(false)
  await expect(save('workout', completed, 1)).rejects.toThrow(/revision_conflict/)
  await expect(save('workout', completed, 0)).rejects.toThrow(/record_deleted/)
  await expect(save('note', { ...note, id: crypto.randomUUID() }, 0)).rejects.toThrow(/record_deleted/)
  const active = createWorkout(state.program.routines[0], state.program.id)
  await save('workout', active)
  await expect(remove('workout', active.id, 1)).rejects.toThrow(/active_workout/)
})
test('an offline-created record can be deleted before its first upload', async () => {
  await asUser('coach')
  const id = crypto.randomUUID()
  expect((await remove('weighin', id, 0)).rows[0].delete_record).toBe(1)
  await expect(save('weighin', { id, athlete: 'anna', date: '2026-10-01', weight: 100 }, 0)).rejects.toThrow(/record_deleted/)
})
test('coach can explicitly discard an active draft; athletes cannot, and stale requests cannot discard completed history', async () => {
  await asUser('coach')
  const active = createWorkout(state.program.routines[0], state.program.id), note = { id: crypto.randomUUID(), workoutId: active.id, athlete: 'anna', text: 'draft note', revision: 0 }
  await save('workout', active); await save('note', note)
  const discard = (revision: number, op = crypto.randomUUID()) => database.query<{ delete_record: number }>('select public.delete_record($1, $2::jsonb, $3, $4::uuid)', ['workout', JSON.stringify({ id: active.id, discard: true }), revision, op])
  await asUser('anna'); await expect(discard(1)).rejects.toThrow(/not_authorized/)
  await asUser('coach'); await expect(discard(0)).rejects.toThrow(/revision_conflict/)
  const op = crypto.randomUUID()
  expect((await discard(1, op)).rows[0].delete_record).toBe(2)
  expect((await discard(1, op)).rows[0].delete_record).toBe(2)
  const remote = (await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')).rows[0].get_workspace
  expect(remote.workoutDiscard).toBe(true)
  expect(remote.workouts.some(w => w.id === active.id)).toBe(false)
  expect(remote.notes.some(n => n.workoutId === active.id)).toBe(false)
  expect(remote.comparisons.some(w => w.id === active.id)).toBe(false)
  await expect(save('workout', active, 0)).rejects.toThrow(/record_deleted/)
  const finished = finishWorkout(createWorkout(state.program.routines[0], state.program.id))
  await save('workout', finished)
  await expect(database.query('select public.delete_record($1, $2::jsonb, $3, $4::uuid)', ['workout', JSON.stringify({ id: finished.id, discard: true }), 1, crypto.randomUUID()])).rejects.toThrow(/workout_finished/)
})
test('corrected workout dates reach shared comparisons even when the athlete was absent', async () => {
  await asUser('coach')
  const saved = { ...finishWorkout(createWorkout(state.program.routines[0], state.program.id, ['dimitra'])), date: '2026-10-01' }
  await save('workout', saved)
  await save('workout', { ...saved, date: '2026-10-02', revision: 1 }, 1)
  await asUser('anna')
  const remote = (await database.query<{ get_workspace: typeof state }>('select public.get_workspace()')).rows[0].get_workspace
  expect(remote.workouts.some(w => w.id === saved.id)).toBe(false)
  expect(remote.comparisons.find(w => w.id === saved.id)!.date).toBe('2026-10-02')
  await expect(save('workout', { ...saved, date: '2026-10-03' }, 2)).rejects.toThrow(/not_authorized/)
})
