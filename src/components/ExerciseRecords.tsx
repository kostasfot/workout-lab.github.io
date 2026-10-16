import { Trophy, ArrowUpRight } from 'lucide-react'
import { athletes, formatDate, type AthleteId, type Movement } from '../lib/model'
import { number } from '../lib/utils'
import { personalRecords, type ExerciseRecord, type ExerciseSession } from '../lib/exercise-analytics'
import { exerciseUnit, setActual } from './ExerciseCharts'
import { Button, Card, SectionHeading } from './ui'

function RecordSource({ record, onOpen }: { record: ExerciseRecord; onOpen: (id: string) => void }) {
  return <Button variant="ghost" size="small" className="analytics-record-source" onClick={() => onOpen(record.session.workoutId)} aria-label={`Προβολή ρεκόρ ${athletes[record.session.athlete].name} ${formatDate(record.session.date, true)}`}><span>{formatDate(record.session.date)} · {record.set.stationName} · Γ{record.set.round}</span><ArrowUpRight size={16} /></Button>
}

export function ExerciseRecords({ sessions, participants, movement, minimum, atWeight, onMinimum, onWeight, onOpen }: {
  sessions: ExerciseSession[]; participants: readonly AthleteId[]; movement: Movement; minimum: number; atWeight: number | null
  onMinimum: (value: string) => void; onWeight: (value: string) => void; onOpen: (id: string) => void
}) {
  const loads = [...new Set(sessions.flatMap(s => s.sets.filter(r => r.state === 'completed' && r.weight !== null).map(r => r.weight!)))].sort((a, b) => a - b)
  return <Card className="analytics-card" data-testid="exercise-records"><SectionHeading title="Προσωπικά ρεκόρ" subtitle="Μέσα στο επιλεγμένο διάστημα. Επιλέξτε όλο το ιστορικό για τα συνολικά ρεκόρ." />
    {movement.loaded && <div className="analytics-record-filters"><label>{movement.metric === 'seconds' ? 'Ελάχιστη διάρκεια για ρεκόρ βάρους' : 'Ελάχιστες επαναλήψεις για ρεκόρ βάρους'}<input aria-label="Ελάχιστος στόχος ρεκόρ" type="number" min="1" max="3600" step="1" value={Number.isFinite(minimum) && minimum > 0 ? minimum : ''} onChange={event => onMinimum(event.target.value)} /></label><label>Βάρος σύγκρισης · kg / αλτήρα<select aria-label="Βάρος σύγκρισης ρεκόρ" value={atWeight ?? ''} onChange={event => onWeight(event.target.value)} disabled={!loads.length}>{!loads.length && <option value="">Χωρίς καταγεγραμμένο βάρος</option>}{loads.map(load => <option key={load} value={load}>{number(load, 2)} kg</option>)}</select></label></div>}
    <div className={`analytics-athlete-grid ${participants.length === 1 ? 'analytics-one-athlete' : ''}`}>{participants.map(a => {
      const records = personalRecords(sessions.filter(s => s.athlete === a), minimum, atWeight)
      return <section className={`analytics-record-panel ${a}`} key={a} aria-label={`Ρεκόρ ${athletes[a].name}`}><div className="analytics-athlete-title"><span className={`avatar ${a}`} aria-hidden="true">{athletes[a].initial}</span><h3>{athletes[a].name}</h3><Trophy size={19} /></div>
        {movement.loaded && <div className="analytics-record"><span>Βάρος με τουλάχιστον {Number.isFinite(minimum) && minimum > 0 ? number(minimum) : '—'} {exerciseUnit(movement)}</span><strong>{records.load ? `${number(records.load.set.weight!, 2)} kg / αλτήρα` : '—'}</strong>{records.load ? <><small>{setActual(records.load.set)}</small><RecordSource record={records.load} onOpen={onOpen} /></> : <small>Κανένα ολοκληρωμένο σετ με αυτόν τον στόχο.</small>}</div>}
        <div className="analytics-record"><span>{movement.metric === 'seconds' ? 'Μέγιστη καταγεγραμμένη διάρκεια' : 'Περισσότερες επαναλήψεις σε ένα σετ'}{movement.loaded && atWeight !== null ? ` στα ${number(atWeight, 2)} kg` : ''}</span><strong>{records.performance ? `${number(records.performance.set.performance!)} ${exerciseUnit(movement)}` : '—'}</strong>{records.performance ? <><small>{setActual(records.performance.set)}</small><RecordSource record={records.performance} onOpen={onOpen} /></> : <small>Δεν υπάρχει ολοκληρωμένο σετ για αυτή τη σύγκριση.</small>}</div>
      </section>
    })}</div>
    {movement.metric === 'seconds' && <p className="analytics-caption">Η μεγαλύτερη διάρκεια είναι καταγεγραμμένη τιμή. Για άσκηση σταθερής διάρκειας, ελέγξτε την επίτευξη του στόχου και το βάρος.</p>}
  </Card>
}
