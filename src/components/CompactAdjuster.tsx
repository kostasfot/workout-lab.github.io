import { useIncrements, incrementSteps, type IncrementKind } from '../context/Increments'
import { number } from '../lib/utils'
import { Button } from './ui'

export type EntryField = 'weight' | 'value' | 'otherSide'
export function CompactAdjuster({ fields, selected, onSelect, value, label, disabled, onAdjust }: { fields: { field: EntryField; kind: IncrementKind; name: string }[]; selected: EntryField; onSelect: (field: EntryField) => void; value: number | null | undefined; label: string; disabled: boolean; onAdjust: (delta: number) => void }) {
  const { steps, choose } = useIncrements(), active = fields.find(f => f.field === selected) || fields[0], step = steps[active.kind]
  const suffix = active.kind === 'weight' ? 'kg' : active.kind === 'seconds' ? 'δευτερολέπτων' : 'επαναλήψεων'
  const invalid = (delta: number) => { const next = Math.round(((value ?? 0) + delta) * 100) / 100; return !Number.isFinite(next) || next < (active.kind === 'weight' ? 0 : 1) || next > (active.kind === 'weight' ? 500 : 3600) }
  return <div className="step-adjuster compact-adjuster" role="group" aria-label={`Προσαρμογή ${active.name} ${label}`}>
    <Button type="button" variant="secondary" disabled={disabled || invalid(-step)} aria-label={`Μείωση ${step} ${suffix} ${active.field === 'otherSide' ? 'Άλλη πλευρά ' : ''}${label}`} onClick={() => onAdjust(-step)}>−</Button>
    <select aria-label={`Πεδίο και βήμα ${label}`} disabled={disabled} value={`${active.field}:${step}`} onChange={e => { const [field, step] = e.target.value.split(':'); const next = fields.find(f => f.field === field)!; onSelect(next.field); choose(next.kind, Number(step)) }}>{fields.map(f => <optgroup key={f.field} label={f.name}>{incrementSteps[f.kind].map(step => <option key={step} value={`${f.field}:${step}`}>{f.field === 'otherSide' ? 'Άλλη' : f.kind === 'weight' ? 'kg' : f.kind === 'seconds' ? 'δευτ.' : 'επ.'} · {number(step, 2)}</option>)}</optgroup>)}</select>
    <Button type="button" variant="secondary" disabled={disabled || invalid(step)} aria-label={`Αύξηση ${step} ${suffix} ${active.field === 'otherSide' ? 'Άλλη πλευρά ' : ''}${label}`} onClick={() => onAdjust(step)}>+</Button>
  </div>
}
