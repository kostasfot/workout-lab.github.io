import { beforeEach, expect, test, vi } from 'vitest'
import { AccountError, createAccountHandler, type AccountBackend, type Profile } from '../../supabase/functions/manage-users/handler'

const ids = { coach: '10000000-0000-0000-0000-000000000001', athlete: '10000000-0000-0000-0000-000000000002', spectator: '10000000-0000-0000-0000-000000000003', other: '10000000-0000-0000-0000-000000000004', new: '10000000-0000-0000-0000-000000000005' }
let backend: AccountBackend
let profiles: Map<string, Profile>
let handler: ReturnType<typeof createAccountHandler>
const origin = 'https://kostasfot.github.io'
const request = (body: unknown, token = 'coach', requestOrigin = origin) => handler(new Request('https://test.supabase.co/functions/v1/manage-users', { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: requestOrigin }, body: JSON.stringify(body) }))
const creation = { action: 'create', name: 'Πατέρας', email: 'father@example.com', password: 'InitialPass123!', role: 'spectator', athleteId: null }
beforeEach(() => {
  profiles = new Map(Object.entries(ids).filter(([name]) => name !== 'new').map(([name, id]) => [id, { id, team_id: name === 'other' ? 'other-team' : 'team', role: name === 'coach' || name === 'other' ? 'coach' : name === 'athlete' ? 'athlete' : 'spectator', athlete_id: name === 'athlete' ? 'anna' : null, display_name: name }] as [string, Profile]))
  backend = {
    authenticate: vi.fn(async token => ids[token as keyof typeof ids] || null),
    profile: vi.fn(async id => profiles.get(id) || null),
    profiles: vi.fn(async team => [...profiles.values()].filter(p => p.team_id === team)),
    account: vi.fn(async id => ({ id, email: `${id}@example.com`, createdAt: '2026-10-01T09:00:00Z', lastSignIn: null, encryptedPassword: 'must never escape' })),
    create: vi.fn(async () => ids.new), attach: vi.fn(async profile => { profiles.set(profile.id, profile) }),
    remove: vi.fn(async id => { profiles.delete(id) }), password: vi.fn(async () => {}),
  }
  handler = createAccountHandler(backend, [origin])
})

