// No credentials or passwords are stored or logged by this handler.
export interface Profile {
  id: string
  team_id: string
  role: 'coach' | 'athlete' | 'spectator'
  athlete_id: 'anna' | 'dimitra' | null
  display_name: string
}
export interface AccountInfo { id: string; email: string; createdAt: string; lastSignIn: string | null }
export interface AccountBackend {
  authenticate: (token: string) => Promise<string | null>
  profile: (id: string) => Promise<Profile | null>
  profiles: (team: string) => Promise<Profile[]>
  account: (id: string) => Promise<AccountInfo>
  create: (email: string, password: string) => Promise<string>
  attach: (profile: Profile) => Promise<void>
  remove: (id: string) => Promise<void>
  password: (id: string, password: string) => Promise<void>
}
export class AccountError extends Error {
  constructor(public code: string, public status = 400) { super(code) }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) throw new AccountError('invalid_password')
  return value
}

export function createAccountHandler(backend: AccountBackend, allowedOrigins: string[]) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get('origin')
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' })
    if (origin && !allowedOrigins.includes(origin)) return new Response(JSON.stringify({ error: 'origin_not_allowed' }), { status: 403, headers })
    if (origin) headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, x-client-info, content-type')
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405)
    try {
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
      if (!token) throw new AccountError('not_authenticated', 401)
      const caller = await backend.authenticate(token)
      if (!caller) throw new AccountError('not_authenticated', 401)
      const coach = await backend.profile(caller)
      if (coach?.role !== 'coach') throw new AccountError('not_authorized', 403)
      // Bound request size, including chunked bodies. Never log the input.
      const reader = request.body?.getReader()
      if (!reader) throw new AccountError('invalid_request')
      let length = 0
      const chunks: Uint8Array[] = []
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > 4096) { await reader.cancel(); throw new AccountError('invalid_request', 413) }
        chunks.push(value)
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
      let input: Record<string, unknown>
      try {
        const parsed = JSON.parse(new TextDecoder().decode(bytes))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
        input = parsed
      } catch { throw new AccountError('invalid_request') }

      if (input.action === 'list') {
        const profiles = await backend.profiles(coach.team_id)
        const users = await Promise.all(profiles.map(async profile => {
          const account = await backend.account(profile.id)
          return { id: profile.id, name: profile.display_name, role: profile.role, athleteId: profile.athlete_id, email: account.email, createdAt: account.createdAt, lastSignIn: account.lastSignIn }
        }))
        return respond({ users })
      }
      if (input.action === 'create') {
        const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 80) throw new AccountError('invalid_account')
        const role = input.role
        const athleteId = input.athleteId ?? null
        if (role !== 'athlete' && role !== 'spectator') throw new AccountError('invalid_role')
        if (role === 'athlete' ? athleteId !== 'anna' && athleteId !== 'dimitra' : athleteId !== null) throw new AccountError('invalid_role')
        const newPassword = password(input.password)
        const existing = await backend.profiles(coach.team_id)
        if (role === 'athlete' && existing.some(p => p.athlete_id === athleteId)) throw new AccountError('athlete_has_account', 409)
        const id = await backend.create(email, newPassword)
        try {
          await backend.attach({ id, team_id: coach.team_id, role, athlete_id: athleteId as Profile['athlete_id'], display_name: name })
        } catch (error) {
          // Compensate if the unique athlete constraint rejects concurrent creation.
          try { await backend.remove(id) } catch { throw new AccountError('creation_cleanup_failed', 500) }
          throw error
        }
        return respond({ id }, 201)
      }
      if (input.action !== 'delete' && input.action !== 'password') throw new AccountError('invalid_action')
      if (typeof input.userId !== 'string' || !uuid.test(input.userId)) throw new AccountError('invalid_account')
      const target = await backend.profile(input.userId)
      if (!target || target.team_id !== coach.team_id) throw new AccountError('account_not_found', 404)
      if (target.id === caller || target.role === 'coach') throw new AccountError('protected_coach', 403)
      if (input.action === 'delete') await backend.remove(target.id)
      else await backend.password(target.id, password(input.password))
      return respond({ success: true })
    } catch (error) {
      // SDK failures can contain account details; only defined codes reach the client.
      const known = error instanceof AccountError ? error : new AccountError('service_error', 503)
      return respond({ error: known.code }, known.status)
    }
  }
}
