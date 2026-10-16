import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Activity, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { useWorkspace } from '../context/Workspace'
import { useAuth } from '../context/Auth'
import { athleteIds, athletes, formatDate, today, type AthleteId } from '../lib/model'
import { number, signed } from '../lib/utils'
import { validCalendarDate } from '../lib/calendar'
import { analyticsWindow, exerciseKey, exerciseOptions, exerciseSessions, exerciseSummary, roundChange, roundGroups, savedAnalyticsWorkouts, sessionValue, type ExerciseSession } from '../lib/exercise-analytics'
import { AthleteLegend, ExerciseTrendChart, exerciseUnit, RoundChart, setActual } from './ExerciseCharts'
import { ExerciseRecords } from './ExerciseRecords'
import { Badge, Button, Card, EmptyState, ProgressBar, SectionHeading } from './ui'

export function ExerciseExplorer() {
  const { data } = useWorkspace(), { identity } = useAuth(), navigate = useNavigate()
  const [urlParams, setUrlParams] = useSearchParams(), [params, setParams] = useState(urlParams), [page, setPage] = useState(0)
  const latestParams = useRef(urlParams), pendingSearches = useRef<string[]>([])
  useEffect(() => {
    // Router navigations are deferred. Own pending navigations must not reset
    // controlled fields or overwrite a newer edit; external navigation can.
    const acknowledged = pendingSearches.current.indexOf(urlParams.toString())
    if (acknowledged >= 0) { pendingSearches.current.splice(0, acknowledged + 1); return }
    latestParams.current = urlParams
    setParams(urlParams)
  }, [urlParams])
  const permitted = identity?.role === 'athlete' ? athleteIds.filter(a => a === identity.athleteId) : [...athleteIds]
  const chosenAthlete = params.get('athlete'), participants = permitted.filter(a => !chosenAthlete || chosenAthlete === 'both' || !permitted.includes(chosenAthlete as AthleteId) || a === chosenAthlete)
  const workouts = useMemo(() => savedAnalyticsWorkouts(data), [data.workouts, data.deletedRecords])
  const options = useMemo(() => exerciseOptions(data.program, workouts), [data.program, workouts])
  const defaultOption = options.find(option => workouts.some(w => Object.values(w.results).some(r => permitted.includes(r.athlete) && r.status === 'completed' && exerciseKey(r.movement) === option.key))) || options[0]
  const selected = options.find(option => option.key === params.get('exercise')) || defaultOption
  const period = ['all', '28', '84', 'custom'].includes(params.get('period') || '') ? params.get('period')! : 'all'
  const currentDate = today(), from = params.get('from') || '', to = params.get('to') || currentDate
  const invalidWindow = period === 'custom' && (!validCalendarDate(from) || !validCalendarDate(to) || from > to || to > currentDate)
  const window = analyticsWindow(period, currentDate, from, to)
  const sessions = useMemo(() => selected && !invalidWindow ? exerciseSessions(workouts, selected.key, participants, window) : [], [workouts, selected?.key, participants.join(','), window.from, window.to, invalidWindow])
  const metric = selected?.movement.loaded && params.get('metric') !== 'value' ? 'weight' : 'value'
  const completed = sessions.flatMap(s => s.sets.filter(r => r.state === 'completed'))
  const loads = [...new Set(completed.filter(r => r.weight !== null).map(r => r.weight!))]
  const requestedLoad = params.has('comparison') ? Number(params.get('comparison')) : null
  const atWeight = requestedLoad !== null && loads.includes(requestedLoad) ? requestedLoad : completed.filter(s => s.weight !== null).at(-1)?.weight ?? null
  const minimum = params.has('target') ? Number(params.get('target')) : selected?.movement.target || 10
  const setFilters = (changes: Record<string, string | null>) => {
    setPage(0)
    const next = new URLSearchParams(latestParams.current); next.set('view', 'exercises')
    for (const [name, value] of Object.entries(changes)) if (value === null) next.delete(name); else next.set(name, value)
    if (next.toString() === latestParams.current.toString()) return
    latestParams.current = next
    pendingSearches.current.push(next.toString())
    setParams(next)
    setUrlParams(next, { replace: true })
  }
  const openLog = (id: string) => navigate(`/history?session=${id}`)
  const groups = new Map<string, ExerciseSession[]>()
  for (const session of sessions) groups.set(session.workoutId, [...(groups.get(session.workoutId) || []), session])
  const rows = [...groups.values()].reverse(), pages = Math.max(1, Math.ceil(rows.length / 10)), visiblePage = Math.min(page, pages - 1)
  const roundId = groups.has(params.get('session') || '') ? params.get('session')! : rows[0]?.[0].workoutId
  const roundSessions = groups.get(roundId) || [], stationOptions = roundGroups(roundSessions)
  const selectedGroup = stationOptions.find(g => g.key === params.get('station')) || stationOptions[0]

  if (!selected) return <Card className="analytics-card"><EmptyState icon={<BarChart3 size={30} />} title="Δεν υπάρχει διαθέσιμη άσκηση." description="Οι ασκήσεις θα εμφανιστούν εδώ όταν προστεθούν στο πρόγραμμα." /></Card>
  const { movement } = selected
  const metricTitle = metric === 'weight' ? 'Μέγιστο βάρος ανά προπόνηση' : `Μέση ${movement.metric === 'seconds' ? 'διάρκεια' : 'τιμή επαναλήψεων'} ανά ολοκληρωμένο σετ`
  return <div className="exercise-explorer" data-testid="exercise-explorer">
    <Card className="analytics-card analytics-filters"><SectionHeading title="Εξερεύνηση ασκήσεων" subtitle="Από την εξέλιξη στο γράφημα, στην καταγραφή που την εξηγεί." action={<BarChart3 size={22} />} />
      <div className="analytics-filter-grid"><label className="analytics-exercise-filter">Άσκηση<select aria-label="Άσκηση για ανάλυση" value={selected.key} onChange={event => setFilters({ exercise: event.target.value, target: null, comparison: null, metric: null, session: null, station: null })}>{options.map(option => <option key={option.key} value={option.key}>{option.movement.name} · {option.movement.equipment} · {exerciseUnit(option.movement)}{option.movement.loaded ? ' · kg' : ''}</option>)}</select></label>
        <label>Αθλήτριες<select aria-label="Αθλήτρια για ανάλυση" value={participants.length === 2 ? 'both' : participants[0] || ''} disabled={permitted.length === 1} onChange={event => setFilters({ athlete: event.target.value })}>{permitted.length === 2 && <option value="both">Και οι δύο</option>}{permitted.map(a => <option key={a} value={a}>{athletes[a].name}</option>)}</select></label>
        <label>Διάστημα<select aria-label="Διάστημα ανάλυσης ασκήσεων" value={period} onChange={event => setFilters({ period: event.target.value })}><option value="all">Όλο το ιστορικό</option><option value="28">4 εβδομάδες</option><option value="84">12 εβδομάδες</option><option value="custom">Επιλογή ημερομηνιών</option></select></label>
      </div>
      {period === 'custom' && <div className="analytics-custom-dates"><label>Από<input type="date" aria-label="Ανάλυση από ημερομηνία" value={from} max={to} onChange={event => setFilters({ from: event.target.value })} /></label><label>Έως<input type="date" aria-label="Ανάλυση έως ημερομηνία" value={to} min={from} max={currentDate} onChange={event => setFilters({ to: event.target.value })} /></label></div>}
      {invalidWindow && <p className="form-message" role="alert">Επιλέξτε έγκυρες ημερομηνίες, από την παλαιότερη έως σήμερα.</p>}
      {identity?.role === 'athlete' && <p className="analytics-caption">Τα αναλυτικά στοιχεία βασίζονται στις προσωπικές καταγραφές σας.</p>}
      {movement.unilateral && <p className="analytics-caption">Στις συγκρίσεις χρησιμοποιείται η μικρότερη καταγεγραμμένη τιμή ανά πλευρά. Οι αρχικές τιμές διατηρούνται στις καταγραφές.</p>}
    </Card>

    <div className={`analytics-athlete-grid ${participants.length === 1 ? 'analytics-one-athlete' : ''}`}>{participants.map(a => {
      const summary = exerciseSummary(sessions.filter(s => s.athlete === a))
      return <Card className="analytics-summary analytics-card" key={a} data-testid={`exercise-summary-${a}`}><div className="analytics-athlete-title"><span className={`avatar ${a}`} aria-hidden="true">{athletes[a].initial}</span><h3>{athletes[a].name}</h3><Badge>{summary.sessions} προπονήσεις</Badge></div>
        <div className="analytics-summary-metric"><span>Επίτευξη στόχου</span><strong data-testid={`target-attainment-${a}`}>{summary.attainment === null ? '—' : `${number(summary.attainment)}%`}</strong></div><p>{summary.met} / {summary.completed} ολοκληρωμένα σετ έφτασαν τον στόχο.</p>{summary.attainment !== null && <ProgressBar value={summary.attainment} />}
        <div className="analytics-summary-metric analytics-secondary-metric"><span>Ολοκληρωμένα / προγραμματισμένα σετ</span><strong data-testid={`set-completion-${a}`}>{summary.completed} / {summary.planned}</strong></div>
        <p>{summary.skipped} παραλείψεις · {summary.missing} χωρίς καταγραφή{summary.invalid ? ` · ${summary.invalid} προς έλεγχο` : ''}</p>
      </Card>
    })}</div>

    <Card className="analytics-card"><SectionHeading title={metricTitle} subtitle={metric === 'weight' ? 'kg ανά αλτήρα · μόνο ολοκληρωμένα σετ' : `${exerciseUnit(movement)} · μόνο ολοκληρωμένα σετ`} action={movement.loaded && <select aria-label="Μέτρηση γραφήματος άσκησης" value={metric} onChange={event => setFilters({ metric: event.target.value })}><option value="weight">Βάρος · kg</option><option value="value">{movement.metric === 'seconds' ? 'Διάρκεια · δευτ.' : 'Επαναλήψεις'}</option></select>} />
      <AthleteLegend participants={participants} />
      {completed.length ? <ExerciseTrendChart sessions={sessions} participants={participants} movement={movement} metric={metric} onOpen={openLog} /> : <EmptyState icon={<Activity size={30} />} title="Δεν υπάρχουν ολοκληρωμένα σετ." description={sessions.length ? 'Οι παραλείψεις και οι ελλείπουσες τιμές εμφανίζονται στις καταγραφές, χωρίς μηδενικές επιδόσεις στο γράφημα.' : 'Επιλέξτε άλλη άσκηση ή διάστημα. Οι αποθηκευμένες καταγραφές θα εμφανιστούν εδώ.'} />}
      <p className="analytics-caption">Κάθε θέση αντιστοιχεί σε μία προπόνηση. Πατήστε ένα σημείο ή ανοίξτε την καταγραφή από τον πίνακα. Τα κενά δεν συνδέονται.</p>
    </Card>

    <ExerciseRecords sessions={sessions} participants={participants} movement={movement} minimum={minimum} atWeight={atWeight} onMinimum={value => setFilters({ target: value })} onWeight={value => setFilters({ comparison: value })} onOpen={openLog} />

    <Card className="analytics-card"><SectionHeading title="Συνέπεια γύρων" subtitle={`${exerciseUnit(movement)} ανά γύρο · τα βάρη εμφανίζονται μαζί με τις αρχικές τιμές`} />
      {rows.length ? <><div className="analytics-round-filters"><label>Προπόνηση<select aria-label="Προπόνηση για συνέπεια γύρων" value={roundId} onChange={event => setFilters({ session: event.target.value, station: null })}>{rows.map((pair, index) => <option key={pair[0].workoutId} value={pair[0].workoutId}>{formatDate(pair[0].date, true)} · {pair[0].name} · καταγραφή {rows.length - index}</option>)}</select></label>{stationOptions.length > 1 && <label>Σταθμός<select aria-label="Σταθμός για συνέπεια γύρων" value={selectedGroup?.key || ''} onChange={event => setFilters({ station: event.target.value })}>{stationOptions.map(group => <option key={group.key} value={group.key}>{group.stationName} · Άσκηση {group.slot + 1}</option>)}</select></label>}</div>
        {selectedGroup && <><AthleteLegend participants={participants} /><RoundChart sessions={roundSessions} group={selectedGroup} participants={participants} movement={movement} />
          <div className="table-scroll"><table className="analytics-table round-values"><caption className="sr-only">Ακριβείς τιμές ανά γύρο</caption><thead><tr><th>Γύρος</th>{participants.map(a => <th key={a}>{athletes[a].name}</th>)}</tr></thead><tbody>{Array.from({ length: selectedGroup.rounds }, (_, i) => <tr key={i}><th scope="row">{i + 1}</th>{participants.map(a => { const set = roundSessions.find(s => s.athlete === a)?.sets.find(s => s.stationId === selectedGroup.stationId && s.slot === selectedGroup.slot && s.round === i + 1); return <td key={a}>{set ? setActual(set) : 'Δεν συμμετείχε'}</td> })}</tr>)}</tbody></table></div>
          <div className="analytics-round-changes">{participants.map(a => {
            const sets = roundSessions.find(s => s.athlete === a)?.sets.filter(s => s.stationId === selectedGroup.stationId && s.slot === selectedGroup.slot) || [], change = roundChange(sets)
            return <p key={a}><strong>{athletes[a].name}:</strong> {change.percent === null ? change.reason : `${signed(change.percent)}% από τον πρώτο στον τελευταίο γύρο, με ίδιο βάρος.`}</p>
          })}</div><Button variant="secondary" onClick={() => openLog(roundId)}>Προβολή προπόνησης<ArrowUpRight size={16} /></Button>
        </>}
      </> : <EmptyState icon={<Activity size={28} />} title="Χωρίς γύρους για σύγκριση." description="Οι γύροι θα εμφανιστούν όταν αποθηκευτεί προπόνηση με αυτή την άσκηση." />}
    </Card>

    <Card className="analytics-card analytics-session-card"><SectionHeading title="Καταγραφές άσκησης" subtitle="Κάθε σύνοψη συνδέεται με τα πραγματικά σετ της προπόνησης." action={<Badge>{rows.length} προπονήσεις</Badge>} />
      {rows.length ? <><div className="table-scroll"><table className="analytics-table"><caption className="sr-only">Αποθηκευμένες προπονήσεις για {movement.name}</caption><thead><tr><th>Ημερομηνία</th>{participants.map(a => <th key={a}>{athletes[a].name}</th>)}<th>Καταγραφή</th></tr></thead><tbody>{rows.slice(visiblePage * 10, visiblePage * 10 + 10).map(pair => <tr key={pair[0].workoutId}><td><strong>{formatDate(pair[0].date, true)}</strong><small>{pair[0].name}</small></td>{participants.map(a => {
        const session = pair.find(s => s.athlete === a), summary = exerciseSummary(session ? [session] : [])
        return <td key={a}>{session ? <><strong>{sessionValue(session, 'value') === null ? '—' : `${number(sessionValue(session, 'value')!, 2)} ${exerciseUnit(movement)} / σετ`}</strong>{movement.loaded && sessionValue(session, 'weight') !== null && <small>Μέγιστο {number(sessionValue(session, 'weight')!, 2)} kg / αλτήρα</small>}<small>{summary.completed} / {summary.planned} σετ · στόχος {summary.met} / {summary.completed}</small></> : 'Δεν συμμετείχε σε αυτή την άσκηση'}</td>
      })}<td><Button variant="ghost" aria-label={`Προβολή προπόνησης ${formatDate(pair[0].date, true)}`} onClick={() => openLog(pair[0].workoutId)}><ArrowUpRight size={18} /><span>Προβολή</span></Button></td></tr>)}</tbody></table></div>
        {pages > 1 && <div className="analytics-pagination"><span>Σελίδα {visiblePage + 1} / {pages}</span><Button variant="secondary" size="icon" aria-label="Προηγούμενες καταγραφές ασκήσεων" disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}><ChevronLeft size={19} /></Button><Button variant="secondary" size="icon" aria-label="Επόμενες καταγραφές ασκήσεων" disabled={visiblePage + 1 >= pages} onClick={() => setPage(visiblePage + 1)}><ChevronRight size={19} /></Button></div>}
      </> : <p className="muted">Δεν υπάρχουν αποθηκευμένες προπονήσεις στο επιλεγμένο διάστημα.</p>}
    </Card>
    <details className="analytics-methods"><summary><Info size={16} />Πώς υπολογίζονται τα στοιχεία</summary><p>Η επίτευξη στόχου μετρά τα έγκυρα ολοκληρωμένα σετ που έφτασαν τουλάχιστον τον αποθηκευμένο στόχο. Οι παραλείψεις και τα σετ χωρίς καταγραφή περιλαμβάνονται στα προγραμματισμένα σετ, χωρίς να γίνονται μηδενικές επιδόσεις. Οι ενεργές και διαγραμμένες προπονήσεις εξαιρούνται. Τα ολοκληρωμένα σετ μερικών προπονήσεων περιλαμβάνονται.</p><p>Οι στόχοι προέρχονται από την κάθε αποθηκευμένη προπόνηση. Αλλαγή ονόματος, εξοπλισμού ή μονάδας μέτρησης διαχωρίζει τις ασκήσεις. Η μέση τιμή ανά σετ δεν λαμβάνει υπόψη διαφορετικά βάρη· ελέγξτε τα σετ πριν συγκρίνετε επιδόσεις. Η μεταβολή μεταξύ γύρων εμφανίζεται μόνο όταν έχουν ολοκληρωθεί όλοι οι γύροι με ίδιο βάρος και στόχο.</p></details>
  </div>
}
