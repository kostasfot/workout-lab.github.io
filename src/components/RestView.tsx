import { useState } from 'react'
import { ArrowRight, Check, Pause, Play, RotateCcw, Timer } from 'lucide-react'
import { remainingSeconds, useTimer } from '../context/Timer'
import { advanceWorkout, athletes, formatTarget, movementsFor, slotFor, type Workout } from '../lib/model'
import { seconds } from '../lib/utils'
import { Button, Modal } from './ui'

export const restContext = (w: Workout) => `${w.id}:${w.stationIndex}:${w.roundIndex}:${w.phase}`

export function RestView({ workout, ready, last, onContinue, primary = false }: { workout: Workout; ready: boolean; last: boolean; onContinue: () => Promise<boolean>; primary?: boolean }) {
  const timer = useTimer(), context = restContext(workout), station = workout.routine.stations[workout.stationIndex]
  const job = timer.jobs.find(j => j.id === 'rest' && j.context === context)
  const [open, setOpen] = useState(Boolean(job)), [duration, setDuration] = useState(job ? String(job.duration) : station.rest === null ? '' : String(station.rest))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const remaining = job ? remainingSeconds(job, timer.now) : null, done = remaining === 0, paused = job?.deadline === null
  const value = Number(duration), validDuration = Number.isInteger(value) && value > 0 && value <= 3600
  const upcoming = ready && !last ? advanceWorkout(workout) : null, nextStation = upcoming?.routine.stations[upcoming.stationIndex]
  const show = () => {
    setError(''); setOpen(true)
    if (!job && station.rest !== null) timer.startRest(station.rest, context)
  }
  return <>
    <Button variant={primary ? 'primary' : 'secondary'} disabled={!ready || busy} onClick={show}><Timer size={17} />{job ? 'Προβολή διαλείμματος' : station.rest === null ? 'Διάλειμμα' : 'Έναρξη διαλείμματος'}</Button>
    <Modal open={open} onOpenChange={value => { if (!busy) setOpen(value) }} title="Διάλειμμα προπόνησης" description={`${station.name} · Γύρος ${workout.roundIndex + 1} / ${station.rounds}. Το παράθυρο μπορεί να κλείσει όσο το χρονόμετρο συνεχίζει.`} wide className="rest-view">
      <div className={`rest-countdown ${done ? 'rest-complete' : ''}`}>
        <span className="eyebrow">{done ? 'ΕΤΟΙΜΟΙ ΓΙΑ ΣΥΝΕΧΕΙΑ' : paused ? 'ΣΕ ΠΑΥΣΗ' : job ? 'ΧΡΟΝΟΣ ΔΙΑΛΕΙΜΜΑΤΟΣ' : 'ΕΛΑΧΙΣΤΟ ΔΙΑΛΕΙΜΜΑ'}</span>
        <strong role="timer" aria-label="Χρόνος διαλείμματος" aria-live="off">{remaining === null ? '—' : seconds(remaining)}</strong>
        <p role="status">{done ? 'Το διάλειμμα ολοκληρώθηκε. Πατήστε Συνέχεια όταν είστε έτοιμοι.' : !job ? 'Χωρίς προεπιλογή. Ορίστε χρόνο ή συνεχίστε όταν είστε έτοιμοι.' : paused ? 'Ο χρόνος μένει σταματημένος μέχρι να τον συνεχίσετε.' : 'Ο επόμενος γύρος ξεκινά με το δικό σας πάτημα.'}</p>
        {job && <div className="rest-timer-controls"><Button variant="secondary" disabled={busy || done} aria-label={paused ? 'Συνέχιση διαλείμματος' : 'Παύση διαλείμματος'} onClick={() => timer.toggle('rest')}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? 'Συνέχιση χρόνου' : 'Παύση'}</Button><Button variant="ghost" disabled={busy} onClick={() => timer.reset('rest')} aria-label="Επαναφορά διαλείμματος"><RotateCcw size={17} />Επαναφορά</Button></div>}
      </div>
      <div className="rest-duration"><label htmlFor="training-rest-seconds">Διάρκεια διαλείμματος σε δευτερόλεπτα<input id="training-rest-seconds" type="number" inputMode="numeric" min="1" max="3600" step="1" placeholder="Χωρίς προεπιλογή" value={duration} disabled={busy} onChange={e => setDuration(e.target.value)} /></label><Button variant="secondary" disabled={busy || !validDuration} onClick={() => timer.startRest(value, context)}><Play size={17} />{job ? 'Επανεκκίνηση' : 'Έναρξη'}</Button></div>
      {!job && <div className="quick-presets">{[20, 30, 60, 90].map(value => <button key={value} disabled={busy} onClick={() => setDuration(String(value))}>{value}″</button>)}</div>}
      {upcoming && nextStation ? <div className="rest-upcoming"><div className="rest-next-heading"><span className="eyebrow">ΣΤΗ ΣΥΝΕΧΕΙΑ</span><h3>{nextStation.name} · Γύρος {upcoming.roundIndex + 1} / {nextStation.rounds}</h3></div><div className="rest-athletes">{upcoming.participants.map(a => <div className={`rest-athlete ${a}`} key={a}><span className={`avatar ${a}`}>{athletes[a].initial}</span><div><strong>{athletes[a].name}</strong>{movementsFor(upcoming, a, nextStation, slotFor(a, upcoming.phase)).map(m => <p key={m.id}>{m.name}<small>{formatTarget(m)}</small></p>)}</div></div>)}</div></div> : last ? <div className="rest-next-heading"><span className="eyebrow">ΤΕΛΟΣ ΠΡΟΠΟΝΗΣΗΣ</span><h3>Ολοκληρώθηκε ο τελευταίος γύρος.</h3><p className="muted small">Με τη Συνέχεια θα ανοίξει η τελική αποθήκευση.</p></div> : null}
      {error && <p className="form-message" role="alert">{error}</p>}
      <div className="modal-actions rest-view-actions"><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Πίσω στην καταγραφή</Button><Button disabled={busy || !ready} onClick={async () => {
        setBusy(true); setError('')
        try {
          if (await onContinue()) { timer.stop('rest', context); setOpen(false) }
          else setError('Η συνέχεια δεν αποθηκεύτηκε. Δοκιμάστε ξανά.')
        } catch { setError('Η συνέχεια δεν αποθηκεύτηκε. Δοκιμάστε ξανά.') }
        finally { setBusy(false) }
      }}>{last ? <Check size={18} /> : <ArrowRight size={18} />}Συνέχεια</Button></div>
    </Modal>
  </>
}
