import { ArrowLeftRight, ArrowRight, CheckCheck, ChevronLeft, Timer } from 'lucide-react'
import { useTimer } from '../context/Timer'
import { useTrainingMode } from '../context/TrainingMode'
import { useWorkspace } from '../context/Workspace'
import { useAuth } from '../context/Auth'
import { athleteIds, canRecordTogether, isRecorded, requiredResults, type Workout } from '../lib/model'
import { RestView, restContext } from './RestView'
import { Button, Card } from './ui'

export function WorkoutControls({ workout, ready, canCombine, last, navigating, recording, next, back, recordBoth }: {
  workout: Workout; ready: boolean; canCombine: boolean; last: boolean; navigating: boolean; recording: boolean;
  next: () => Promise<boolean>; back: () => Promise<void>; recordBoth: () => Promise<void>
}) {
  const { active: training } = useTrainingMode(), timer = useTimer(), { local } = useAuth(), { online, pending, syncing, error } = useWorkspace()
  const station = workout.routine.stations[workout.stationIndex], both = athleteIds.every(a => workout.participants.includes(a))
  const status = local ? 'Στη συσκευή' : !online ? 'Εκτός σύνδεσης' : pending.some(p => p.conflict) ? 'Έλεγχος αλλαγών' : pending.length ? `${pending.length} σε αναμονή` : syncing ? 'Συγχρονισμός…' : 'Συγχρονισμένο'
  const recordButton = <Button disabled={recording || navigating || !canRecordTogether(workout)} onClick={() => void recordBoth()}><CheckCheck size={18} />Καταγραφή και των δύο</Button>
  const nextButton = <Button disabled={(!ready && !canCombine) || navigating || recording} onClick={() => void next()}>{workout.phase === 0 ? <><ArrowLeftRight size={17} />{canCombine ? 'Καταγραφή και αλλαγή' : 'Αλλαγή ασκήσεων'}</> : last ? <><CheckCheck size={17} />Ολοκλήρωση</> : <>{workout.roundIndex + 1 === station.rounds ? 'Επόμενος σταθμός' : 'Επόμενος γύρος'}<ArrowRight size={17} /></>}</Button>
  const restView = <RestView key={restContext(workout)} workout={workout} ready={ready && !navigating} last={last} onContinue={next} primary={training && !last} />
  const keepFieldFocus = (e: React.PointerEvent<HTMLElement>) => {
    // Hiding focused choices must not move a shared action between pointer-down and click.
    if (e.button === 0 && document.activeElement instanceof HTMLInputElement && document.activeElement.closest('.movement-logger') && e.target instanceof Element && e.target.closest('button')) e.preventDefault()
  }
  return <>
    {!training && both && <Card className="paired-recording" onPointerDownCapture={keepFieldFocus}><div><strong>Καταγραφή τρέχοντος ζεύγους</strong><small>{requiredResults(workout, true).every(isRecorded) ? 'Οι τρέχουσες ασκήσεις έχουν καταγραφεί.' : 'Συμπληρώστε τις τιμές και αποθηκεύστε τις μαζί.'}</small></div>{recordButton}</Card>}
    <Card className="workout-control" data-testid="workout-controls" onPointerDownCapture={keepFieldFocus}>
      {!training ? <div className="rest-reminder"><Timer size={21} /><div><strong>{workout.phase === 0 ? 'Δύο ασκήσεις, χωρίς ενδιάμεσο διάλειμμα.' : station.rest === null ? 'Ελάχιστο διάλειμμα, όταν το επιλέξετε.' : `${station.rest}″ διάλειμμα μετά το ζεύγος.`}</strong><small>Το χρονόμετρο ξεκινά μόνο με το δικό σας πάτημα.</small></div><div className="rest-actions">{workout.phase === 1 && restView}<Button variant="secondary" onClick={timer.open}><Timer size={17} />Χρονόμετρο</Button></div></div>
        : <div className="training-action-status"><span>{ready ? workout.phase === 0 ? 'Έτοιμοι για αλλαγή ασκήσεων.' : 'Έτοιμοι για διάλειμμα.' : 'Συμπληρώστε τις πραγματικές τιμές πριν την καταγραφή.'}</span><strong>{status}</strong></div>}
      {training && error && <p className="training-save-error" role="alert">{error}</p>}
      <div className="workout-navigation"><Button variant="ghost" disabled={navigating || recording || (workout.phase === 0 && workout.roundIndex === 0 && workout.stationIndex === 0)} onClick={() => void back()} aria-label="Πίσω"><ChevronLeft size={17} /><span>Πίσω</span></Button>{!training && <span>{ready ? 'Το ζεύγος έχει καταγραφεί.' : 'Καταγράψτε ή παραλείψτε τις ασκήσεις για συνέχεια.'}</span>}
        <div className="live-main-actions">{training && <Button variant="secondary" size="icon" aria-label="Χρονόμετρο προπόνησης" onClick={timer.open}><Timer size={20} /></Button>}
          {training && workout.phase === 1 && ready ? <>{!last && <Button className="skip-rest" variant="ghost" disabled={navigating} onClick={() => void next()}>Χωρίς διάλειμμα<ArrowRight size={16} /></Button>}{restView}{last && nextButton}</> : training && workout.phase === 1 && both ? recordButton : nextButton}
        </div>
      </div>
    </Card>
  </>
}
