import { ArrowLeftRight, ArrowRight, CheckCheck, ChevronLeft, Timer, CloudCheck, CloudOff, HardDrive, RefreshCw, AlertTriangle } from 'lucide-react'
import { remainingSeconds, useTimer } from '../context/Timer'
import { useTrainingMode } from '../context/TrainingMode'
import { useWorkspace } from '../context/Workspace'
import { useAuth } from '../context/Auth'
import { athleteIds, athletes, canRecordTogether, isRecorded, requiredResults, type Workout } from '../lib/model'
import { recordingIssues } from '../lib/live'
import { seconds } from '../lib/utils'
import { RestView, restContext } from './RestView'
import { Button, Card } from './ui'

export function WorkoutControls({ workout, ready, canCombine, last, navigating, recording, next, back, recordBoth }: {
  workout: Workout; ready: boolean; canCombine: boolean; last: boolean; navigating: boolean; recording: boolean;
  next: () => Promise<boolean>; back: () => Promise<void>; recordBoth: () => Promise<void>
}) {
  const { active: training } = useTrainingMode(), timer = useTimer(), { local } = useAuth(), { online, pending, syncing, error } = useWorkspace()
  const station = workout.routine.stations[workout.stationIndex], both = athleteIds.every(a => workout.participants.includes(a))
  const conflict = pending.some(p => p.conflict)
  const status = local ? 'Στη συσκευή' : !online ? 'Εκτός σύνδεσης' : conflict ? 'Έλεγχος αλλαγών' : pending.length ? `${pending.length} σε αναμονή` : syncing ? 'Συγχρονισμός…' : 'Συγχρονισμένο'
  const SyncIcon = local ? HardDrive : !online ? CloudOff : conflict ? AlertTriangle : syncing ? RefreshCw : CloudCheck
  const activeTimer = timer.jobs.find(j => j.deadline !== null && remainingSeconds(j, timer.now) > 0) || timer.jobs.find(j => j.deadline !== null)
  const restJob = timer.jobs.find(j => j.id === 'rest' && j.context === restContext(workout))
  const restFeedback = restJob ? remainingSeconds(restJob, timer.now) === 0 ? 'Το διάλειμμα ολοκληρώθηκε.' : restJob.deadline === null ? 'Το διάλειμμα είναι σε παύση.' : 'Διάλειμμα σε εξέλιξη.' : null
  const issues = recordingIssues(workout), current = requiredResults(workout, true), currentReady = current.every(isRecorded)
  const feedback = navigating || recording ? ['Αποθήκευση στη συσκευή…'] : issues.length ? issues : ready
    ? [workout.phase === 0 ? 'Έτοιμοι για αλλαγή ασκήσεων.' : restFeedback || (last ? 'Έτοιμοι για ολοκλήρωση.' : 'Έτοιμοι για διάλειμμα.')]
    : canCombine ? ['Έτοιμοι για καταγραφή και αλλαγή.']
    : currentReady ? ['Επιστρέψτε στο πρώτο ζεύγος για καταγραφή.']
    : both ? ['Έτοιμοι για καταγραφή.'] : [`${athletes[workout.participants[0]].name}: πατήστε Καταγραφή.`]
  const nextLabel = workout.roundIndex + 1 === station.rounds ? 'Επόμενος σταθμός' : 'Επόμενος γύρος'
  const recordButton = <Button disabled={recording || navigating || !canRecordTogether(workout)} onClick={() => void recordBoth()}><CheckCheck size={18} />Καταγραφή και των δύο</Button>
  const nextButton = <Button disabled={(!ready && !canCombine) || navigating || recording} onClick={() => void next()}>{workout.phase === 0 ? <><ArrowLeftRight size={17} />{canCombine ? 'Καταγραφή και αλλαγή' : 'Αλλαγή ασκήσεων'}</> : last ? <><CheckCheck size={17} />Ολοκλήρωση</> : <>{nextLabel}<ArrowRight size={17} /></>}</Button>
  const restView = <RestView key={restContext(workout)} workout={workout} ready={ready && !navigating && !recording} last={last} onContinue={next} primary={!last} />
  const primary = workout.phase === 0 ? nextButton : ready ? last ? nextButton : restView : both ? recordButton : nextButton
  const keepFieldFocus = (event: React.PointerEvent<HTMLElement>) => {
    // Keep the focused numeric field active until a tapped action completes.
    if (event.button === 0 && document.activeElement?.closest('.result-inputs') && event.target instanceof Element && event.target.closest('button')) event.preventDefault()
  }
  return <Card className="workout-control clean-workout-control" data-testid="workout-controls" onPointerDownCapture={keepFieldFocus} aria-busy={navigating || recording}>
    <div className="workout-bar-meta">
      <div className="workout-feedback" role="status" aria-label="Κατάσταση καταγραφής">{feedback.map(message => <span key={message}>{message}</span>)}</div>
      {workout.phase === 1 && ready && (last ? <div className="bar-final-rest">{restView}</div> : <Button variant="ghost" size="small" className="bar-skip-rest" aria-label={nextLabel} title={`${nextLabel} χωρίς διάλειμμα`} disabled={navigating || recording} onClick={() => void next()}>Χωρίς διάλειμμα<ArrowRight size={13} /></Button>)}
      <span className={`workout-sync ${conflict ? 'attention' : ''}`} title={status}><SyncIcon size={13} className={syncing ? 'spinning' : ''} aria-hidden="true" /><span>{status}</span></span>
    </div>
    {training && error && <p className="training-save-error" role="alert">{error}</p>}
    <div className="workout-navigation">
      <Button variant="ghost" className="bar-back" disabled={navigating || recording || (workout.phase === 0 && workout.roundIndex === 0 && workout.stationIndex === 0)} onClick={() => void back()} aria-label="Πίσω"><ChevronLeft size={18} /><span>Πίσω</span></Button>
      <Button variant="secondary" className={`bar-timer ${activeTimer ? 'active' : ''}`} aria-label="Άνοιγμα χρονομέτρου" title="Χρονόμετρο" onClick={timer.open}><Timer size={20} />{activeTimer && <span aria-hidden="true">{seconds(remainingSeconds(activeTimer, timer.now))}</span>}</Button>
      <div className="live-main-actions">{primary}</div>
    </div>
  </Card>
}
