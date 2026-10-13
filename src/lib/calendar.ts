import { athleteIds, createWorkout, today, workoutDate, type AthleteId, type CalendarSession, type CalendarWorkout, type Workspace } from './model'

export type CalendarDraft = Pick<CalendarSession, 'date' | 'startTime' | 'routineId' | 'participants'>
export type CalendarStatus = 'planned' | 'pending' | 'active' | 'completed' | 'partial' | 'cancelled' | 'removed'
export const calendarLabels: Record<CalendarStatus, string> = {
  planned: 'Προγραμματισμένη', pending: 'Εκκρεμεί', active: 'Σε εξέλιξη', completed: 'Ολοκληρώθηκε',
  partial: 'Μερική ολοκλήρωση', cancelled: 'Ακυρώθηκε', removed: 'Η καταγραφή διαγράφηκε',
}
export function validCalendarDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
}
export function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function calendarWeek(date = today()) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const monday = addCalendarDays(date, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, day) => addCalendarDays(monday, day))
}
export function calendarWeekday(date: string) {
  return new Intl.DateTimeFormat('el-GR', { weekday: 'long', timeZone: 'Europe/Athens' }).format(new Date(`${date}T12:00:00Z`))
}
export function validateCalendarDraft(data: Workspace, draft: CalendarDraft) {
  if (!validCalendarDate(draft.date)) throw new Error('Επιλέξτε έγκυρη ημερομηνία.')
  if (draft.startTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.startTime)) throw new Error('Επιλέξτε έγκυρη ώρα ή αφήστε την κενή.')
  if (!data.program.routines.some(r => r.id === draft.routineId)) throw new Error('Επιλέξτε διαθέσιμη προπόνηση.')
  if (!draft.participants.length || new Set(draft.participants).size !== draft.participants.length || draft.participants.some(a => !athleteIds.includes(a))) throw new Error('Επιλέξτε τουλάχιστον μία αθλήτρια.')
}
export function calendarWorkouts(data: Workspace): CalendarWorkout[] {
  const result = new Map((data.calendarWorkouts || []).map(w => [w.id, w]))
  for (const w of data.workouts) {
    const shared = result.get(w.id)
    result.set(w.id, { id: w.id, date: workoutDate(w), name: w.routine.name, routineId: w.routine.id, status: w.status,
      participants: shared?.participants || w.participants, scheduleId: w.scheduleId || shared?.scheduleId })
  }
  for (const deleted of data.deletedRecords || []) if (deleted.kind === 'workout') result.delete(deleted.id)
  return [...result.values()]
}
export function sessionWorkout(data: Workspace, session: CalendarSession) {
  const results = calendarWorkouts(data)
  return session.workoutId ? results.find(w => w.id === session.workoutId) : results.find(w => w.scheduleId === session.id)
}
export function calendarStatus(data: Workspace, session: CalendarSession, date = today()): CalendarStatus {
  const workout = sessionWorkout(data, session)
  if (workout) return workout.status
  if (session.status === 'cancelled') return 'cancelled'
  if (session.resultRemoved) return 'removed'
  return session.date < date ? 'pending' : 'planned'
}
export function editableSession(data: Workspace, session: CalendarSession) {
  return !session.workoutId && !sessionWorkout(data, session)
}
export function createCalendarSession(data: Workspace, draft: CalendarDraft): CalendarSession {
  validateCalendarDraft(data, draft)
  return { ...draft, participants: [...draft.participants], id: crypto.randomUUID(), routineName: data.program.routines.find(r => r.id === draft.routineId)!.name,
    status: 'planned', workoutId: null, resultRemoved: false, revision: 0, createdAt: new Date().toISOString() }
}
export function updateCalendarSession(data: Workspace, id: string, draft: CalendarDraft): CalendarSession {
  const current = (data.calendarSessions || []).find(s => s.id === id)
  if (!current || !editableSession(data, current)) throw new Error('Η προπόνηση έχει ήδη ξεκινήσει. Δείτε την καταγραφή της.')
  validateCalendarDraft(data, draft)
  return { ...current, ...draft, participants: [...draft.participants], routineName: data.program.routines.find(r => r.id === draft.routineId)!.name }
}
export function cancelCalendarSession(data: Workspace, id: string): CalendarSession {
  const session = (data.calendarSessions || []).find(s => s.id === id)
  if (!session || !editableSession(data, session)) throw new Error('Η προπόνηση έχει ήδη ξεκινήσει. Συνεχίστε ή διακόψτε την πρώτα.')
  return { ...session, status: 'cancelled' }
}
export function startCalendarWorkout(data: Workspace, routineId: string, participants: AthleteId[], scheduleId?: string) {
  if (data.workouts.some(w => w.status === 'active')) throw new Error('Υπάρχει ήδη ενεργή προπόνηση. Συνεχίστε ή διακόψτε την πριν ξεκινήσετε άλλη.')
  const session = scheduleId ? (data.calendarSessions || []).find(s => s.id === scheduleId) : undefined
  if (scheduleId && (!session || session.status !== 'planned' || !editableSession(data, session))) throw new Error('Η προγραμματισμένη προπόνηση δεν είναι πλέον διαθέσιμη για έναρξη.')
  const chosenId = session?.routineId || routineId
  validateCalendarDraft(data, { date: today(), startTime: null, routineId: chosenId, participants })
  const workout = createWorkout(data.program.routines.find(r => r.id === chosenId)!, data.program.id, [...participants])
  if (session) {
    workout.scheduleId = session.id; workout.scheduleRevision = session.revision
    session.workoutId = workout.id; session.resultRemoved = false
  }
  data.workouts.push(workout)
  return workout
}
export function availableSessions(data: Workspace, date?: string) {
  return (data.calendarSessions || []).filter(s => s.status === 'planned' && editableSession(data, s) && (!date || s.date === date))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '99:99').localeCompare(b.startTime || '99:99') || a.id.localeCompare(b.id))
}
export interface CalendarEntry {
  key: string; date: string; kind: 'session' | 'workout' | 'reference'; status: CalendarStatus;
  session?: CalendarSession; workout?: CalendarWorkout
}
export function calendarEntries(data: Workspace, week: string[]): CalendarEntry[] {
  const entries: CalendarEntry[] = [], used = new Set<string>()
  for (const session of data.calendarSessions || []) {
    const workout = sessionWorkout(data, session), status = calendarStatus(data, session)
    if (workout) {
      used.add(workout.id)
      if (week.includes(workout.date)) entries.push({ key: `workout:${workout.id}`, date: workout.date, kind: 'workout', workout, session, status })
      if (session.date !== workout.date && week.includes(session.date)) entries.push({ key: `reference:${session.id}`, date: session.date, kind: 'reference', workout, session, status })
    } else if (week.includes(session.date)) entries.push({ key: `session:${session.id}`, date: session.date, kind: 'session', session, status })
  }
  for (const workout of calendarWorkouts(data)) if (!used.has(workout.id) && week.includes(workout.date)) entries.push({ key: `workout:${workout.id}`, date: workout.date, kind: 'workout', workout, status: workout.status })
  return entries.sort((a, b) => a.date.localeCompare(b.date) || (a.session?.startTime || '99:99').localeCompare(b.session?.startTime || '99:99') || a.key.localeCompare(b.key))
}
