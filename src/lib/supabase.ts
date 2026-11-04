import type { SupabaseClient } from '@supabase/supabase-js'
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

let client: Promise<SupabaseClient> | null = null

/**
 * El cliente de Supabase (~57 KB comprimidos) se carga SOLO cuando hace falta: al restaurar una sesión guardada,
 * al iniciar sesión o al sincronizar. Quien usa la app sin cuenta nunca lo descarga.
 * Devuelve null si no hay una configuración válida: la app funciona igualmente en local.
 */
export function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured) return Promise.resolve(null)
  client ??= import('@supabase/supabase-js').then((m) =>
    m.createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }),
  )
  return client
}

/** ¿Hay una sesión de Supabase guardada en este navegador? (Se mira sin cargar la librería.) */
export function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k))
  } catch {
    return false
  }
}
