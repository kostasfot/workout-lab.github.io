import { ChevronDown } from 'lucide-react'
import { incrementSteps, useIncrements, type IncrementKind } from '../context/Increments'
import { number } from '../lib/utils'
import { Button } from './ui'

export function StepAdjuster({ kind, value, label, disabled = false, onAdjust }: { kind: IncrementKind; value: number | null | undefined; label: string; disabled?: boolean; onAdjust: (delta: number) => void }) {
  const { steps, choose } = useIncrements(), step = steps[kind]
  const suffix = kind === 'weight' ? 'kg' : kind === 'seconds' ? 'δευτερολέπτων' : 'επαναλήψεων'
  const heading = kind === 'weight' ? 'βάρους' : suffix, minimum = kind === 'weight' ? 0 : 1, maximum = kind === 'weight' ? 500 : 3600
  const invalid = (delta: number) => {
    const next = kind === 'weight' ? Math.round(((value ?? 0) + delta) * 100) / 100 : (value ?? 0) + delta
    return !Number.isFinite(next) || next < minimum || next > maximum
  }
  return <div className={`step-adjuster ${kind === 'weight' ? 'weight-increments' : 'value-increments'}`} role="group" aria-label={`Προσαρμογή ${kind === 'weight' ? 'βάρους ' : ''}${label}`}>
    <Button type="button" variant="secondary" size="small" disabled={disabled || invalid(-step)} aria-label={`Μείωση ${step} ${suffix} ${label}`} onClick={() => onAdjust(-step)}>−</Button>
    <label className="increment-selector"><select aria-label={`Βήμα ${heading} ${label}`} title={`Βήμα ${heading}`} disabled={disabled} value={step} onChange={event => choose(kind, Number(event.target.value))}>{incrementSteps[kind].map(option => <option key={option} value={option}>{number(option, 2)}</option>)}</select><ChevronDown size={12} aria-hidden="true" /></label>
    <Button type="button" variant="secondary" size="small" disabled={disabled || invalid(step)} aria-label={`Αύξηση ${step} ${suffix} ${label}`} onClick={() => onAdjust(step)}>+</Button>
  </div>
}
