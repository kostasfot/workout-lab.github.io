export const athleteIds = ['anna', 'dimitra'] as const
export type AthleteId = typeof athleteIds[number]
export const athletes = {
  anna: { name: 'Άννα', initial: 'Α', color: '#0d9488' },
  dimitra: { name: 'Δήμητρα', initial: 'Δ', color: '#8b5cf6' },
} as const

export interface Movement {
  id: string
  name: string
  equipment: string
  metric: 'reps' | 'seconds'
  target: number
  maximum?: number
  loaded: boolean
  unilateral?: 'leg' | 'arm'
}
export interface Slot { movements: Movement[]; alternatives?: boolean }
export interface Station { id: string; name: string; rounds: number; rest: number | null; slots: [Slot, Slot] }
export interface Routine { id: string; name: string; subtitle: string; focus: string; stations: Station[] }
export interface Program { id: string; revision: number; routines: Routine[]; createdAt: string }
export interface SetResult {
  key: string; athlete: AthleteId; station: string; round: number; slot: number;
  movement: Movement; status: 'pending' | 'completed' | 'skipped';
  weight: number | null; value: number | null; otherSide?: number | null
}
export interface Workout {
  id: string; programId: string; routine: Routine; startedAt: string; completedAt?: string;
  status: 'active' | 'completed' | 'partial'; stationIndex: number; roundIndex: number; phase: 0 | 1;
  participants: AthleteId[]; selections: Record<string, string>; results: Record<string, SetResult>;
  revision: number
}
export interface WeighIn { id: string; athlete: AthleteId; date: string; weight: number; revision: number; createdAt: string }
export interface CoachNote { id: string; workoutId: string; athlete: AthleteId; text: string; revision: number }
export interface Goal { id: AthleteId; value: number | null; revision: number }
export interface Comparison { id: string; date: string; name: string; results: Record<AthleteId, { completed: number; skipped: number }> }
export interface Workspace {
  program: Program; workouts: Workout[]; weighIns: WeighIn[]; goals: Record<AthleteId, Goal>;
  comparisons: Comparison[]; notes: CoachNote[];
  historyDeletion?: boolean; deletedRecords?: DeletedRecord[]
}
export interface DeletedRecord { kind: 'workout' | 'weighin'; id: string; revision: number }
export interface Deletion { id: string; revision: number; deleted: true }
export type MutationKind = 'program' | 'workout' | 'weighin' | 'goal' | 'note'
export type MutationPayload = Program | Workout | WeighIn | Goal | CoachNote | Deletion
export const isDeletion = (payload: MutationPayload): payload is Deletion => 'deleted' in payload && payload.deleted === true

export function deleteLoggedSet(workout: Workout, key: string): Workout {
  if (workout.status === 'active') throw new Error('Η προπόνηση είναι ακόμη σε εξέλιξη.')
  const results = { ...workout.results }
  delete results[key]
  return { ...workout, results, status: allExpected(workout).every(r => results[r.key]?.status === 'completed') ? 'completed' : 'partial' }
}

