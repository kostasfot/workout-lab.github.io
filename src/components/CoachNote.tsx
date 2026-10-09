import { useId, useState, type CSSProperties } from 'react'
import { ChevronDown, LockKeyhole } from 'lucide-react'
import { useWorkspace } from '../context/Workspace'
import { athletes, type AthleteId } from '../lib/model'
import { Button, Modal } from './ui'
import { useViewport } from '../lib/useViewport'

export function CoachNote({ athlete, workoutId, popup = false }: { athlete: AthleteId; workoutId: string; popup?: boolean }) {
  const { data, edit } = useWorkspace(), id = useId(), [open, setOpen] = useState(false), layout = useViewport()
  const note = data.notes.find(n => n.workoutId === workoutId && n.athlete === athlete)
  const indicator = note?.text.trim() && <span className="note-indicator" title="Υπάρχει σημείωση"><span className="visually-hidden">Υπάρχει σημείωση</span></span>
  const field = <><label className="visually-hidden" htmlFor={id}>Ιδιωτική σημείωση προπονητή {athletes[athlete].name}</label>
    <textarea id={id} rows={2} maxLength={10000} placeholder="Πώς πήγε αυτό το σετ;" value={note?.text || ''} onChange={event => {
      const text = event.target.value
      void edit(w => {
        const existing = w.notes.find(n => n.workoutId === workoutId && n.athlete === athlete)
        const value = existing || { id: crypto.randomUUID(), workoutId, athlete, text, revision: 0 }
        value.text = text
        if (!existing) w.notes.push(value)
        return [{ kind: 'note', payload: value }]
      }).catch(() => {})
    }} /></>
  if (popup) return <><Button variant="ghost" size="icon" className="fit-note" aria-label={`Σημείωση προπονητή ${athletes[athlete].name}`} title="Σημείωση προπονητή" onClick={() => setOpen(true)}><LockKeyhole size={17} />{indicator}</Button><Modal open={open} onOpenChange={setOpen} title={`Σημείωση προπονητή ${athletes[athlete].name}`} description="Ιδιωτική σημείωση · αποθηκεύεται καθώς γράφετε." className="fit-note-editor" style={{ '--live-height': `${layout.height}px`, '--live-top': `${layout.top}px` } as CSSProperties}>{field}<div className="modal-actions"><Button onClick={() => setOpen(false)}>Έτοιμο</Button></div></Modal></>
  return <details className="coach-note">
    <summary><span><LockKeyhole size={13} />Σημείωση προπονητή</span>{indicator}<ChevronDown size={14} className="disclosure-chevron" aria-hidden="true" /></summary>
    {field}
  </details>
}
