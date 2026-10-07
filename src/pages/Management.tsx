import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Users, UserPlus, RefreshCw, KeyRound, Trash2, ShieldCheck, Eye } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { useWorkspace } from '../context/Workspace'
import { manageAccounts, type ManagedUser } from '../lib/accounts'
import { athleteIds, athletes, formatDate, type AthleteId } from '../lib/model'
import { Badge, Button, Card, DeleteConfirmation, EmptyState, Modal } from '../components/ui'

const roles = { coach: 'Προπονητής', athlete: 'Αθλήτρια', spectator: 'Θεατής' }
export function Management() {
  const { identity, local } = useAuth(), { data, online } = useWorkspace()
  const [users, setUsers] = useState<ManagedUser[]>([]), [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [creating, setCreating] = useState(false), [deleting, setDeleting] = useState<ManagedUser | null>(null), [resetting, setResetting] = useState<ManagedUser | null>(null)
  const [busy, setBusy] = useState(false), [formError, setFormError] = useState('')
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [assignment, setAssignment] = useState('spectator')
  const ready = identity?.role === 'coach' && !local && online && data.accountManagement === true
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { const response = await manageAccounts({ action: 'list' }); setUsers(response.users || []); setLoaded(true) }
    catch (err) { setError(err instanceof Error ? err.message : 'Η λίστα δεν φορτώθηκε.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { if (ready) void refresh() }, [ready, refresh])
  const closeForm = () => { setCreating(false); setResetting(null); setPassword(''); setFormError('') }
  if (identity?.role !== 'coach') return <Navigate to="/" replace />
  const available = athleteIds.filter(a => !users.some(user => user.athleteId === a))
  return <>
    <div className="page-heading"><div><span className="eyebrow">ΠΡΟΣΒΑΣΗ ΣΤΗΝ ΟΜΑΔΑ</span><h1>Διαχείριση χρηστών<span className="title-dot">.</span></h1><p>Προσωπικοί λογαριασμοί και δικαιώματα προβολής.</p></div><Button disabled={!ready || !loaded || loading || busy} onClick={() => { setName(''); setEmail(''); setPassword(''); setAssignment('spectator'); setFormError(''); setCreating(true) }}><UserPlus size={18} />Νέος χρήστης</Button></div>
    {!online && <p className="inline-notice" role="status">Η διαχείριση λογαριασμών χρειάζεται internet. Οι ενέργειες δεν αποθηκεύονται για αργότερα.</p>}
    {(local || !data.accountManagement) && <Card className="management-notice"><ShieldCheck size={24} /><div><h2>{local ? 'Συνδεθείτε στο cloud' : 'Ενεργοποίηση διαχείρισης'}</h2><p>{local ? 'Οι χρήστες ανήκουν στους λογαριασμούς της ομάδας στο Supabase.' : 'Χρειάζεται η ενημέρωση της βάσης και η λειτουργία manage-users στο Supabase. Μετά την ενεργοποίηση, συγχρονίστε και ανανεώστε την εφαρμογή.'}</p></div></Card>}
    {error && <p className="form-message" role="alert">{error}</p>}{message && <p className="inline-notice" role="status">{message}</p>}
    <Card className="management-card"><div className="history-toolbar"><h2>Λογαριασμοί ομάδας</h2><Button variant="secondary" size="small" disabled={!ready || loading || busy} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? 'spinning' : ''} />Ανανέωση λίστας</Button></div>
      {users.length ? <div className="managed-users">{users.map(user => <section className="managed-user" key={user.id} aria-label={`Λογαριασμός ${user.name || roles[user.role]}`}><span className={`avatar ${user.athleteId || 'coach-avatar'}`}>{user.role === 'spectator' ? <Eye size={20} /> : user.athleteId ? athletes[user.athleteId].initial : 'Κ'}</span><div className="managed-user-details"><strong>{user.name || roles[user.role]}</strong><span>{user.email}</span><small>{user.lastSignIn ? `Τελευταία σύνδεση · ${formatDate(user.lastSignIn, true)}` : 'Δεν έχει συνδεθεί ακόμη'}</small></div><Badge>{roles[user.role]}{user.athleteId ? ` · ${athletes[user.athleteId].name}` : ''}</Badge><div className="managed-user-actions">{user.role === 'coach' ? <span className="muted small"><ShieldCheck size={15} />Προστατευμένος</span> : <><Button variant="secondary" size="small" disabled={!ready || loading || busy} aria-label={`Νέος κωδικός ${user.name}`} onClick={() => { setPassword(''); setFormError(''); setResetting(user) }}><KeyRound size={16} />Νέος κωδικός</Button><Button variant="ghost" size="icon" disabled={!ready || loading || busy} aria-label={`Διαγραφή χρήστη ${user.name}`} onClick={() => setDeleting(user)}><Trash2 size={17} /></Button></>}</div></section>)}</div> : <EmptyState icon={<Users size={28} />} title={loading ? 'Φόρτωση λογαριασμών…' : 'Λογαριασμοί ομάδας'} description={loaded ? 'Δεν βρέθηκαν λογαριασμοί.' : 'Η λίστα θα εμφανιστεί όταν ολοκληρωθεί η σύνδεση με τη διαχείριση.'} />}</Card>
    <div className="management-rules"><Card><Eye size={22} /><h3>Θεατές</h3><p>Βλέπουν τις αποθηκευμένες προπονήσεις, τα βάρη και την πρόοδο και των δύο αθλητριών. Δεν καταγράφουν ή αλλάζουν δεδομένα.</p></Card><Card><KeyRound size={22} /><h3>Κωδικοί πρόσβασης</h3><p>Οι υπάρχοντες κωδικοί δεν είναι ορατοί. Μπορείτε να ορίσετε νέο κωδικό για αθλήτρια ή θεατή.</p></Card></div>
    <Modal open={creating || Boolean(resetting)} onOpenChange={open => { if (!open && !busy) closeForm() }} title={creating ? 'Νέος χρήστης' : 'Ορισμός νέου κωδικού'} description={creating ? 'Ο λογαριασμός δημιουργείται απευθείας στο Supabase και μπορεί να συνδεθεί αμέσως.' : `${resetting?.name || ''} · ${resetting?.email || ''}`}>
      <form onSubmit={async event => {
        event.preventDefault(); if (!ready || busy) return
        setBusy(true); setFormError(''); setMessage('')
        try {
          if (creating) await manageAccounts({ action: 'create', name, email, password, role: assignment === 'spectator' ? 'spectator' : 'athlete', athleteId: assignment === 'spectator' ? null : assignment as AthleteId })
          else if (resetting) await manageAccounts({ action: 'password', userId: resetting.id, password })
          setMessage(creating ? 'Ο νέος λογαριασμός δημιουργήθηκε στο Supabase.' : 'Ο νέος κωδικός αποθηκεύτηκε στο Supabase.'); closeForm(); await refresh()
        } catch (err) { setFormError(err instanceof Error ? err.message : 'Η ενέργεια δεν ολοκληρώθηκε.') }
        finally { setBusy(false) }
      }}><fieldset disabled={busy || !ready} className="account-form">
        {creating && <><label>Όνομα<input autoFocus required maxLength={80} autoComplete="off" value={name} onChange={e => setName(e.target.value)} /></label><label>Email<input type="email" required maxLength={254} autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} /></label><label>Πρόσβαση<select value={assignment} onChange={e => setAssignment(e.target.value)}><option value="spectator">Θεατής · μόνο προβολή</option>{available.map(a => <option key={a} value={a}>Αθλήτρια · {athletes[a].name}</option>)}</select></label>{!available.length && <p className="muted small">Και οι δύο αθλήτριες έχουν λογαριασμό. Για αντικατάσταση, αφαιρέστε πρώτα το παλιό τους login.</p>}</>}
        <label>Νέος κωδικός<input type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label><p className="muted small">Τουλάχιστον 8 χαρακτήρες. Δώστε τον νέο κωδικό στον κάτοχο του λογαριασμού.</p>
      </fieldset>{formError && <p className="form-message" role="alert">{formError}</p>}<div className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={closeForm}>Ακύρωση</Button><Button type="submit" disabled={!ready || busy || password.length < 8}>{busy ? 'Αποθήκευση…' : creating ? 'Δημιουργία λογαριασμού' : 'Αποθήκευση νέου κωδικού'}</Button></div></form>
    </Modal>
    <DeleteConfirmation open={Boolean(deleting)} onOpenChange={open => { if (!open) setDeleting(null) }} title="Διαγραφή χρήστη" description={deleting ? `${deleting.name} · ${deleting.email}` : ''} confirmLabel="Διαγραφή λογαριασμού" message="Ο λογαριασμός θα διαγραφεί από το Supabase και η online πρόσβασή του θα σταματήσει. Οι συγχρονισμένες προπονήσεις και μετρήσεις βάρους παραμένουν. Η διαγραφή δεν αναιρείται και χρειάζεται internet." onConfirm={async () => { if (!ready || !deleting) throw new Error('Η ενέργεια δεν είναι διαθέσιμη.'); setBusy(true); try { await manageAccounts({ action: 'delete', userId: deleting.id }); setMessage('Ο λογαριασμός διαγράφηκε. Το ιστορικό παραμένει.'); await refresh() } finally { setBusy(false) } }} />
  </>
}
