import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, Clock, Play, Plus } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { useWorkspace } from '../context/Workspace'
import { athletes, formatDate, today } from '../lib/model'
import { availableSessions } from '../lib/calendar'
import { Button, Card, SectionHeading } from './ui'

export function UpcomingTraining({ onStart }: { onStart: (id: string) => void }) {
  const { data } = useWorkspace(), { identity, local } = useAuth(), navigate = useNavigate()
  if (!local && data.calendarEnabled !== true) return null
  const sessions = availableSessions(data).filter(s => s.date >= today()).slice(0, 3), coach = identity?.role === 'coach'
  return <Card className="upcoming-training" data-testid="upcoming-training">
    <SectionHeading title="Οι επόμενες προπονήσεις" subtitle="Το πλάνο μας, μέρα με τη μέρα." action={<Button variant="ghost" onClick={() => navigate('/calendar')}><CalendarDays size={17} />Ημερολόγιο<ArrowRight size={15} /></Button>} />
    {sessions.length ? <div className="upcoming-session-list">{sessions.map(s => <div className="upcoming-session" key={s.id}><span className="upcoming-session-icon"><CalendarDays size={21} /></span><div><strong>{data.program.routines.find(r => r.id === s.routineId)?.name || s.routineName}</strong><span>{formatDate(s.date, true)}{s.startTime && <><Clock size={12} />{s.startTime}</>}</span><small>{s.participants.map(a => athletes[a].name).join(' & ')}</small></div>{coach ? <Button variant="secondary" disabled={!data.program.routines.some(r => r.id === s.routineId)} onClick={() => onStart(s.id)} aria-label={`Έναρξη προγραμματισμένης ${data.program.routines.find(r => r.id === s.routineId)?.name || s.routineName}, ${formatDate(s.date, true)}${s.startTime ? `, ${s.startTime}` : ''}`}><Play size={15} /><span>Έναρξη</span></Button> : <Button variant="ghost" onClick={() => navigate(`/calendar?week=${s.date}`)}>Προβολή<ArrowRight size={15} /></Button>}</div>)}</div> : <div className="upcoming-empty"><p>Η επόμενη προπόνηση δεν έχει προγραμματιστεί ακόμη.</p>{coach && <Button variant="secondary" onClick={() => navigate('/calendar?new=1')}><Plus size={16} />Προσθήκη προπόνησης</Button>}</div>}
  </Card>
}
