import { advanceWorkout, athleteIds, compareWorkoutDates, isRecorded, recordTogether, requiredResults, validResult, type SetResult, type Workout } from './model'

export function roundStep(workout: Workout): 0 | 1 | 2 | 3 {
  const ready = requiredResults(workout, workout.phase === 0).every(isRecorded)
  return workout.phase === 0 ? ready ? 1 : 0 : ready ? 3 : 2
}

export function recordAndSwap(workout: Workout): Workout {
  if (workout.status !== 'active' || workout.phase !== 0 || !athleteIds.every(a => workout.participants.includes(a))) throw new Error('Η καταγραφή και αλλαγή είναι διαθέσιμη μόνο στο πρώτο ζεύγος και για τις δύο αθλήτριες.')
  return advanceWorkout(recordTogether(workout))
}

export type ChoiceField = 'weight' | 'value' | 'otherSide'
export function quickValues(workouts: Workout[], workout: Workout, expected: SetResult, field: ChoiceField): number[] {
  const compatible = (r: SetResult) => r.status === 'completed' && r.athlete === expected.athlete && r.movement.id === expected.movement.id &&
    r.movement.metric === expected.movement.metric && r.movement.loaded === expected.movement.loaded && r.movement.unilateral === expected.movement.unilateral && validResult(r)
  const earlier = Object.values(workout.results).filter(r => r.station === expected.station && r.slot === expected.slot && r.round < expected.round).sort((a, b) => b.round - a.round)
  const saved = workouts.filter(w => w.id !== workout.id && w.status !== 'active').sort(compareWorkoutDates).flatMap(w => Object.values(w.results).sort((a, b) => b.round - a.round))
  const recent = [...earlier, ...saved].filter(compatible).map(r => field === 'otherSide' ? r.otherSide ?? r.value : r[field]).filter((n): n is number => n !== null && Number.isFinite(n) && n >= (field === 'weight' ? 0 : 1) && n <= (field === 'weight' ? 500 : 3600))
  const { target, maximum, metric } = expected.movement
  const targets = field === 'weight' ? [] : metric === 'reps' && maximum !== undefined && maximum >= target
    ? maximum - target <= 4 ? Array.from({ length: maximum - target + 1 }, (_, i) => target + i) : [target, Math.floor((target + maximum) / 2), maximum]
    : [target]
  return [...new Set([...targets.filter(n => Number.isInteger(n) && n >= 1 && n <= 3600), ...recent])].slice(0, 5)
}
