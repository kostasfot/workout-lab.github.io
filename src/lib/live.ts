import { advanceWorkout, athleteIds, isRecorded, recordTogether, requiredResults, type Workout } from './model'

export function roundStep(workout: Workout): 0 | 1 | 2 | 3 {
  const ready = requiredResults(workout, workout.phase === 0).every(isRecorded)
  return workout.phase === 0 ? ready ? 1 : 0 : ready ? 3 : 2
}

export function recordAndSwap(workout: Workout): Workout {
  if (workout.status !== 'active' || workout.phase !== 0 || !athleteIds.every(a => workout.participants.includes(a))) throw new Error('Η καταγραφή και αλλαγή είναι διαθέσιμη μόνο στο πρώτο ζεύγος και για τις δύο αθλήτριες.')
  return advanceWorkout(recordTogether(workout))
}
