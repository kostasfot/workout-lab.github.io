import { Button } from './ui'

export function ValueButtons({ value, metric, label, disabled = false, onAdjust }: { value: number | null | undefined; metric: 'reps' | 'seconds'; label: string; disabled?: boolean; onAdjust: (delta: number) => void }) {
  const steps = metric === 'seconds' ? [-10, -5, 5, 10] : [-5, -1, 1, 5]
  return <div className="value-increments" role="group" aria-label={`Προσαρμογή ${label}`}>
    {steps.map(step => <Button key={step} type="button" variant="secondary" size="small" disabled={disabled || (value ?? 0) + step < 1 || (value ?? 0) + step > 3600} aria-label={`${step > 0 ? 'Αύξηση' : 'Μείωση'} ${Math.abs(step)} ${metric === 'seconds' ? 'δευτερολέπτων' : 'επαναλήψεων'} ${label}`} onClick={() => onAdjust(step)}>{step > 0 ? '+' : '−'}{Math.abs(step)}{metric === 'seconds' ? '″' : ''}</Button>)}
  </div>
}
