import { Check } from 'lucide-react'
import { roundStep } from '../lib/live'
import type { Workout } from '../lib/model'

const steps = [{ label: 'Ασκήσεις', detail: 'Αρχικό ζεύγος' }, { label: 'Αλλαγή', detail: 'Χωρίς διάλειμμα' }, { label: 'Ασκήσεις', detail: 'Μετά την αλλαγή' }, { label: 'Διάλειμμα', detail: 'Με το πάτημά σας' }]

export function RoundFlow({ workout }: { workout: Workout }) {
  const current = roundStep(workout)
  return <ol className="round-flow" aria-label="Ροή γύρου">{steps.map((step, index) => <li key={index} className={index === current ? 'current' : index < current ? 'done' : ''} aria-current={index === current ? 'step' : undefined} aria-label={`${index + 1}. ${step.label} · ${step.detail}`} data-step={index}>
    <span className="round-flow-number">{index < current ? <Check size={14} /> : index + 1}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div>
  </li>)}</ol>
}
