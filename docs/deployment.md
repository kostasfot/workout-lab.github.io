# GitHub Pages deployment

The app is published at **https://kostasfot.github.io/workout-lab.github.io/**. GitHub Pages serves the `gh-pages` branch's root directory, with HTTPS enforced. Source code is on `main`. Publishing the Codex environment is a separate action that retains the development workspace.

## Publish an update

1. Commit the source changes and push them to `main` in `kostasfot/workout-lab.github.io`.
2. Provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` through environment settings or the ignored `.env.local`. The current cloud environment has these public client values configured. Administrative/service-role keys must never be used in the frontend.
3. Run `npm run publish:pages` from the repository. It checks that the source is clean and pushed, builds with `/workout-lab.github.io/` as the site path, and pushes the compiled files to `gh-pages` using a separate temporary index. It preserves the source checkout and refuses a non-fast-forward publication.
4. Wait for GitHub's **pages build and deployment** run to succeed. The site's `build-info.json` identifies the deployed source commit; the publisher prints the intended commit.

No GitHub Actions repository variables are required for this publication route. The publishable configuration is embedded in the compiled browser app. Device logs, passwords, and `.env.local` are not copied into the publication branch.

## Use the Android tablet

Open the HTTPS site in Chrome and sign in with the coach account created in Supabase. Use the browser's **Install app** or **Add to home screen** action. Test a workout in both orientations, then check offline recording and reconnecting. The three accounts use their Supabase email/password credentials, independently of the GitHub dashboard login.

Perform the signed-in checks in [the Supabase guide](supabase-setup.md). Supabase's Site URL and password-recovery redirect must match the deployed URL. Password email delivery depends on the project's SMTP configuration.

## Alternative manual Actions workflow

The [Publish Workout Lab workflow](../.github/workflows/deploy.yml) remains available as an alternative. To use it, an administrator must set both Supabase repository variables, change **Settings → Pages → Source** to **GitHub Actions**, then trigger the workflow on `main`. The current GitHub integration cannot manage Actions variables; the working branch publication avoids needing that permission.

## Verified behavior

The production site serves the matching source commit, index, app assets, manifest, and service worker. GitHub reports successful Pages deployment. Local tests cover 14 unit/database cases, 20 browser checks across four sizes, and production PWA offline reloads. Actual account login, cloud synchronization, SMTP delivery, and use on the physical Android tablet still need signed-in verification.
