# Supabase database and accounts

Project: **workout-lab-backend** (`ntrwfapkyqbxbchwowcy`). Your GitHub login into the Supabase dashboard administers the project; the app has three separate email/password accounts.

## 1. Apply the database migration

In the project's **SQL Editor**, choose **New query**, paste the complete contents of [202610070001_workout_lab.sql](../supabase/migrations/202610070001_workout_lab.sql), then click **Run**. Apply this initial migration once. It creates the tables, permissions, and synchronization functions. If it reports an error, keep the exact error before trying subsequent steps.

## 2. Create three app users

In **Authentication → Users**, choose **Add user → Create new user**. Create the coach, Άννα, and Δήμητρα with a distinct email and a password of at least eight characters. Enter passwords only in the Supabase dashboard. Select the option to confirm the email automatically for these manually created accounts.

Open each user's record and copy the **User UID**. The coach supplied these IDs:

| Account | User UID |
| --- | --- |
| Coach | `e4ea1ff5-833e-4efc-b582-3a163214f7d4` |
| Άννα | `55190837-1ec1-414b-a377-a92b1761da96` |
| Δήμητρα | `8bb496d5-6d34-47d6-a517-d497182b9bde` |

These are identifiers, not passwords. They are already placed in the bootstrap file. If you recreate an account, update its ID before running the bootstrap.

## 3. Assign the app roles

Create another SQL Editor query. Paste the complete contents of [bootstrap.sql](../supabase/bootstrap.sql), then click **Run** once. It creates one Workout Lab group and assigns the coach and both athletes. The script runs in one transaction and refuses to overwrite existing membership.

Check the assignments with:

```sql
select id, role, athlete_id, team_id
from public.profiles
where id in (
  'e4ea1ff5-833e-4efc-b582-3a163214f7d4',
  '55190837-1ec1-414b-a377-a92b1761da96',
  '8bb496d5-6d34-47d6-a517-d497182b9bde'
)
order by role, athlete_id;
```

Expect three rows: one `coach` with no athlete ID, one `athlete` with `anna`, and one with `dimitra`. All three must have the same `team_id`. A successful SQL run may simply show “Success. No rows returned”; use the query above to inspect the records.

## 4. Connect and test the app

The project URL and publishable key are already in the current environment's ignored `.env.local`. In a new environment or hosting build, provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` through its environment settings, then restart or rebuild the app. No service-role key is needed.

Sign in as the coach first. Starting the first workout or saving a program edit publishes the initial program to the group. A freshly bootstrapped group has no imported measurements, goals, or workout history.

Verify these actions on separate browser profiles or devices:

1. Coach records an actual set; the sync indicator reaches synchronized.
2. Coach finishes the workout; each athlete sees her own detailed results and both athletes' comparisons, without private coach notes.
3. Άννα adds a weigh-in; both other accounts see it. She cannot add a weigh-in for Δήμητρα or edit a workout.
4. On the coach's already signed-in tablet, disconnect the internet, log a set, reload the installed app, and reconnect. The queued change should synchronize.

Keep the app open for synchronization after reconnecting. Browser background sync is not required. A first login needs internet; cached account data supports later offline use on the same device. If the app reports a conflict, resolve it in Settings before signing out.

## 5. Configure password recovery for the hosted site

Under **Authentication → URL Configuration**, set the **Site URL** to the final hosted app URL and allow that same URL with `?recovery=1` as a redirect. For the planned GitHub Pages project site, the recovery path is `https://kostasfot.github.io/workout-lab.github.io/?recovery=1`; use the actual URL if hosting changes.

Supabase's default email service has delivery limits and recipient restrictions. Configure custom SMTP for reliable reset emails to all three users. Manually creating and confirming the accounts lets you test password login without relying on invitation-email delivery. The application does not offer public signup.

## Troubleshooting

| Message or symptom | What to check |
| --- | --- |
| Invalid email/password | Use the app user's email and password, rather than the GitHub dashboard login. Check that the email is confirmed. |
| No active profile | Check the three bootstrap assignments. Creating an auth user alone is insufficient. |
| Function `get_workspace` not found | Apply the migration and allow Supabase's API schema cache to refresh. |
| Foreign-key error in bootstrap | The supplied UID must exist under Authentication → Users in this project. |
| Users already have profiles | The bootstrap preserves existing membership. Inspect it with the verification query; do not delete accounts to retry. |
| Pending sync | Check network access, project activity, and whether migration/bootstrap completed. Local entries remain saved. |

The publishable key can authenticate public client requests, but it cannot apply migrations or create these user accounts. Perform those two steps in the dashboard; do not share administrator keys or passwords in chat.
