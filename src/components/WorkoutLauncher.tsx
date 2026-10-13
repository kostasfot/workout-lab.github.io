import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { useWorkspace } from '../context/Workspace'
import { useTimer } from '../context/Timer'
import { athleteIds, athletes, discardActiveWorkout, formatDate, today, type AthleteId } from '../lib/model'
import { availableSessions, startCalendarWorkout } from '../lib/calendar'
import { Button, DeleteConfirmation, Modal } from './ui'

export function WorkoutLauncher({ routineId, scheduleId, offerToday = false, onClose }: {
  routineId?: string; scheduleId?: string; offerToday?: boolean; onClose: () => void
}) {
  const { data, edit } = useWorkspace(), { identity, local } = useAuth(), timer = useTimer(), navigate = useNavigate()
  const enabled = local || data.calendarEnabled === true
  const planned = enabled ? availableSessions(data, today()) : []
  const initialId = scheduleId || (offerToday ? planned[0]?.id : undefined)
  const initial = data.calendarSessions?.find(s => s.id === initialId)
  const [chosenSchedule, setChosenSchedule] = useState(initialId || '')
  const [chosenRoutine, setChosenRoutine] = useState(initial?.routineId || routineId || data.program.routines[0].id)
  const [participants, setParticipants] = useState<AthleteId[]>([...(initial?.participants || athleteIds)])
  const [busy, setBusy] = useState(false), [replacing, setReplacing] = useState(false), [error, setError] = useState('')
  const lock = useRef(false)
  const session = data.calendarSessions?.find(s => s.id === chosenSchedule)
  const selectedRoutine = session?.routineId || chosenRoutine
  const selected = data.program.routines.find(r => r.id === selectedRoutine)
  const active = data.workouts.find(w => w.status === 'active')
  const sameActive = Boolean(active && chosenSchedule && active.scheduleId === chosenSchedule)
  const canDiscard = identity?.role === 'coach' && (local || data.workoutDiscard === true)
  const start = async (replace = false) => {
    if (lock.current || !selected || !participants.length) return
    lock.current = true; setBusy(true); setError('')
    try {
      let id = ''
      await edit(workspace => {
        const changes = replace && active ? discardActiveWorkout(workspace, active.id) : []
        const workout = startCalendarWorkout(workspace, selected.id, participants, chosenSchedule || undefined)
        id = workout.id
        return [...changes, ...(workspace.program.revision === 0 ? [{ kind: 'program' as const, payload: workspace.program }] : []), { kind: 'workout', payload: workout }]
      })
      if (replace) timer.clear()
      onClose(); navigate(`/workout/${id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Η έναρξη δεν αποθηκεύτηκε. Δοκιμάστε ξανά.'
      setError(message); if (replace) throw err
    } finally { lock.current = false; setBusy(false) }
  }
  const selectPlan = (id: string) => {
    const value = data.calendarSessions?.find(s => s.id === id)
    setChosenSchedule(id)
    if (value) { setChosenRoutine(value.routineId); setParticipants([...value.participants]) }
    setError('')
  }
  return <>
    <Modal open onOpenChange={open => { if (!open && !busy) onClose() }} title="Έτοιμες για προπόνηση;" description={selected ? `${selected.name} · ${selected.focus}` : 'Επιλέξτε προπόνηση.'}>
      {offerToday && planned.length > 0 && <label className="workout-routine-choice">Προγραμματισμένη προπόνηση<select aria-label="Προγραμματισμένη προπόνηση" disabled={busy} value={chosenSchedule} onChange={e => selectPlan(e.target.value)}><option value="">Εκτός προγράμματος</option>{planned.map(s => <option key={s.id} value={s.id}>{s.startTime ? `${s.startTime} · ` : ''}{data.program.routines.find(r => r.id === s.routineId)?.name || s.routineName} · {s.participants.map(a => athletes[a].name).join(' & ')}</option>)}</select></label>}
      {session && <div className="inline-notice launch-calendar-date">Προγραμματισμένη: {formatDate(session.date, true)}{session.startTime && ` · ${session.startTime}`}<small>Η καταγραφή θα έχει τη σημερινή ημερομηνία και θα συνδεθεί στο ημερολόγιο.</small></div>}
      <label className="workout-routine-choice">Επιλογή προπόνησης<select aria-label="Επιλογή προπόνησης" value={selectedRoutine} disabled={busy || Boolean(chosenSchedule)} onChange={e => setChosenRoutine(e.target.value)}>{data.program.routines.map(r => <option key={r.id} value={r.id}>{r.name} · {r.subtitle}</option>)}</select></label>
      {active && <div className="inline-notice workout-replacement-notice">Υπάρχει ενεργή προπόνηση: <strong>{active.routine.name}</strong>. {sameActive ? 'Συνεχίστε την υπάρχουσα καταγραφή.' : 'Μπορείτε να τη συνεχίσετε ή να τη διακόψετε χωρίς αποθήκευση για να ξεκινήσετε τη νέα.'}{!canDiscard && !sameActive && <p>Η διακοπή χρειάζεται ενεργοποίηση για την ομάδα.</p>}</div>}
      <div className="participant-choice">{athleteIds.map(a => <label key={a} className={participants.includes(a) ? 'selected' : ''}><span aria-hidden="true" className={`avatar ${a}`}>{athletes[a].initial}</span><strong>{athletes[a].name}</strong><input type="checkbox" checked={participants.includes(a)} disabled={busy} onChange={e => setParticipants(previous => e.target.checked ? [...previous, a] : previous.filter(p => p !== a))} /></label>)}</div>
      <p className="muted small">Επιλέξτε ποιες συμμετέχουν. Άσκηση → αλλαγή → χειροκίνητο διάλειμμα.</p>
      {error && <p className="form-message" role="alert">{error}</p>}
      <div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={onClose}>Ακύρωση</Button>{active ? <><Button variant="secondary" disabled={busy} onClick={() => { onClose(); navigate(`/workout/${active.id}`) }}>Συνέχεια τρέχουσας</Button>{!sameActive && <Button variant="danger" disabled={!participants.length || busy || !canDiscard || !selected} onClick={() => setReplacing(true)}>Διακοπή και νέα προπόνηση</Button>}</> : <Button disabled={!participants.length || busy || !selected} onClick={() => void start()}><Play size={17} />{busy ? 'Αποθήκευση…' : 'Έναρξη προπόνησης'}</Button>}</div>
    </Modal>
    <DeleteConfirmation open={replacing} onOpenChange={setReplacing} title="Διακοπή και νέα προπόνηση" description={active && selected ? `${active.routine.name} → ${selected.name}` : ''} confirmLabel="Διακοπή και έναρξη" message="Τα σετ και οι σημειώσεις της τρέχουσας προπόνησης θα διαγραφούν χωρίς καταγραφή στο ιστορικό. Η νέα προπόνηση θα ξεκινήσει με κενά αποτελέσματα." onConfirm={async () => { if (!canDiscard || !active) throw new Error('Η τρέχουσα προπόνηση δεν είναι διαθέσιμη για διακοπή.'); await start(true) }} />
  </>
}
