import { number } from '../lib/utils'
import { Button } from './ui'

export function WeightButtons({ value, label, disabled = false, onAdjust }: { value: number | null | undefined; label: string; disabled?: boolean; onAdjust: (delta: number) => void }) {
  return <div className="weight-increments" role="group" aria-label={`Προσαρμογή βάρους ${label}`}>
    {[-2.5, -1.25, 1.25, 2.5].map(step => {
      const next = Math.round(((value ?? 0) + step) * 100) / 100
      return <Button key={step} type="button" variant="secondary" size="small" disabled={disabled || !Number.isFinite(next) || next < 0 || next > 500} aria-label={`${step > 0 ? 'Αύξηση' : 'Μείωση'} ${Math.abs(step)} kg ${label}`} onClick={() => onAdjust(step)}>{step > 0 ? '+' : '−'}{number(Math.abs(step), 2)} kg</Button>
    })}
  </div>
}
