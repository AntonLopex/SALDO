import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { computed, ref } from 'vue'
import { authErrorMessage } from './authErrors'
import { getSupabase, hasStoredSession, isSupabaseConfigured } from './supabase'

export const session = ref<Session | null>(null)
export const authReady = ref(false)
export const userEmail = computed(() => session.value?.user.email ?? null)

export interface AuthResult {
  ok: boolean
  message: string
}

let started = false
let listening = false

/** Carga el cliente (la primera vez) y engancha el seguimiento de la sesión. */
async function client(): Promise<SupabaseClient | null> {
  const sb = await getSupabase()
  if (sb && !listening) {
    listening = true
    sb.auth.onAuthStateChange((_event, s) => {
      session.value = s
    })
  }
  return sb
}

/**
 * Recupera la sesión guardada. Sin Supabase configurado, o sin sesión guardada, NO se descarga la librería de la nube:
 * se queda en modo local y se cargará solo si el usuario inicia sesión.
 */
export async function initAuth(): Promise<void> {
  if (started) return
  started = true
  if (!isSupabaseConfigured || !hasStoredSession()) {
    authReady.value = true
    return
  }
  try {
    const sb = await client()
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } }
    session.value = data.session
  } catch {
    /* sin red al arrancar: la sesión guardada se reintentará sola */
  } finally {
    authReady.value = true
  }
}

const NO_BACKEND: AuthResult = { ok: false, message: 'Supabase no está configurado en esta instalación.' }

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const sb = await client()
    if (!sb) return NO_BACKEND
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
    return error ? { ok: false, message: authErrorMessage(error) } : { ok: true, message: 'Sesión iniciada.' }
  } catch (e) {
    return { ok: false, message: authErrorMessage(e) }
  }
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  try {
    const sb = await client()
    if (!sb) return NO_BACKEND
    const { data, error } = await sb.auth.signUp({ email: email.trim(), password })
    if (error) return { ok: false, message: authErrorMessage(error) }
    // Sin sesión inmediata = el proyecto exige confirmar el correo.
    return data.session
      ? { ok: true, message: 'Cuenta creada.' }
      : { ok: true, message: 'Te hemos enviado un correo para confirmar la cuenta. Después, inicia sesión.' }
  } catch (e) {
    return { ok: false, message: authErrorMessage(e) }
  }
}

export async function signOut(): Promise<AuthResult> {
  try {
    const sb = await client()
    if (!sb) return NO_BACKEND
    const { error } = await sb.auth.signOut()
    return error ? { ok: false, message: authErrorMessage(error) } : { ok: true, message: 'Sesión cerrada.' }
  } catch (e) {
    return { ok: false, message: authErrorMessage(e) }
  }
}
