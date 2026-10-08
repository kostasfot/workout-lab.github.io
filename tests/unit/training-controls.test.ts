import { expect, test } from 'vitest'
import { canRecordTogether, createWorkout, requiredResults } from '../../src/lib/model'
import { quickValues, recordAndSwap, roundStep } from '../../src/lib/live'
import { initialRoutines } from '../../src/lib/program'

test('the four round steps follow actual records and manual advancement', () => {
  const w = createWorkout(initialRoutines[0], 'program')
  expect(roundStep(w)).toBe(0)
  for (const r of requiredResults(w, true)) w.results[r.key] = { ...r, status: 'completed', value: 10, weight: r.movement.loaded ? 6 : null }
  expect(roundStep(w)).toBe(1)
  const swapped = recordAndSwap(w)
  expect(roundStep(swapped)).toBe(2)
  for (const r of requiredResults(swapped, true)) swapped.results[r.key] = { ...r, status: 'skipped' }
  expect(roundStep(swapped)).toBe(3)
  expect(swapped.roundIndex).toBe(0)
})

test('quick reps reflect the exercise range, fixed targets and bounded choices', () => {
  const w = createWorkout(initialRoutines[0], 'program'), r = requiredResults(w, true)[0]
  expect(quickValues([], w, r, 'value')).toEqual([10, 11, 12])
  expect(quickValues([], w, { ...r, movement: { ...r.movement, target: 15, maximum: undefined } }, 'value')).toEqual([15])
  expect(quickValues([], w, { ...r, movement: { ...r.movement, maximum: 100 } }, 'value')).toEqual([10, 55, 100])
  expect(quickValues([], w, r, 'weight')).toEqual([])
})

test('recent weight choices stay within the athlete and exercise, deduplicate and ignore incomplete or incompatible history', () => {
  const w = createWorkout(initialRoutines[0], 'program'), first = requiredResults(w, true)[0]
  w.results[first.key] = { ...first, status: 'completed', value: 10, weight: 7.5 }; w.roundIndex = 1
  const expected = requiredResults(w, true)[0], saved = structuredClone(w)
  saved.id = 'history'; saved.status = 'partial'; saved.results = {
    a: { ...first, weight: 6.25, status: 'completed', value: 11 },
    b: { ...first, athlete: 'dimitra', weight: 11.25, status: 'completed', value: 12 },
    c: { ...first, weight: 10, status: 'pending', value: 11 },
    d: { ...first, weight: 8, status: 'completed', value: 35, movement: { ...first.movement, metric: 'seconds' } },
    e: { ...first, weight: 6.25, status: 'completed', value: 11 },
  }
  expect(quickValues([saved], w, expected, 'weight')).toEqual([7.5, 6.25])
  expect(quickValues([{ ...saved, status: 'active' }], w, expected, 'weight')).toEqual([7.5])
})

test('quick choices preserve actual seconds and optional other-side counts', () => {
  const w = createWorkout(initialRoutines[2], 'program'), first = requiredResults(w, true)[0]
  w.results[first.key] = { ...first, status: 'completed', value: 37, weight: 6.25 }; w.roundIndex = 1
  expect(quickValues([], w, requiredResults(w, true)[0], 'value')).toEqual([40, 37])
  const legs = createWorkout(initialRoutines[0], 'program'); legs.stationIndex = 2
  const leg = requiredResults(legs, true)[0]
  legs.results[leg.key] = { ...leg, status: 'completed', value: 11, weight: 6, otherSide: 8 }; legs.roundIndex = 1
  expect(quickValues([], legs, requiredResults(legs, true)[0], 'otherSide')).toEqual([10, 8])
})

test('combined recording saves both TRX movements and swaps atomically, rejecting incomplete or replayed actions', () => {
  const w = createWorkout(initialRoutines[1], 'program'); w.stationIndex = 2
  const current = requiredResults(w, true)
  for (const r of current.slice(0, 2)) w.results[r.key] = { ...r, status: 'pending', value: 10, weight: r.movement.loaded ? 6.25 : null }
  expect(() => recordAndSwap(w)).toThrow(/τιμές/)
  expect(w.phase).toBe(0); expect(Object.values(w.results).every(r => r.status === 'pending')).toBe(true)
  const last = current[2]; w.results[last.key] = { ...last, status: 'pending', value: 9 }
  expect(canRecordTogether(w)).toBe(true)
  const swapped = recordAndSwap(w)
  expect(swapped.phase).toBe(1); expect(swapped.roundIndex).toBe(0)
  expect(Object.values(swapped.results).filter(r => r.status === 'completed')).toHaveLength(3)
  expect(swapped.results[last.key].value).toBe(9)
  expect(() => recordAndSwap(swapped)).toThrow(/πρώτο ζεύγος/)
  expect(() => recordAndSwap({ ...w, participants: ['anna'] })).toThrow()
})
