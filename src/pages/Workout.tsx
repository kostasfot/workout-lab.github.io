import { useEffect, useRef, useState, useId, type CSSProperties, type FocusEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Copy, ChevronDown, Dumbbell, SkipForward, Trophy, Undo2 } from 'lucide-react'
import { useWorkspace } from '../context/Workspace'
import { useAuth } from '../context/Auth'
import { useTimer } from '../context/Timer'
import { athleteIds, athletes, canRecordTogether, recordTogether, discardActiveWorkout, previousResult, advanceWorkout, allExpected, blankResult, finishWorkout, formatTarget, isRecorded, movementsFor, progress, requiredResults, slotFor, validResult, type AthleteId, type Movement, type SetResult, type Workout as WorkoutType } from '../lib/model'
import { number } from '../lib/utils'
import { ValueButtons } from '../components/ValueButtons'
import { WeightButtons } from '../components/WeightButtons'
import { CoachNote } from '../components/CoachNote'
import { restContext } from '../components/RestView'
import { WorkoutControls } from '../components/WorkoutControls'
import { TrainingModeToggle } from '../components/TrainingModeToggle'
import { WorkoutOptions } from '../components/WorkoutOptions'
import { useTrainingMode } from '../context/TrainingMode'
import { RoundFlow } from '../components/RoundFlow'
import { quickValues, recordAndSwap, type ChoiceField } from '../lib/live'
import { QuickChoices } from '../components/QuickChoices'
import { Button, Card, Badge, EmptyState, Modal, DeleteConfirmation, ProgressBar } from '../components/ui'

