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

1. The blue start button opens a popup where the coach selects any routine and the athletes present. Routine cards preselect their routine in the same popup; the coach can change it before starting.
2. Άννα starts slot 1; Δήμητρα starts slot 2. Their panels remain in fixed positions.
3. Coach logs actual reps or seconds and load for each movement independently.
4. Both complete their assigned movements, then coach presses **Αλλαγή ασκήσεων**. There is no intervening rest.
5. Both complete the other slot, then coach starts the rest timer when appropriate.
6. Repeat for the station's round count; advance only when the coach presses the next button.

Each movement must be recorded or explicitly skipped before advancing. The two TRX movements are logged separately within one slot. Slash alternatives are chosen per athlete and station, then preserved once recorded. One absent athlete does not prevent the other from training.

Loads mean **kg per dumbbell**. Unilateral reps mean per leg/arm, with an optional different count for the other side. Actual results are separate from prescribed targets. Starting, stopping, or finishing a timer does not fill a result or advance the workout. New sets start with empty actual values and show previous results as suggestions.

Each loaded exercise has **−2.5 kg, −1.25 kg, +1.25 kg, +2.5 kg** controls, also available in saved-workout editing. They adjust only that athlete's entered load, use zero as the starting value when empty, and preserve quarter-kilogram precision. Adjustments that would go below zero or above 500 kg are disabled. Recorded live sets lock these controls until the coach reopens the record for editing.

Rep entry has **−5, −1, +1, +5** controls; seconds entry has **−10, −5, +5, +10**. Direct typing remains available. Optional other-side counts adjust independently, starting from the main count when blank. Counts stay between 1 and 3600, and recorded sets lock all adjustments. Changing logged seconds never starts or changes a work timer.

## Timers and completion

The persistent timer button opens a popup for configurable rest or prescribed work timers. Every timer starts manually. Closing the popup preserves it. Pausing and resetting are explicit. Minimal rest has no preset. Each athlete can have a work timer; the coach can start both together.

Completing a workout saves its date, participants, program snapshot, selected movements, rounds, actual values, and skipped results. Early completion creates a partial record. Coach can edit the training date and both athletes' weights, reps, seconds, other-side counts, and completed/skipped/unrecorded status. Edits apply to actual results and preserve the prescribed program and original start/completion timestamps. Cancelling the editor saves nothing. Corrected dates determine history order, recent activity, team comparison dates, and CSV filenames. Settings offers an account-scoped JSON backup.

Coach can stop an active workout without saving it, following confirmation. This removes the draft, its notes, and its timers without adding history. Choosing a new routine while one is active offers resume or confirmed discard followed by an empty new workout; the local replacement is one atomic transaction.

Coach can delete individual logged sets or whole saved workouts with confirmation. Removing a set leaves the other records intact and updates completion status and comparisons. Whole-workout deletion also removes its private notes and comparisons. Active workouts are not deleted through history.

## Accounts and progress

The coach and two athletes have private email/password logins in one group; additional spectator logins are supported. Coach edits the training program, both workout logs, goals, weigh-in corrections, and private notes. Athletes read their own detailed workouts, see both athletes' shared workout comparisons and body-weight progress, and add their own weigh-ins. They cannot edit workouts, program, goals, or the other athlete's measurements. Private coach notes are kept separately and never returned to athletes or spectators. Spectators can read both athletes’ completed detailed workouts, comparisons, weights, and goals, with all training mutations denied at both the interface and database.

Weights and goals begin empty. Progress charts use actual measurements, with absolute kilograms and percentage change from each athlete's first recorded measurement. Coach enters real goals when available.

Only the coach can delete weigh-ins. Deletion immediately recalculates the history, chart, and summary; each athlete's other measurements and goals remain intact.

## Persistence and program edits

Entries are saved locally before cloud synchronization. Storage is scoped to the signed-in account. Offline entries remain queued until acknowledged. Revision conflicts are displayed for explicit resolution; the app preserves the local version while it is pending. Sign-out is deferred while there are unsynchronized changes.

Confirmed history deletions use the same offline queue. Server deletion markers prevent stale uploads from recreating deleted workouts or weigh-ins. A remote deletion takes precedence over a pending edit to that deleted record. The additive history-deletion migration must be applied before cloud deletion controls are enabled.

Draft discard uses the deletion queue with an explicit discard flag. Only the coach can request it, and the backend checks that the current record is still active at the expected revision. The workout-editing/discard migration enables this action and corrected dates in shared comparisons. Saved edits merge untouched rows from the latest local version; a competing change to the same set or training date requires reopening the editor.

Program edits create a new version for future workouts. Existing active and completed sessions retain their original snapshot. Coach can change exercise names, targets, metric, load/unilateral settings, alternatives, rounds, station order, and rest defaults.

## Implementation and verification status

The interface, offline store, migrations, and bootstrap are implemented. The coach reported that the live application works and supplied successful SQL checks for the base schema, history deletion, discard capability, and completed-workout discard guard after applying migration 003. Workout selection and signed weight adjustments use that existing database setup. Authenticated browser tests use test responses, and database permissions are verified in PostgreSQL. Hosting and environment publication are separate from local validation; current checks are recorded in the deployment guide.

The coach-only management tab lists team account names, emails, and roles. It creates read-only spectators or replacement accounts for a vacant existing athlete identity, confirms account deletion, and sets new passwords. Existing passwords cannot be read. Coach logins are protected. Account actions execute online through the authenticated Supabase Edge Function; credentials never enter the offline queue. Migration 004 preserves weigh-ins/history when an auth user is deleted. Migration 004 and the function are implemented and locally tested; live activation requires the Supabase deployment described in the account management guide.
