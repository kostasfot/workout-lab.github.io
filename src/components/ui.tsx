import * as Dialog from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X, ArrowUpRight, Trash2 } from 'lucide-react'
import { useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../lib/utils'

const buttonStyles = cva('button', { variants: { variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost', danger: 'button-danger' }, size: { default: '', small: 'button-small', icon: 'button-icon' } }, defaultVariants: { variant: 'primary', size: 'default' } })
export function Button({ className, variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonStyles>) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />
}
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div className={cn('card', className)} {...props} /> }
export function Badge({ children, className }: { children: ReactNode; className?: string }) { return <span className={cn('badge', className)}>{children}</span> }
export function Modal({ open, onOpenChange, title, description, children, wide = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className={cn('modal', wide && 'modal-wide')} {...(!description ? { 'aria-describedby': undefined } : {})}>
    <div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description>{description}</Dialog.Description>}</div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Κλείσιμο"><X size={20} /></Button></Dialog.Close></div>{children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
export function DeleteConfirmation({ open, onOpenChange, title, description, onConfirm, confirmLabel = 'Διαγραφή', message = 'Η διαγραφή δεν αναιρείται. Η αλλαγή αποθηκεύεται στη συσκευή και συγχρονίζεται όταν υπάρχει σύνδεση.' }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; onConfirm: () => Promise<void>; confirmLabel?: string; message?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { if (open) setError('') }, [open])
  return <Modal open={open} onOpenChange={value => { if (!busy) onOpenChange(value) }} title={title} description={description}>
    <p className="muted small">{message}</p>
    {error && <p className="form-message" role="alert">{error}</p>}
    <div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>Ακύρωση</Button><Button variant="danger" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(); onOpenChange(false) } catch (err) { setError(err instanceof Error ? err.message : 'Η ενέργεια δεν ολοκληρώθηκε. Δοκιμάστε ξανά.') } finally { setBusy(false) } }}><Trash2 size={16} />{busy ? 'Παρακαλώ περιμένετε…' : confirmLabel}</Button></div>
  </Modal>
}
export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div> }
export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="empty-state"><div className="empty-icon">{icon}</div><h3>{title}</h3><p>{description}</p>{action}</div> }
export function ProgressBar({ value, className }: { value: number; className?: string }) { return <div className={cn('progress-track', className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div> }
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) { return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={15} /></button> }
