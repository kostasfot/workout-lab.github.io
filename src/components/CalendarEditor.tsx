import { useState } from 'react'
import { CalendarPlus, Check } from 'lucide-react'
import { useWorkspace } from '../context/Workspace'
import { athleteIds, athletes, type CalendarSession } from '../lib/model'
import { createCalendarSession, updateCalendarSession, type CalendarDraft } from '../lib/calendar'
import { Button, Modal } from './ui'

export function CalendarEditor({ session, date, onClose, onSaved }: { session?: CalendarSession; date: string; onClose: () => void; onSaved: (date: string) => void }) {
  const { data, edit } = useWorkspace()
  const [draft, setDraft] = useState<CalendarDraft>(() => session ? { date: session.date, startTime: session.startTime, routineId: session.routineId, participants: [...session.participants] } : { date, startTime: null, routineId: data.program.routines[0].id, participants: [...athleteIds] })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <Modal open onOpenChange={open => { if (!open && !busy) onClose() }} title={session ? 'Επεξεργασία προγραμματισμένης προπόνησης' : 'Νέα προγραμματισμένη προπόνηση'} description="Ημερομηνία και ώρα Ελλάδας · αποθήκευση στη συσκευή και συγχρονισμός με την ομάδα." className="calendar-editor">
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return
      setBusy(true); setError('')
      try {
        await edit(workspace => {
          const value = session ? updateCalendarSession(workspace, session.id, draft) : createCalendarSession(workspace, draft)
          workspace.calendarSessions = session ? (workspace.calendarSessions || []).map(s => s.id === value.id ? value : s) : [...(workspace.calendarSessions || []), value]
          return [...(workspace.program.revision === 0 ? [{ kind: 'program' as const, payload: workspace.program }] : []), { kind: 'calendar', payload: value }]
        })
        onSaved(draft.date)
      } catch (err) { setError(err instanceof Error ? err.message : 'Δεν ήταν δυνατή η αποθήκευση.') } finally { setBusy(false) }
    }}>
      <label>Προπόνηση<select aria-label="Προπόνηση" required disabled={busy} value={draft.routineId} onChange={e => setDraft({ ...draft, routineId: e.target.value })}>{data.program.routines.map(r => <option key={r.id} value={r.id}>{r.name} · {r.subtitle}</option>)}</select></label>
      <div className="calendar-editor-dates"><label>Ημερομηνία<input type="date" required disabled={busy} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label><label>Ώρα έναρξης (προαιρετικά)<input type="time" step="60" disabled={busy} value={draft.startTime || ''} onChange={e => setDraft({ ...draft, startTime: e.target.value || null })} /></label></div>
      <span className="calendar-editor-label">Αθλήτριες</span><div className="participant-choice">{athleteIds.map(a => <label key={a} className={draft.participants.includes(a) ? 'selected' : ''}><span aria-hidden="true" className={`avatar ${a}`}>{athletes[a].initial}</span><strong>{athletes[a].name}</strong><input type="checkbox" disabled={busy} checked={draft.participants.includes(a)} onChange={e => setDraft({ ...draft, participants: e.target.checked ? [...draft.participants, a] : draft.participants.filter(p => p !== a) })} /></label>)}</div>
      {error && <p className="form-message" role="alert">{error}</p>}
      <div className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Ακύρωση</Button><Button type="submit" disabled={busy || !draft.participants.length}>{session ? <Check size={17} /> : <CalendarPlus size={17} />}{busy ? 'Αποθήκευση…' : 'Αποθήκευση προγραμματισμού'}</Button></div>
    </form>
  </Modal>
}
