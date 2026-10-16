import { allExpected, createWorkout, finishWorkout, type AthleteId, type Workout, type Workspace } from '../../src/lib/model'
import { emptyWorkspace } from '../../src/lib/program'

export function analyticsWorkout(date: string, anna: number[], dimitra: number[] = anna, weight = 6, routine = 0): Workout {
  const program = emptyWorkspace().program, workout = createWorkout(program.routines[routine], program.id)
  workout.date = date; workout.startedAt = `${date}T09:00:00Z`
  const movementId = program.routines[routine].stations[0].slots[0].movements[0].id
  for (const row of allExpected(workout)) if (row.movement.id === movementId) workout.results[row.key] = { ...row, status: 'completed', value: (row.athlete === 'anna' ? anna : dimitra)[row.round] ?? null, weight: row.movement.loaded ? weight : null }
  return { ...finishWorkout(workout), revision: 1 }
}

export function analyticsWorkspace(workspace: Workspace) {
  workspace.workouts = [analyticsWorkout('2026-10-01', [12, 10, 8], [10, 9, 8]), analyticsWorkout('2026-10-08', [12, 12, 11], [12, 11, 10]), analyticsWorkout('2026-10-14', [10, 10, 9], [9, 9, 8], 7.5), analyticsWorkout('2026-10-15', [40, 40, 35], [40, 35, 35], 6, 2)]
  workspace.weighIns = []
  for (const athlete of ['anna', 'dimitra'] as AthleteId[]) for (const [date, weight] of [['2026-10-01', 100], ['2026-10-01', 102], ['2026-10-03', 99], ['2026-10-08', 99], ['2026-10-14', 98]] as const) workspace.weighIns.push({ id: crypto.randomUUID(), athlete, date, weight: weight + (athlete === 'dimitra' ? 1 : 0), revision: 1, createdAt: `${date}T09:00:00Z` })
}
