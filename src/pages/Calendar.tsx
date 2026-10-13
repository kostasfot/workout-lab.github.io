import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock, Pencil, Play, X, ArrowRight, CheckCheck, RotateCcw } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { useWorkspace } from '../context/Workspace'
import { athletes, formatDate, today } from '../lib/model'
import { addCalendarDays, calendarEntries, calendarWorkouts, calendarLabels, calendarStatus, calendarWeek, calendarWeekday, cancelCalendarSession, editableSession, sessionWorkout, validCalendarDate, type CalendarEntry } from '../lib/calendar'
import { CalendarEditor } from '../components/CalendarEditor'
import { WorkoutLauncher } from '../components/WorkoutLauncher'
import { Badge, Button, Card, DeleteConfirmation, Modal } from '../components/ui'

export function Calendar() {
  const { data, edit, pending, syncing, online } = useWorkspace(), { identity, local } = useAuth(), navigate = useNavigate(), [params, setParams] = useSearchParams()
  const initial = params.get('week'), coach = identity?.role === 'coach', enabled = local || data.calendarEnabled === true
  const [anchor, setAnchor] = useState(initial && validCalendarDate(initial) ? initial : today())
  const [editing, setEditing] = useState<{ id?: string; date: string } | null>(params.get('new') === '1' && coach && enabled ? { date: today() } : null)
  const [selected, setSelected] = useState<CalendarEntry | null>(null), [cancelling, setCancelling] = useState<string | null>(null), [launching, setLaunching] = useState<string | null>(null)
  const [error, setError] = useState(''), [restoring, setRestoring] = useState(false)
  const week = calendarWeek(anchor), entries = calendarEntries(data, week)
  // Resolve against current local/synced data, so an open dialog cannot act on a stale card.
  const session = selected?.session ? data.calendarSessions?.find(s => s.id === selected.session!.id) : undefined
  const workout = session ? sessionWorkout(data, session) : selected?.workout ? calendarWorkouts(data).find(w => w.id === selected.workout!.id) : undefined
  const status = session ? calendarStatus(data, session) : workout?.status || selected?.status || 'planned'
  const canEdit = coach && enabled && Boolean(session && editableSession(data, session))
  const canViewLog = workout && workout.status !== 'active' && (identity?.role !== 'athlete' || workout.participants.includes(identity.athleteId!)) && data.workouts.some(w => w.id === workout.id)
  const syncText = local ? 'Στη συσκευή' : !online ? 'Εκτός σύνδεσης' : pending.some(p => p.conflict) ? 'Έλεγχος αλλαγών' : pending.length ? 'Αλλαγές σε αναμονή' : syncing ? 'Συγχρονισμός…' : 'Συγχρονισμένο'
  const cancelSession = data.calendarSessions?.find(s => s.id === cancelling)
  const openStart = (id: string) => { setSelected(null); setLaunching(id) }
  const closeEditor = () => {
    setEditing(null)
    if (params.has('new')) { const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true }) }
  }
  return <>
    <div className="page-heading calendar-heading"><div><span className="eyebrow">ΤΟ ΕΒΔΟΜΑΔΙΑΙΟ ΠΛΑΝΟ ΜΑΣ</span><h1>Ημερολόγιο<span className="title-dot">.</span></h1><p>Οι προγραμματισμένες προπονήσεις και όσα κάναμε στην πράξη.</p></div>{coach && <Button disabled={!enabled} onClick={() => setEditing({ date: today() })}><CalendarPlus size={18} />Νέα προπόνηση</Button>}</div>
    {!enabled && <div className="inline-notice calendar-availability">Ο προγραμματισμός προπονήσεων δεν έχει ενεργοποιηθεί ακόμη για την ομάδα. Μπορείτε να δείτε τις υπάρχουσες καταγραφές.</div>}
    <Card className="calendar-week-toolbar"><div className="calendar-week-label"><CalendarDays size={21} /><div><h2>{formatDate(week[0])} — {formatDate(week[6], true)}</h2><small>Δευτέρα — Κυριακή · ώρα Ελλάδας</small></div></div><div className="calendar-week-controls"><Button variant="ghost" size="icon" aria-label="Προηγούμενη εβδομάδα" onClick={() => setAnchor(addCalendarDays(week[0], -7))}><ChevronLeft size={20} /></Button><Button variant="secondary" onClick={() => setAnchor(today())}>Σήμερα</Button><Button variant="ghost" size="icon" aria-label="Επόμενη εβδομάδα" onClick={() => setAnchor(addCalendarDays(week[0], 7))}><ChevronRight size={20} /></Button></div></Card>
    <div className="calendar-week" data-testid="calendar-week">{week.map(date => <section key={date} className={`calendar-day ${date === today() ? 'calendar-today' : ''}`} aria-label={formatDate(date, true)} data-date={date}><header className="calendar-day-heading"><span>{calendarWeekday(date)}</span><div className="calendar-day-tools"><div><strong>{new Date(`${date}T12:00:00Z`).getUTCDate()}</strong>{date === today() && <small>Σήμερα</small>}</div>{coach && <Button variant="ghost" size="icon" disabled={!enabled} aria-label={`Προσθήκη προπόνησης ${date}`} onClick={() => setEditing({ date })}><CalendarPlus size={17} /></Button>}</div></header><div className="calendar-day-entries">{entries.filter(e => e.date === date).map(entry => {
      const name = entry.workout?.name || data.program.routines.find(r => r.id === entry.session?.routineId)?.name || entry.session?.routineName
      const people = entry.workout?.participants || entry.session?.participants || []
      return <button key={entry.key} className={`calendar-entry calendar-${entry.status} ${entry.kind === 'reference' ? 'calendar-reference' : ''}`} data-testid={entry.kind === 'workout' ? `calendar-result-${entry.workout!.id}` : entry.kind === 'reference' ? `calendar-reference-${entry.session!.id}` : `calendar-session-${entry.session!.id}`} onClick={() => { setError(''); setSelected(entry) }}><span className="calendar-entry-top">{entry.kind === 'reference' ? <ArrowRight size={15} /> : entry.workout ? <CheckCheck size={15} /> : <CalendarDays size={15} />}<span>{entry.kind === 'reference' ? 'Αρχικός προγραμματισμός' : entry.workout ? entry.session ? 'Συνδεδεμένη καταγραφή' : 'Εκτός προγράμματος' : entry.session?.startTime ? <><Clock size={12} />{entry.session.startTime}</> : 'Χωρίς ώρα'}</span></span><strong>{name}</strong><span className="calendar-entry-athletes">{people.map(a => <span key={a}><i className={`athlete-dot ${a}`} />{athletes[a].name}</span>)}</span><span className={`calendar-status calendar-status-${entry.status}`}>{calendarLabels[entry.status]}</span>{entry.kind === 'reference' && <small>{entry.workout?.status === 'active' ? 'Έναρξη' : 'Έγινε'}: {formatDate(entry.workout!.date)}</small>}</button>
    })}{entries.every(e => e.date !== date) && <p className="calendar-day-empty">Χωρίς προπόνηση</p>}</div></section>)}</div>
    <div className="calendar-footer"><span>Καταχωρίσεις εβδομάδας: {entries.filter(e => e.kind !== 'reference').length}</span><span title={syncText}>{syncText}</span></div>
    <Modal open={Boolean(selected)} onOpenChange={open => { if (!open) setSelected(null) }} title={workout?.name || data.program.routines.find(r => r.id === session?.routineId)?.name || session?.routineName || 'Προπόνηση'} description="Ο προγραμματισμός και η καταγραφή συνδέονται χωρίς να αλλάζουν οι πραγματικές ημερομηνίες." className="calendar-details">
      {selected && <><Badge className={`calendar-status-${status}`}>{calendarLabels[status]}</Badge><dl className="calendar-session-details">{session && <><dt>Προγραμματισμένη</dt><dd>{formatDate(session.date, true)}{session.startTime && ` · ${session.startTime}`}</dd><dt>Προγραμματισμένες αθλήτριες</dt><dd>{session.participants.map(a => athletes[a].name).join(' & ')}</dd></>}{workout && <><dt>{workout.status === 'active' ? 'Ημερομηνία έναρξης' : 'Ημερομηνία καταγραφής'}</dt><dd>{formatDate(workout.date, true)}</dd><dt>Συμμετείχαν</dt><dd>{workout.participants.map(a => athletes[a].name).join(' & ')}</dd></>}</dl>
      {session && !workout && session.resultRemoved && <p className="muted small">Η καταγραφή ιστορικού διαγράφηκε. Ο αρχικός προγραμματισμός διατηρείται.</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
      <div className="calendar-detail-actions">{canEdit && session && <>
        <Button variant="secondary" onClick={() => { setSelected(null); setEditing({ id: session.id, date: session.date }) }}><Pencil size={16} />Μεταφορά / επεξεργασία</Button>
        {session.status === 'planned' ? <><Button variant="ghost" onClick={() => { setSelected(null); setCancelling(session.id) }}><X size={16} />Ακύρωση προπόνησης</Button><Button disabled={!data.program.routines.some(r => r.id === session.routineId)} onClick={() => openStart(session.id)}><Play size={16} />Έναρξη προπόνησης</Button></> : <Button disabled={restoring} onClick={async () => { setRestoring(true); try { await edit(w => { const current = w.calendarSessions?.find(s => s.id === session.id); if (!current || !editableSession(w, current)) throw new Error('Η προπόνηση έχει ήδη ξεκινήσει.'); const value = { ...current, status: 'planned' as const }; w.calendarSessions = w.calendarSessions!.map(s => s.id === value.id ? value : s); return [{ kind: 'calendar', payload: value }] }) } catch (err) { setError(err instanceof Error ? err.message : 'Δεν ήταν δυνατή η επαναφορά.') } finally { setRestoring(false) } }}><RotateCcw size={16} />Επαναφορά προγραμματισμού</Button>}
      </>}{coach && workout?.status === 'active' && <Button onClick={() => navigate(`/workout/${workout.id}`)}><Play size={16} />Συνέχεια προπόνησης</Button>}{canViewLog && <Button onClick={() => navigate(`/history?session=${workout!.id}`)}>Προβολή καταγραφής<ArrowRight size={16} /></Button>}{selected.kind === 'reference' && workout && <Button variant="secondary" onClick={() => { setAnchor(workout.date); setSelected(null) }}>Προβολή ημέρας καταγραφής<ArrowRight size={16} /></Button>}</div>
      </>}
    </Modal>
    {editing && <CalendarEditor key={editing.id || editing.date} date={editing.date} session={editing.id ? data.calendarSessions?.find(s => s.id === editing.id) : undefined} onClose={closeEditor} onSaved={date => { setAnchor(date); closeEditor() }} />}
    <DeleteConfirmation open={Boolean(cancelling)} onOpenChange={open => { if (!open) setCancelling(null) }} title="Ακύρωση προγραμματισμένης προπόνησης" description={cancelSession ? `${cancelSession.routineName} · ${formatDate(cancelSession.date, true)}` : ''} confirmLabel="Ακύρωση προπόνησης" message="Η προπόνηση θα εμφανίζεται ως ακυρωμένη στο ημερολόγιο. Μπορείτε να επαναφέρετε τον προγραμματισμό αργότερα." onConfirm={async () => { if (!cancelling) return; await edit(w => { const value = cancelCalendarSession(w, cancelling); w.calendarSessions = w.calendarSessions!.map(s => s.id === value.id ? value : s); return [{ kind: 'calendar', payload: value }] }) }} />
    {launching && <WorkoutLauncher scheduleId={launching} onClose={() => setLaunching(null)} />}
  </>
}
