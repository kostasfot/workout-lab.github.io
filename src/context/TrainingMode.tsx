import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from './Auth'
import { useWorkspace } from './Workspace'

const TrainingModeContext = createContext<{ active: boolean; toggle: () => void }>(null!)
export const useTrainingMode = () => useContext(TrainingModeContext)

export function TrainingModeProvider({ children }: { children: ReactNode }) {
  const { identity } = useAuth(), { data, scope } = useWorkspace(), { pathname } = useLocation(), key = `wl-training-fit:${scope}`
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(key) !== 'no' } catch { return true } })
  useEffect(() => { try { localStorage.setItem(key, enabled ? 'yes' : 'no') } catch { /* The view still works without persisting its preference. */ } }, [enabled, key])
  const active = enabled && identity?.role === 'coach' && data.workouts.some(w => w.status === 'active' && pathname === `/workout/${w.id}`)
  return <TrainingModeContext.Provider value={{ active, toggle: () => setEnabled(value => !value) }}>{children}</TrainingModeContext.Provider>
}
