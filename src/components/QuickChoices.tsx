import type { ChoiceField } from '../lib/live'
import { number } from '../lib/utils'

export function QuickChoices({ values, field, metric, label, onChoose }: { values: number[]; field: ChoiceField; metric: 'reps' | 'seconds'; label: string; onChoose: (value: number) => void }) {
  const unit = field === 'weight' ? 'kg' : field === 'value' && metric === 'seconds' ? 'δευτ.' : 'επ.'
  return <div className="quick-choices" role="group" aria-label={`Γρήγορες τιμές ${label}`}>
    <span>{field === 'weight' ? 'Πρόσφατα βάρη' : 'Γρήγορες τιμές'}</span>
    {values.length ? <div>{values.map(value => <button type="button" key={value} onPointerDown={e => { if (e.button === 0) e.preventDefault() }} aria-label={`Χρήση ${number(value, 2)} ${unit} ${label}`} onClick={() => onChoose(value)}>{number(value, 2)} <small>{unit}</small></button>)}</div> : <p>Δεν υπάρχουν ακόμη προηγούμενα βάρη για αυτή την άσκηση.</p>}
  </div>
}
