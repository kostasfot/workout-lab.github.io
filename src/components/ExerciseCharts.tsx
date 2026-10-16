import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { athletes, formatDate, type AthleteId, type Movement } from '../lib/model'
import { number } from '../lib/utils'
import { sessionValue, type ExerciseSession, type ExerciseSet, type RoundGroup } from '../lib/exercise-analytics'

export function exerciseUnit(movement: Movement) {
  return movement.metric === 'seconds' ? 'δευτ.' : movement.unilateral ? 'επ. / πλευρά' : 'επ.'
}
export function setActual(set: ExerciseSet) {
  if (set.state !== 'completed') return set.state === 'skipped' ? 'Παραλείφθηκε' : set.state === 'invalid' ? 'Ελέγξτε την καταγραφή' : 'Χωρίς καταγραφή'
  return `${set.weight !== null ? `${number(set.weight, 2)} kg · ` : ''}${number(set.value!)}${set.otherSide !== null && set.otherSide !== set.value ? ` / ${number(set.otherSide)}` : ''} ${exerciseUnit(set.movement)}`
}
export function AthleteLegend({ participants }: { participants: readonly AthleteId[] }) {
  return <div className="chart-legend analytics-legend">{participants.map(a => <span key={a}><i style={{ background: athletes[a].color }} /><span>{athletes[a].name}</span><span className={`analytics-line-key ${a}`} aria-hidden="true" /></span>)}</div>
}
const axis = { tickLine: false, axisLine: false, tick: { fill: 'var(--muted)', fontSize: 12 } }

export function ExerciseTrendChart({ sessions, participants, movement, metric, onOpen }: {
  sessions: ExerciseSession[]; participants: readonly AthleteId[]; movement: Movement; metric: 'weight' | 'value'; onOpen: (id: string) => void
}) {
  const grouped = new Map<string, { id: string; date: string; anna: number | null; dimitra: number | null; sessions: ExerciseSession[] }>()
  for (const session of sessions) {
    const point = grouped.get(session.workoutId) || { id: session.workoutId, date: session.date, anna: null, dimitra: null, sessions: [] }
    point[session.athlete] = sessionValue(session, metric); point.sessions.push(session); grouped.set(point.id, point)
  }
  const rows = [...grouped.values()], unit = metric === 'weight' ? 'kg / αλτήρα' : exerciseUnit(movement)
  return <div className="analytics-chart" data-testid="exercise-trend-chart" role="img" aria-label={`Εξέλιξη ${movement.name}: ${metric === 'weight' ? 'μέγιστο βάρος' : 'μέση τιμή ανά σετ'}. Οι ακριβείς καταγραφές βρίσκονται στον πίνακα προπονήσεων.`}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 22, right: 25, bottom: 12, left: 0 }}>
      <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
      <XAxis {...axis} dataKey="id" tickFormatter={id => formatDate(grouped.get(id)?.date || rows[0].date)} interval="preserveStartEnd" minTickGap={24} />
      <YAxis {...axis} width={48} domain={[0, 'auto']} allowDecimals={metric === 'weight' || movement.metric === 'seconds'} />
      <Tooltip content={({ active, label }) => {
        const point = grouped.get(String(label)); if (!active || !point) return null
        return <div className="analytics-tooltip"><strong>{formatDate(point.date, true)}</strong>{point.sessions.map(session => <div key={session.athlete}><b>{athletes[session.athlete].name}</b><span>{sessionValue(session, metric) === null ? 'Χωρίς ολοκληρωμένο σετ' : `${number(sessionValue(session, metric)!, 2)} ${unit}`}</span><small>{session.sets.map(s => `Γ${s.round}: ${setActual(s)}`).join(' · ')}</small></div>)}</div>
      }} />
      {participants.map(a => <Line key={a} type="linear" name={athletes[a].name} dataKey={a} stroke={athletes[a].color} strokeWidth={2.5} strokeDasharray={a === 'dimitra' ? '6 4' : undefined} connectNulls={false} isAnimationActive={false} activeDot={false} dot={props => {
        const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: { id: string; date: string; anna: number | null; dimitra: number | null } }
        if (!payload || payload[a] === null || !Number.isFinite(cx) || !Number.isFinite(cy)) return <g />
        return <g role="button" tabIndex={0} className="analytics-chart-point" aria-label={`Προβολή καταγραφής ${athletes[a].name} ${formatDate(payload.date, true)}`} onClick={() => onOpen(payload.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(payload.id) } }}><circle cx={cx} cy={cy} r={18} fill="transparent" /><circle cx={cx} cy={cy} r={4.5} fill="var(--surface)" stroke={athletes[a].color} strokeWidth={2.5} /></g>
      }} />)}
    </LineChart></ResponsiveContainer>
  </div>
}

export function RoundChart({ sessions, group, participants, movement }: { sessions: ExerciseSession[]; group: RoundGroup; participants: readonly AthleteId[]; movement: Movement }) {
  const rows = Array.from({ length: group.rounds }, (_, i) => {
    const point: { round: number; anna: number | null; dimitra: number | null } = { round: i + 1, anna: null, dimitra: null }
    for (const a of participants) point[a] = sessions.find(s => s.athlete === a)?.sets.find(s => s.stationId === group.stationId && s.slot === group.slot && s.round === i + 1)?.performance ?? null
    return point
  })
  return <div className="analytics-chart round-chart" data-testid="round-consistency-chart" role="img" aria-label={`Τιμές ανά γύρο για ${movement.name}. Τα βάρη και οι καταγραφές εμφανίζονται στον πίνακα γύρων.`}><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 20, right: 25, bottom: 12, left: 0 }}>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" /><XAxis {...axis} dataKey="round" tickFormatter={round => `Γ${round}`} interval={0} /><YAxis {...axis} width={48} domain={[0, 'auto']} allowDecimals={movement.metric === 'seconds'} />
    <Tooltip content={({ active, label }) => !active ? null : <div className="analytics-tooltip"><strong>Γύρος {label}</strong>{participants.map(a => { const set = sessions.find(s => s.athlete === a)?.sets.find(s => s.stationId === group.stationId && s.slot === group.slot && s.round === Number(label)); return <div key={a}><b>{athletes[a].name}</b><span>{set ? setActual(set) : 'Δεν συμμετείχε σε αυτή την άσκηση'}</span></div> })}</div>} />
    {participants.map(a => <Line key={a} type="linear" dataKey={a} name={athletes[a].name} stroke={athletes[a].color} strokeWidth={2.5} strokeDasharray={a === 'dimitra' ? '6 4' : undefined} dot={{ r: 4, fill: 'var(--surface)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />)}
  </LineChart></ResponsiveContainer></div>
}
