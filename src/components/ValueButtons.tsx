import { StepAdjuster } from './StepAdjuster'

export function ValueButtons({ value, metric, label, disabled = false, onAdjust }: { value: number | null | undefined; metric: 'reps' | 'seconds'; label: string; disabled?: boolean; onAdjust: (delta: number) => void }) {
  return <StepAdjuster kind={metric} value={value} label={label} disabled={disabled} onAdjust={onAdjust} />
}
