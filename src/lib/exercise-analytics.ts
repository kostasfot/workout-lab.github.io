import { allExpected, athleteIds, validResult, workoutDate, type AthleteId, type Movement, type Program, type SetResult, type Workout, type Workspace } from './model'
import { addCalendarDays, validCalendarDate } from './calendar'

const normalized = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')

// Targets may change without changing the exercise. A renamed/replaced movement,
// different equipment, metric or side convention must not inherit its records.
export function exerciseKey(movement: Movement) {
  return JSON.stringify([movement.id, normalized(movement.name), normalized(movement.equipment), movement.metric, movement.loaded, movement.unilateral || null])
}

export interface ExerciseOption { key: string; movement: Movement }
export interface ExerciseSet {
  key: string; athlete: AthleteId; stationId: string; stationName: string; stationIndex: number; slot: number; round: number
  movement: Movement; state: 'completed' | 'skipped' | 'missing' | 'invalid'
  weight: number | null; value: number | null; otherSide: number | null; performance: number | null; targetMet: boolean
}
export interface ExerciseSession {
  workoutId: string; date: string; startedAt: string; name: string; athlete: AthleteId; sets: ExerciseSet[]
}
export interface ExerciseSummary {
  sessions: number; planned: number; completed: number; skipped: number; missing: number; invalid: number; met: number
  attainment: number | null; completion: number | null
}
export interface ExerciseRecord { session: ExerciseSession; set: ExerciseSet }
export interface RoundGroup { key: string; stationId: string; stationName: string; slot: number; rounds: number }
export interface AnalyticsWindow { from?: string; to?: string }

export function analyticsWindow(period: string, currentDate: string, from?: string, to?: string): AnalyticsWindow {
  if (period === 'custom') return { from, to }
  return { from: period === '28' || period === '84' ? addCalendarDays(currentDate, 1 - Number(period)) : undefined, to: currentDate }
}

export function savedAnalyticsWorkouts(data: Pick<Workspace, 'workouts' | 'deletedRecords'>) {
  const deleted = new Set((data.deletedRecords || []).filter(r => r.kind === 'workout').map(r => r.id))
  const unique = new Map<string, Workout>()
  for (const workout of data.workouts) {
    if (workout.status === 'active' || deleted.has(workout.id) || !validCalendarDate(workoutDate(workout))) continue
    if (!unique.has(workout.id) || unique.get(workout.id)!.revision < workout.revision) unique.set(workout.id, workout)
  }
  return [...unique.values()].sort((a, b) => workoutDate(a).localeCompare(workoutDate(b)) || a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
}

export function exerciseOptions(program: Program, workouts: Workout[]): ExerciseOption[] {
  const options = new Map<string, ExerciseOption>()
  const add = (movement: Movement) => options.set(exerciseKey(movement), { key: exerciseKey(movement), movement })
  // Keep program order familiar, while retaining historical/alternative exercises.
  for (const routine of program.routines) for (const station of routine.stations) for (const slot of station.slots) for (const movement of slot.movements) add(movement)
  for (const workout of workouts) for (const row of allExpected(workout)) if (!options.has(exerciseKey(row.movement))) add(row.movement)
  return [...options.values()]
}

function observedSet(expected: SetResult, result: SetResult | undefined, workout: Workout): ExerciseSet {
  const stationIndex = workout.routine.stations.findIndex(s => s.id === expected.station)
  const base = { key: expected.key, athlete: expected.athlete, stationId: expected.station, stationName: workout.routine.stations[stationIndex].name,
    stationIndex, slot: expected.slot, round: expected.round + 1, movement: expected.movement, weight: null, value: null, otherSide: null, performance: null, targetMet: false }
  if (!result || result.status === 'pending') return { ...base, state: 'missing' }
  if (result.status === 'skipped') return { ...base, state: 'skipped' }
  const valid = result.status === 'completed' && result.key === expected.key && result.athlete === expected.athlete && result.station === expected.station && result.round === expected.round && result.slot === expected.slot && exerciseKey(result.movement) === exerciseKey(expected.movement) && validResult(result) && result.value! <= 3600 && (result.weight ?? 0) <= 500 && (result.otherSide ?? 0) <= 3600
  if (!valid) return { ...base, state: 'invalid' }
  const performance = expected.movement.unilateral ? Math.min(result.value!, result.otherSide ?? result.value!) : result.value!
  return { ...base, state: 'completed', weight: expected.movement.loaded ? result.weight : null, value: result.value,
    otherSide: expected.movement.unilateral ? result.otherSide ?? null : null, performance, targetMet: performance >= expected.movement.target }
}

export function exerciseSessions(workouts: Workout[], key: string, participants: readonly AthleteId[], window: AnalyticsWindow = {}): ExerciseSession[] {
  const sessions: ExerciseSession[] = []
  for (const workout of workouts) {
    const date = workoutDate(workout)
    if (workout.status === 'active' || !validCalendarDate(date) || (window.from && date < window.from) || (window.to && date > window.to)) continue
    const expected = allExpected(workout).filter(row => exerciseKey(row.movement) === key)
    for (const athlete of participants) {
      if (!athleteIds.includes(athlete) || !workout.participants.includes(athlete)) continue
      const sets = expected.filter(row => row.athlete === athlete).map(row => observedSet(row, workout.results[row.key], workout))
      if (sets.length) sessions.push({ workoutId: workout.id, date, startedAt: workout.startedAt, name: workout.routine.name, athlete, sets })
    }
  }
  return sessions.sort((a, b) => a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt) || a.workoutId.localeCompare(b.workoutId) || a.athlete.localeCompare(b.athlete))
}

