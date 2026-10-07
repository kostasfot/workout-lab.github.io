import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const cloud = url && key ? createClient(url, key) : null
export interface Identity { userId: string; teamId: string; role: 'coach' | 'athlete'; athleteId: 'anna' | 'dimitra' | null }
export const localIdentity: Identity = { userId: 'local', teamId: 'local', role: 'coach', athleteId: null }
export const identityScope = (identity: Identity) => `${identity.teamId}:${identity.userId}`
