import { expect, test } from 'vitest'
import { allExpected, createWorkout, type Workout } from '../../src/lib/model'
import { emptyWorkspace } from '../../src/lib/program'
import { analyticsWorkout } from '../fixtures/analytics'
import { analyticsWindow, exerciseKey, exerciseOptions, exerciseSessions, exerciseSummary, personalRecords, roundChange, roundGroups, savedAnalyticsWorkouts, sessionValue } from '../../src/lib/exercise-analytics'

const program = emptyWorkspace().program, goblet = program.routines[0].stations[0].slots[0].movements[0], key = exerciseKey(goblet)
const analyze = (workouts: Workout[], selected = key) => exerciseSessions(workouts, selected, ['anna'])

test('completed sets in partial workouts count; skipped/missing values never become zero performance', () => {
  const w = analyticsWorkout('2026-10-01', [12, 10, 8]), expected = allExpected(w).filter(r => r.athlete === 'anna' && r.movement.id === 'goblet')
  w.results[expected[1].key] = { ...expected[1], status: 'skipped' }; delete w.results[expected[2].key]
  const sessions = analyze([w]), summary = exerciseSummary(sessions)
  expect(summary).toMatchObject({ planned: 3, completed: 1, skipped: 1, missing: 1, attainment: 100 })
  expect(summary.completion).toBeCloseTo(100 / 3)
  expect(sessions[0].sets.map(s => s.performance)).toEqual([12, null, null])
})
test('active, deleted, invalid-date and duplicate old revisions are excluded from saved analytics', () => {
  const w = analyticsWorkout('2026-10-01', [12, 10, 8]), deleted = analyticsWorkout('2026-10-02', [12, 12, 12])
  const data = { workouts: [w, { ...w, revision: 3 }, { ...w, id: 'active', status: 'active' as const }, deleted, { ...w, id: 'bad-date', date: '2026-02-31' }], deletedRecords: [{ kind: 'workout' as const, id: deleted.id, revision: 2 }] }
  expect(savedAnalyticsWorkouts(data).map(w => [w.id, w.revision])).toEqual([[w.id, 3]])
})
test('target attainment uses each saved prescription, independent of the current program', () => {
  const before = analyticsWorkout('2026-10-01', [12, 10, 8]), after = analyticsWorkout('2026-10-08', [12, 12, 11])
  after.routine.stations[0].slots[0].movements[0].target = 12
  const sessions = analyze([before, after])
  expect(exerciseSummary(sessions)).toMatchObject({ planned: 6, completed: 6, met: 4, completion: 100 })
  expect(exerciseSummary(sessions).attainment).toBeCloseTo(100 * 4 / 6)
})
test('names, equipment, metrics, load and side conventions isolate variants; targets do not', () => {
  for (const change of [{ name: 'Step Ups' }, { equipment: 'Barbell' }, { metric: 'seconds' as const }, { loaded: false }, { unilateral: 'leg' as const }]) expect(exerciseKey({ ...goblet, ...change })).not.toBe(key)
  expect(exerciseKey({ ...goblet, target: 15, maximum: 20 })).toBe(key)
  expect(exerciseKey({ ...goblet, name: '  GOBLET   Squats ' })).toBe(key)
  expect(exerciseOptions(program, [analyticsWorkout('2026-10-01', [10, 10, 10])]).filter(o => o.key === key)).toHaveLength(1)
})
test('historical renamed exercises remain selectable without mixing their performances', () => {
  const w = analyticsWorkout('2026-10-01', [12, 12, 12]); w.routine.stations[0].slots[0].movements[0].name = 'Old Squat'
  const options = exerciseOptions(program, [w])
  expect(options.some(o => o.movement.name === 'Old Squat')).toBe(true)
  expect(analyze([w])).toEqual([])
})
test('missing completed-set denominators are null, while all-skipped completion is zero', () => {
  const w = analyticsWorkout('2026-10-01', [10, 10, 10]), trx = w.routine.stations[0].slots[1].movements[0]
  const sessions = analyze([w], exerciseKey(trx))
  expect(sessionValue(sessions[0], 'value')).toBeNull()
  expect(exerciseSummary(sessions)).toMatchObject({ completed: 0, attainment: null, completion: 0, skipped: 3 })
  expect(exerciseSummary([])).toMatchObject({ sessions: 0, completion: null, attainment: null })
})
test('invalid or unrelated saved rows cannot create personal records or inflate target rates', () => {
  const w = analyticsWorkout('2026-10-01', [12, 10, 8]), rows = allExpected(w).filter(r => r.athlete === 'anna' && r.movement.id === 'goblet')
  w.results[rows[0].key].weight = null; w.results[rows[1].key].value = 4000; w.results[rows[2].key].round = 15
  w.results['orphan'] = { ...rows[0], key: 'orphan', status: 'completed', weight: 500, value: 3600 }
  expect(exerciseSummary(analyze([w]))).toMatchObject({ invalid: 3, completed: 0, planned: 3, attainment: null })
  expect(personalRecords(analyze([w]), 10, 6)).toEqual({ load: null, performance: null })
})
test('absent athletes and unselected exercise alternatives produce no planned sets', () => {
  const w = analyticsWorkout('2026-10-01', [10, 10, 10]); w.participants = ['dimitra']
  expect(analyze([w])).toEqual([])
  const day3 = analyticsWorkout('2026-10-01', [40, 40, 40], undefined, 6, 2)
  const unused = day3.routine.stations[1].slots[1].movements[1]
  expect(analyze([day3], exerciseKey(unused))).toEqual([])
})
test('personal records require a chosen rep threshold or an exact comparison load, with stable ties', () => {
  const lowReps = analyticsWorkout('2026-10-10', [5, 5, 5], undefined, 10)
  const old = analyticsWorkout('2026-10-01', [12, 10, 8]), later = analyticsWorkout('2026-10-08', [12, 12, 11], undefined, 7.5)
  const records = personalRecords(analyze([lowReps, later, old]), 10, 6)
  expect(records.load?.set.weight).toBe(7.5); expect(records.load?.session.workoutId).toBe(later.id)
  expect(records.performance?.set.performance).toBe(12); expect(records.performance?.session.workoutId).toBe(old.id)
  expect(personalRecords(analyze([lowReps]), 10, 6)).toEqual({ load: null, performance: null })
})
test('timed load records use a minimum duration; unloaded exercise load charts remain null', () => {
  const w = analyticsWorkout('2026-10-01', [40, 40, 35], undefined, 6, 2), movement = w.routine.stations[0].slots[0].movements[0]
  expect(personalRecords(analyze([w], exerciseKey(movement)), 40, 6).load?.set.weight).toBe(6)
  expect(personalRecords(analyze([w], exerciseKey(movement)), 45, 6).load).toBeNull()
  const plain = analyticsWorkout('2026-10-01', [10, 10, 10]), trx = plain.routine.stations[0].slots[1].movements[0]
  expect(sessionValue(analyze([plain], exerciseKey(trx))[0], 'weight')).toBeNull()
})
test('unilateral target and records use the smaller side count and retain the entered sides', () => {
  const w = analyticsWorkout('2026-10-01', [10, 10, 10]), row = allExpected(w).find(r => r.athlete === 'anna' && r.movement.unilateral)!
  w.results[row.key] = { ...row, status: 'completed', weight: 5, value: 12, otherSide: 9 }
  const session = analyze([w], exerciseKey(row.movement))[0], result = session.sets[0]
  expect(result).toMatchObject({ value: 12, otherSide: 9, performance: 9, targetMet: false })
  expect(personalRecords([session], 10, 5).load).toBeNull()
})
test('round change is only calculated for complete groups at one load and target', () => {
  const sessions = analyze([analyticsWorkout('2026-10-01', [12, 10, 8])]), sets = sessions[0].sets
  expect(roundChange(sets).percent).toBeCloseTo(-100 / 3)
  expect(roundChange(sets.slice(0, 1)).percent).toBeNull()
  expect(roundChange(sets.map((s, i) => i === 1 ? { ...s, weight: 7.5 } : s)).percent).toBeNull()
  expect(roundChange(sets.map((s, i) => i === 1 ? { ...s, state: 'missing' } : s)).percent).toBeNull()
  expect(roundGroups(sessions)).toMatchObject([{ stationId: 'd1-a', slot: 0, rounds: 3 }])
})
test('the same exercise in multiple stations stays separate for round consistency', () => {
  const w = analyticsWorkout('2026-10-01', [12, 10, 8]); w.routine.stations[1].slots[0].movements = [structuredClone(goblet)]
  expect(roundGroups(analyze([w]))).toHaveLength(2)
  expect(analyze([w])[0].sets).toHaveLength(6)
})
test('date filters include both boundaries and preserve multiple sessions on one date', () => {
  const before = analyticsWorkout('2026-09-30', [12, 12, 12]), one = analyticsWorkout('2026-10-01', [12, 10, 8]), two = analyticsWorkout('2026-10-01', [12, 12, 12]), after = analyticsWorkout('2026-10-02', [12, 12, 12])
  expect(exerciseSessions([before, one, two, after], key, ['anna'], { from: '2026-10-01', to: '2026-10-01' })).toHaveLength(2)
  expect(analyticsWindow('28', '2026-10-16')).toEqual({ from: '2026-09-19', to: '2026-10-16' })
  expect(analyticsWindow('28', '2026-03-30').from).toBe('2026-03-03')
})
