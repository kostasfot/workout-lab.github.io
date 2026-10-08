import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useWorkspace } from './Workspace'

export type IncrementKind = 'weight' | 'reps' | 'seconds'
export const incrementSteps: Record<IncrementKind, number[]> = { weight: [1.25, 2.5], reps: [1, 5], seconds: [5, 10] }
type Preferences = Record<IncrementKind, number>
const defaults: Preferences = { weight: 1.25, reps: 1, seconds: 5 }
const IncrementsContext = createContext<{ steps: Preferences; choose: (kind: IncrementKind, value: number) => void }>(null!)
export const useIncrements = () => useContext(IncrementsContext)

export function IncrementsProvider({ children }: { children: ReactNode }) {
  const { scope } = useWorkspace(), key = `wl-increments:${scope}`
  const [steps, setSteps] = useState<Preferences>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      return Object.fromEntries(Object.entries(defaults).map(([kind, fallback]) => [kind, incrementSteps[kind as IncrementKind].includes(stored?.[kind]) ? stored[kind] : fallback])) as Preferences
    } catch { return { ...defaults } }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(steps)) } catch { /* Adjustments remain usable when preferences cannot be persisted. */ } }, [steps, key])
  const choose = (kind: IncrementKind, value: number) => { if (incrementSteps[kind].includes(value)) setSteps(current => ({ ...current, [kind]: value })) }
  return <IncrementsContext.Provider value={{ steps, choose }}>{children}</IncrementsContext.Provider>
}
