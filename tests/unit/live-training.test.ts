import { describe, expect, test } from 'vitest'
import { allExpected, canRecordTogether, createWorkout, finishWorkout, previousResult, recordTogether, requiredResults, type SetResult } from '../../src/lib/model'
import { initialRoutines } from '../../src/lib/program'

const completed = (r: SetResult, value = 10, weight = 6): SetResult => ({ ...r, status: 'completed', value, weight: r.movement.loaded ? weight : null })

describe('reuse actual exercise values', () => {
  test('uses the most recent completed earlier round for this athlete, station and exercise', () => {
    const w = createWorkout(initialRoutines[0], 'program')
    const first = requiredResults(w, true)[0]
    w.results[first.key] = completed(first, 9, 5)
    w.roundIndex = 1
    const second = requiredResults(w, true)[0]
    w.results[second.key] = completed(second, 11, 7.5)
    w.roundIndex = 2
    const third = requiredResults(w, true)[0]
    w.results[third.key] = completed(third, 13, 8)
    expect(previousResult([], w, third)).toEqual({ result: w.results[second.key], source: 'round' })
    w.results[second.key].status = 'skipped'
    expect(previousResult([], w, third)?.result).toEqual(w.results[first.key])
    expect(previousResult([], w, requiredResults(w, true)[1])).toBeUndefined()
  })
  test('falls back to the last completed set in the latest saved workout, ignoring incomplete, deleted, and active results', () => {
    const saved = createWorkout(initialRoutines[0], 'program'), current = createWorkout(initialRoutines[0], 'program')
    for (const r of allExpected(saved).filter(r => r.movement.id === 'goblet' && r.athlete === 'anna')) saved.results[r.key] = completed(r, 10 + r.round, 5 + r.round)
    const history = finishWorkout(saved), expected = requiredResults(current, true)[0]
    const newest = structuredClone(history)
    newest.id = 'newest'; newest.date = '2026-10-07'; history.date = '2026-10-01'
    const last = Object.values(newest.results).find(r => r.movement.id === 'goblet' && r.athlete === 'anna' && r.round === 2)!
    last.value = 15
    const unrelatedActive = structuredClone(newest); unrelatedActive.id = 'active'; unrelatedActive.status = 'active'
    expect(previousResult([history, unrelatedActive, newest], current, expected)?.result.value).toBe(15)
    delete newest.results[last.key]
    expect(previousResult([history, newest], current, expected)?.result.value).toBe(11)
    for (const r of Object.values(newest.results)) r.status = 'skipped'
    expect(previousResult([newest, history], current, expected)?.result.value).toBe(12)
  })
  test('keeps seconds and unilateral values, and rejects changed units or invalid history', () => {
    const saved = createWorkout(initialRoutines[2], 'program'), current = createWorkout(initialRoutines[2], 'program')
    const r = requiredResults(saved, true)[0]
    saved.results[r.key] = completed(r, 37, 6.25)
    const history = finishWorkout(saved), expected = requiredResults(current, true)[0]
    expect(previousResult([history], current, expected)?.result.value).toBe(37)
    expect(previousResult([history], current, { ...expected, movement: { ...expected.movement, metric: 'reps' } })).toBeUndefined()
    history.results[r.key].value = 4000
    expect(previousResult([history], current, expected)).toBeUndefined()
    const legs = createWorkout(initialRoutines[0], 'program'); legs.stationIndex = 2
    const leg = requiredResults(legs, true)[0]
    legs.results[leg.key] = { ...completed(leg), otherSide: 8 }; legs.roundIndex = 1
    expect(previousResult([], legs, requiredResults(legs, true)[0])?.result.otherSide).toBe(8)
  })
})

describe('record both athletes together', () => {
  test('requires all pending values, saves one pair, and neither advances nor duplicates records', () => {
    const w = createWorkout(initialRoutines[0], 'program'), [anna, dimitra] = requiredResults(w, true)
    w.results[anna.key] = { ...completed(anna), status: 'pending' }
    expect(canRecordTogether(w)).toBe(false)
    expect(() => recordTogether(w)).toThrow(/τιμές/)
    w.results[dimitra.key] = { ...completed(dimitra, 12), status: 'pending' }
    const recorded = recordTogether(w)
    expect(Object.values(recorded.results).map(r => r.status)).toEqual(['completed', 'completed'])
    expect(recorded.phase).toBe(0); expect(recorded.roundIndex).toBe(0)
    expect(recorded.results[dimitra.key].value).toBe(12)
    expect(w.results[anna.key].status).toBe('pending')
    expect(recordTogether(recorded)).toBe(recorded)
    expect(canRecordTogether(recorded)).toBe(false)
  })
  test('includes both TRX movements and preserves previously skipped or individually recorded results', () => {
    const w = createWorkout(initialRoutines[1], 'program'); w.stationIndex = 2
    const [press, curls, triceps] = requiredResults(w, true)
    w.results[press.key] = { ...press, status: 'skipped' }
    w.results[curls.key] = completed(curls, 9)
    expect(canRecordTogether(w)).toBe(false)
    w.results[triceps.key] = { ...completed(triceps, 11), status: 'pending' }
    const recorded = recordTogether(w)
    expect(recorded.results[press.key]).toEqual(w.results[press.key])
    expect(recorded.results[curls.key]).toEqual(w.results[curls.key])
    expect(recorded.results[triceps.key].status).toBe('completed')
  })
  test('supports actual seconds and unilateral counts, rejects absent athletes and invalid limits', () => {
    const timed = createWorkout(initialRoutines[2], 'program')
    for (const r of requiredResults(timed, true)) timed.results[r.key] = { ...completed(r, 35), status: 'pending' }
    expect(canRecordTogether(timed)).toBe(true)
    expect(Object.values(recordTogether(timed).results).every(r => r.value === 35)).toBe(true)
    const w = createWorkout(initialRoutines[0], 'program'); w.stationIndex = 2
    for (const r of requiredResults(w, true)) w.results[r.key] = { ...completed(r), status: 'pending', otherSide: r.movement.unilateral ? 8 : null }
    expect(Object.values(recordTogether(w).results)[0].otherSide).toBe(8)
    expect(canRecordTogether({ ...w, participants: ['anna'] })).toBe(false)
    expect(() => recordTogether({ ...w, participants: ['anna'] })).toThrow()
    Object.values(w.results)[0].value = 3601
    expect(canRecordTogether(w)).toBe(false)
  })
})
