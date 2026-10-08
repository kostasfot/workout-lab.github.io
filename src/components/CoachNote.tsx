import { useId } from 'react'
import { ChevronDown, LockKeyhole } from 'lucide-react'
import { useWorkspace } from '../context/Workspace'
import { athletes, type AthleteId } from '../lib/model'

export function CoachNote({ athlete, workoutId }: { athlete: AthleteId; workoutId: string }) {
  const { data, edit } = useWorkspace(), id = useId()
  const note = data.notes.find(n => n.workoutId === workoutId && n.athlete === athlete)
  return <details className="coach-note">
    <summary><span><LockKeyhole size={13} />Σημείωση προπονητή</span>{note?.text.trim() && <span className="note-indicator" title="Υπάρχει σημείωση"><span className="visually-hidden">Υπάρχει σημείωση</span></span>}<ChevronDown size={14} className="disclosure-chevron" aria-hidden="true" /></summary>
    <label className="visually-hidden" htmlFor={id}>Ιδιωτική σημείωση προπονητή {athletes[athlete].name}</label>
    <textarea id={id} rows={2} maxLength={10000} placeholder="Πώς πήγε αυτό το σετ;" value={note?.text || ''} onChange={event => {
      const text = event.target.value
      void edit(w => {
        const existing = w.notes.find(n => n.workoutId === workoutId && n.athlete === athlete)
        const value = existing || { id: crypto.randomUUID(), workoutId, athlete, text, revision: 0 }
        value.text = text
        if (!existing) w.notes.push(value)
        return [{ kind: 'note', payload: value }]
      }).catch(() => {})
    }} />
  </details>
}
