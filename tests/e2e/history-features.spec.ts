import { test, expect, type Page } from '@playwright/test'
import { emptyWorkspace } from '../../src/lib/program'
import { createWorkout, finishWorkout, requiredResults, type Workspace } from '../../src/lib/model'

async function mockAccount(page: Page, role: 'coach' | 'athlete', enabled = true) {
  const userId = '10000000-0000-0000-0000-000000000001', teamId = '20000000-0000-0000-0000-000000000001'
  const remote = emptyWorkspace()
  remote.historyDeletion = enabled; remote.deletedRecords = []; remote.program.revision = 1
  let workout = createWorkout(remote.program.routines[0], remote.program.id)
  for (const r of requiredResults(workout, true)) workout.results[r.key] = { ...r, status: 'completed', weight: r.movement.loaded ? 6.25 : null, value: 10 }
  workout = { ...finishWorkout(workout), revision: 1 }
  remote.workouts = [workout]
  remote.notes = [{ id: crypto.randomUUID(), workoutId: workout.id, athlete: 'anna', text: 'private note', revision: 1 }]
  remote.weighIns = ['anna', 'dimitra'].map((athlete, i) => ({ id: crypto.randomUUID(), athlete: athlete as 'anna' | 'dimitra', date: '2026-10-01', weight: 100 + i, revision: 1, createdAt: '2026-10-01T09:00:00Z' }))
  const requests: { kind: string; payload: { id: string }; endpoint: string }[] = []
  const expiry = Math.floor(Date.now() / 1000) + 3600
  const accessToken = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', exp: expiry })).toString('base64url'), 'test-signature'].join('.')
  await page.addInitScript(({ userId, accessToken, expiry }) => {
    localStorage.setItem('sb-workout-lab-test-auth-token', JSON.stringify({ access_token: accessToken, refresh_token: 'test-refresh', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }))
  }, { userId, accessToken, expiry })
  await page.route('https://workout-lab-test.supabase.co/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    let body: unknown
    if (pathname === '/rest/v1/profiles') body = { id: userId, team_id: teamId, role, athlete_id: role === 'athlete' ? 'anna' : null }
    else if (pathname.endsWith('/get_workspace')) {
      const data: Workspace = structuredClone(remote)
      data.comparisons = remote.workouts.map(w => ({ id: w.id, date: w.completedAt!, name: w.routine.name, results: { anna: { completed: Object.values(w.results).filter(r => r.athlete === 'anna' && r.status === 'completed').length, skipped: 0 }, dimitra: { completed: Object.values(w.results).filter(r => r.athlete === 'dimitra' && r.status === 'completed').length, skipped: 0 } } }))
      if (role === 'athlete') { data.notes = []; data.workouts = data.workouts.map(w => ({ ...w, participants: ['anna'], results: Object.fromEntries(Object.entries(w.results).filter(([, r]) => r.athlete === 'anna')) })) }
      body = data
    } else if (pathname.endsWith('/delete_record')) {
      const request = route.request().postDataJSON(); requests.push({ ...request, endpoint: 'delete_record' })
      if (request.kind === 'weighin') remote.weighIns = remote.weighIns.filter(w => w.id !== request.payload.id)
      if (request.kind === 'workout') { remote.workouts = remote.workouts.filter(w => w.id !== request.payload.id); remote.notes = remote.notes.filter(n => n.workoutId !== request.payload.id) }
      remote.deletedRecords!.push({ kind: request.kind, id: request.payload.id, revision: request.expected_revision + 1 })
      body = request.expected_revision + 1
    } else if (pathname.endsWith('/save_record')) {
      const request = route.request().postDataJSON(); requests.push({ ...request, endpoint: 'save_record' })
      if (request.kind === 'workout') remote.workouts = remote.workouts.map(w => w.id === request.payload.id ? { ...request.payload, revision: request.expected_revision + 1 } : w)
      body = request.expected_revision + 1
    } else { throw new Error(`Unexpected mock request: ${pathname}`) }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Καλώς ήρθατε στο Lab.' })).toBeVisible()
  await expect(page.locator('.sync-pill')).toHaveAttribute('title', 'Συγχρονισμένο')
  return { requests, remote, workout }
}
async function synchronize(page: Page) {
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Συγχρονισμός τώρα', exact: true }).click()
  await expect(page.locator('.sync-pill')).toHaveAttribute('title', 'Συγχρονισμένο')
}
test('coach confirms offline weigh-in deletion, individual set deletion, and whole workout deletion', async ({ page, context }) => {
  const { requests, remote, workout } = await mockAccount(page, 'coach')
  await page.goto('/#/progress')
  await expect(page.locator('.weighin-table tbody tr')).toHaveCount(2)
  const deleteWeight = page.getByRole('button', { name: 'Διαγραφή μέτρησης Άννα 2026-10-01', exact: true })
  await expect(deleteWeight).toBeEnabled()
  await deleteWeight.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Ακύρωση', exact: true }).click()
  await expect(page.locator('.weighin-table tbody tr')).toHaveCount(2)
  await context.setOffline(true)
  await deleteWeight.click()
  await page.getByRole('dialog').getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.locator('.weighin-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.weight-card.anna .current-weight')).toContainText('—')
  await expect(page.locator('.weight-card.dimitra .current-weight')).toContainText('101')
  expect(requests).toHaveLength(0)
  await context.setOffline(false); await synchronize(page)
  await expect.poll(() => requests.filter(r => r.endpoint === 'delete_record' && r.kind === 'weighin').length).toBe(1)
  await page.goto(`/#/history?session=${workout.id}`)
  await expect(page.getByText('6,25 kg / αλτήρα · 10 επ.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Διαγραφή σετ Άννα Goblet Squats σετ 1', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Διαγραφή καταγεγραμμένου σετ', exact: true })
  await confirmation.getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.locator('.result-history-row')).toHaveCount(43)
  await expect(page.locator('.history-athlete.anna').getByText('6,25 kg / αλτήρα · 10 επ.', { exact: true })).toHaveCount(0)
  await expect(page.locator('.history-athlete.dimitra').getByText('10 επ.', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Κλείσιμο', exact: true }).click()
  await synchronize(page)
  expect(requests.some(r => r.endpoint === 'save_record' && r.kind === 'workout')).toBe(true)
  await page.goto(`/#/history?session=${workout.id}`)
  await expect(page.locator('.result-history-row')).toHaveCount(43)
  await page.getByRole('button', { name: 'Διαγραφή προπόνησης', exact: true }).click()
  await page.getByRole('dialog', { name: 'Διαγραφή προπόνησης', exact: true }).getByRole('button', { name: 'Διαγραφή', exact: true }).click()
  await expect(page.getByText('Το ιστορικό σας ξεκινά εδώ.', { exact: true })).toBeVisible()
  await synchronize(page)
  expect(requests.some(r => r.endpoint === 'delete_record' && r.kind === 'workout')).toBe(true)
  expect(remote.workouts).toEqual([]); expect(remote.notes).toEqual([])
  await page.goto('/#/history'); await page.reload()
  await expect(page.getByText('Το ιστορικό σας ξεκινά εδώ.', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('athletes cannot access deletion controls, and old databases keep coach deletion disabled', async ({ page }) => {
  const { workout } = await mockAccount(page, 'athlete')
  await page.goto('/#/progress')
  await expect(page.locator('.weighin-table tbody tr')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Διαγραφή/ })).toHaveCount(0)
  await page.goto(`/#/history?session=${workout.id}`)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Διαγραφή/ })).toHaveCount(0)
  const coach = await page.context().newPage()
  try {
    await mockAccount(coach, 'coach', false)
    await coach.goto('/#/progress')
    await expect(coach.getByRole('button', { name: 'Διαγραφή μέτρησης Άννα 2026-10-01', exact: true })).toBeDisabled()
    await expect(coach.getByText('Η διαγραφή ιστορικού θα είναι διαθέσιμη μόλις ενεργοποιηθεί για την ομάδα.')).toBeVisible()
  } finally { await coach.close() }
})
test('weight buttons add exact quarter-kilogram loads independently and respect recorded sets and limits', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Προεπισκόπηση στη συσκευή' }).click()
  await page.getByRole('button', { name: 'Ξεκινήστε προπόνηση' }).click()
  await page.getByRole('button', { name: 'Έναρξη προπόνησης', exact: true }).click()
  const anna = page.getByTestId('panel-anna'), dimitra = page.getByTestId('panel-dimitra')
  await expect(dimitra.locator('.weight-increments')).toHaveCount(0)
  const weight = anna.getByLabel(/^Βάρος/), small = anna.getByRole('button', { name: 'Αύξηση 1.25 kg Άννα Goblet Squats', exact: true }), large = anna.getByRole('button', { name: 'Αύξηση 2.5 kg Άννα Goblet Squats', exact: true })
  await expect(small).toHaveText('+1,25 kg')
  await weight.fill('497.5'); await large.click()
  await expect(weight).toHaveValue('500'); await expect(small).toBeDisabled(); await expect(large).toBeDisabled()
  await weight.fill('')
  await small.click(); await small.click(); await large.click()
  await expect(weight).toHaveValue('5')
  const buttonSize = await small.boundingBox(); expect(buttonSize!.height).toBeGreaterThanOrEqual(44)
  await anna.getByLabel(/^Επαναλήψεις/).fill('10')
  await anna.getByRole('button', { name: 'Καταγραφή', exact: true }).click()
  await expect(small).toBeDisabled(); await expect(large).toBeDisabled()
  await dimitra.getByLabel(/^Επαναλήψεις/).fill('11')
  await dimitra.getByRole('button', { name: 'Καταγραφή', exact: true }).click()
  await page.getByRole('button', { name: 'Αλλαγή ασκήσεων', exact: true }).click()
  await dimitra.getByRole('button', { name: 'Αύξηση 2.5 kg Δήμητρα Goblet Squats', exact: true }).click()
  await dimitra.getByRole('button', { name: 'Αύξηση 1.25 kg Δήμητρα Goblet Squats', exact: true }).click()
  await expect(dimitra.getByLabel(/^Βάρος/)).toHaveValue('3.75')
  await page.reload()
  await expect(dimitra.getByLabel(/^Βάρος/)).toHaveValue('3.75')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
