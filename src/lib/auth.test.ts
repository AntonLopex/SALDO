import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Cliente de Supabase simulado: permite comprobar el flujo de sesión sin tocar la nube. */
function fakeClient(over: Record<string, unknown> = {}) {
  let listener: ((e: string, s: unknown) => void) | null = null
  const auth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1', email: 'yo@x.com' } } } }),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange: vi.fn((cb) => { listener = cb; return { data: { subscription: { unsubscribe() {} } } } }),
    ...over,
  }
  return { client: { auth }, auth, emit: (s: unknown) => listener?.('SIGNED_IN', s) }
}

async function load(opts: { configured?: boolean; stored?: boolean; client?: ReturnType<typeof fakeClient> | null } = {}) {
  vi.resetModules()
  const getSupabase = vi.fn().mockResolvedValue(opts.client === undefined ? fakeClient().client : (opts.client?.client ?? null))
  vi.doMock('./supabase', () => ({
    getSupabase,
    hasStoredSession: () => opts.stored ?? false,
    isSupabaseConfigured: opts.configured ?? true,
  }))
  const auth = await import('./auth')
  return { auth, getSupabase }
}

beforeEach(() => vi.resetModules())

describe('arranque (initAuth): la librería de la nube solo se carga si hace falta', () => {
  it('sin sesión guardada NO se carga el cliente y la app queda lista en modo local', async () => {
    const { auth, getSupabase } = await load({ stored: false })
    await auth.initAuth()
    expect(getSupabase).not.toHaveBeenCalled()
    expect(auth.authReady.value).toBe(true)
    expect(auth.session.value).toBeNull()
  })

  it('sin Supabase configurado tampoco se carga nada', async () => {
    const { auth, getSupabase } = await load({ configured: false, stored: true })
    await auth.initAuth()
    expect(getSupabase).not.toHaveBeenCalled()
    expect(auth.authReady.value).toBe(true)
  })

  it('con sesión guardada recupera la sesión y sigue sus cambios', async () => {
    const fc = fakeClient()
    const { auth, getSupabase } = await load({ stored: true, client: fc })
    await auth.initAuth()
    expect(getSupabase).toHaveBeenCalledTimes(1)
    expect(auth.session.value?.user.email).toBe('yo@x.com')
    expect(auth.userEmail.value).toBe('yo@x.com')
    expect(auth.authReady.value).toBe(true)
    fc.emit(null) // cierre de sesión desde otra pestaña
    expect(auth.session.value).toBeNull()
  })

  it('sin red al arrancar no falla: queda listo y sin sesión (se reintenta solo)', async () => {
    const fc = fakeClient({ getSession: vi.fn().mockRejectedValue(new Error('Failed to fetch')) })
    const { auth } = await load({ stored: true, client: fc })
    await expect(auth.initAuth()).resolves.toBeUndefined()
    expect(auth.authReady.value).toBe(true)
    expect(auth.session.value).toBeNull()
  })

  it('es idempotente: llamarlo varias veces solo restaura una vez', async () => {
    const fc = fakeClient()
    const { auth } = await load({ stored: true, client: fc })
    await auth.initAuth(); await auth.initAuth()
    expect(fc.auth.getSession).toHaveBeenCalledTimes(1)
  })
})

describe('entrar, crear cuenta y salir', () => {
  it('signIn correcto, con el correo recortado', async () => {
    const fc = fakeClient()
    const { auth } = await load({ client: fc })
    expect(await auth.signIn('  yo@x.com ', 'clave-larga-1')).toEqual({ ok: true, message: 'Sesión iniciada.' })
    expect(fc.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'yo@x.com', password: 'clave-larga-1' })
    expect(fc.auth.onAuthStateChange).toHaveBeenCalledTimes(1) // engancha el seguimiento al primer uso
  })

  it('errores de Supabase → mensajes claros en español, sin filtrar detalles', async () => {
    const fc = fakeClient({ signInWithPassword: vi.fn().mockResolvedValue({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } }) })
    const { auth } = await load({ client: fc })
    const r = await auth.signIn('a@b.com', 'mala')
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/incorrectos/)
  })

  it('un corte de red durante el acceso devuelve un mensaje, no una excepción', async () => {
    const fc = fakeClient({ signInWithPassword: vi.fn().mockRejectedValue(Object.assign(new Error('Failed to fetch'), { name: 'AuthRetryableFetchError' })) })
    const { auth } = await load({ client: fc })
    const r = await auth.signIn('a@b.com', 'x')
    expect(r).toMatchObject({ ok: false })
    expect(r.message).toMatch(/Sin conexión/)
  })

  it('signUp sin sesión inmediata pide confirmar el correo; con sesión confirma la cuenta', async () => {
    const pending = await load({ client: fakeClient() })
    expect((await pending.auth.signUp('a@b.com', 'clave-larga-1')).message).toMatch(/correo para confirmar/)
    const direct = await load({ client: fakeClient({ signUp: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }) }) })
    expect(await direct.auth.signUp('a@b.com', 'clave-larga-1')).toEqual({ ok: true, message: 'Cuenta creada.' })
  })

  it('signUp con correo ya registrado', async () => {
    const fc = fakeClient({ signUp: vi.fn().mockResolvedValue({ data: { session: null }, error: { code: 'user_already_exists' } }) })
    const { auth } = await load({ client: fc })
    expect((await auth.signUp('a@b.com', 'clave-larga-1')).message).toMatch(/Ya existe/)
  })

  it('signOut correcto y con error', async () => {
    const ok = await load({ client: fakeClient() })
    expect(await ok.auth.signOut()).toEqual({ ok: true, message: 'Sesión cerrada.' })
    const bad = await load({ client: fakeClient({ signOut: vi.fn().mockResolvedValue({ error: { message: 'x' } }) }) })
    expect((await bad.auth.signOut()).ok).toBe(false)
  })

  it('sin Supabase configurado, las operaciones responden con un aviso claro', async () => {
    const { auth } = await load({ configured: false, client: null })
    for (const r of [await auth.signIn('a@b.com', 'x'), await auth.signUp('a@b.com', 'x'), await auth.signOut()]) {
      expect(r).toEqual({ ok: false, message: 'Supabase no está configurado en esta instalación.' })
    }
  })
})

describe('hasStoredSession (se consulta sin cargar la librería)', () => {
  it('detecta la clave de sesión de Supabase en este navegador', async () => {
    vi.resetModules()
    vi.doUnmock('./supabase')
    const { hasStoredSession } = await import('./supabase')
    localStorage.clear()
    expect(hasStoredSession()).toBe(false)
    localStorage.setItem('saldo-theme', 'dark')
    expect(hasStoredSession()).toBe(false) // otras claves de la app no cuentan
    localStorage.setItem('sb-nkbqsonppmqjhletpvuq-auth-token', '{}')
    expect(hasStoredSession()).toBe(true)
    localStorage.clear()
  })
})
