import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import { athleteIds, athletes, formatDate, today, type WeighIn } from '../lib/model'
import { number, signed } from '../lib/utils'
import { weeklyWeights, type WeeklyStatistic } from '../lib/weight-trends'
import type { AnalyticsWindow } from '../lib/exercise-analytics'
import { AthleteLegend } from './ExerciseCharts'
import { Badge, Button, Card, EmptyState, SectionHeading } from './ui'

const sampleCount = (days: number, measurements: number) => `${days} ${days === 1 ? 'ημέρα' : 'ημέρες'} · ${measurements} ${measurements === 1 ? 'μέτρηση' : 'μετρήσεις'}`

export function WeeklyWeightTrends({ entries, window }: { entries: WeighIn[]; window: AnalyticsWindow }) {
  const [statistic, setStatistic] = useState<WeeklyStatistic>('mean'), [page, setPage] = useState(0), current = today()
  const series = useMemo(() => ({ anna: weeklyWeights(entries, 'anna', window, statistic, current), dimitra: weeklyWeights(entries, 'dimitra', window, statistic, current) }), [entries, window.from, window.to, statistic, current])
  const weekIds = [...new Set(athleteIds.flatMap(a => series[a].map(w => w.week)))].sort()
  const maps = { anna: new Map(series.anna.map(w => [w.week, w])), dimitra: new Map(series.dimitra.map(w => [w.week, w])) }
  const chart = weekIds.map(week => ({ week, anna: maps.anna.get(week)?.value ?? null, dimitra: maps.dimitra.get(week)?.value ?? null }))
  const descending = [...weekIds].reverse(), pages = Math.max(1, Math.ceil(descending.length / 12)), selectedPage = Math.min(page, pages - 1)
  const label = statistic === 'mean' ? 'Εβδομαδιαίος μέσος όρος' : 'Εβδομαδιαία διάμεσος'
  return <Card className="analytics-card weekly-weight-trends" data-testid="weekly-weight-trends">
    <SectionHeading title="Εβδομαδιαία τάση βάρους" subtitle="Δευτέρα — Κυριακή · kg · ίδιο χρονικό διάστημα με το γράφημα μετρήσεων" action={<select aria-label="Υπολογισμός εβδομαδιαίας τάσης" value={statistic} onChange={event => { setStatistic(event.target.value as WeeklyStatistic); setPage(0) }}><option value="mean">Μέσος όρος</option><option value="median">Διάμεσος</option></select>} />
    {weekIds.length ? <>
      <div className="analytics-athlete-grid">{athleteIds.map(a => {
        const last = series[a].findLast(w => w.value !== null)
        return <section className="weekly-summary" key={a} aria-label={`Εβδομαδιαία τάση ${athletes[a].name}`} data-testid={`weekly-summary-${a}`}><div className="analytics-athlete-title"><span className={`avatar ${a}`} aria-hidden="true">{athletes[a].initial}</span><h3>{athletes[a].name}</h3></div>
          <strong className="weekly-value">{last?.value !== null && last?.value !== undefined ? `${number(last.value, 2)} kg` : '—'}</strong>
          {last ? <><span>{label} · {formatDate(last.week)} — {formatDate(last.end)}</span><small>{sampleCount(last.days, last.measurements)}{last.partial ? ' · μερική εβδομάδα' : ''}</small><p>{last.change === null ? 'Χωρίς σύγκριση με την προηγούμενη εβδομάδα.' : `${signed(last.change)} kg από την προηγούμενη εβδομάδα.`}</p></> : <small>Χωρίς μετρήσεις στο επιλεγμένο διάστημα.</small>}
        </section>
      })}</div>
      <AthleteLegend participants={athleteIds} />
      <div className="analytics-chart weekly-chart" role="img" aria-label={`${label} βάρους ανά αθλήτρια. Οι τιμές και οι μετρήσεις εμφανίζονται στον πίνακα εβδομάδων.`}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ top: 18, right: 24, bottom: 12, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} /><XAxis dataKey="week" tickFormatter={week => formatDate(week)} interval="preserveStartEnd" minTickGap={28} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} /><YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={56} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickFormatter={weight => number(weight, 1)} />
          <Tooltip content={({ active, label: week }) => !active ? null : <div className="analytics-tooltip"><strong>Εβδομάδα από {formatDate(String(week), true)}</strong>{athleteIds.map(a => {
            const value = maps[a].get(String(week))
            return <div key={a}><b>{athletes[a].name}</b><span>{value?.value !== null && value?.value !== undefined ? `${number(value.value, 2)} kg` : 'Χωρίς μέτρηση'}</span>{value && <small>{sampleCount(value.days, value.measurements)}{value.partial ? ' · μερική εβδομάδα' : ''}</small>}</div>
          })}</div>} />
          {athleteIds.map(a => <Line key={a} type="linear" name={athletes[a].name} dataKey={a} stroke={athletes[a].color} strokeWidth={2.5} strokeDasharray={a === 'dimitra' ? '6 4' : undefined} dot={{ r: 4, fill: 'var(--surface)', strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />)}
        </LineChart></ResponsiveContainer>
      </div>
      <p className="analytics-caption">Κάθε ημέρα μετρά μία φορά. Τα κενά δεν συμπληρώνονται. Η μεταβολή συγκρίνει μόνο διαδοχικές εβδομάδες με μετρήσεις. Ο άξονας βάρους προσαρμόζεται στις τιμές.</p>
      <div className="table-scroll"><table className="analytics-table weekly-table"><caption className="sr-only">Ακριβείς εβδομαδιαίες τιμές βάρους</caption><thead><tr><th>Εβδομάδα</th>{athleteIds.map(a => <th key={a}>{athletes[a].name} · kg</th>)}</tr></thead><tbody>{descending.slice(selectedPage * 12, selectedPage * 12 + 12).map(week => <tr key={week}><th scope="row">{formatDate(week)} — {formatDate(maps.anna.get(week)?.end || maps.dimitra.get(week)!.end)}</th>{athleteIds.map(a => {
        const value = maps[a].get(week)
        return <td key={a} data-testid={`weekly-value-${a}-${week}`}><strong>{value?.value !== null && value?.value !== undefined ? number(value.value, 2) : '—'}</strong><small>{sampleCount(value?.days || 0, value?.measurements || 0)}</small>{value?.partial && <Badge>Μερική εβδομάδα</Badge>}</td>
      })}</tr>)}</tbody></table></div>
      {pages > 1 && <div className="analytics-pagination"><span>Σελίδα {selectedPage + 1} / {pages}</span><Button variant="secondary" size="icon" aria-label="Προηγούμενες εβδομάδες βάρους" disabled={selectedPage === 0} onClick={() => setPage(selectedPage - 1)}><ChevronLeft size={18} /></Button><Button variant="secondary" size="icon" aria-label="Επόμενες εβδομάδες βάρους" disabled={selectedPage + 1 >= pages} onClick={() => setPage(selectedPage + 1)}><ChevronRight size={18} /></Button></div>}
    </> : <EmptyState icon={<TrendingUp size={29} />} title="Η εβδομαδιαία τάση περιμένει μετρήσεις." description="Προσθέστε πραγματικές μετρήσεις ή επιλέξτε μεγαλύτερο χρονικό διάστημα." />}
    <details className="analytics-methods"><summary><CalendarDays size={16} />Πώς υπολογίζεται η εβδομάδα</summary><p>Αν υπάρχουν πολλές μετρήσεις την ίδια ημέρα, πρώτα υπολογίζεται ο ημερήσιος μέσος όρος. Στη συνέχεια υπολογίζεται ο μέσος όρος ή η διάμεσος αυτών των ημερήσιων τιμών για κάθε εβδομάδα. Έτσι, μία ημέρα με πολλές καταγραφές δεν έχει μεγαλύτερη βαρύτητα.</p><p>Οι αριθμοί ημερών και μετρήσεων δείχνουν πόσα δεδομένα υποστηρίζουν την τιμή. Η τρέχουσα εβδομάδα και οι εβδομάδες που κόβονται από το επιλεγμένο διάστημα σημειώνονται ως μερικές. Το βάρος δεν είναι μέτρηση σωματικού λίπους.</p></details>
  </Card>
}
