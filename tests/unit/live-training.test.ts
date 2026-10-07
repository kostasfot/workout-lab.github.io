import { describe, expect, test } from 'vitest'
import { allExpected, createWorkout, finishWorkout, previousResult, requiredResults, type SetResult } from '../../src/lib/model'
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
