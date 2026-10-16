import { expect, test } from 'vitest'
import { weeklyWeights } from '../../src/lib/weight-trends'
import type { WeighIn } from '../../src/lib/model'

const entry = (date: string, weight: number): WeighIn => ({ id: crypto.randomUUID(), date, weight, athlete: 'anna', revision: 1, createdAt: `${date}T09:00:00Z` })
const current = '2026-10-16'
test('weekly means weight measurement days equally, with source measurement and day counts', () => {
  const rows = [entry('2026-10-01', 100), entry('2026-10-01', 102), entry('2026-10-03', 99)]
  expect(weeklyWeights(rows, 'anna', {}, 'mean', current)[0]).toMatchObject({ week: '2026-09-28', value: 100, days: 2, measurements: 3, change: null, partial: false })
})
test('weekly median uses daily means and handles odd and even numbers of measured days', () => {
  const rows = [entry('2026-10-01', 100), entry('2026-10-02', 102), entry('2026-10-03', 98), entry('2026-10-04', 200)]
  expect(weeklyWeights(rows, 'anna', {}, 'median', current)[0].value).toBe(101)
  expect(weeklyWeights(rows.slice(0, 3), 'anna', {}, 'median', current)[0].value).toBe(100)
})
test('empty weeks remain null and week-to-week changes never bridge a missing week', () => {
  const rows = [entry('2026-10-01', 100), entry('2026-10-14', 98)]
  expect(weeklyWeights(rows, 'anna', {}, 'mean', current).map(w => [w.value, w.change, w.days])).toEqual([[100, null, 1], [null, null, 0], [98, null, 1]])
})
test('adjacent measured weeks use unrounded values for changes', () => {
  const rows = [entry('2026-10-01', 100), entry('2026-10-03', 101), entry('2026-10-08', 100)]
  expect(weeklyWeights(rows, 'anna', {}, 'mean', '2026-10-11')[1].change).toBe(-0.5)
})
test('filters and current-week boundaries are explicit, with no future/invalid measurements', () => {
  const rows = [entry('2026-10-01', 100), entry('2026-10-03', 99), entry('2026-10-14', 98), entry('2026-10-17', 1), entry('2026-02-31', 2), entry('2026-10-15', NaN)]
  const result = weeklyWeights(rows, 'anna', { from: '2026-10-02', to: '2026-10-15' }, 'mean', current)
  expect(result[0]).toMatchObject({ value: 99, days: 1, partial: true })
  expect(result.at(-1)).toMatchObject({ value: 98, days: 1, partial: true })
  expect(weeklyWeights(rows, 'dimitra', {}, 'mean', current)).toEqual([])
})
test('duplicate record revisions do not double count; distinct same-day measurements are retained', () => {
  const original = entry('2026-10-01', 100)
  expect(weeklyWeights([original, { ...original, revision: 2, weight: 98 }], 'anna', {}, 'mean', current)[0]).toMatchObject({ value: 98, measurements: 1 })
})
test('Monday weeks and empty inputs work across year and daylight-saving boundaries', () => {
  expect(weeklyWeights([entry('2026-01-01', 100)], 'anna', {}, 'mean', '2026-01-04')[0].week).toBe('2025-12-29')
  expect(weeklyWeights([], 'anna', {}, 'mean', current)).toEqual([])
})
