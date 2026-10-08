import { advanceWorkout, athleteIds, athletes, isRecorded, recordTogether, requiredResults, type Workout } from './model'

export function recordingIssues(workout: Workout): string[] {
  const current = requiredResults(workout, true)
  return workout.participants.flatMap(athlete => {
    const movements = current.filter(r => r.athlete === athlete)
    for (const r of movements.filter(r => !isRecorded(r))) {
      let reason = ''
      if (r.movement.loaded && r.weight == null) reason = 'συμπληρώστε βάρος'
      else if (r.movement.loaded && (!Number.isFinite(r.weight) || r.weight! < 0 || r.weight! > 500)) reason = 'ελέγξτε βάρος (0–500 kg)'
      else if (r.value == null) reason = r.movement.metric === 'seconds' ? 'συμπληρώστε διάρκεια' : 'συμπληρώστε επαναλήψεις'
      else if (!Number.isFinite(r.value) || r.value <= 0 || r.value > 3600 || (r.movement.metric === 'reps' && !Number.isInteger(r.value))) reason = r.movement.metric === 'seconds' ? 'ελέγξτε διάρκεια (1–3600 δευτ.)' : 'ελέγξτε επαναλήψεις (1–3600)'
      else if (r.otherSide != null && (!Number.isInteger(r.otherSide) || r.otherSide <= 0 || r.otherSide > 3600)) reason = 'ελέγξτε την άλλη πλευρά (1–3600)'
      if (reason) return [`${athletes[athlete].name}${movements.length > 1 ? ` · ${r.movement.name}` : ''}: ${reason}`]
    }
    return []
  })
}

export function roundStep(workout: Workout): 0 | 1 | 2 | 3 {
  const ready = requiredResults(workout, workout.phase === 0).every(isRecorded)
  return workout.phase === 0 ? ready ? 1 : 0 : ready ? 3 : 2
}

export function recordAndSwap(workout: Workout): Workout {
  if (workout.status !== 'active' || workout.phase !== 0 || !athleteIds.every(a => workout.participants.includes(a))) throw new Error('Η καταγραφή και αλλαγή είναι διαθέσιμη μόνο στο πρώτο ζεύγος και για τις δύο αθλήτριες.')
  return advanceWorkout(recordTogether(workout))
}
