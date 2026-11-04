import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { authErrorMessage } from './authErrors'
import { classifyKey } from './supabaseKey'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role, iss: 'supabase' })}.firma`

describe('classifyKey', () => {
  it('reconoce la clave pública y rechaza la de servicio', () => {
    expect(classifyKey(jwt('anon'))).toBe('public')
    expect(classifyKey(jwt('service_role'))).toBe('secret')
    expect(classifyKey('sb_publishable_abc123')).toBe('public')
    expect(classifyKey('sb_secret_abc123')).toBe('secret')
  })
  it('lo desconocido no se da por válido ni por secreto', () => {
    expect(classifyKey('no-es-una-clave')).toBe('unknown')
    expect(classifyKey('')).toBe('unknown')
    expect(classifyKey('a.%%%.c')).toBe('unknown')
  })
})

describe('authErrorMessage', () => {
  it.each([
    [{ code: 'invalid_credentials' }, /incorrectos/],
    [{ code: 'email_not_confirmed' }, /confirmado tu correo/],
    [{ code: 'user_already_exists' }, /Ya existe/],
    [{ code: 'weak_password' }, /débil/],
    [{ code: 'over_request_rate_limit' }, /Demasiados intentos/],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, /Sin conexión/],
    [{ message: 'Invalid login credentials' }, /incorrectos/],
    [{ status: 429 }, /Demasiados intentos/],
    [null, /No se pudo completar/],
    [{ code: 'algo_raro', message: 'detalle interno' }, /No se pudo completar/],
  ])('%j', (err, re) => expect(authErrorMessage(err)).toMatch(re))

  it('no filtra detalles internos al usuario', () => {
    expect(authErrorMessage({ code: 'x', message: 'select * from auth.users' })).not.toMatch(/auth\.users/)
  })
})

/** Guardia de seguridad: ningún código del frontend puede mencionar claves de servicio. */
describe('el frontend no incluye secretos', () => {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|vue|js|html)$/.test(n)) files.push(p)
    }
  }
  walk(join(process.cwd(), 'src'))
  walk(join(process.cwd(), 'public'))
  files.push(join(process.cwd(), 'index.html'))

  it('no usa variables VITE_ con claves de servicio ni las menciona', () => {
    const offenders = files
      .filter((f) => !f.endsWith('supabase.test.ts') && !f.endsWith('supabaseKey.ts') && !f.endsWith('AccountView.vue'))
      .filter((f) => /service_role|SERVICE_ROLE|sb_secret_/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
  it('.env y similares están ignorados por git', () => {
    const ignore = readFileSync(join(process.cwd(), '.gitignore'), 'utf8')
    expect(ignore).toMatch(/^\.env$/m)
    expect(ignore).toMatch(/^\.env\.\*$/m)
  })
  it('.env.example no contiene valores', () => {
    const ex = readFileSync(join(process.cwd(), '.env.example'), 'utf8')
    for (const l of ex.split('\n').filter((x) => /^VITE_/.test(x))) expect(l.split('=')[1]).toBe('')
  })
})
