# Enable coach account management

This update keeps the two-athlete training roster. It adds **Διαχείριση** for the coach, spectator logins, replacement logins for Άννα/Δήμητρα, confirmed account deletion, and setting a new password. Existing passwords cannot be displayed: Supabase Auth stores password hashes, not readable passwords.

The website is a static GitHub Pages application. Account administration runs in the **manage-users Supabase Edge Function**, which validates the caller with Supabase Auth, checks the coach's current database membership, and uses Supabase's server-only administrator key. The browser only has the existing publishable key. Account actions require internet and execute immediately; they never enter the offline workout queue.

## 1. Apply migration 004

Open [this project's SQL Editor](https://supabase.com/dashboard/project/ntrwfapkyqbxbchwowcy/sql/new). Paste the complete contents of [202610070004_account_management.sql](../supabase/migrations/202610070004_account_management.sql) and click **Run**. Your existing migrations 001–003 must already be present. Migration 004 is safe to run again. Do not rerun bootstrap or recreate existing users.

It adds the `spectator` role, display names, and read-only completed training access for both athletes. It preserves weigh-ins when a login is removed and deletes only that login's membership and synchronization receipts. All existing workout/program/history permissions remain enforced by the database. Direct profile writes remain unavailable to browser clients.

## 2. Deploy the manage-users function

Choose one method.

### Supabase dashboard

1. Open [Edge Functions](https://supabase.com/dashboard/project/ntrwfapkyqbxbchwowcy/functions), choose **Deploy a new function → Via Editor**, and name it exactly **manage-users**.
2. Replace the template's `index.ts` with [index.ts](../supabase/functions/manage-users/index.ts).
3. Add a second file named **handler.ts** in the same directory. Paste [handler.ts](../supabase/functions/manage-users/handler.ts) into it. The import `./handler.ts` must refer to this file.
4. Disable the gateway **Verify JWT** setting for this function, then deploy. The function itself still requires and verifies a bearer token using `auth.getUser` for every account action, and checks that the caller is a coach. Disabling the legacy gateway check supports Supabase's newer signing keys; it does not make account actions public. If the editor does not expose the setting, open the deployed function's settings and switch it off there.

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically inside Edge Functions. Keep the service-role key there; do not copy it into GitHub, a `VITE_` variable, or chat. The default allowed browser origin is `https://kostasfot.github.io`, matching this website. No additional secrets need to be entered for this deployment.

### Supabase CLI

From the repository, with the Supabase CLI installed and authenticated:

```sh
supabase login
supabase functions deploy manage-users --project-ref ntrwfapkyqbxbchwowcy
```

The checked-in [config.toml](../supabase/config.toml) applies the gateway setting. Migration 004 can still be applied in the SQL Editor; deploying the function does not apply SQL migrations. For local function testing, set the function's `ALLOWED_ORIGINS` to your development origin, such as `http://127.0.0.1:5173`. This optional server variable is a comma-separated list of exact origins, without paths.

## 3. Verify in the app

1. Refresh the live app (or tap **Ενημέρωση**), sign in as the coach, and use **Συγχρονισμός τώρα** if the new tab shows an activation notice.
2. Open **Διαχείριση**. Expect the coach, Άννα, and Δήμητρα with their email addresses. The coach account is protected from deletion and password changes through this tab; the coach can use the normal password-recovery form for their own account.
3. Choose **Νέος χρήστης**, enter the father's name/email and an initial password, leave **Θεατής · μόνο προβολή**, and create the account. Use at least eight characters and satisfy any stronger password policy configured in your project. The email is confirmed by the coach-created account flow, so password login works immediately without an invitation email.
4. Sign in with that spectator account in another browser. It can view both athletes' completed training details, comparisons, weight measurements, and goals. It cannot add weigh-ins, edit/delete records, start workouts, open management, or read private coach notes. Active drafts remain coach-only.
5. **Νέος κωδικός** sets a replacement password in Supabase Auth. It does not reveal the old password or send an email. Give the new password to the account owner separately; the application does not store it in localStorage or IndexedDB.
6. **Διαγραφή χρήστη** opens confirmation. Confirming deletes the Supabase Auth user and their profile. Cloud-synchronized workouts, goals, notes, and weight measurements remain. Before replacing an athlete login, sync any pending weigh-ins from her device; unsynchronized records under the removed login cannot upload through the new account. If an athlete login is removed, **Νέος χρήστης → Πρόσβαση** offers that athlete again, letting the coach attach a replacement account to her existing records. A second simultaneous login for the same athlete is refused.

Removing membership immediately denies further database access, including previously issued tokens. An open online app rechecks membership every 12 seconds and when returning to the foreground/reconnecting. Already downloaded offline data cannot be remotely erased; account deletion revokes online access but does not erase copies from an offline device.

The function refuses creating additional coaches, cross-team account operations, self-deletion, and modifying any coach login. Only the team's app members are listed; unrelated Supabase project users are not exposed.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Activation notice / disabled new-user button | Run migration 004, sync, and refresh. Local preview does not manage real accounts. |
| Management service error | Deploy both function files under `manage-users`; check the JWT setting and Edge Function logs. Do not log request bodies or passwords. |
| Email already used | The function does not take over an unrelated account. Use a distinct email or investigate its existing Supabase membership. |
| Athlete already has a login | Remove her old login only if you intend to replace it, then refresh the list. |
| Creation cleanup failed | Inspect Authentication → Users for an unassigned login before retrying. Account creation compensates for profile-insertion failure, but cleanup can fail if Supabase Auth is unavailable. |
| Actions disabled offline | Reconnect and refresh the list. Account actions are never queued. |

Local database, function-handler, and browser tests cover these permissions and workflows. Enabling and testing real project account actions still requires applying the migration and deploying the function in your Supabase project.