export function Workout() {
  const { active: training } = useTrainingMode()
  const { id } = useParams(), { data, edit } = useWorkspace(), { identity, local } = useAuth(), timer = useTimer(), navigate = useNavigate()
  const workout = data.workouts.find(w => w.id === id), [finishing, setFinishing] = useState(false), [discarding, setDiscarding] = useState(false), [busy, setBusy] = useState(false), [recording, setRecording] = useState(false)
  const navigationLock = useRef(false), [navigating, setNavigating] = useState(false)
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = async () => { if ('wakeLock' in navigator && document.visibilityState === 'visible') { try { lock = await navigator.wakeLock.request('screen') } catch { /* optional browser capability */ } } }
    void acquire(); document.addEventListener('visibilitychange', acquire)
    return () => { document.removeEventListener('visibilitychange', acquire); void lock?.release() }
  }, [])
  if (!workout || workout.status !== 'active' || identity?.role !== 'coach') return <EmptyState icon={<Dumbbell size={30} />} title="Δεν υπάρχει ενεργή προπόνηση εδώ." description="Επιλέξτε προπόνηση από την επισκόπηση ή δείτε τις προηγούμενες στο ιστορικό." action={<Button onClick={() => navigate('/')}>Στην επισκόπηση<ArrowRight size={17} /></Button>} />
  const station = workout.routine.stations[workout.stationIndex], state = progress(workout)
  const panelRows = 3 + 4 * Math.max(...athleteIds.map(a => workout.participants.includes(a) ? movementsFor(workout, a, station, slotFor(a, workout.phase)).length : 0))
  const update = async (fn: (w: WorkoutType) => WorkoutType) => {
    let changed = false
    try { await edit(workspace => { const index = workspace.workouts.findIndex(w => w.id === id); if (index < 0 || workspace.workouts[index].status !== 'active') return []; const value = fn(workspace.workouts[index]); if (value === workspace.workouts[index]) return []; workspace.workouts[index] = value; changed = true; return [{ kind: 'workout', payload: value }] }); return changed } catch { return false /* context displays error */ }
  }
  const canDiscard = local || data.workoutDiscard === true
  const last = workout.stationIndex === workout.routine.stations.length - 1 && workout.roundIndex === station.rounds - 1 && workout.phase === 1
  const ready = requiredResults(workout, workout.phase === 0).every(isRecorded)
  const canCombine = workout.phase === 0 && canRecordTogether(workout)
  const next = async () => {
    if (navigationLock.current) return false
    navigationLock.current = true; setNavigating(true)
    try {
      if (last) { setFinishing(true); timer.stop('rest', restContext(workout)); return true }
      const saved = await update(w => w.stationIndex === workout.stationIndex && w.roundIndex === workout.roundIndex && w.phase === workout.phase ? canCombine ? recordAndSwap(w) : advanceWorkout(w) : w)
      if (saved) timer.stop('rest', restContext(workout))
      return saved
    } finally { navigationLock.current = false; setNavigating(false) }
  }
  const back = async () => {
    const saved = await update(w => w.phase === 1 ? { ...w, phase: 0 } : w.roundIndex > 0 ? { ...w, phase: 1, roundIndex: w.roundIndex - 1 } : w.stationIndex > 0 ? { ...w, stationIndex: w.stationIndex - 1, phase: 1, roundIndex: w.routine.stations[w.stationIndex - 1].rounds - 1 } : w)
    if (saved) timer.stop('rest', restContext(workout))
  }
  const recordBoth = async () => { setRecording(true); try { await update(w => w.stationIndex === workout.stationIndex && w.roundIndex === workout.roundIndex && w.phase === workout.phase ? recordTogether(w) : w) } finally { setRecording(false) } }
  return <><div className="page-heading workout-heading"><div><button className="back-link" onClick={() => navigate('/')}><ArrowLeft size={16} />Επισκόπηση</button><h1>{workout.routine.name}<span className="title-dot">.</span></h1><p>{workout.routine.focus}</p></div><Badge className="live-badge"><span className="live-dot" />ΣΕ ΕΞΕΛΙΞΗ</Badge></div>
    <Card className="station-navigation">{workout.routine.stations.map((s, i) => <div className={`station-step ${i === workout.stationIndex ? 'current' : i < workout.stationIndex ? 'past' : ''}`} key={s.id}><span>{i < workout.stationIndex ? <Check size={16} /> : String(i + 1).padStart(2, '0')}</span><div><strong>{s.name}</strong><small>{s.rounds} γύροι · {s.rest === null ? 'χωρίς preset' : `${s.rest}″ rest`}</small></div></div>)}</Card>
    <div className={`round-heading compact-round-heading ${training ? 'training-round-heading' : ''}`} data-testid="round-header"><div className="round-heading-line"><strong className="round-station">{station.name}</strong><span className="round-separator" aria-hidden="true">·</span><h2>Γύρος {workout.roundIndex + 1} <span>/ {station.rounds}</span></h2></div><div className="training-toolbar"><TrainingModeToggle /><WorkoutOptions canDiscard={canDiscard} onFinish={() => setFinishing(true)} onDiscard={() => setDiscarding(true)} /></div><RoundFlow workout={workout} /></div>
    <div className="athlete-panels compact-athlete-panels" style={{ '--panel-rows': panelRows } as CSSProperties} onPointerDownCapture={e => {
      // Both cards share row heights: preserve field focus until a tapped action completes,
      // so collapsing either athlete's quick choices cannot move the other card's button.
      if (e.button === 0 && e.target instanceof Element && e.target.closest('button, summary') && e.currentTarget.contains(document.activeElement) && document.activeElement?.closest('.result-inputs')) e.preventDefault()
    }}>{athleteIds.map(a => <AthletePanel key={a} athlete={a} workout={workout} update={update} present={workout.participants.includes(a)} />)}</div>
    <WorkoutControls workout={workout} ready={ready} canCombine={canCombine} last={last} navigating={navigating} recording={recording} next={next} back={back} recordBoth={recordBoth} />
    <div className="session-progress"><span>Πρόοδος προπόνησης</span><ProgressBar value={state.percent} /><strong>{state.recorded}/{state.total}</strong></div>
    {!canDiscard && <p className="muted small deletion-availability">Η διακοπή χωρίς αποθήκευση θα είναι διαθέσιμη μόλις ενεργοποιηθεί για την ομάδα.</p>}
    <DeleteConfirmation open={discarding} onOpenChange={setDiscarding} title="Διακοπή χωρίς αποθήκευση" description={workout.routine.name} confirmLabel="Διακοπή χωρίς αποθήκευση" message="Τα τρέχοντα σετ και οι σημειώσεις αυτής της προπόνησης θα διαγραφούν. Δεν θα προστεθεί προπόνηση στο ιστορικό. Η ενέργεια δεν αναιρείται." onConfirm={async () => { if (!canDiscard) throw new Error('Η διακοπή δεν έχει ενεργοποιηθεί.'); await edit(w => discardActiveWorkout(w, workout.id)); timer.clear(); navigate('/') }} />
    <Modal open={finishing} onOpenChange={setFinishing} title="Ολοκλήρωση προπόνησης" description="Η καταγραφή μένει αποθηκευμένη, ακόμη και χωρίς σύνδεση."><div className="finish-summary"><span className="finish-icon"><Trophy size={30} /></span><h3>{workout.routine.name}</h3><p>{Object.values(workout.results).filter(r => r.status === 'completed').length} από {state.total} αποτελέσματα έχουν ολοκληρωθεί.</p></div>{allExpected(workout).some(r => workout.results[r.key]?.status !== 'completed') && <div className="inline-notice">Οι ασκήσεις που δεν ολοκληρώθηκαν θα σημειωθούν ως παραλειφθείσες. Η προπόνηση θα αποθηκευτεί ως μερική.</div>}<div className="modal-actions"><Button variant="secondary" onClick={() => setFinishing(false)}>Συνέχεια προπόνησης</Button><Button disabled={busy} onClick={async () => { setBusy(true); try { await edit(w => { const index = w.workouts.findIndex(x => x.id === id); const finished = finishWorkout(w.workouts[index]); w.workouts[index] = finished; return [{ kind: 'workout', payload: finished }] }); timer.clear(); navigate(`/history?session=${id}`) } catch { setBusy(false) } }}><Check size={17} />Αποθήκευση & τέλος</Button></div></Modal>
  </>
}
function AthletePanel({ athlete, workout, update, present }: { athlete: AthleteId; workout: WorkoutType; update: (fn: (w: WorkoutType) => WorkoutType) => Promise<boolean>; present: boolean }) {
  const station = workout.routine.stations[workout.stationIndex], slotIndex = slotFor(athlete, workout.phase), slot = station.slots[slotIndex]
  const movements = movementsFor(workout, athlete, station, slotIndex)
  const choiceLocked = Object.values(workout.results).some(r => r.athlete === athlete && r.station === station.id && r.slot === slotIndex && isRecorded(r))
  return <Card className={`athlete-panel ${athlete}`} data-testid={`panel-${athlete}`}><div className="athlete-panel-header"><span className={`avatar ${athlete}`}>{athletes[athlete].initial}</span><div><h3>{athletes[athlete].name}</h3><span>{present ? `Άσκηση ${slotIndex + 1} · Σετ ${workout.roundIndex + 1}` : 'Δεν συμμετέχει σήμερα'}</span></div><span className="athlete-color-dot" /></div><div className="panel-choice">{present && slot.alternatives && <label className="alternative-select">Επιλογή άσκησης<select value={movements[0].id} disabled={choiceLocked} onChange={e => { const value = e.target.value; void update(w => ({ ...w, selections: { ...w.selections, [`${athlete}:${station.id}`]: value } })) }}>{slot.movements.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}</div>{present ? <>{movements.map(m => <MovementLogger key={`${workout.stationIndex}:${workout.roundIndex}:${m.id}`} movement={m} athlete={athlete} workout={workout} slotIndex={slotIndex} update={update} />)}<CoachNote athlete={athlete} workoutId={workout.id} /></> : <EmptyState icon={<UsersIcon />} title="Απούσα" description="Δεν θα δημιουργηθούν αποτελέσματα για αυτή την αθλήτρια." />}</Card>
}
function UsersIcon() { return <Dumbbell size={24} /> }
function MovementLogger({ movement, athlete, workout, slotIndex, update }: { movement: Movement; athlete: AthleteId; workout: WorkoutType; slotIndex: number; update: (fn: (w: WorkoutType) => WorkoutType) => Promise<boolean> }) {
  const [selected, setSelected] = useState<ChoiceField | null>(null)
  const { data } = useWorkspace(), blank = blankResult(workout, athlete, movement, slotIndex), result = workout.results[blank.key] || blank, recorded = isRecorded(result)
  const previous = previousResult(data.workouts, workout, blank), sideId = useId()
  const differentSide = result.otherSide != null && result.otherSide !== result.value
  const [sideExpanded, setSideExpanded] = useState(differentSide)
  useEffect(() => { if (differentSide) setSideExpanded(true) }, [differentSide, result.otherSide, recorded])
  const previousValues = previous ? `${movement.loaded && previous.result.weight !== null ? `${number(previous.result.weight, 2)} kg · ` : ''}${previous.result.value}${movement.unilateral && previous.result.otherSide != null && previous.result.otherSide !== previous.result.value ? ` / ${previous.result.otherSide}` : ''} ${movement.metric === 'seconds' ? 'δευτ.' : 'επ.'}` : ''
  const previousSource = previous?.source === 'round' ? 'Προηγούμενος γύρος' : 'Προηγούμενη προπόνηση'
  const reuse = () => update(w => {
    const current = w.results[blank.key] || blank, prior = previousResult(data.workouts, w, blank)?.result
    if (isRecorded(current) || !prior) return w
    return { ...w, results: { ...w.results, [blank.key]: { ...current, weight: movement.loaded ? prior.weight : null, value: prior.value, otherSide: movement.unilateral ? prior.otherSide ?? null : null } } }
  })
  const setResult = (patch: Partial<SetResult>) => update(w => ({ ...w, results: { ...w.results, [blank.key]: { ...(w.results[blank.key] || blank), ...patch } } }))
  const fieldEvents = (field: ChoiceField) => ({
    onFocus: (e: FocusEvent<HTMLDivElement>) => { if (e.target instanceof HTMLInputElement) setSelected(field) },
    onBlur: (e: FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSelected(current => current === field ? null : current) },
  })
  const choices = (field: ChoiceField) => selected === field && !recorded ? <QuickChoices values={quickValues(data.workouts, workout, blank, field)} field={field} metric={movement.metric} label={`${athletes[athlete].name} ${movement.name} ${field === 'weight' ? 'βάρος' : field === 'otherSide' ? 'άλλη πλευρά' : movement.metric === 'seconds' ? 'διάρκεια' : 'επαναλήψεις'}`} onChoose={value => void update(w => {
    const current = w.results[blank.key] || blank
    return isRecorded(current) ? w : { ...w, results: { ...w.results, [blank.key]: { ...current, [field]: value } } }
  })} /> : null
  const adjustValue = (field: 'value' | 'otherSide', delta: number) => update(w => {
    const current = w.results[blank.key] || blank
    if (isRecorded(current)) return w
    const value = (field === 'otherSide' ? current.otherSide ?? current.value ?? 0 : current.value ?? 0) + delta
    if (value < 1 || value > 3600 || !Number.isFinite(value)) return w
    return { ...w, results: { ...w.results, [blank.key]: { ...current, [field]: value } } }
  })
  return <form className={`movement-logger ${recorded ? 'recorded' : ''}`} onSubmit={e => { e.preventDefault(); if (validResult(result)) void setResult({ status: 'completed' }) }}><div className="movement-title"><div className="movement-summary"><h4>{movement.name}</h4><span className="movement-target" aria-label={`Στόχος ${athletes[athlete].name} ${movement.name}`}>{formatTarget(movement, true)}</span></div>{recorded && <Badge className={result.status === 'completed' ? 'complete-badge' : ''}>{result.status === 'completed' ? <Check size={13} /> : <SkipForward size={13} />}{result.status === 'completed' ? 'Έγινε' : 'Παράλειψη'}</Badge>}</div><div className={`result-inputs ${!movement.loaded ? 'single-input' : ''}`}>
    {movement.loaded && <div className="weight-input-group" {...fieldEvents('weight')}><label htmlFor={`${athlete}-${movement.id}-weight`}>Βάρος <small>kg / αλτήρα</small><input id={`${athlete}-${movement.id}-weight`} type="number" inputMode="decimal" min="0" max="500" step="any" placeholder="—" disabled={recorded} value={result.weight ?? ''} onChange={e => void setResult({ weight: e.target.value === '' ? null : Number(e.target.value) })} /></label>{choices('weight')}<WeightButtons value={result.weight} label={`${athletes[athlete].name} ${movement.name}`} disabled={recorded} onAdjust={delta => void update(w => {
      const current = w.results[blank.key] || blank
      if (isRecorded(current)) return w
      const weight = Math.round(((current.weight ?? 0) + delta) * 100) / 100
      if (weight < 0 || weight > 500 || !Number.isFinite(weight)) return w
      return { ...w, results: { ...w.results, [blank.key]: { ...current, weight } } }
    })} /></div>}
    <div className="exercise-input-group" {...fieldEvents('value')}><label htmlFor={`${athlete}-${movement.id}-value`}>{movement.metric === 'seconds' ? 'Διάρκεια' : 'Επαναλήψεις'}<small>{movement.metric === 'seconds' ? 'δευτερόλεπτα' : movement.unilateral === 'leg' ? 'ανά πόδι' : movement.unilateral === 'arm' ? 'ανά χέρι' : 'πραγματικές'}</small><input id={`${athlete}-${movement.id}-value`} type="number" inputMode="numeric" min="1" max="3600" step="1" placeholder="—" disabled={recorded} value={result.value ?? ''} onChange={e => void setResult({ value: e.target.value === '' ? null : Number(e.target.value) })} /></label>{choices('value')}<ValueButtons value={result.value} metric={movement.metric} label={`${athletes[athlete].name} ${movement.name}`} disabled={recorded} onAdjust={delta => void adjustValue('value', delta)} /></div>
    {movement.unilateral && <div className="other-side-section"><Button type="button" variant="ghost" size="small" className="other-side-toggle" aria-expanded={sideExpanded} aria-controls={sideId} onClick={() => setSideExpanded(value => !value)}><span>Διαφορετική τιμή ανά πλευρά</span>{differentSide && <small>{result.otherSide} επ.</small>}<ChevronDown size={14} aria-hidden="true" /></Button><div id={sideId} hidden={!sideExpanded} className="other-side-input exercise-input-group" {...fieldEvents('otherSide')}><label>Άλλη πλευρά <small>προαιρετικά, αν διαφέρει</small><input aria-label={`Άλλη πλευρά ${athletes[athlete].name} ${movement.name}`} type="number" inputMode="numeric" min="1" step="1" placeholder="ίδιες επαναλήψεις" disabled={recorded} value={result.otherSide ?? ''} onChange={e => void setResult({ otherSide: e.target.value === '' ? null : Number(e.target.value) })} /></label>{choices('otherSide')}<ValueButtons value={result.otherSide ?? result.value} metric="reps" label={`Άλλη πλευρά ${athletes[athlete].name} ${movement.name}`} disabled={recorded} onAdjust={delta => void adjustValue('otherSide', delta)} /></div></div>}
    </div><div className="previous-entry">{previous && <><span className="previous-result" title={`${previousSource}: ${previousValues}`}><span className="visually-hidden">{previousSource}: </span>{previousValues}</span><Button type="button" variant="secondary" size="small" disabled={recorded} onClick={() => void reuse()}><Copy size={15} />Ίδιο με πριν</Button></>}</div><div className="movement-actions">{recorded ? <Button type="button" variant="secondary" onClick={() => void setResult({ status: 'pending' })}><Undo2 size={16} />Αλλαγή καταγραφής</Button> : <><Button type="button" variant="ghost" size="small" onClick={() => void setResult({ status: 'skipped', weight: null, value: null, otherSide: null })}><SkipForward size={15} />Παράλειψη</Button><Button type="submit" disabled={!validResult(result)}><Check size={16} />Καταγραφή</Button></>}</div></form>
}
