import { athleteIds, type AthleteId, type WeighIn } from './model'
import { addCalendarDays, calendarWeek, validCalendarDate } from './calendar'
import type { AnalyticsWindow } from './exercise-analytics'

export interface WeeklyWeight {
  week: string; end: string; days: number; measurements: number; value: number | null; change: number | null; partial: boolean
}
export type WeeklyStatistic = 'mean' | 'median'

export function weeklyWeights(entries: WeighIn[], athlete: AthleteId, window: AnalyticsWindow, statistic: WeeklyStatistic, currentDate: string): WeeklyWeight[] {
  if (!athleteIds.includes(athlete)) return []
  const unique = new Map<string, WeighIn>()
  for (const entry of entries) if (entry.athlete === athlete && validCalendarDate(entry.date) && entry.date <= currentDate && entry.weight > 0 && entry.weight < 1000 && Number.isFinite(entry.weight)) {
    if (!unique.has(entry.id) || unique.get(entry.id)!.revision < entry.revision) unique.set(entry.id, entry)
  }
  const days = new Map<string, number[]>()
  for (const entry of unique.values()) {
    if ((window.from && entry.date < window.from) || (window.to && entry.date > window.to)) continue
    days.set(entry.date, [...(days.get(entry.date) || []), entry.weight])
  }
  if (!days.size) return []
  const observedDates = [...days.keys()].sort(), first = calendarWeek(observedDates[0])[0]
  const last = calendarWeek(window.to && window.to < currentDate ? window.to : currentDate)[0]
  const result: WeeklyWeight[] = []
  for (let week = first; week <= last; week = addCalendarDays(week, 7)) {
    const dates = calendarWeek(week), observed = dates.filter(date => days.has(date))
    const values = observed.map(date => days.get(date)!.reduce((sum, weight) => sum + weight, 0) / days.get(date)!.length).sort((a, b) => a - b)
    const middle = Math.floor(values.length / 2)
    const value = !values.length ? null : statistic === 'mean' ? values.reduce((sum, weight) => sum + weight, 0) / values.length
      : values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
    const previous = result.at(-1)?.value ?? null
    result.push({ week, end: dates[6], days: observed.length, measurements: observed.reduce((sum, date) => sum + days.get(date)!.length, 0), value,
      change: value !== null && previous !== null ? value - previous : null,
      partial: dates[6] > currentDate || Boolean(window.from && week < window.from) || Boolean(window.to && dates[6] > window.to) })
  }
  return result
}
