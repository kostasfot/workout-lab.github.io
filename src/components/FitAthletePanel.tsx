import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Check, Copy, Dumbbell, SkipForward, Undo2, ArrowLeftRight } from 'lucide-react'
import { useWorkspace } from '../context/Workspace'
import { athletes, blankResult, formatTarget, isRecorded, movementsFor, previousResult, slotFor, validResult, type AthleteId, type Movement, type SetResult, type Workout } from '../lib/model'
import { useViewport } from '../lib/useViewport'
import { number } from '../lib/utils'
import { CoachNote } from './CoachNote'
import { CompactAdjuster, type EntryField } from './CompactAdjuster'
import { StepAdjuster } from './StepAdjuster'
import { Badge, Button, Card, EmptyState, Modal } from './ui'

type Update = (fn: (workout: Workout) => Workout) => Promise<boolean>
export function FitAthletePanel({ athlete, workout, update }: { athlete: AthleteId; workout: Workout; update: Update }) {
  const layout = useViewport(), station = workout.routine.stations[workout.stationIndex], slotIndex = slotFor(athlete, workout.phase), slot = station.slots[slotIndex]
  const present = workout.participants.includes(athlete), movements = movementsFor(workout, athlete, station, slotIndex)
  const [selectedId, setSelectedId] = useState(movements[0].id)
  const selected = movements.find(m => m.id === selectedId) || movements[0]
  const complexPair = station.slots.some(s => !s.alternatives && s.movements.length > 1 && s.movements.some(m => m.loaded || m.unilateral))
  const paged = layout.layoutHeight < (complexPair ? 1100 : 900) || layout.compact || movements.length > 2
  const headingPicker = layout.short || (layout.compact && layout.layoutHeight < 760)
  const chooserRow = !headingPicker && station.slots.some(s => s.alternatives || (paged && s.movements.length > 1))
  const recorded = (m: Movement) => isRecorded(workout.results[blankResult(workout, athlete, m, slotIndex).key] || blankResult(workout, athlete, m, slotIndex))
  const locked = Object.values(workout.results).some(r => r.athlete === athlete && r.station === station.id && r.slot === slotIndex && isRecorded(r))
  const afterRecording = (id: string) => { const next = movements.find(m => m.id !== id && !recorded(m)); if (next && paged) setSelectedId(next.id) }
  const alternative = <select aria-label={`Επιλογή άσκησης ${athletes[athlete].name}`} title={selected.name} disabled={locked} value={selected.id} onChange={e => { const id = e.target.value; setSelectedId(id); void update(w => ({ ...w, selections: { ...w.selections, [`${athlete}:${station.id}`]: id } })) }}>{slot.movements.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
  return <Card className={`fit-athlete ${athlete} ${headingPicker ? 'fit-heading-picker' : ''}`} data-testid={`panel-${athlete}`}>
    <div className="fit-athlete-heading"><span className={`avatar ${athlete}`}>{athletes[athlete].initial}</span><div><h3>{athletes[athlete].name}</h3><small>{present ? `Άσκηση ${slotIndex + 1}` : 'Απούσα'}</small></div>{present && headingPicker && (slot.alternatives ? <div className="fit-heading-select">{alternative}</div> : movements.length > 1 ? <select className="fit-heading-select" aria-label={`Άσκηση ${athletes[athlete].name}`} title={selected.name} value={selected.id} onChange={e => setSelectedId(e.target.value)}>{movements.map((m, i) => <option key={m.id} value={m.id}>{i + 1} · {m.name}{recorded(m) ? ' ✓' : ''}</option>)}</select> : null)}{present && <CoachNote athlete={athlete} workoutId={workout.id} popup />}</div>
    {present ? <>
      {chooserRow && <div className={`fit-chooser-row ${station.slots.some(s => s.alternatives) ? 'with-alternative' : ''}`}>
      {slot.alternatives && !headingPicker && <label className="fit-alternative">Επιλογή άσκησης{alternative}</label>}
      {paged && movements.length > 1 && !headingPicker && <div className="fit-movement-tabs" role="tablist" aria-label={`Ασκήσεις ${athletes[athlete].name}`}>{movements.map((m, i) => <Button key={m.id} variant={m.id === selected.id ? 'primary' : 'secondary'} role="tab" aria-selected={m.id === selected.id} aria-controls={`${athlete}-${m.id}-fit`} id={`${athlete}-${m.id}-tab`} onClick={() => setSelectedId(m.id)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? movements.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + movements.length) % movements.length; setSelectedId(movements[index].id); document.getElementById(`${athlete}-${movements[index].id}-tab`)?.focus() } }} tabIndex={m.id === selected.id ? 0 : -1} title={m.name}>{recorded(m) ? <Check size={14} /> : i + 1}<span>{m.name.replace(/^TRX /, '')}</span></Button>)}</div>}
      </div>}
      <div className="fit-movements">{(paged ? [selected] : movements).map(m => <FitMovement key={`${workout.stationIndex}:${workout.roundIndex}:${workout.phase}:${m.id}`} movement={m} athlete={athlete} workout={workout} slotIndex={slotIndex} update={update} afterRecording={() => afterRecording(m.id)} tabbed={paged && movements.length > 1 && !headingPicker} />)}</div>
    </> : <EmptyState icon={<Dumbbell size={24} />} title="Απούσα" description="Δεν συμμετέχει σε αυτή την προπόνηση." />}
  </Card>
}