export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (name: string) => parts.find(p => p.type === name)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function formatDate(value: string, long = false) {
  return new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: long ? 'long' : 'short', year: long ? 'numeric' : undefined, timeZone: 'Europe/Athens' }).format(new Date(value.length === 10 ? value + 'T12:00:00Z' : value))
}
export function formatTarget(m: Movement) {
  return `${m.target}${m.maximum ? `–${m.maximum}` : ''} ${m.metric === 'seconds' ? 'δευτ.' : m.unilateral === 'leg' ? '/ πόδι' : m.unilateral === 'arm' ? '/ χέρι' : 'επαναλήψεις'}`
}
export const slotFor = (athlete: AthleteId, phase: number) => (phase + (athlete === 'dimitra' ? 1 : 0)) % 2
export function movementsFor(w: Workout, athlete: AthleteId, station: Station, slotIndex: number) {
  const slot = station.slots[slotIndex]
  return slot.alternatives ? [slot.movements.find(m => m.id === w.selections[`${athlete}:${station.id}`]) || slot.movements[0]] : slot.movements
}
export const resultKey = (athlete: AthleteId, station: string, round: number, slot: number, movement: string) => `${athlete}:${station}:${round}:${slot}:${movement}`
export function blankResult(w: Workout, athlete: AthleteId, movement: Movement, slot: number, stationIndex = w.stationIndex, round = w.roundIndex): SetResult {
  const station = w.routine.stations[stationIndex]
  return { key: resultKey(athlete, station.id, round, slot, movement.id), athlete, station: station.id, round, slot, movement, status: 'pending', weight: null, value: null }
}
export function requiredResults(w: Workout, onlyCurrentPhase = false): SetResult[] {
  const station = w.routine.stations[w.stationIndex]
  return w.participants.flatMap(athlete => (onlyCurrentPhase ? [slotFor(athlete, w.phase)] : [0, 1]).flatMap(slot => movementsFor(w, athlete, station, slot).map(m => {
    const result = blankResult(w, athlete, m, slot)
    return w.results[result.key] || result
  })))
}
export const isRecorded = (r: SetResult) => r.status === 'completed' || r.status === 'skipped'
export function validResult(r: SetResult) {
  return r.value !== null && Number.isFinite(r.value) && r.value > 0 && (r.movement.metric !== 'reps' || Number.isInteger(r.value)) &&
    (!r.movement.loaded || (r.weight !== null && Number.isFinite(r.weight) && r.weight >= 0)) &&
    (r.otherSide == null || (Number.isInteger(r.otherSide) && r.otherSide > 0))
}
export function advanceWorkout(w: Workout): Workout {
  if (!requiredResults(w, w.phase === 0).every(isRecorded)) throw new Error('Καταγράψτε ή παραλείψτε τις τρέχουσες ασκήσεις πριν συνεχίσετε.')
  if (w.phase === 0) return { ...w, phase: 1 }
  const station = w.routine.stations[w.stationIndex]
  if (w.roundIndex + 1 < station.rounds) return { ...w, phase: 0, roundIndex: w.roundIndex + 1 }
  if (w.stationIndex + 1 < w.routine.stations.length) return { ...w, phase: 0, roundIndex: 0, stationIndex: w.stationIndex + 1 }
  return w
}
export function allExpected(w: Workout) {
  return w.routine.stations.flatMap((station, stationIndex) => Array.from({ length: station.rounds }, (_, round) =>
    w.participants.flatMap(athlete => [0, 1].flatMap(slot => movementsFor(w, athlete, station, slot).map(m => blankResult(w, athlete, m, slot, stationIndex, round))))).flat())
}
export function progress(w: Workout) {
  const expected = allExpected(w)
  const recorded = expected.filter(r => isRecorded(w.results[r.key] || r)).length
  return { recorded, total: expected.length, percent: expected.length ? Math.round(recorded / expected.length * 100) : 0 }
}
export function finishWorkout(w: Workout): Workout {
  const expected = allExpected(w)
  const complete = expected.every(r => w.results[r.key]?.status === 'completed')
  const results = { ...w.results }
  for (const result of expected) if (!isRecorded(results[result.key] || result)) results[result.key] = { ...result, status: 'skipped' }
  return { ...w, results, status: complete ? 'completed' : 'partial', completedAt: new Date().toISOString() }
}
export function createWorkout(routine: Routine, programId: string, participants: AthleteId[] = [...athleteIds]): Workout {
  return { id: crypto.randomUUID(), programId, routine: structuredClone(routine), startedAt: new Date().toISOString(), status: 'active', stationIndex: 0, roundIndex: 0, phase: 0, participants, selections: {}, results: {}, revision: 0 }
}
export function weightStats(entries: WeighIn[], athlete: AthleteId) {
  const ordered = entries.filter(e => e.athlete === athlete).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  const first = ordered[0], latest = ordered.at(-1), previous = ordered.at(-2)
  return { first, latest, previous, change: first && latest ? latest.weight - first.weight : null, previousChange: previous && latest ? latest.weight - previous.weight : null }
}
