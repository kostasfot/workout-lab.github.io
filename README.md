# Workout Lab

A Greek training dashboard for a coach, Άννα, and Δήμητρα. Built for an Android tablet in either orientation, with desktop and phone layouts, light/dark themes, and offline recording.

The workbook's second sheet supplies three strength routines. Both athletes start opposite exercises, swap without resting, then take a manually started rest. Dumbbell loads are kilograms per dumbbell. TRX curls and triceps extensions have separate entries; slash alternatives are selectable. Weight measurements and goals start empty.

The blue start button opens a workout selector for any of the three routines. Exercise entry and saved-workout editing use compact **− / step selector / +** controls: choose **1.25 or 2.5 kg**, **1 or 5 reps**, or **5 or 10 seconds**. Selected steps are shared by value type and remembered per account on the device; actual values remain independent for each athlete. Weight controls stop at zero and preserve quarter-kilogram precision. The coach can edit saved workout dates and actual results, delete history with confirmation, or discard an active workout without saving it. Starting another routine offers resume or confirmed replacement of the active draft. These changes work offline and sync on reconnection. Apply the database updates described in the Supabase guide to enable cloud deletion and draft discard.

Live exercises offer **Ίδιο με πριν** to copy that athlete's most recent completed earlier round, falling back to her latest saved values for the same exercise. Copying fills editable values without recording them. **Καταγραφή και των δύο** records all valid pending movements in the current pair together, preserving individually recorded/skipped entries and keeping swaps manual. After both exercises, **Έναρξη διαλείμματος** opens a large countdown with the upcoming exercises and round; **Συνέχεια** explicitly advances. Finishers have no rest preset. The rest view survives reloads and works offline. These features use the existing database and need no additional migration.

The four-step round indicator highlights **ασκήσεις → αλλαγή → ασκήσεις → διάλειμμα**. When both athletes' first-pair values are valid, **Καταγραφή και αλλαγή** records them and swaps in one transaction. Selecting an input reveals quick choices from its prescribed reps/time and that athlete's recent compatible results; choosing a value leaves it editable and unrecorded. **Λειτουργία προπόνησης** hides navigation, enlarges the panels, and pins the round and main action while scrolling. Its preference is saved per account on the device. **Κανονική προβολή** (shown as **Έξοδος** on smaller screens) restores navigation; completion or discard also restores it. All timers still start manually.

The compact live header keeps station and round on one line with the flow underneath. **Ολοκλήρωση** and **Διακοπή** are in **Επιλογές προπόνησης** and retain confirmation dialogs. Athlete panels show the exercise and target together and align input rows across both athletes, including wrapped titles and exercise alternatives.

Coach notes expand on demand; a small indicator marks an existing note. Previous results and **Ίδιο με πριν** share one compact row. Unilateral exercises reveal the optional other-side input through **Διαφορετική τιμή ανά πλευρά** and open it automatically for different recorded or copied values. Collapsing either disclosure preserves its data.

The live bottom bar groups Back, Timer, and the main action, with specific missing-field feedback for each athlete and a discreet sync indicator. Its main action follows recording/swap, paired recording, manual rest, and completion. Recording the first pair without swapping remains available through **Επιλογές προπόνησης → Καταγραφή και των δύο**. After the second pair, **Χωρίς διάλειμμα** explicitly advances instead of starting rest. Normal and training views share these controls; training mode keeps them visible while scrolling. No additional database migration is needed.

## Run locally

Use Node.js 24 and npm. From this repository:

```sh
npm ci
cp -n .env.example .env.local
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local` to the project's URL and publishable key. These values are public browser configuration. Administrative/service-role keys must never be used in the frontend. `.env.local` is ignored by Git.

```sh
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

The development login includes an explicit device preview for testing without accounts. Preview data stays on that device in a separate workspace; it is not imported into a cloud account. A configured production build requires login. Restart Vite after changing configuration.

## Connect Supabase

Follow [the account and database guide](docs/supabase-setup.md). Apply all four migrations in order, create three confirmed email/password users, and run the bootstrap once to assign their roles. Existing installations only need the unapplied migrations. The supplied user IDs are already filled in [bootstrap.sql](supabase/bootstrap.sql).

The coach manages the program, workout records, private notes, and goals. Each athlete can read her own workout details, see both athletes' shared comparisons and weights, and add her own weigh-ins. Server permissions enforce these boundaries. Authentication alone does not assign membership; the bootstrap does that.

The coach-only **Διαχείριση** tab adds spectator accounts, replaces a removed athlete login, deletes athlete/spectator accounts with confirmation, and sets new passwords. Spectators see both athletes' completed training and weight progress without editing access or private notes. Existing passwords cannot be viewed. Follow [account management activation](docs/account-management.md) to apply migration 004 and deploy the protected Supabase Edge Function; GitHub Pages publication alone cannot enable account administration. Account actions require internet and preserve training history when a login is deleted.

## Validate

```sh
npm test
npm run build
npm run test:e2e
npm run test:offline
```

Unit tests cover station progression, program snapshots, account-scoped IndexedDB, synchronization revisions, account-management authorization and compensation, and actual PostgreSQL policies/RPCs using PGlite. Browser tests cover paired logging, manual timers, weight entry, program edits, account administration, read-only spectator access, and four screen sizes. The offline check builds an isolated production PWA and verifies reloads, an unvisited lazy route, durable records, and timer recovery without a Supabase password.

Browser checks use `/usr/bin/chromium` when available. Otherwise install Chromium with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing executable.

## Build and host

Set `VITE_BASE_PATH=/workout-lab.github.io/` for the GitHub Pages project site, or `/` for a root-domain deployment. Supply the two Supabase variables when building; Vite embeds public configuration at build time.

```sh
npm run build
```

The output is `dist/`. The live app is at **https://kostasfot.github.io/workout-lab.github.io/**, served from the `gh-pages` branch with HTTPS enforced. Hash routes work with static hosting. After committing and pushing source changes to `main`, run `npm run publish:pages` to build and update that branch. It requires the publishable cloud configuration and refuses to overwrite a newer concurrent publication. See [the deployment guide](docs/deployment.md) for the current setup and the alternative manual Actions workflow. Add the hosted site's URL to Supabase Authentication's redirect configuration before using password recovery.

## Offline behavior

Open the app online and sign in on each device before using it offline. Production caches the app, fonts, and page bundles; private API responses are not stored in the service-worker cache. Entries are saved in account-scoped IndexedDB and queued for cloud sync. The UI distinguishes local preview, offline/pending changes, synchronized records, and conflicts. Resolve conflicting versions from Settings; a cloud revision is not silently overwritten.

Timers use saved deadlines and start only when pressed. Closing the popup or reloading does not reset a running timer. Discarding a workout clears its timers and notes. Sound requires the app to be active; a background operating-system alarm is not provided. Updates are deferred during an active workout. Finished workouts retain the program snapshot used at the time. Editing the training date updates history, comparisons, and the CSV filename while preserving original start/completion timestamps. Settings offers a JSON backup; workout details offer CSV export.

## Implementation

React, TypeScript, Vite, Tailwind CSS, Radix UI, and Recharts form the interface. Dexie handles local persistence; Supabase provides email/password authentication, PostgreSQL, row-level security, and revision-aware RPC synchronization. The PWA uses Workbox. See [the agreed requirements](docs/product-plan.md) for the source interpretation and scope.
