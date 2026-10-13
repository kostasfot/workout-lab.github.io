import 'fake-indexeddb/auto'
import { afterEach, expect, test, vi } from 'vitest'
import { emptyWorkspace } from '../../src/lib/program'
import { createWorkout, discardActiveWorkout, finishWorkout, today } from '../../src/lib/model'
import { calendarEntries, calendarStatus, calendarWeek, createCalendarSession, startCalendarWorkout, updateCalendarSession, validCalendarDate } from '../../src/lib/calendar'
import { WorkoutDatabase, acknowledge, editWorkspace, ensureWorkspace, mergeRemote, mutationPriority, prepareCalendarMutation } from '../../src/lib/storage'

const db = new WorkoutDatabase('calendar-tests')
afterEach(async () => { vi.useRealTimers(); await db.workspaces.clear(); await db.mutations.clear() })
const draft = (date = '2026-10-13') => ({ date, startTime: '18:00', routineId: 'day-2', participants: ['anna', 'dimitra'] as ('anna' | 'dimitra')[] })
test('date-only weeks start on Monday across month/year and Athens daylight-saving boundaries', () => {
  expect(calendarWeek('2027-01-01')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  expect(calendarWeek('2026-03-29')[0]).toBe('2026-03-23')
  expect(calendarWeek('2026-10-25')[6]).toBe('2026-10-25')
  expect(validCalendarDate('2026-02-31')).toBe(false)
  expect(validCalendarDate('2028-02-29')).toBe(true)
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T22:30:00Z'))
  expect(today()).toBe('2026-10-13')
})
test('scheduling validates date, optional time, current routine, and nonempty distinct athletes', () => {
  const state = emptyWorkspace()
  const session = createCalendarSession(state, { ...draft(), startTime: null, participants: ['anna'] })
  expect(session.workoutId).toBeNull(); expect(session.participants).toEqual(['anna'])
  for (const change of [{ date: '2026-02-31' }, { startTime: '24:00' }, { participants: [] }, { participants: ['anna', 'anna'] }, { routineId: 'absent' }])
    expect(() => createCalendarSession(state, { ...draft(), ...change } as ReturnType<typeof draft>)).toThrow()
})
test('starting snapshots the current program, preserves planned and actual dates, and prevents duplicate starts', () => {
  const state = emptyWorkspace(), session = createCalendarSession(state, draft())
  state.calendarSessions = [session]
  state.program.routines[1].stations[0].slots[0].movements[0].target = 15
  const workout = startCalendarWorkout(state, 'day-1', ['anna'], session.id)
  expect(workout.routine.id).toBe('day-2'); expect(workout.participants).toEqual(['anna'])
  expect(workout.routine.stations[0].slots[0].movements[0].target).toBe(15)
  state.program.routines[1].stations[0].slots[0].movements[0].target = 20
  expect(workout.routine.stations[0].slots[0].movements[0].target).toBe(15)
  expect(session.date).toBe('2026-10-13'); expect(workout.date).toBe(today())
  expect(calendarStatus(state, session)).toBe('active')
  expect(() => startCalendarWorkout(state, 'day-2', ['anna'], session.id)).toThrow()
  expect(() => updateCalendarSession(state, session.id, draft('2026-10-14'))).toThrow()
})
test('past plans remain pending; actual-date results and original-day references never duplicate workout cards', () => {
  const state = emptyWorkspace(), session = createCalendarSession(state, draft())
  state.calendarSessions = [session]
  expect(calendarStatus(state, session, '2026-10-14')).toBe('pending')
  const workout = startCalendarWorkout(state, 'day-2', ['anna', 'dimitra'], session.id)
  state.workouts[0] = { ...finishWorkout(workout), date: '2026-10-15' }
  const events = calendarEntries(state, calendarWeek('2026-10-13'))
  expect(events.filter(e => e.kind === 'workout')).toHaveLength(1)
  expect(events.find(e => e.kind === 'workout')?.date).toBe('2026-10-15')
  expect(events.find(e => e.kind === 'reference')?.date).toBe('2026-10-13')
  expect(events.every(e => e.status === 'partial')).toBe(true)
  state.workouts[0].date = '2026-10-22'
  expect(calendarEntries(state, calendarWeek('2026-10-13')).map(e => e.kind)).toEqual(['reference'])
})
test('shared metadata allows read-only calendar status without exposing another athlete’s results', () => {
  const state = emptyWorkspace(), session = createCalendarSession(state, draft())
  session.workoutId = crypto.randomUUID(); state.calendarSessions = [session]
  state.calendarWorkouts = [{ id: session.workoutId, date: '2026-10-13', name: 'Προπόνηση 2', routineId: 'day-2', participants: ['anna', 'dimitra'], status: 'active', scheduleId: session.id }]
  expect(calendarStatus(state, session)).toBe('active'); expect(state.workouts).toEqual([])
})
test('offline plan creation, start and late acknowledgements retain both the draft and calendar revisions', async () => {
  await ensureWorkspace('coach', db)
  await editWorkspace('coach', true, state => { const session = createCalendarSession(state, draft()); state.calendarSessions = [session]; return [{ kind: 'calendar', payload: session }] }, db)
  const planned = (await db.mutations.toArray())[0]
  await editWorkspace('coach', true, state => { const w = startCalendarWorkout(state, 'day-2', ['anna'], planned.entityId); return [{ kind: 'workout', payload: w }] }, db)
  let queue = await db.mutations.toArray(), state = (await db.workspaces.get('coach'))!.data
  const work = queue.find(p => p.kind === 'workout')!
  expect(prepareCalendarMutation(state, work, queue)).toBeNull()
  await acknowledge('coach', planned, 1, db)
  state = (await db.workspaces.get('coach'))!.data; queue = await db.mutations.toArray()
  const sent = { ...work, payload: prepareCalendarMutation(state, work, queue)! }
  expect((sent.payload as typeof state.workouts[number]).scheduleRevision).toBe(1)
  await editWorkspace('coach', true, w => discardActiveWorkout(w, work.entityId), db)
  await editWorkspace('coach', true, w => { const session = updateCalendarSession(w, planned.entityId, draft('2026-10-20')); w.calendarSessions = [session]; return [{ kind: 'calendar', payload: session }] }, db)
  await acknowledge('coach', sent, 1, db)
  queue = await db.mutations.toArray(); state = (await db.workspaces.get('coach'))!.data
  expect(queue.find(p => p.kind === 'calendar')?.baseRevision).toBe(2)
  const deletion = queue.find(p => p.kind === 'workout')!
  expect(mutationPriority(deletion)).toBeLessThan(mutationPriority(queue.find(p => p.kind === 'calendar')!))
  await acknowledge('coach', { ...deletion, payload: prepareCalendarMutation(state, deletion, queue)! }, 2, db)
  expect((await db.mutations.toArray()).find(p => p.kind === 'calendar')?.baseRevision).toBe(3)
  db.close(); await db.open()
  state = (await db.workspaces.get('coach'))!.data
  expect(state.calendarSessions?.[0].date).toBe('2026-10-20'); expect(state.calendarSessions?.[0].workoutId).toBeNull()
  expect(state.workouts).toEqual([])
})
test('pending history deletion preserves the cleared calendar link during a remote refresh', async () => {
  await ensureWorkspace('coach', db)
  await editWorkspace('coach', true, w => {
    const session = createCalendarSession(w, draft()); w.calendarSessions = [session]
    const workout = startCalendarWorkout(w, 'day-2', ['anna'], session.id)
    w.workouts[0] = finishWorkout(workout)
    return [{ kind: 'workout', payload: w.workouts[0] }]
  }, db)
  const remote = structuredClone((await db.workspaces.get('coach'))!.data), id = remote.workouts[0].id
  await editWorkspace('coach', true, w => { w.workouts = []; return [{ kind: 'workout', payload: { id, revision: 0, deleted: true } }] }, db)
  const local = (await db.workspaces.get('coach'))!.data, queue = await db.mutations.toArray()
  const merged = mergeRemote(local, remote, queue)
  expect(merged.calendarSessions?.[0].workoutId).toBeNull()
  expect(merged.calendarSessions?.[0].resultRemoved).toBe(true)
  expect(calendarEntries(merged, calendarWeek('2026-10-13')).some(e => e.kind === 'workout')).toBe(false)
})
test('unplanned historical workouts appear without needing calendar records', () => {
  const state = emptyWorkspace()
  state.workouts = [{ ...finishWorkout(createWorkout(state.program.routines[0], state.program.id)), date: '2026-10-13' }]
  expect(calendarEntries(state, calendarWeek('2026-10-13'))).toMatchObject([{ kind: 'workout', status: 'partial', date: '2026-10-13' }])
})