function FitMovement({ movement, athlete, workout, slotIndex, update, afterRecording, tabbed }: { movement: Movement; athlete: AthleteId; workout: Workout; slotIndex: number; update: Update; afterRecording: () => void; tabbed: boolean }) {
  const { data } = useWorkspace(), layout = useViewport(), id = useId(), inputRef = useRef<HTMLInputElement>(null)
  const blank = blankResult(workout, athlete, movement, slotIndex), result = workout.results[blank.key] || blank, recorded = isRecorded(result)
  const [active, setActive] = useState<EntryField>(movement.loaded ? 'weight' : 'value'), [editor, setEditor] = useState<EntryField | null>(null)
  const previous = previousResult(data.workouts, workout, blank), differentSide = result.otherSide != null && result.otherSide !== result.value
  const reducedDetails = layout.short || (layout.compact && layout.layoutHeight < 760)
  const sameTurn = (w: Workout) => w.stationIndex === workout.stationIndex && w.roundIndex === workout.roundIndex && w.phase === workout.phase
  const label = `${athletes[athlete].name} ${movement.name}`, valueName = movement.metric === 'seconds' ? 'Διάρκεια' : 'Επαναλήψεις'
  const fields: { field: EntryField; kind: 'weight' | 'reps' | 'seconds'; name: string; unit: string }[] = [
    ...(movement.loaded ? [{ field: 'weight' as const, kind: 'weight' as const, name: 'Βάρος', unit: 'kg / αλτήρα' }] : []),
    { field: 'value', kind: movement.metric, name: valueName, unit: movement.metric === 'seconds' ? 'δευτ.' : movement.unilateral === 'leg' ? 'ανά πόδι' : movement.unilateral === 'arm' ? 'ανά χέρι' : 'επ.' },
    ...(movement.unilateral ? [{ field: 'otherSide' as const, kind: 'reps' as const, name: 'Άλλη πλευρά', unit: 'επ.' }] : []),
  ]
  useEffect(() => {
    if (!layout.keyboard || editor !== null || recorded) return
    const field = fields.find(f => document.activeElement?.id === `${id}-main-${f.field}`)
    if (field) { setActive(field.field); setEditor(field.field) }
  }, [layout.keyboard, editor, recorded, id])
  const change = (patch: Partial<SetResult>) => update(w => { const current = w.results[blank.key] || blank; if (!sameTurn(w) || (isRecorded(current) && patch.status === undefined)) return w; return { ...w, results: { ...w.results, [blank.key]: { ...current, ...patch } } } })
  const adjust = (field: EntryField, delta: number) => update(w => {
    const current = w.results[blank.key] || blank
    if (!sameTurn(w) || isRecorded(current)) return w
    const value = Math.round(((field === 'otherSide' ? current.otherSide ?? current.value ?? 0 : current[field] ?? 0) + delta) * 100) / 100
    if (!Number.isFinite(value) || value < (field === 'weight' ? 0 : 1) || value > (field === 'weight' ? 500 : 3600)) return w
    return { ...w, results: { ...w.results, [blank.key]: { ...current, [field]: value } } }
  })
  const reuse = () => update(w => {
    const current = w.results[blank.key] || blank, prior = previousResult(data.workouts, w, blank)?.result
    if (!sameTurn(w) || isRecorded(current) || !prior) return w
    return { ...w, results: { ...w.results, [blank.key]: { ...current, weight: movement.loaded ? prior.weight : null, value: prior.value, otherSide: movement.unilateral ? prior.otherSide ?? null : null } } }
  })
  const priorValues = previous ? `${movement.loaded ? `${number(previous.result.weight!, 2)} kg · ` : ''}${previous.result.value}${previous.result.otherSide != null && previous.result.otherSide !== previous.result.value ? ` / ${previous.result.otherSide}` : ''} ${movement.metric === 'seconds' ? 'δευτ.' : 'επ.'}` : ''
  const source = previous?.source === 'round' ? 'Προηγούμενος γύρος' : 'Προηγούμενη προπόνηση'
  const copy = previous && <Button type="button" variant="secondary" className="fit-copy" disabled={recorded} aria-label="Ίδιο με πριν" title={`Ίδιο με πριν · ${priorValues}`} onClick={() => void reuse()}><Copy size={17} /><span>Ίδιο με πριν</span></Button>
  const open = (field: EntryField) => { setActive(field); setEditor(field) }
  const numericInput = (field: typeof fields[number], popup: boolean) => <label key={field.field} className={`fit-input-field ${active === field.field ? 'selected' : ''}`} htmlFor={`${id}-${popup ? 'editor' : 'main'}-${field.field}`}><span>{field.name}<small>{field.unit}</small></span><input ref={popup && editor === field.field ? inputRef : undefined} id={`${id}-${popup ? 'editor' : 'main'}-${field.field}`} type="number" inputMode={field.field === 'weight' ? 'decimal' : 'numeric'} min={field.field === 'weight' ? 0 : 1} max={field.field === 'weight' ? 500 : 3600} step={field.field === 'weight' ? 'any' : '1'} disabled={recorded} placeholder={field.field === 'otherSide' ? 'ίδιες' : '—'} value={result[field.field] ?? ''} onFocus={() => setActive(field.field)} onChange={e => void change({ [field.field]: e.target.value === '' ? null : Number(e.target.value) })} /></label>
  const exerciseTitle = <><h4>{movement.name}</h4><span>{formatTarget(movement, true)}</span></>
  return <form id={`${athlete}-${movement.id}-fit`} className={`fit-movement ${recorded ? 'recorded' : ''}`} role={tabbed ? 'tabpanel' : undefined} aria-labelledby={tabbed ? `${athlete}-${movement.id}-tab` : undefined} onSubmit={async e => { e.preventDefault(); if (validResult(result) && await change({ status: 'completed' })) afterRecording() }}>
    <div className="fit-movement-title">{layout.short ? <div className="fit-exercise" title={movement.name}>{exerciseTitle}</div> : <button type="button" className="fit-exercise" title={movement.name} aria-label={`Λεπτομέρειες ${movement.name}`} onClick={() => open('value')}>{exerciseTitle}</button>}{recorded && <Badge className={result.status === 'completed' ? 'complete-badge' : ''}>{result.status === 'completed' ? <Check size={13} /> : <SkipForward size={13} />}<span>{result.status === 'completed' ? 'Έγινε' : 'Παράλειψη'}</span></Badge>}</div>
    <div className={`fit-values ${movement.loaded ? '' : 'one-value'}`}>
      {fields.filter(f => f.field !== 'otherSide').map(field => layout.compact || layout.short ? <Button key={field.field} type="button" variant="secondary" className={`fit-value ${active === field.field ? 'selected' : ''}`} aria-label={`Επεξεργασία ${field.name.toLowerCase()} ${label}`} onClick={() => open(field.field)}><span>{layout.compact && movement.loaded && field.field === 'value' && movement.metric === 'reps' ? 'Επαναλ.' : field.name}<small>{field.unit}</small></span><strong className={String(result[field.field] ?? '').length > 5 ? 'long-value' : ''}>{result[field.field] == null ? '—' : number(result[field.field]!, 2)}{field.field === 'value' && differentSide && <small> / {result.otherSide}</small>}</strong></Button> : <div key={field.field}>{numericInput(field, false)}<StepAdjuster kind={field.kind} value={result[field.field]} label={label} disabled={recorded} onAdjust={delta => void adjust(field.field, delta)} /></div>)}
    </div>
    {layout.compact && !layout.short && <CompactAdjuster fields={fields} selected={active} onSelect={setActive} value={active === 'otherSide' ? result.otherSide ?? result.value : result[active]} label={label} disabled={recorded} onAdjust={delta => void adjust(active, delta)} />}
    {movement.unilateral && !layout.short && !layout.compact && <Button type="button" variant="ghost" className="fit-side" aria-label="Διαφορετική τιμή ανά πλευρά" onClick={() => open('otherSide')}><ArrowLeftRight size={15} /><span>{differentSide ? `Άλλη πλευρά: ${result.otherSide} επ.` : 'Διαφορετική τιμή ανά πλευρά'}</span></Button>}
    {!reducedDetails && previous && <div className="fit-previous"><span title={`${source}: ${priorValues}`}><span className="visually-hidden">{source}: </span>{priorValues}</span>{copy}</div>}
    <div className="fit-actions">{reducedDetails && copy}{recorded ? <Button type="button" variant="secondary" aria-label="Αλλαγή καταγραφής" title="Αλλαγή καταγραφής" onClick={() => void change({ status: 'pending' })}><Undo2 size={17} /><span>Αλλαγή καταγραφής</span></Button> : <><Button type="button" variant="ghost" aria-label="Παράλειψη" title="Παράλειψη" onClick={async () => { if (await change({ status: 'skipped', value: null, weight: null, otherSide: null })) afterRecording() }}><SkipForward size={17} /><span>Παράλειψη</span></Button><Button type="submit" disabled={!validResult(result)} aria-label="Καταγραφή" title="Καταγραφή"><Check size={17} /><span>Καταγραφή</span></Button></>}</div>
    <Modal open={editor !== null} onOpenChange={value => { if (!value) setEditor(null) }} title={`${athletes[athlete].name} · ${movement.name}`} description={`${formatTarget(movement)} · Οι τιμές αποθηκεύονται καθώς τις αλλάζετε.`} className="fit-value-editor" onCloseAutoFocus={event => {
      // Returning to a numeric input would reopen the touch keyboard and editor.
      event.preventDefault()
      document.getElementById(`${athlete}-${movement.id}-fit`)?.querySelector<HTMLButtonElement>('button.fit-exercise, button.fit-value')?.focus({ preventScroll: true })
    }} style={{ '--live-height': `${layout.height}px`, '--live-top': `${layout.top}px` } as CSSProperties} onOpenAutoFocus={event => { if (!recorded) { event.preventDefault(); inputRef.current?.focus({ preventScroll: true }) } }}>
      <div className="fit-editor-fields">{fields.map(field => <div key={field.field}>{numericInput(field, true)}<StepAdjuster kind={field.kind} value={field.field === 'otherSide' ? result.otherSide ?? result.value : result[field.field]} label={`${field.field === 'otherSide' ? 'Άλλη πλευρά ' : ''}${label}`} disabled={recorded} onAdjust={delta => void adjust(field.field, delta)} /></div>)}</div>
      {previous && <p className="muted small">{source}: {priorValues}</p>}
      <div className="modal-actions"><Button type="button" onClick={() => setEditor(null)}>Έτοιμο</Button></div>
    </Modal>
  </form>
}
