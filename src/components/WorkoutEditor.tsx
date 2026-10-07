import { useState } from 'react'
import { Check, CalendarDays } from 'lucide-react'
import { allExpected, athletes, formatTarget, today, workoutDate, type AthleteId, type SetResult, type Workout } from '../lib/model'
import { number } from '../lib/utils'
import { Badge, Button, Modal } from './ui'
import { ValueButtons } from './ValueButtons'

export function WorkoutEditor({ workout, athlete, station, onClose, onSave }: { workout: Workout; athlete?: AthleteId; station?: string; onClose: () => void; onSave: (draft: Workout) => Promise<void> }) {
  const [draft, setDraft] = useState<Workout>(() => ({ ...structuredClone(workout), date: workoutDate(workout) }))
  const [selectedAthlete, setSelectedAthlete] = useState(athlete || workout.participants[0])
  const [selectedStation, setSelectedStation] = useState(station || workout.routine.stations[0].id)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const rows = allExpected(draft).filter(r => r.athlete === selectedAthlete && r.station === selectedStation)
  const change = (key: string, update: (result: SetResult) => SetResult) => setDraft(previous => {
    const blank = allExpected(previous).find(r => r.key === key)!
    return { ...previous, results: { ...previous.results, [key]: update(previous.results[key] || blank) } }
  })
  return <Modal wide open onOpenChange={open => { if (!open && !busy) onClose() }} title="Επεξεργασία προπόνησης" description={`${workout.routine.name} · Ημερομηνία και πραγματικά αποτελέσματα και για τις δύο αθλήτριες.`}>
    <form className="saved-workout-editor" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { await onSave(draft); onClose() } catch (err) { setError(err instanceof Error ? err.message : 'Δεν ήταν δυνατή η αποθήκευση.') } finally { setBusy(false) } }}>
      <fieldset disabled={busy}>
        <div className="workout-editor-date"><CalendarDays size={20} /><label>Ημερομηνία προπόνησης<input type="date" required max={today()} value={draft.date} onChange={event => { const date = event.target.value; setDraft(previous => ({ ...previous, date })) }} /></label></div>
        <div className="workout-editor-navigation"><div className="segmented" role="group" aria-label="Αθλήτρια επεξεργασίας">{workout.participants.map(id => <button key={id} type="button" className={selectedAthlete === id ? 'selected' : ''} aria-pressed={selectedAthlete === id} onClick={() => setSelectedAthlete(id)}>{athletes[id].name}</button>)}</div><label>Σταθμός επεξεργασίας<select value={selectedStation} onChange={event => setSelectedStation(event.target.value)}>{workout.routine.stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
        <div className="workout-editor-results">{rows.map(blank => {
          const result = draft.results[blank.key] || blank, completed = result.status === 'completed'
          const label = `${athletes[blank.athlete].name} ${blank.movement.name} σετ ${blank.round + 1}`
          const adjust = (field: 'value' | 'otherSide', delta: number) => change(blank.key, current => {
            const value = (field === 'otherSide' ? current.otherSide ?? current.value ?? 0 : current.value ?? 0) + delta
            return value < 1 || value > 3600 ? current : { ...current, [field]: value }
          })
          return <section className="workout-editor-result" key={blank.key} aria-label={label}>
            <div className="workout-editor-result-heading"><div><Badge>Σετ {blank.round + 1}</Badge><h3>{blank.movement.name}</h3><small>Στόχος: {formatTarget(blank.movement)}</small></div><label>Κατάσταση σετ<select value={result.status} onChange={event => { const status = event.target.value as SetResult['status']; change(blank.key, current => ({ ...current, status })) }}><option value="completed">Ολοκληρώθηκε</option><option value="skipped">Παραλείφθηκε</option><option value="pending">Χωρίς καταγραφή</option></select></label></div>
            {completed && <div className="workout-editor-inputs">
              {blank.movement.loaded && <div><label>Βάρος (kg / αλτήρα)<input type="number" inputMode="decimal" min="0" max="500" step="any" required value={result.weight ?? ''} onChange={event => { const weight = event.target.value === '' ? null : Number(event.target.value); change(blank.key, current => ({ ...current, weight })) }} /></label><div className="weight-increments">{[1.25, 2.5].map(step => <Button key={step} type="button" variant="secondary" size="small" disabled={(result.weight ?? 0) + step > 500} onClick={() => change(blank.key, current => { const weight = Math.round(((current.weight ?? 0) + step) * 100) / 100; return weight <= 500 ? { ...current, weight } : current })}>+{number(step, 2)} kg</Button>)}</div></div>}
              <div><label>{blank.movement.metric === 'seconds' ? 'Δευτερόλεπτα' : 'Επαναλήψεις'}<input type="number" inputMode="numeric" min="1" max="3600" step="1" required value={result.value ?? ''} onChange={event => { const value = event.target.value === '' ? null : Number(event.target.value); change(blank.key, current => ({ ...current, value })) }} /></label><ValueButtons value={result.value} metric={blank.movement.metric} label={label} onAdjust={delta => adjust('value', delta)} /></div>
              {blank.movement.unilateral && <div className="editor-other-side"><label>Άλλη πλευρά<input type="number" inputMode="numeric" min="1" max="3600" step="1" placeholder="Ίδιες επαναλήψεις" value={result.otherSide ?? ''} onChange={event => { const otherSide = event.target.value === '' ? null : Number(event.target.value); change(blank.key, current => ({ ...current, otherSide })) }} /></label><ValueButtons value={result.otherSide ?? result.value} metric="reps" label={`Άλλη πλευρά ${label}`} onAdjust={delta => adjust('otherSide', delta)} /></div>}
            </div>}
          </section>
        })}</div>
      </fieldset>
      {error && <p className="form-message" role="alert">{error}</p>}
      <div className="modal-actions editor-save"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Ακύρωση</Button><Button type="submit" disabled={busy}><Check size={16} />{busy ? 'Αποθήκευση…' : 'Αποθήκευση αλλαγών'}</Button></div>
    </form>
  </Modal>
}
