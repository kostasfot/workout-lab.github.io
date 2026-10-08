import { expect, test } from 'vitest'
import { canRecordTogether, createWorkout, requiredResults } from '../../src/lib/model'
import { initialRoutines } from '../../src/lib/program'
import { recordingIssues } from '../../src/lib/live'

test('recording feedback identifies the first missing field for each present athlete', () => {
  const w = createWorkout(initialRoutines[0], 'program'), [a, d] = requiredResults(w, true)
  expect(recordingIssues(w)).toEqual(['Άννα: συμπληρώστε βάρος', 'Δήμητρα: συμπληρώστε επαναλήψεις'])
  w.results[a.key] = { ...a, weight: 0, value: 10 }
  w.results[d.key] = { ...d, value: 11 }
  expect(recordingIssues(w)).toEqual([]); expect(canRecordTogether(w)).toBe(true)
  w.participants = ['anna']; delete w.results[d.key]
  expect(recordingIssues(w)).toEqual([])
})

test('feedback covers invalid limits and optional side counts without modifying actual values', () => {
  const w = createWorkout(initialRoutines[0], 'program'); w.stationIndex = 2; w.participants = ['anna']
  const r = requiredResults(w, true)[0]
  w.results[r.key] = { ...r, weight: 501, value: 10 }
  expect(recordingIssues(w)[0]).toContain('ελέγξτε βάρος'); expect(canRecordTogether(w)).toBe(false)
  w.results[r.key].weight = 6.25; w.results[r.key].value = 10.5
  expect(recordingIssues(w)[0]).toContain('ελέγξτε επαναλήψεις')
  w.results[r.key].value = 10; w.results[r.key].otherSide = 3601
  expect(recordingIssues(w)[0]).toContain('ελέγξτε την άλλη πλευρά')
  expect(w.results[r.key].otherSide).toBe(3601)
  w.results[r.key].status = 'skipped'; expect(recordingIssues(w)).toEqual([])
})

test('multiple movements name the exercise that still needs attention', () => {
  const w = createWorkout(initialRoutines[1], 'program'); w.stationIndex = 2
  const [a, curls, triceps] = requiredResults(w, true)
  w.results[a.key] = { ...a, status: 'completed', weight: 6, value: 10 }
  w.results[curls.key] = { ...curls, status: 'skipped' }
  expect(recordingIssues(w)).toEqual(['Δήμητρα · TRX Triceps Extensions: συμπληρώστε επαναλήψεις'])
  w.results[triceps.key] = { ...triceps, value: 11 }
  expect(recordingIssues(w)).toEqual([]); expect(canRecordTogether(w)).toBe(true)
})

test('timed feedback uses duration and follows the current exercise phase', () => {
  const w = createWorkout(initialRoutines[2], 'program'); w.phase = 1; w.participants = ['anna']
  const r = requiredResults(w, true)[0]
  expect(recordingIssues(w)).toEqual(['Άννα: συμπληρώστε διάρκεια'])
  w.results[r.key] = { ...r, value: 4000 }
  expect(recordingIssues(w)[0]).toContain('ελέγξτε διάρκεια')
  w.results[r.key].value = 35; expect(recordingIssues(w)).toEqual([])
})