export function exerciseSummary(sessions: ExerciseSession[]): ExerciseSummary {
  const sets = sessions.flatMap(s => s.sets), completed = sets.filter(s => s.state === 'completed')
  const met = completed.filter(s => s.targetMet).length
  return { sessions: new Set(sessions.map(s => s.workoutId)).size, planned: sets.length, completed: completed.length, skipped: sets.filter(s => s.state === 'skipped').length,
    missing: sets.filter(s => s.state === 'missing').length, invalid: sets.filter(s => s.state === 'invalid').length, met,
    attainment: completed.length ? met / completed.length * 100 : null, completion: sets.length ? completed.length / sets.length * 100 : null }
}

export function sessionValue(session: ExerciseSession, metric: 'weight' | 'value') {
  const sets = session.sets.filter(s => s.state === 'completed')
  if (!sets.length) return null
  if (metric === 'weight') return session.sets[0].movement.loaded ? Math.max(...sets.map(s => s.weight!)) : null
  return sets.reduce((sum, set) => sum + set.performance!, 0) / sets.length
}

export function personalRecords(sessions: ExerciseSession[], minimum: number, atWeight: number | null) {
  const records: ExerciseRecord[] = sessions.flatMap(session => session.sets.filter(set => set.state === 'completed').map(set => ({ session, set })))
  const best = (eligible: ExerciseRecord[], metric: 'weight' | 'performance') => eligible.reduce<ExerciseRecord | null>((record, next) => !record || next.set[metric]! > record.set[metric]! ? next : record, null)
  return {
    load: Number.isFinite(minimum) && minimum > 0 ? best(records.filter(r => r.set.movement.loaded && r.set.performance! >= minimum), 'weight') : null,
    performance: best(records.filter(r => !r.set.movement.loaded || (atWeight !== null && r.set.weight === atWeight)), 'performance'),
  }
}

export function roundGroups(sessions: ExerciseSession[]): RoundGroup[] {
  const groups = new Map<string, RoundGroup>()
  for (const session of sessions) for (const set of session.sets) {
    const key = JSON.stringify([set.stationId, set.slot]), previous = groups.get(key)
    groups.set(key, { key, stationId: set.stationId, stationName: set.stationName, slot: set.slot, rounds: Math.max(previous?.rounds || 0, set.round) })
  }
  return [...groups.values()]
}

export function roundChange(sets: ExerciseSet[]): { percent: number | null; reason: string | null } {
  if (sets.length < 2) return { percent: null, reason: 'Χρειάζονται τουλάχιστον δύο γύροι.' }
  if (sets.some(s => s.state !== 'completed')) return { percent: null, reason: 'Δεν έχουν ολοκληρωθεί όλοι οι γύροι.' }
  if (new Set(sets.map(s => s.weight)).size > 1) return { percent: null, reason: 'Διαφορετικό βάρος μεταξύ γύρων.' }
  if (new Set(sets.map(s => s.movement.target)).size > 1) return { percent: null, reason: 'Διαφορετικοί στόχοι μεταξύ γύρων.' }
  const ordered = [...sets].sort((a, b) => a.round - b.round)
  return { percent: (ordered.at(-1)!.performance! - ordered[0].performance!) / ordered[0].performance! * 100, reason: null }
}
