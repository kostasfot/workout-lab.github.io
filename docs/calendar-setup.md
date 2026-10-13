# Training calendar

The shared **Ημερολόγιο** tab is available to the coach, athletes, and spectators. Only the coach can schedule, edit, cancel, restore, or start a session. Optional times are local wall-clock times in **Europe/Athens**; weeks start on Monday. Sessions are added individually. Landscape tablets use a full-width week grid with bottom navigation; portrait tablets and phones use an agenda.

## Backend activation

Apply [migration 005](../supabase/migrations/202610130005_training_calendar.sql) in Supabase's SQL Editor after migrations 001–004. The migration is additive and safe to rerun. Existing workout logs remain unchanged. The coach confirmed that this migration succeeded on the live project on 13 October 2026. A read-only check also confirmed that the live table exists and rejects anonymous access.

It adds `training_sessions` and extends the existing revision-aware `save_record`, `delete_record`, and `get_workspace` RPCs. Scheduling writes require the coach role and team membership. Readers receive shared planning data and workout metadata, while existing detailed-log and private-note permissions remain enforced. Direct table writes and access to the retained helper RPCs are denied to browser roles. No Edge Function deployment or additional browser key is needed.

The frontend detects `calendarEnabled` from `get_workspace`. Until the upgrade is detected, it shows existing workout history in the calendar and disables scheduling. Refresh or synchronize after applying the migration.

## Using the calendar

- Choose **Νέα προπόνηση**, or a day's add button, then select the routine, date, optional time, and athletes.
- Open an unstarted entry to reschedule, cancel, restore, or start. Starting uses the current available program and the attendance selected in the launch dialog.
- Use the dashboard's blue start button to select today's plan or **Εκτός προγράμματος**. Upcoming sessions are also shown on the dashboard.
- A linked workout's actual log determines its active, partial, or completed state. Past plans without results remain pending.
- If planned and actual dates differ, the result appears on its actual date and the planned day keeps a reference. Editing a saved workout date updates both views.
- Discarding an active draft makes its plan available again. Deleting saved history retains the plan and labels the removed result. A linked plan cannot be edited while its workout exists.

## Offline and conflicts

Sign in and open the app online before using it offline. Calendar edits and workouts are saved in the account's IndexedDB workspace. Synchronization saves program and calendar dependencies before a new linked workout, and processes a discard before rescheduling or replacement. Server receipts make retries idempotent; calendar revision checks prevent a stale device from overwriting a changed or already-started plan.

Settings exposes conflicting changes for explicit resolution. If another device has already linked a different workout, keeping a new local workout preserves its entered results as an unscheduled record rather than replacing the other device's calendar link.

## Verification limits

Database checks run the migration and RPCs in PostgreSQL through PGlite, covering permissions, cross-team isolation, revision conflicts, retries, lifecycle transitions, and private-note protection. Browser checks use intercepted authentication and synchronization responses rather than real accounts. Production offline checks use an isolated local-mode PWA build. Live SQL activation is based on the coach's confirmation; automated checks do not create accounts or alter real workout history.
