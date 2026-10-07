import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkspace } from './Workspace'
import { Timer, Play, Pause, RotateCcw, Bell, Check, Clock3 } from 'lucide-react'
import { Button, Modal } from '../components/ui'
import { seconds } from '../lib/utils'
import { athleteIds, athletes, movementsFor, slotFor } from '../lib/model'

export interface TimerJob { id: string; label: string; duration: number; remaining: number; deadline: number | null; context?: string }
export const remainingSeconds = (job: TimerJob, now = Date.now()) => job.deadline === null ? job.remaining : Math.min(job.remaining, Math.max(0, Math.ceil((job.deadline - now) / 1000)))
interface TimerValue { open: () => void; clear: () => void; jobs: TimerJob[]; now: number; startRest: (duration: number, context: string) => void; toggle: (id: string) => void; reset: (id: string) => void; stop: (id: string, context?: string) => void }
const TimerContext = createContext<TimerValue>(null!)
export const useTimer = () => useContext(TimerContext)
export function TimerProvider({ children }: { children: ReactNode }) {
  const { scope, data } = useWorkspace(), storageKey = `wl-timers:${scope}`
  const [jobs, setJobs] = useState<TimerJob[]>(() => { try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch { return [] } })
  const [now, setNow] = useState(Date.now()), [open, setOpen] = useState(false), [mode, setMode] = useState<'rest' | 'work'>('rest')
  const workout = data.workouts.find(w => w.status === 'active'), station = workout?.routine.stations[workout.stationIndex]
  const [duration, setDuration] = useState(''), [sound, setSound] = useState(localStorage.getItem('wl-sound') === 'yes')
  const notified = useRef(new Set<string>()), audio = useRef<AudioContext | null>(null)
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(jobs)) }, [jobs, storageKey])
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id) }, [])
  useEffect(() => {
    for (const job of jobs) {
      const key = `${job.id}:${job.deadline}`
      if (job.deadline !== null && remainingSeconds(job, now) === 0 && !notified.current.has(key)) {
        notified.current.add(key)
        if (sound && audio.current && audio.current.state === 'running') {
          const oscillator = audio.current.createOscillator(), gain = audio.current.createGain()
          oscillator.connect(gain); gain.connect(audio.current.destination); oscillator.frequency.value = 740
          gain.gain.value = 0.08; oscillator.start(); oscillator.stop(audio.current.currentTime + 0.3)
        }
      }
    }
  }, [now, jobs, sound])
  const start = (id: string, label: string, value: number, context?: string) => {
    if (!Number.isInteger(value) || value <= 0 || value > 3600) return
    if (sound) { audio.current ||= new AudioContext(); void audio.current.resume() }
    setJobs(previous => [...previous.filter(j => j.id !== id), { id, label, duration: value, remaining: value, deadline: Date.now() + value * 1000, context }])
  }
  const toggle = (id: string) => setJobs(all => all.map(job => {
    if (job.id !== id) return job
    const remaining = remainingSeconds(job)
    if (remaining === 0) return job
    return { ...job, remaining, deadline: job.deadline === null ? Date.now() + remaining * 1000 : null }
  }))
  const reset = (id: string) => setJobs(all => all.map(job => job.id !== id ? job : { ...job, deadline: null, remaining: job.duration }))
  const stop = (id: string, context?: string) => setJobs(all => all.filter(job => job.id !== id || (context !== undefined && job.context !== context)))
  const workTargets = workout && station ? athleteIds.filter(a => workout.participants.includes(a)).flatMap(a => movementsFor(workout, a, station, slotFor(a, workout.phase)).filter(m => m.metric === 'seconds').map(m => ({ id: `${a}:${m.id}`, label: `${athletes[a].name} · ${m.name}`, duration: m.target }))) : []
  const active = jobs.find(j => j.deadline !== null && remainingSeconds(j, now) > 0) || jobs.find(j => j.deadline !== null)
  const show = () => { setDuration(station?.rest == null ? '' : String(station.rest)); setOpen(true) }
  return <TimerContext.Provider value={{ open: show, clear: () => { setJobs([]); setOpen(false); notified.current.clear(); localStorage.removeItem(storageKey) }, jobs, now, startRest: (value, context) => start('rest', 'Διάλειμμα', value, context), toggle, reset, stop }}>{children}
    <button className={`timer-fab ${active ? 'timer-fab-active' : ''}`} onClick={show} aria-label="Άνοιγμα χρονομέτρου"><Timer size={21} /><span>{active ? seconds(remainingSeconds(active, now)) : 'Χρονόμετρο'}</span></button>
    <Modal open={open} onOpenChange={setOpen} title="Χρονόμετρο" description="Ξεκινά μόνο όταν το επιλέξετε. Συνεχίζει και με κλειστό παράθυρο.">
      <div className="segmented"><button className={mode === 'rest' ? 'selected' : ''} onClick={() => setMode('rest')}><Clock3 size={16} />Διάλειμμα</button><button className={mode === 'work' ? 'selected' : ''} onClick={() => setMode('work')}><Timer size={16} />Άσκηση</button></div>
      {mode === 'rest' ? <div className="timer-setup"><label htmlFor="rest-seconds">Διάρκεια διαλείμματος σε δευτερόλεπτα</label><div className="input-action"><input id="rest-seconds" type="number" inputMode="numeric" min="1" max="3600" step="1" placeholder={station?.rest == null ? 'Χωρίς προεπιλογή' : '60'} value={duration} onChange={e => setDuration(e.target.value)} /><Button disabled={!(Number.isInteger(Number(duration)) && Number(duration) > 0 && Number(duration) <= 3600)} onClick={() => start('rest', 'Διάλειμμα', Number(duration))}><Play size={17} />Έναρξη</Button></div><div className="quick-presets">{[20, 30, 60, 90].map(value => <button key={value} onClick={() => setDuration(String(value))}>{value}″</button>)}</div></div> : <div className="work-targets">{workTargets.length ? <>{workTargets.map(t => <div key={t.id}><span>{t.label}</span><Button variant="secondary" size="small" onClick={() => start(t.id, t.label, t.duration)}><Play size={15} />{t.duration}″</Button></div>)}{workTargets.length > 1 && <Button onClick={() => workTargets.forEach(t => start(t.id, t.label, t.duration))}><Play size={17} />Έναρξη και για τις δύο</Button>}</> : <p className="muted">Δεν υπάρχει χρονισμένη άσκηση στο τρέχον ζεύγος.</p>}</div>}
      <div className="timer-jobs">{jobs.map(job => {
        const remaining = remainingSeconds(job, now), done = job.deadline !== null && remaining === 0
        return <div className={`timer-job ${done ? 'timer-done' : ''}`} key={job.id}><div><span>{job.label}</span><strong aria-live={done ? 'polite' : 'off'}>{done ? <><Check size={25} />Ολοκληρώθηκε</> : seconds(remaining)}</strong></div><div className="timer-job-actions"><Button variant="ghost" size="icon" disabled={remaining === 0} aria-label={`${job.deadline === null ? 'Συνέχιση' : 'Παύση'} ${job.label}`} onClick={() => toggle(job.id)}>{job.deadline === null ? <Play size={18} /> : <Pause size={18} />}</Button><Button variant="ghost" size="icon" aria-label={`Επαναφορά ${job.label}`} onClick={() => reset(job.id)}><RotateCcw size={18} /></Button></div></div>
      })}</div>
      <label className="checkbox-line"><input type="checkbox" checked={sound} onChange={e => { setSound(e.target.checked); localStorage.setItem('wl-sound', e.target.checked ? 'yes' : 'no') }} /><Bell size={16} />Ήχος ολοκλήρωσης όσο η εφαρμογή είναι ενεργή</label>
    </Modal>
  </TimerContext.Provider>
}
