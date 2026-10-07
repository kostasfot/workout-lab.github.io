import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { AccountError, createAccountHandler, type Profile } from './handler.ts'

// Supabase supplies these built-in variables to its Edge Functions.
// Never use a VITE_ variable for the service-role key.
const url = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const origins = (Deno.env.get('ALLOWED_ORIGINS') || 'https://kostasfot.github.io').split(',').map(value => value.trim()).filter(Boolean)

function failure(error: { code?: string } | null) {
  if (!error) return
  const codes: Record<string, [string, number]> = {
    email_exists: ['email_exists', 409], user_already_exists: ['email_exists', 409],
    weak_password: ['weak_password', 400], same_password: ['same_password', 400],
    '23505': ['athlete_has_account', 409],
  }
  const [code, status] = codes[error.code || ''] || ['service_error', 503]
  throw new AccountError(code, status)
}

Deno.serve(createAccountHandler({
  authenticate: async token => {
    // Verify against Supabase Auth; never authorize from client-supplied JWT claims.
    const { data, error } = await admin.auth.getUser(token)
    return error ? null : data.user?.id || null
  },
  profile: async id => {
    const { data, error } = await admin.from('profiles').select('id,team_id,role,athlete_id,display_name').eq('id', id).maybeSingle()
    failure(error)
    return data as Profile | null
  },
  profiles: async team => {
    const { data, error } = await admin.from('profiles').select('id,team_id,role,athlete_id,display_name').eq('team_id', team).order('role').order('display_name')
    failure(error)
    return data as Profile[]
  },
  account: async id => {
    const { data, error } = await admin.auth.admin.getUserById(id)
    failure(error)
    if (!data.user) throw new AccountError('account_not_found', 404)
    return { id, email: data.user.email || '', createdAt: data.user.created_at, lastSignIn: data.user.last_sign_in_at || null }
  },
  create: async (email, password) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    failure(error)
    if (!data.user) throw new AccountError('service_error', 503)
    return data.user.id
  },
  attach: async profile => {
    const { error } = await admin.from('profiles').insert(profile)
    failure(error)
  },
  remove: async id => {
    const { error } = await admin.auth.admin.deleteUser(id)
    failure(error)
  },
  password: async (id, password) => {
    const { error } = await admin.auth.admin.updateUserById(id, { password })
    failure(error)
  },
}, origins))
