# Agreed application behavior

The coach trains Άννα and Δήμητρα together on an Android tablet, in portrait or landscape. The interface is Greek with English exercise names. Desktop and phone layouts are supported. Light mode is the default; a dark-mode toggle is available.

## Workbook interpretation

The source is `Πρόγραμμα Προπόνησης & Απώλειας Λίπους - Home Workout.xlsx`, specifically its second sheet. Workbook cells are source data; the coach's explicit answers determine behavior. Date-formatted “10-12” cells mean **10–12 repetitions**. Neither the sample 110 kg measurements nor the 95 kg goals are imported.

The three routines are named Προπόνηση 1, 2, and 3 to avoid confusing routine numbers with weekdays. Cardio and active recovery are deferred.

| Routine | Station | Exercise slot 1 | Exercise slot 2 | Rounds | Manual rest default |
| --- | --- | --- | --- | --- | --- |
| 1 | A | Goblet Squats, 10–12 reps | TRX Rows, 10–12 reps | 3 | 60 seconds |
| 1 | B | Bench Press, 10–12 reps | Romanian Deadlift, 10–12 reps | 3 | 60 seconds |
| 1 | C | Split Squats, 10 per leg | Push-Ups, 10–12 reps | 3 | 60 seconds |
| 1 | Finisher | Dumbbell Swings, 15 reps | Plank, 45 seconds | 2 | No preset |
| 2 | A | Sumo Squats, 10–12 reps | TRX Chest Press, 10–12 reps | 3 | 60 seconds |
| 2 | B | Bulgarian Squats, 10 per leg | Dumbbell Rows, 10 per arm | 3 | 60 seconds |
| 2 | C | Seated Shoulder Press, 10–12 reps | TRX Biceps Curls **and** TRX Triceps Extensions, 10–12 each | 3 | 60 seconds |
| 2 | Finisher | Farmers Walk, 40 seconds | Choose Crunches **or** Plank Hip Dips, 40 seconds | 2 | No preset |
| 3 | A | Dumbbell Thrusters, 40 seconds | TRX Y-Fly, 40 seconds | 3 | 20 seconds |
| 3 | B | Dumbbell Deadlift High Pull, 40 seconds | Choose Mountain Climbers **or** Russian Twists, 40 seconds | 3 | 20 seconds |

## Live training

1. Coach selects a routine and the athletes present.
2. Άννα starts slot 1; Δήμητρα starts slot 2. Their panels remain in fixed positions.
3. Coach logs actual reps or seconds and load for each movement independently.
4. Both complete their assigned movements, then coach presses **Αλλαγή ασκήσεων**. There is no intervening rest.
5. Both complete the other slot, then coach starts the rest timer when appropriate.
6. Repeat for the station's round count; advance only when the coach presses the next button.

Each movement must be recorded or explicitly skipped before advancing. The two TRX movements are logged separately within one slot. Slash alternatives are chosen per athlete and station, then preserved once recorded. One absent athlete does not prevent the other from training.

Loads mean **kg per dumbbell**. Unilateral reps mean per leg/arm, with an optional different count for the other side. Actual results are separate from prescribed targets. Starting, stopping, or finishing a timer does not fill a result or advance the workout. New sets start with empty actual values and show previous results as suggestions.

## Timers and completion

The persistent timer button opens a popup for configurable rest or prescribed work timers. Every timer starts manually. Closing the popup preserves it. Pausing and resetting are explicit. Minimal rest has no preset. Each athlete can have a work timer; the coach can start both together.

Completing a workout saves its date, participants, program snapshot, selected movements, rounds, actual values, and skipped results. Early completion creates a partial record. Coach can correct completed results. CSV export is available from the details; Settings offers an account-scoped JSON backup.

## Accounts and progress

There are three private email/password logins in one group. Coach edits the training program, both workout logs, goals, weigh-in corrections, and private notes. Athletes read their own detailed workouts, see both athletes' shared workout comparisons and body-weight progress, and add their own weigh-ins. They cannot edit workouts, program, goals, or the other athlete's measurements. Private coach notes are kept separately and never returned to athletes.

Weights and goals begin empty. Progress charts use actual measurements, with absolute kilograms and percentage change from each athlete's first recorded measurement. Coach enters real goals when available.

## Persistence and program edits

Entries are saved locally before cloud synchronization. Storage is scoped to the signed-in account. Offline entries remain queued until acknowledged. Revision conflicts are displayed for explicit resolution; the app preserves the local version while it is pending. Sign-out is deferred while there are unsynchronized changes.

Program edits create a new version for future workouts. Existing active and completed sessions retain their original snapshot. Coach can change exercise names, targets, metric, load/unilateral settings, alternatives, rounds, station order, and rest defaults.

## Implementation and verification status

The interface, offline store, migration, and bootstrap are implemented. On 2026-10-07, 14 unit/PostgreSQL tests, 20 browser checks across four layouts, the production build, and the production PWA offline reload check passed. The coach reported successful migration and bootstrap in Supabase, and an anonymous API request confirmed the deployed workspace function rejects unauthenticated access. Actual signed-in login and synchronization checks remain outstanding. Hosting and environment publication are separate from local build validation.
