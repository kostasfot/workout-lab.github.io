import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, expect, test } from 'vitest'
import { emptyWorkspace } from '../../src/lib/program'
import { createWorkout, finishWorkout, type Workspace } from '../../src/lib/model'
import { createCalendarSession } from '../../src/lib/calendar'

const db = new PGlite(), state = emptyWorkspace()
const team = '20000000-0000-0000-0000-000000000001', otherTeam = '20000000-0000-0000-0000-000000000002'
const users = { coach: '10000000-0000-0000-0000-000000000001', anna: '10000000-0000-0000-0000-000000000002', spectator: '10000000-0000-0000-0000-000000000003', other: '10000000-0000-0000-0000-000000000004' }
async function asUser(user: keyof typeof users) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users[user]]); await db.exec('set role authenticated') }
const save = async (kind: string, value: unknown, revision = 0, op = crypto.randomUUID()) => (await db.query<{ value: number }>('select public.save_record($1,$2::jsonb,$3,$4::uuid) as value', [kind, JSON.stringify(value), revision, op])).rows[0].value
const remove = async (id: string, discard = false, revision = 1, op = crypto.randomUUID()) => (await db.query<{ value: number }>("select public.delete_record('workout',$1::jsonb,$2,$3::uuid) as value", [JSON.stringify({ id, discard }), revision, op])).rows[0].value
const workspace = async () => (await db.query<{ value: Workspace }>('select public.get_workspace() as value')).rows[0].value
async function planned() {
  const session = createCalendarSession(state, { date: '2026-10-13', startTime: '18:00', routineId: 'day-2', participants: ['anna', 'dimitra'] })
  await save('calendar', session)
  const workout = { ...createWorkout(state.program.routines[1], state.program.id), scheduleId: session.id, scheduleRevision: 1 }
  return { session, workout }
}
beforeAll(async () => {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;")
  for (const path of readdirSync('supabase/migrations').filter(p => p.endsWith('.sql')).sort()) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'))
  await db.exec(readFileSync('supabase/migrations/202610130005_training_calendar.sql', 'utf8'))
  for (const id of Object.values(users)) await db.query('insert into auth.users values ($1)', [id])
  for (const id of [team, otherTeam]) await db.query('insert into public.teams(id) values ($1)', [id])
  for (const [name, id] of Object.entries(users)) await db.query('insert into public.profiles(id,team_id,role,athlete_id) values ($1,$2,$3,$4)', [id, name === 'other' ? otherTeam : team, name === 'anna' ? 'athlete' : name === 'spectator' ? 'spectator' : 'coach', name === 'anna' ? 'anna' : null])
  await asUser('coach'); await save('program', state.program)
  await asUser('other'); await save('program', state.program)
}, 30000)
beforeEach(async () => {
  await db.exec('reset role; delete from public.training_sessions; delete from public.coach_notes; delete from public.workouts; delete from public.deleted_records; delete from public.mutation_receipts;')
  await asUser('coach')
})
afterAll(async () => { await db.close() })
test('additive migration preserves the preceding capabilities and projects normalized calendar records', async () => {
  const { session } = await planned(), remote = await workspace()
  expect(remote.calendarEnabled).toBe(true); expect(remote.accountManagement).toBe(true); expect(remote.workoutDiscard).toBe(true)
  expect(remote.calendarSessions?.[0]).toMatchObject({ id: session.id, date: session.date, startTime: '18:00', revision: 1, workoutId: null, resultRemoved: false })
})
test('athletes and spectators read shared schedules but cannot mutate them or call private helper RPCs', async () => {
  const { session } = await planned()
  for (const role of ['anna', 'spectator'] as const) {
    await asUser(role)
    expect((await workspace()).calendarSessions).toHaveLength(1)
    expect((await db.query('select * from public.training_sessions')).rows).toHaveLength(1)
    await expect(save('calendar', { ...session, status: 'cancelled' }, 1)).rejects.toThrow(/not_authorized/)
    await expect(db.query('update public.training_sessions set revision=9')).rejects.toThrow(/permission denied/)
  }
  await asUser('coach')
  await expect(db.query('select public.get_workspace_before_calendar()')).rejects.toThrow(/permission denied/)
  await expect(db.query("select public.save_record_before_calendar('calendar','{}',0,$1)", [crypto.randomUUID()])).rejects.toThrow(/permission denied/)
  await db.exec('reset role; set role anon')
  await expect(db.query('select public.get_workspace()')).rejects.toThrow(/permission denied/)
})
test('team boundaries apply to schedule reads, edits, and workout linking', async () => {
  const { session, workout } = await planned()
  await asUser('other')
  expect((await workspace()).calendarSessions).toEqual([])
  expect((await db.query('select * from public.training_sessions')).rows).toEqual([])
  await expect(save('calendar', session, 1)).rejects.toThrow(/not_authorized/)
  await expect(save('workout', workout)).rejects.toThrow(/not_authorized/)
})
test('schedule writes validate input and use revision checks and retry receipts', async () => {
  const { session } = await planned(), op = crypto.randomUUID()
  const updated = { ...session, date: '2026-10-20', startTime: null }
  expect(await save('calendar', updated, 1, op)).toBe(2)
  expect(await save('calendar', updated, 1, op)).toBe(2)
  await expect(save('calendar', updated, 1)).rejects.toThrow(/revision_conflict/)
  for (const change of [{ date: '2026-02-31' }, { startTime: '24:00' }, { participants: [] }, { participants: ['anna', 'anna'] }, { participants: ['outsider'] }, { routineId: 'unknown' }, { status: 'completed' }])
    await expect(save('calendar', { ...updated, ...change }, 2)).rejects.toThrow()
  expect((await workspace()).calendarSessions?.[0].date).toBe('2026-10-20')
})
test('starting binds workout and plan atomically, and a lost response cannot create a second link', async () => {
  const { session, workout } = await planned(), op = crypto.randomUUID()
  expect(await save('workout', workout, 0, op)).toBe(1)
  expect(await save('workout', workout, 0, op)).toBe(1)
  expect((await workspace()).calendarSessions?.[0]).toMatchObject({ workoutId: workout.id, revision: 2 })
  await save('workout', { ...workout, phase: 1 }, 1)
  expect((await workspace()).calendarSessions?.[0].revision).toBe(2)
  const competing = { ...finishWorkout(createWorkout(state.program.routines[1], state.program.id)), scheduleId: session.id, scheduleRevision: 2 }
  await expect(save('workout', competing)).rejects.toThrow(/calendar_conflict/)
  expect((await workspace()).workouts).toHaveLength(1)
})
test('stale planned starts reject the entire workout rather than silently using a rescheduled plan', async () => {
  const { session, workout } = await planned()
  await save('calendar', { ...session, date: '2026-10-21' }, 1)
  await expect(save('workout', workout)).rejects.toThrow(/calendar_conflict/)
  expect((await workspace()).workouts).toEqual([])
  expect((await workspace()).calendarSessions?.[0].workoutId).toBeNull()
})
test('active sessions cannot be rescheduled or cancelled; links cannot be edited and another active workout is rejected', async () => {
  const { session, workout } = await planned()
  await save('workout', workout)
  await expect(save('calendar', { ...session, status: 'cancelled' }, 2)).rejects.toThrow(/calendar_locked/)
  await expect(save('workout', { ...workout, scheduleId: null }, 1)).rejects.toThrow(/calendar_link_changed/)
  await expect(save('workout', createWorkout(state.program.routines[0], state.program.id))).rejects.toThrow(/active_workout_exists/)
})
test('shared live metadata contains no sets or private notes and saved date corrections drive result dates', async () => {
  const { session, workout } = await planned()
  await save('workout', workout)
  await save('note', { id: crypto.randomUUID(), workoutId: workout.id, athlete: 'anna', text: 'private note', revision: 0 })
  for (const role of ['anna', 'spectator'] as const) {
    await asUser(role)
    const remote = await workspace()
    expect(remote.workouts).toEqual([]); expect(remote.notes).toEqual([])
    expect(remote.calendarWorkouts?.[0]).toMatchObject({ id: workout.id, scheduleId: session.id, status: 'active', participants: ['anna', 'dimitra'] })
    expect(remote.calendarWorkouts?.[0]).not.toHaveProperty('results')
  }
  await asUser('coach')
  await save('workout', { ...finishWorkout(workout), date: '2026-10-12' }, 1)
  const remote = await workspace()
  expect(remote.calendarWorkouts?.[0].date).toBe('2026-10-12')
  expect(remote.calendarSessions?.[0].date).toBe('2026-10-13')
})
test('discard returns a plan to scheduled, supports restarting, and cannot resurrect the old draft', async () => {
  const { session, workout } = await planned()
  await save('workout', workout)
  expect(await remove(workout.id, true)).toBe(2)
  expect((await workspace()).calendarSessions?.[0]).toMatchObject({ workoutId: null, resultRemoved: false, revision: 3 })
  const restarted = { ...workout, id: crypto.randomUUID(), scheduleRevision: 3 }
  await save('workout', restarted)
  await expect(save('workout', workout)).rejects.toThrow(/calendar_conflict|record_deleted|active_workout_exists/)
  expect((await workspace()).workouts.map(w => w.id)).toEqual([restarted.id])
})
test('deleting completed history clears the linked result and is idempotent, while cancellation leaves history intact', async () => {
  const { session, workout } = await planned(), op = crypto.randomUUID()
  await save('workout', finishWorkout(workout))
  expect(await remove(workout.id, false, 1, op)).toBe(2)
  expect(await remove(workout.id, false, 1, op)).toBe(2)
  const remote = await workspace()
  expect(remote.calendarSessions?.[0]).toMatchObject({ workoutId: null, resultRemoved: true, revision: 3 })
  expect(remote.calendarWorkouts).toEqual([])
  await save('calendar', { ...session, status: 'cancelled' }, 3)
  await save('workout', finishWorkout(createWorkout(state.program.routines[0], state.program.id)))
  expect((await workspace()).workouts).toHaveLength(1)
})
