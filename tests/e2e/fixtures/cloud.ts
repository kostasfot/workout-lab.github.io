import { expect, type Page } from '@playwright/test'
import { emptyWorkspace } from '../../../src/lib/program'
import { createWorkout, finishWorkout, requiredResults, workoutDate, type Workspace } from '../../../src/lib/model'
import { AccountError, createAccountHandler, type Profile, type AccountInfo } from '../../../supabase/functions/manage-users/handler'

export async function mockAccount(page: Page, role: 'coach' | 'athlete' | 'spectator', enabled = true, options: { active?: boolean; routine?: number; workoutDiscard?: boolean; accountManagement?: boolean } = {}) {
  const userId = role === 'coach' ? '10000000-0000-0000-0000-000000000001' : role === 'athlete' ? '10000000-0000-0000-0000-000000000002' : '10000000-0000-0000-0000-000000000004', teamId = '20000000-0000-0000-0000-000000000001'
  const remote = emptyWorkspace()
  remote.historyDeletion = enabled; remote.workoutDiscard = options.workoutDiscard ?? enabled; remote.deletedRecords = []; remote.program.revision = 1
  remote.accountManagement = options.accountManagement ?? enabled
  const profiles = new Map<string, Profile>(), accounts = new Map<string, AccountInfo>()
  for (const [i, name] of ['Προπονητής', 'Άννα', 'Δήμητρα', 'Πατέρας'].entries()) {
    if (i === 3 && role !== 'spectator') continue
    const id = `10000000-0000-0000-0000-00000000000${i + 1}`
    profiles.set(id, { id, team_id: teamId, role: i === 0 ? 'coach' : i === 3 ? 'spectator' : 'athlete', athlete_id: i === 1 ? 'anna' : i === 2 ? 'dimitra' : null, display_name: name })
    accounts.set(id, { id, email: `${['coach', 'anna', 'dimitra', 'father'][i]}@example.com`, createdAt: '2026-10-01T09:00:00Z', lastSignIn: null })
  }
  const accountRequests: { action: string; userId?: string }[] = []
  let workout = createWorkout(remote.program.routines[options.routine ?? 0], remote.program.id)
  for (const r of requiredResults(workout, true)) workout.results[r.key] = { ...r, status: 'completed', weight: r.movement.loaded ? 6.25 : null, value: 10 }
  workout = { ...(options.active ? workout : finishWorkout(workout)), revision: 1 }
  remote.workouts = [workout]
  remote.notes = [{ id: crypto.randomUUID(), workoutId: workout.id, athlete: 'anna', text: 'private note', revision: 1 }]
  remote.weighIns = ['anna', 'dimitra'].map((athlete, i) => ({ id: crypto.randomUUID(), athlete: athlete as 'anna' | 'dimitra', date: '2026-10-01', weight: 100 + i, revision: 1, createdAt: '2026-10-01T09:00:00Z' }))
  const requests: { kind: string; payload: { id: string; date?: string; discard?: boolean; results?: Workspace['workouts'][number]['results'] }; endpoint: string }[] = []
  const expiry = Math.floor(Date.now() / 1000) + 3600
  const accessToken = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', exp: expiry })).toString('base64url'), 'test-signature'].join('.')
  const accountHandler = createAccountHandler({
    authenticate: async token => token === accessToken ? userId : null,
    profile: async id => profiles.get(id) || null,
    profiles: async team => [...profiles.values()].filter(p => p.team_id === team),
    account: async id => accounts.get(id)!,
    create: async email => { if ([...accounts.values()].some(a => a.email === email)) throw new AccountError('email_exists', 409); const id = crypto.randomUUID(); accounts.set(id, { id, email, createdAt: new Date().toISOString(), lastSignIn: null }); return id },
    attach: async profile => { profiles.set(profile.id, profile) },
    remove: async id => { profiles.delete(id); accounts.delete(id) },
    password: async () => {},
  }, ['http://127.0.0.1:5173'])
  await page.addInitScript(({ userId, accessToken, expiry }) => {
    localStorage.setItem('sb-workout-lab-test-auth-token', JSON.stringify({ access_token: accessToken, refresh_token: 'test-refresh', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }))
  }, { userId, accessToken, expiry })
  await page.route('https://workout-lab-test.supabase.co/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/functions/v1/manage-users') {
      const input = route.request().postDataJSON()
      accountRequests.push({ action: input.action, userId: input.userId })
      const response = await accountHandler(new Request(route.request().url(), { method: 'POST', headers: route.request().headers(), body: route.request().postData() }))
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() })
      return
    }
    let body: unknown
    if (pathname === '/rest/v1/profiles') {
      body = profiles.get(userId)
      if (!body) { await route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'No profile' }) }); return }
    }
    else if (pathname.endsWith('/get_workspace')) {
      const data: Workspace = structuredClone(remote)
      data.comparisons = remote.workouts.filter(w => w.status !== 'active').map(w => ({ id: w.id, date: workoutDate(w), name: w.routine.name, results: { anna: { completed: Object.values(w.results).filter(r => r.athlete === 'anna' && r.status === 'completed').length, skipped: 0 }, dimitra: { completed: Object.values(w.results).filter(r => r.athlete === 'dimitra' && r.status === 'completed').length, skipped: 0 } } }))
      if (role === 'athlete') { data.notes = []; data.workouts = data.workouts.filter(w => w.status !== 'active').map(w => ({ ...w, participants: ['anna'], results: Object.fromEntries(Object.entries(w.results).filter(([, r]) => r.athlete === 'anna')) })) }
      if (role === 'spectator') { data.notes = []; data.workouts = data.workouts.filter(w => w.status !== 'active') }
      body = data
    } else if (pathname.endsWith('/delete_record')) {
      const request = route.request().postDataJSON(); requests.push({ ...request, endpoint: 'delete_record' })
      if (request.kind === 'weighin') remote.weighIns = remote.weighIns.filter(w => w.id !== request.payload.id)
      if (request.kind === 'workout') { remote.workouts = remote.workouts.filter(w => w.id !== request.payload.id); remote.notes = remote.notes.filter(n => n.workoutId !== request.payload.id) }
      remote.deletedRecords!.push({ kind: request.kind, id: request.payload.id, revision: request.expected_revision + 1 })
      body = request.expected_revision + 1
    } else if (pathname.endsWith('/save_record')) {
      const request = route.request().postDataJSON(); requests.push({ ...request, endpoint: 'save_record' })
      if (request.kind === 'workout') remote.workouts = [...remote.workouts.filter(w => w.id !== request.payload.id), { ...request.payload, revision: request.expected_revision + 1 }]
      if (request.kind === 'program') remote.program = { ...request.payload, revision: request.expected_revision + 1 }
      if (request.kind === 'note') remote.notes = [...remote.notes.filter(n => n.id !== request.payload.id), { ...request.payload, revision: request.expected_revision + 1 }]
      body = request.expected_revision + 1
    } else { throw new Error(`Unexpected mock request: ${pathname}`) }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Καλώς ήρθατε στο Lab.' })).toBeVisible()
  await expect(page.locator('.sync-pill')).toHaveAttribute('title', 'Συγχρονισμένο')
  return { requests, remote, workout, accountRequests, profiles, accounts }
}
export async function synchronize(page: Page) {
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Συγχρονισμός τώρα', exact: true }).click()
  await expect(page.locator('.sync-pill')).toHaveAttribute('title', 'Συγχρονισμένο')
}
