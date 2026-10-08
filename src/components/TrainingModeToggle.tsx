import { Maximize2, Minimize2 } from 'lucide-react'
import { useTrainingMode } from '../context/TrainingMode'
import { Button } from './ui'

export function TrainingModeToggle() {
  const { active, toggle } = useTrainingMode()
  return <Button variant="secondary" aria-pressed={active} aria-label={active ? 'Έξοδος από λειτουργία προπόνησης' : 'Λειτουργία προπόνησης'} onClick={toggle}>{active ? <Minimize2 size={18} /> : <Maximize2 size={18} />}{active ? 'Κανονική προβολή' : 'Λειτουργία προπόνησης'}</Button>
}
