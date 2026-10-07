import type { Movement, Routine, Slot, Station, Workspace } from './model'

function reps(id: string, name: string, equipment: string, target = 10, maximum: number | undefined = target === 10 ? 12 : undefined, loaded = true, unilateral?: 'leg' | 'arm'): Movement {
  return { id, name, equipment, metric: 'reps', target, maximum: unilateral ? undefined : maximum, loaded, unilateral }
}
function time(id: string, name: string, equipment: string, target: number, loaded = false): Movement {
  return { id, name, equipment, metric: 'seconds', target, loaded }
}
const slot = (...movements: Movement[]): Slot => ({ movements })
const station = (id: string, name: string, rounds: number, rest: number | null, a: Slot, b: Slot): Station => ({ id, name, rounds, rest, slots: [a, b] })
export const initialRoutines: Routine[] = [
  { id: 'day-1', name: 'Προπόνηση 1', subtitle: 'Full Body · Quad & Pull', focus: 'Τετρακέφαλοι, στήθος & πλάτη', stations: [
    station('d1-a', 'Σταθμός Α', 3, 60, slot(reps('goblet', 'Goblet Squats', 'Dumbbell')), slot(reps('trx-row', 'TRX Rows', 'TRX', 10, 12, false))),
    station('d1-b', 'Σταθμός Β', 3, 60, slot(reps('bench', 'Bench Press', 'Bench · Dumbbells')), slot(reps('rdl', 'Romanian Deadlift (RDL)', 'Dumbbells'))),
    station('d1-c', 'Σταθμός Γ', 3, 60, slot(reps('split', 'Split Squats', 'Dumbbells', 10, undefined, true, 'leg')), slot(reps('push-up', 'Push-Ups', 'Bodyweight', 10, 12, false))),
    station('d1-f', 'Finisher', 2, null, slot(reps('swing', 'Dumbbell Swings', 'Dumbbell', 15, undefined)), slot(time('plank', 'Plank', 'Bodyweight', 45))),
  ] },
  { id: 'day-2', name: 'Προπόνηση 2', subtitle: 'Full Body · Posterior & Push', focus: 'Οπίσθια αλυσίδα, ώμοι & πλάτη', stations: [
    station('d2-a', 'Σταθμός Α', 3, 60, slot(reps('sumo', 'Sumo Squats', 'Dumbbell')), slot(reps('trx-press', 'TRX Chest Press', 'TRX', 10, 12, false))),
    station('d2-b', 'Σταθμός Β', 3, 60, slot(reps('bulgarian', 'Bulgarian Squats', 'Bench · Dumbbells', 10, undefined, true, 'leg')), slot(reps('db-row', 'Dumbbell Rows', 'Dumbbell', 10, undefined, true, 'arm'))),
    station('d2-c', 'Σταθμός Γ', 3, 60, slot(reps('shoulder', 'Seated Shoulder Press', 'Bench · Dumbbells')), slot(reps('curl', 'TRX Biceps Curls', 'TRX', 10, 12, false), reps('triceps', 'TRX Triceps Extensions', 'TRX', 10, 12, false))),
    station('d2-f', 'Finisher', 2, null, slot(time('carry', "Dumbbell Farmer’s Walk", 'Dumbbells', 40, true)), { alternatives: true, movements: [time('crunch', 'Crunches', 'Bodyweight', 40), time('hip-dip', 'Plank Hip Dips', 'Bodyweight', 40)] }),
  ] },
  { id: 'day-3', name: 'Προπόνηση 3', subtitle: 'Metabolic · Strength & Core', focus: 'Μεταβολική ενδυνάμωση & κορμός', stations: [
    station('d3-a', 'Σταθμός Α', 3, 20, slot(time('thruster', 'Dumbbell Thrusters', 'Dumbbells', 40, true)), slot(time('y-fly', 'TRX Y-Fly', 'TRX', 40))),
    station('d3-b', 'Σταθμός Β', 3, 20, slot(time('high-pull', 'Dumbbell Deadlift High Pull', 'Dumbbells', 40, true)), { alternatives: true, movements: [time('climber', 'Mountain Climbers', 'Bodyweight', 40), time('twist', 'Russian Twists', 'Bench / Ground', 40)] }),
  ] },
]
export function emptyWorkspace(): Workspace {
  return {
    program: { id: '6552e4fb-23da-4c62-b2fa-e14a5c4519bf', revision: 0, routines: structuredClone(initialRoutines), createdAt: '2026-10-07T00:00:00Z' },
    workouts: [], weighIns: [], comparisons: [], notes: [],
    goals: { anna: { id: 'anna', value: null, revision: 0 }, dimitra: { id: 'dimitra', value: null, revision: 0 } },
  }
}
