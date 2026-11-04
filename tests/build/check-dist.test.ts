// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Pone a prueba el propio verificador de seguridad: debe PASAR con el build real y FALLAR ante cada
 * problema concreto. Si este test no existe, un verificador roto diría «OK» sin que nadie lo notara.
 * Requiere haber ejecutado `npm run build` antes (el workflow de despliegue lo hace).
 */
const hasDist = existsSync('dist/sw.js')
let tmp = ''
afterEach(() => tmp && rmSync(tmp, { recursive: true, force: true }))

function copyDist(): string {
  tmp = mkdtempSync(join(tmpdir(), 'saldo-dist-'))
  cpSync('dist', tmp, { recursive: true })
  return tmp
}
function check(dir: string): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync('node', ['scripts/check-dist.mjs', dir], { encoding: 'utf8' }) }
  } catch (e) {
    const err = e as { status: number; stderr: string }
    return { code: err.status, out: err.stderr }
  }
}
const firstJs = (dir: string) => join(dir, 'assets', readdirSync(join(dir, 'assets')).find((f) => f.endsWith('.js'))!)

describe.skipIf(!hasDist)('verificador de dist', () => {
  it('pasa con el build real', () => {
    expect(check('dist')).toMatchObject({ code: 0 })
  })
  it.each([
    ['clave secreta de Supabase', 'const k="sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0K1l2"', /sb_secret_/],
    ['clave privada age', 'const k="AGE-SECRET-KEY-1' + 'Q'.repeat(58) + '"', /clave privada age/],
    ['token de GitHub', 'const t="ghp_' + 'a'.repeat(36) + '"', /token de GitHub/],
    ['clave PEM', 'const p="-----BEGIN PRIVATE KEY-----"', /PEM/],
  ])('detecta: %s', (_n, injected, re) => {
    const d = copyDist()
    writeFileSync(firstJs(d), readFileSync(firstJs(d), 'utf8') + '\n' + injected)
    const r = check(d)
    expect(r.code).toBe(1)
    expect(r.out).toMatch(re)
  })
  it('detecta un JWT con rol service_role (y no uno anon)', () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.firmafirmafirma`
    const d = copyDist()
    writeFileSync(firstJs(d), readFileSync(firstJs(d), 'utf8') + `\nconst a="${jwt('anon')}"`)
    expect(check(d).code).toBe(0)
    writeFileSync(firstJs(d), readFileSync(firstJs(d), 'utf8') + `\nconst s="${jwt('service_role')}"`)
    const r = check(d)
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/service_role/)
  })
  it('detecta archivos sensibles, sourcemaps y piezas PWA que faltan', () => {
    let d = copyDist()
    writeFileSync(join(d, '.env'), 'X=1')
    expect(check(d).out).toMatch(/sensible/)
    rmSync(d, { recursive: true }); d = copyDist()
    writeFileSync(join(d, 'assets', 'x.js.map'), '{}')
    expect(check(d).out).toMatch(/sourcemaps/)
    rmSync(d, { recursive: true }); d = copyDist()
    rmSync(join(d, 'sw.js'))
    expect(check(d).out).toMatch(/Falta .*sw\.js/)
    rmSync(d, { recursive: true }); d = copyDist()
    rmSync(join(d, '404.html'))
    expect(check(d).code).toBe(1)
  })
  it('detecta un manifest sin icono maskable', () => {
    const d = copyDist()
    const p = join(d, 'manifest.webmanifest')
    const m = JSON.parse(readFileSync(p, 'utf8'))
    m.icons = m.icons.filter((i: { purpose?: string }) => i.purpose !== 'maskable')
    writeFileSync(p, JSON.stringify(m))
    expect(check(d).out).toMatch(/maskable/)
  })

  describe('política de seguridad de contenido', () => {
    const CSP_RE = /(http-equiv="Content-Security-Policy" content=")([^"]*)(")/
    const withCsp = (fn: (csp: string) => string) => {
      const d = copyDist()
      const idx = join(d, 'index.html')
      const html = readFileSync(idx, 'utf8')
      const next = html.replace(CSP_RE, (_m, a, csp, c) => a + fn(csp) + c)
      writeFileSync(idx, next)
      writeFileSync(join(d, '404.html'), next) // 404.html debe seguir siendo copia
      return check(d)
    }
    it('exige que exista', () => {
      const d = copyDist()
      const html = readFileSync(join(d, 'index.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
      writeFileSync(join(d, 'index.html'), html)
      writeFileSync(join(d, '404.html'), html)
      expect(check(d).out).toMatch(/no incluye la Content-Security-Policy/)
    })
    it.each([
      ["script-src 'self'", "script-src 'self' 'unsafe-inline'", /unsafe-/],
      ["script-src 'self'", "script-src 'self' 'unsafe-eval'", /unsafe-/],
      ["script-src 'self'", "script-src 'self' https://cdn.evil.example", /script-src debe ser exactamente/],
      ["object-src 'none'", "object-src 'self'", /object-src/],
      ["default-src 'self'", "default-src *", /comodines/],
    ])('detecta el debilitamiento %s → %s', (from, to, re) => {
      const r = withCsp((csp) => csp.replace(from, to))
      expect(r.code).toBe(1)
      expect(r.out).toMatch(re)
    })
    it('connect-src solo admite tu dominio de Supabase, no otros', () => {
      expect(withCsp((csp) => csp.replace(/connect-src [^;]*/, "connect-src 'self' https://abc.supabase.co")).code).toBe(0)
      const bad = withCsp((csp) => csp.replace(/connect-src [^;]*/, "connect-src 'self' https://evil.example"))
      expect(bad.code).toBe(1)
      expect(bad.out).toMatch(/connect-src/)
      expect(withCsp((csp) => csp.replace(/connect-src [^;]*/, "connect-src 'self' https://a.supabase.co https://b.supabase.co")).code).toBe(1)
    })
    it('detecta un script en línea en index.html', () => {
      const d = copyDist()
      const idx = join(d, 'index.html')
      const html = readFileSync(idx, 'utf8').replace('</head>', '<script>alert(1)</script></head>')
      writeFileSync(idx, html)
      writeFileSync(join(d, '404.html'), html)
      const r = check(d)
      expect(r.code).toBe(1)
      expect(r.out).toMatch(/script en línea/)
    })
  })
})
