import { useEffect, useId, useRef, useState } from 'react'
import { Flag, MoreHorizontal, Square } from 'lucide-react'
import { Button } from './ui'

export function WorkoutOptions({ canDiscard, onFinish, onDiscard }: { canDiscard: boolean; onFinish: () => void; onDiscard: () => void }) {
  const [open, setOpen] = useState(false), id = useId(), root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return <div className="workout-options" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <Button ref={trigger} variant="secondary" size="icon" aria-label="Επιλογές προπόνησης" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) }
      if (event.key === 'Escape') { event.preventDefault(); close() }
    }}><MoreHorizontal size={22} /></Button>
    {open && <div ref={menu} id={id} className="workout-options-menu" role="menu" aria-label="Επιλογές προπόνησης" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault()
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
      }
    }}>
      <Button variant="ghost" role="menuitem" onClick={() => { close(); onFinish() }}><Flag size={18} />Ολοκλήρωση</Button>
      <Button variant="ghost" role="menuitem" className="workout-options-discard" disabled={!canDiscard} onClick={() => { close(); onDiscard() }}><Square size={18} />Διακοπή</Button>
    </div>}
  </div>
}
