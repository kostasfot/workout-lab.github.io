import { expect, test } from 'vitest'
import { canRecordTogether, createWorkout, requiredResults } from '../../src/lib/model'
import { recordAndSwap, roundStep } from '../../src/lib/live'
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
