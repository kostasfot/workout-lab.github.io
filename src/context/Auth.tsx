import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { cloud, localIdentity, type Identity } from '../lib/cloud'

interface AuthValue { identity: Identity | null; loading: boolean; error: string | null; local: boolean; enterLocal: () => void; signOut: () => Promise<void> }
const AuthContext = createContext<AuthValue>(null!)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [loading, setLoading] = useState(Boolean(cloud))
  const [error, setError] = useState<string | null>(null)
  const [local, setLocal] = useState((!cloud || import.meta.env.DEV) && localStorage.getItem('wl-local') === 'yes')
  useEffect(() => {
    if (local) { setIdentity(localIdentity); setLoading(false); return }
    if (!cloud) { setLoading(false); return }
    let cancelled = false
    const load = async (userId: string | undefined) => {
      if (!userId) { setIdentity(null); setLoading(false); return }
      const { data, error: profileError } = await cloud!.from('profiles').select('id,team_id,role,athlete_id').eq('id', userId).single()
      if (cancelled) return
      if (profileError) {
        const cached = localStorage.getItem(`wl-profile:${userId}`)
        if (!navigator.onLine && cached) setIdentity(JSON.parse(cached))
        else { setIdentity(null); setError('Δεν βρέθηκε ενεργό προφίλ. Ζητήστε από τον προπονητή να ολοκληρώσει τη σύνδεση του λογαριασμού σας.') }
      } else {
        const value: Identity = { userId: data.id, teamId: data.team_id, role: data.role, athleteId: data.athlete_id }
        localStorage.setItem(`wl-profile:${userId}`, JSON.stringify(value)); setIdentity(value); setError(null)
      }
      setLoading(false)
    }
    cloud.auth.getSession().then(({ data }) => load(data.session?.user.id))
    const { data: subscription } = cloud.auth.onAuthStateChange((_event, session) => { setTimeout(() => { void load(session?.user.id) }, 0) })
    return () => { cancelled = true; subscription.subscription.unsubscribe() }
  }, [local])
  return <AuthContext.Provider value={{ identity, loading, error, local, enterLocal: () => { localStorage.setItem('wl-local', 'yes'); setLocal(true) }, signOut: async () => { localStorage.removeItem('wl-local'); setLocal(false); setIdentity(null); if (cloud) await cloud.auth.signOut() } }}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
