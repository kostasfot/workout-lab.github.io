import { StepAdjuster } from './StepAdjuster'

export function WeightButtons({ value, label, disabled = false, onAdjust }: { value: number | null | undefined; label: string; disabled?: boolean; onAdjust: (delta: number) => void }) {
  return <StepAdjuster kind="weight" value={value} label={label} disabled={disabled} onAdjust={onAdjust} />
}
