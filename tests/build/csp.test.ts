// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Plugin } from 'vite'
import { buildCsp, cspPlugin } from '../../scripts/csp'

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(name + ' ')) ?? ''

describe('política de seguridad de contenido', () => {
  it('con tu proyecto: conexión solo a su dominio EXACTO (sin comodines)', () => {
    const csp = buildCsp('https://nkbqsonppmqjhletpvuq.supabase.co')
    expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://nkbqsonppmqjhletpvuq.supabase.co")
    expect(csp).not.toContain('*')
  })
  it('sin nube configurada: la app solo puede hablar consigo misma', () => {
    expect(directive(buildCsp(undefined), 'connect-src')).toBe("connect-src 'self'")
    expect(directive(buildCsp(''), 'connect-src')).toBe("connect-src 'self'")
  })
  it('rechaza URLs no seguras o inválidas (http, basura)', () => {
    expect(directive(buildCsp('http://evil.example'), 'connect-src')).toBe("connect-src 'self'")
    expect(directive(buildCsp('no-es-una-url'), 'connect-src')).toBe("connect-src 'self'")
  })
  it('nunca permite scripts en línea ni eval, ni plugins, ni cambiar la base', () => {
    const csp = buildCsp('https://x.supabase.co')
    expect(directive(csp, 'script-src')).toBe("script-src 'self'")
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline/)
    expect(directive(csp, 'object-src')).toBe("object-src 'none'")
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(directive(csp, 'form-action')).toBe("form-action 'self'")
    expect(directive(csp, 'default-src')).toBe("default-src 'self'")
  })
  it('el plugin inserta la CSP y «no-referrer» al principio del <head>, solo en build', () => {
    const p = cspPlugin('https://x.supabase.co') as Plugin & { transformIndexHtml: { handler: (h: string) => string } }
    expect(p.apply).toBe('build')
    const out = p.transformIndexHtml.handler('<html><head><title>x</title></head></html>')
    expect(out).toMatch(/<head>\s*<meta http-equiv="Content-Security-Policy"/)
    expect(out).toContain('<meta name="referrer" content="no-referrer"')
    expect(out.indexOf('Content-Security-Policy')).toBeLessThan(out.indexOf('<title>'))
  })
})
