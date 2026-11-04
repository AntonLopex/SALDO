import type { Session } from '@supabase/supabase-js'
import { computed, ref } from 'vue'
import { authErrorMessage } from './authErrors'
import { supabase } from './supabase'

export const session = ref<Session | null>(null)
export const authReady = ref(false)
export const userEmail = computed(() => session.value?.user.email ?? null)

export interface AuthResult {
  ok: boolean
  message: string
}

let started = false
/** Recupera la sesión guardada y se mantiene al día. Sin Supabase configurado no hace nada. */
export async function initAuth(): Promise<void> {
  if (started) return
  started = true
  if (!supabase) {
    authReady.value = true
    return
  }
  try {
    const { data } = await supabase.auth.getSession()
    session.value = data.session
  } catch {
    /* sin red al arrancar: la sesión guardada se reintentará sola */
  } finally {
    authReady.value = true
  }
  supabase.auth.onAuthStateChange((_event, s) => {
    session.value = s
  })
}

const NO_BACKEND: AuthResult = { ok: false, message: 'Supabase no está configurado en esta instalación.' }

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return NO_BACKEND
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? { ok: false, message: authErrorMessage(error) } : { ok: true, message: 'Sesión iniciada.' }
  } catch (e) {
    return { ok: false, message: authErrorMessage(e) }
  }
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return NO_BACKEND
  try {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
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
  if (!supabase) return NO_BACKEND
  try {
    const { error } = await supabase.auth.signOut()
    return error ? { ok: false, message: authErrorMessage(error) } : { ok: true, message: 'Sesión cerrada.' }
  } catch (e) {
    return { ok: false, message: authErrorMessage(e) }
  }
}
