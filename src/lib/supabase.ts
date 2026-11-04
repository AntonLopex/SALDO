import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { classifyKey } from './supabaseKey'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

export type SupabaseStatus = 'ready' | 'not-configured' | 'forbidden-key'

function status(): SupabaseStatus {
  if (!url || !key || !/^https:\/\/[^/]+/.test(url)) return 'not-configured'
  if (classifyKey(key) === 'secret') return 'forbidden-key' // nunca usar una clave de servicio en el navegador
  return 'ready'
}

export const supabaseStatus: SupabaseStatus = status()
export const isSupabaseConfigured = supabaseStatus === 'ready'

/** null si no hay configuración válida: la app funciona igualmente en local. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
