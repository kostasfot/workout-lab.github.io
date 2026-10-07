# Publish the frontend to GitHub Pages

The app is built and tested in this workspace. It has not been pushed or published. Publishing the Codex cloud environment retains the development environment; publishing GitHub Pages makes the frontend available to the Android tablet. These are separate actions.

The target is the `kostasfot/workout-lab.github.io` repository, with the project-site path `/workout-lab.github.io/`. The manual [Publish Workout Lab workflow](../.github/workflows/deploy.yml) builds the frontend with cloud login enabled and uploads it to Pages.

1. Commit and push the reviewed application files and workflows to the repository's `main` branch. Keep `.env.local`, `node_modules`, `dist`, and test outputs ignored.
2. In GitHub **Settings → Secrets and variables → Actions → Variables**, create `VITE_SUPABASE_URL` using the Supabase project URL and `VITE_SUPABASE_PUBLISHABLE_KEY` using its publishable key. These values are embedded in the browser build. An administrative/service-role key must not be used.
3. In **Settings → Pages**, select **GitHub Actions** as the source.
4. In **Actions → Publish Workout Lab**, choose **Run workflow** on `main`. The workflow runs the database/unit tests and production build, then publishes the generated artifact. It does not run automatically on each push.
5. Wait for both build and deploy jobs to succeed. Open the URL reported by the deployment job. Confirm the email/password login appears, then perform the signed-in checks in [the Supabase guide](supabase-setup.md).
6. Open that HTTPS URL in Chrome on the Android tablet, sign in online, and choose the browser's **Install app** or **Add to home screen** action. Verify the first offline workout on that tablet in both orientations.

For later updates, trigger the same workflow after pushing reviewed changes. The app offers an update prompt and defers activation during an active workout. Supabase Authentication's Site URL and recovery redirect must match the actual deployed URL.

The local browser checks use Chromium at desktop, landscape tablet, portrait tablet, and phone sizes. They do not prove a hosted deployment or behavior on the physical Android device. The live Supabase migration endpoint was observed rejecting an anonymous workspace request; actual signed-in account and cloud-sync checks remain to be completed.