test('account administration verifies the token and database coach role for every request', async () => {
  for (const token of ['forged-token', 'athlete', 'spectator', 'new']) {
    for (const action of [{ action: 'list' }, creation, { action: 'delete', userId: ids.athlete }, { action: 'password', userId: ids.athlete, password: 'NewPassword123!' }]) {
      const response = await request(action, token)
      expect([401, 403]).toContain(response.status)
    }
  }
  expect(backend.create).not.toHaveBeenCalled(); expect(backend.remove).not.toHaveBeenCalled(); expect(backend.password).not.toHaveBeenCalled()
  const missing = await handler(new Request('https://test', { method: 'POST', body: '{}' }))
  expect(missing.status).toBe(401)
})
test('coach lists only her team with no password, auth metadata, or other-team accounts', async () => {
  const response = await request({ action: 'list', teamId: 'other-team' })
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  const result = await response.json()
  expect(result.users.map((u: Profile) => u.id)).toEqual([ids.coach, ids.athlete, ids.spectator])
  expect(JSON.stringify(result)).not.toMatch(/password|encrypted|must never escape|other-team/i)
  expect(backend.account).toHaveBeenCalledTimes(3)
})
test('spectator creation binds to the verified coach team and never returns credentials', async () => {
  const response = await request({ ...creation, teamId: 'other-team', email: ' FATHER@example.com ' })
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ id: ids.new })
  expect(backend.create).toHaveBeenCalledWith('father@example.com', creation.password)
  expect(backend.attach).toHaveBeenCalledWith({ id: ids.new, team_id: 'team', role: 'spectator', athlete_id: null, display_name: 'Πατέρας' })
})
test('new accounts cannot gain coach privileges, invalid athlete IDs, or a spectator athlete assignment', async () => {
  for (const body of [{ role: 'coach' }, { role: 'admin' }, { athleteId: 'anna' }, { role: 'athlete', athleteId: null }, { role: 'athlete', athleteId: 'someone' }]) expect((await request({ ...creation, ...body })).status).toBe(400)
  expect(backend.create).not.toHaveBeenCalled()
})
test('duplicate athlete login creation is refused and a vacant athlete gets the existing roster identity', async () => {
  expect((await request({ ...creation, role: 'athlete', athleteId: 'anna' })).status).toBe(409)
  expect(backend.create).not.toHaveBeenCalled()
  const response = await request({ ...creation, role: 'athlete', athleteId: 'dimitra' })
  expect(response.status).toBe(201)
  expect(profiles.get(ids.new)!.athlete_id).toBe('dimitra')
})
test('profile insertion failure cleans up a newly created auth login', async () => {
  vi.mocked(backend.attach).mockRejectedValueOnce(new AccountError('athlete_has_account', 409))
  const response = await request(creation)
  expect(response.status).toBe(409)
  expect(backend.remove).toHaveBeenCalledWith(ids.new)
  expect(profiles.has(ids.new)).toBe(false)
})
test('cleanup failure is reported without pretending account creation succeeded', async () => {
  vi.mocked(backend.attach).mockRejectedValueOnce(new Error('db failed'))
  vi.mocked(backend.remove).mockRejectedValueOnce(new Error('auth failed'))
  const response = await request(creation)
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'creation_cleanup_failed' })
})
test('coach cannot delete/reset another team account or any coach, including self', async () => {
  for (const userId of [ids.other, ids.coach, ids.new]) {
    for (const action of ['delete', 'password']) expect([403, 404]).toContain((await request({ action, userId, password: 'NewPassword123!' })).status)
  }
  expect(backend.remove).not.toHaveBeenCalled(); expect(backend.password).not.toHaveBeenCalled()
})
test('coach can delete an athlete or spectator login and set a new password without exposing it', async () => {
  for (const userId of [ids.athlete, ids.spectator]) {
    const response = await request({ action: 'password', userId, password: 'NewPassword123!' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(backend.password).toHaveBeenCalledWith(userId, 'NewPassword123!')
    expect((await request({ action: 'delete', userId })).status).toBe(200)
    expect(backend.remove).toHaveBeenCalledWith(userId)
  }
})
test('invalid form data cannot reach admin mutations and service failures never expose raw SDK messages', async () => {
  for (const body of [{ password: '1234567' }, { password: 'a'.repeat(129) }, { email: 'wrong' }, { name: '' }, { name: 'a'.repeat(81) }]) expect((await request({ ...creation, ...body })).status).toBe(400)
  expect((await request({ action: 'password', userId: ids.athlete, password: 'short' })).status).toBe(400)
  expect((await request({ action: 'delete', userId: 'invalid-id' })).status).toBe(400)
  expect(backend.create).not.toHaveBeenCalled(); expect(backend.password).not.toHaveBeenCalled(); expect(backend.remove).not.toHaveBeenCalled()
  vi.mocked(backend.create).mockRejectedValueOnce(new Error(`SDK failure ${creation.email} ${creation.password}`))
  const response = await request(creation)
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'service_error' })
})
test('only configured browser origins are allowed, and preflight does not run administration', async () => {
  expect((await request({ action: 'list' }, 'coach', 'https://evil.example')).status).toBe(403)
  expect(backend.authenticate).not.toHaveBeenCalled()
  const response = await handler(new Request('https://test', { method: 'OPTIONS', headers: { Origin: origin } }))
  expect(response.status).toBe(204)
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
  expect(backend.authenticate).not.toHaveBeenCalled()
  expect((await handler(new Request('https://test', { method: 'GET' }))).status).toBe(405)
})
test('malformed, oversized, and unknown-action requests are rejected without account mutations', async () => {
  for (const body of ['{', '[]', 'null', 'a'.repeat(4097)]) {
    const response = await handler(new Request('https://test', { method: 'POST', headers: { Authorization: 'Bearer coach' }, body }))
    expect([400, 413]).toContain(response.status)
  }
  expect((await request({ action: 'promote', userId: ids.spectator })).status).toBe(400)
  expect(backend.create).not.toHaveBeenCalled(); expect(backend.remove).not.toHaveBeenCalled(); expect(backend.password).not.toHaveBeenCalled()
})
