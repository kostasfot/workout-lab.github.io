import { describe, expect, test } from 'vitest'
import { emptyWorkspace, initialRoutines } from '../../src/lib/program'
import { advanceWorkout, allExpected, applyWorkoutEdits, calendarDate, compareWorkoutDates, createWorkout, deleteLoggedSet, discardActiveWorkout, finishWorkout, formatTarget, progress, requiredResults, validResult, workoutDate } from '../../src/lib/model'

describe('paired training program', () => {
  test('contains the exact routines, combined movements, rest defaults, and empty measurements', () => {
    expect(initialRoutines.map(r => allExpected(createWorkout(r, 'test')).length)).toEqual([44, 50, 24])
    expect(initialRoutines.map(r => r.stations.map(s => s.rest))).toEqual([[60, 60, 60, null], [60, 60, 60, null], [20, 20]])
    expect(formatTarget(initialRoutines[0].stations[3].slots[0].movements[0])).toBe('15 επαναλήψεις')
    expect(formatTarget(initialRoutines[0].stations[2].slots[0].movements[0])).toBe('10 / πόδι')
    expect(initialRoutines[1].stations[2].slots[1].movements).toHaveLength(2)
    expect(emptyWorkspace().weighIns).toEqual([])
    expect(emptyWorkspace().goals.anna.value).toBeNull()
    expect(emptyWorkspace().goals.dimitra.value).toBeNull()
  })
  test('requires actual records, swaps athletes, and retains different per-athlete values across rounds', () => {
    let w = createWorkout(initialRoutines[0], 'test')
    expect(() => advanceWorkout(w)).toThrow()
    expect(requiredResults(w, true).map(r => r.movement.name)).toEqual(['Goblet Squats', 'TRX Rows'])
    for (const result of requiredResults(w, true)) w.results[result.key] = { ...result, status: 'completed', weight: result.movement.loaded ? 6 : null, value: result.athlete === 'anna' ? 10 : 12 }
    w = advanceWorkout(w)
    expect(w.phase).toBe(1)
    expect(requiredResults(w, true).map(r => r.movement.name)).toEqual(['TRX Rows', 'Goblet Squats'])
    for (const result of requiredResults(w, true)) w.results[result.key] = { ...result, status: 'completed', weight: result.movement.loaded ? 8 : null, value: 11 }
    w = advanceWorkout(w)
    expect(w.roundIndex).toBe(1)
    expect(w.phase).toBe(0)
    expect(Object.values(w.results).map(r => r.value)).toEqual([10, 12, 11, 11])
    expect(progress(w).recorded).toBe(4)
  })
  test('timed actuals stay independent of targets and bodyweight does not require load', () => {
    const w = createWorkout(initialRoutines[2], 'test')
    const [loaded, bodyweight] = requiredResults(w, true)
    expect(validResult({ ...loaded, value: 38 })).toBe(false)
    expect(validResult({ ...loaded, value: 38, weight: 5 })).toBe(true)
    expect(validResult({ ...bodyweight, value: 37 })).toBe(true)
    expect(bodyweight.movement.target).toBe(40)
    expect(validResult({ ...bodyweight, value: null })).toBe(false)
    expect(validResult({ ...bodyweight, value: -1 })).toBe(false)
  })
  test('partial completion marks only missing work skipped and does not fabricate values', () => {
    const w = createWorkout(initialRoutines[0], 'test')
    const one = requiredResults(w, true)[0]
    w.results[one.key] = { ...one, status: 'completed', weight: 7, value: 10 }
    const done = finishWorkout(w)
    expect(done.status).toBe('partial')
    expect(Object.values(done.results).filter(r => r.status === 'skipped')).toHaveLength(43)
    expect(done.results[one.key].weight).toBe(7)
    expect(Object.values(done.results).filter(r => r.status === 'skipped').every(r => r.value === null)).toBe(true)
  })
  test('an absent athlete has no expected records and program edits cannot mutate a session snapshot', () => {
    const program = emptyWorkspace().program
    const w = createWorkout(program.routines[0], program.id, ['anna'])
    expect(allExpected(w)).toHaveLength(22)
    program.routines[0].stations[0].slots[0].movements[0].target = 20
    expect(w.routine.stations[0].slots[0].movements[0].target).toBe(10)
    expect(allExpected(w).every(r => r.athlete === 'anna')).toBe(true)
  })
  test('deleting a completed set removes only that result and marks the finished workout partial', () => {
    const w = createWorkout(initialRoutines[0], 'test')
    for (const r of allExpected(w)) w.results[r.key] = { ...r, status: 'completed', value: 10, weight: r.movement.loaded ? 5 : null }
    const completed = finishWorkout(w), key = Object.keys(completed.results)[0]
    const updated = deleteLoggedSet(completed, key)
    expect(updated.status).toBe('partial')
    expect(updated.results[key]).toBeUndefined()
    expect(Object.keys(updated.results)).toHaveLength(43)
    expect(Object.values(updated.results).every(r => r.status === 'completed')).toBe(true)
    expect(completed.results[key]).toBeDefined()
    expect(() => deleteLoggedSet(w, key)).toThrow(/σε εξέλιξη/)
  })
  test('saved workout edits preserve timestamps and the program snapshot while updating dates and actuals', () => {
    const original = finishWorkout(createWorkout(initialRoutines[0], 'program'))
    const draft = structuredClone(original), result = allExpected(original)[0]
    draft.date = '2026-10-01'
    draft.results[result.key] = { ...result, status: 'completed', weight: 6.25, value: 12 }
    const updated = applyWorkoutEdits(original, original, draft)
    expect(updated.date).toBe('2026-10-01')
    expect(updated.startedAt).toBe(original.startedAt); expect(updated.completedAt).toBe(original.completedAt)
    expect(updated.routine).toEqual(original.routine)
    expect(updated.results[result.key].value).toBe(12)
    expect(original.results[result.key].status).toBe('skipped')
    expect(updated.status).toBe('partial')
    expect([updated, original].sort(compareWorkoutDates)[0]).toBe(original)
    const legacy = { ...original, date: undefined, completedAt: '2026-10-01T22:30:00Z' }
    expect(workoutDate(legacy)).toBe('2026-10-02')
    expect(calendarDate('2026-10-01T22:30:00Z')).toBe('2026-10-02')
  })
  test('saved workout edits validate dates and values, and can remove a result without inventing skipped work', () => {
    const original = finishWorkout(createWorkout(initialRoutines[0], 'program'))
    const invalidDate = { ...structuredClone(original), date: '2026-02-29' }
    expect(() => applyWorkoutEdits(original, original, invalidDate)).toThrow(/ημερομηνία/)
    expect(() => applyWorkoutEdits(original, original, { ...invalidDate, date: '' })).toThrow(/ημερομηνία/)
    expect(() => applyWorkoutEdits(original, original, { ...invalidDate, date: '2099-01-01' })).toThrow(/ημερομηνία/)
    const draft = structuredClone(original), result = allExpected(original)[0]
    draft.results[result.key] = { ...result, status: 'completed', value: 10, weight: null }
    expect(() => applyWorkoutEdits(original, original, draft)).toThrow(/Ελέγξτε/)
    draft.results[result.key] = { ...result, status: 'pending' }
    expect(applyWorkoutEdits(original, original, draft).results[result.key]).toBeUndefined()
  })
  test('saved edits preserve concurrent changes to other sets and reject changes to the same set or date', () => {
    const original = finishWorkout(createWorkout(initialRoutines[0], 'program'))
    const [first, second] = allExpected(original), draft = structuredClone(original), latest = structuredClone(original)
    draft.results[first.key] = { ...first, status: 'completed', weight: 5, value: 10 }
    latest.results[second.key] = { ...second, status: 'completed', weight: second.movement.loaded ? 6 : null, value: 11 }
    // A server round trip may reorder JSON keys without changing any result.
    latest.results[first.key] = Object.fromEntries(Object.entries(latest.results[first.key]).reverse()) as typeof first
    const merged = applyWorkoutEdits(latest, original, draft)
    expect(merged.results[first.key].value).toBe(10); expect(merged.results[second.key].value).toBe(11)
    latest.results[first.key] = { ...draft.results[first.key], value: 9 }
    expect(() => applyWorkoutEdits(latest, original, draft)).toThrow(/ίδιο σετ/)
    draft.date = '2026-10-01'; latest.date = '2026-10-02'
    expect(() => applyWorkoutEdits(latest, original, draft)).toThrow(/ημερομηνία άλλαξε/)
  })
  test('discard removes only the active workout and its private notes without generating history', () => {
    const workspace = emptyWorkspace(), active = createWorkout(initialRoutines[0], 'program'), saved = finishWorkout(createWorkout(initialRoutines[1], 'program'))
    workspace.workouts = [active, saved]
    workspace.notes = [{ id: 'note', workoutId: active.id, athlete: 'anna', text: 'draft', revision: 0 }]
    const changes = discardActiveWorkout(workspace, active.id)
    expect(workspace.workouts).toEqual([saved]); expect(workspace.notes).toEqual([])
    expect(changes).toEqual([{ kind: 'workout', payload: { id: active.id, revision: 0, deleted: true, discard: true } }])
    expect(() => discardActiveWorkout(workspace, saved.id)).toThrow(/ενεργή/)
  })
})
