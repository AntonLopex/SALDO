import type { Plugin } from 'vite'

/**
 * Política de seguridad de contenido (CSP) de SALDO.
 * GitHub Pages no permite cabeceras HTTP, así que se incluye como <meta> en index.html (solo en la compilación).
 *  - script-src 'self'  → no se ejecuta ningún script en línea ni de otros dominios (frena inyecciones XSS).
 *  - connect-src        → la app solo habla consigo misma y con TU proyecto de Supabase (dominio exacto, no *.supabase.co).
 *  - frame-ancestors NO se puede fijar desde un <meta>; es una limitación conocida de Pages (documentada en docs/TESTING.md).
 */
export function buildCsp(supabaseUrl?: string): string {
  let supabaseOrigin = ''
  try {
    if (supabaseUrl) supabaseOrigin = new URL(supabaseUrl).origin
  } catch {
    /* URL no válida: sin acceso a la nube */
  }
  if (supabaseOrigin && !supabaseOrigin.startsWith('https://')) supabaseOrigin = ''
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${supabaseOrigin ? ' ' + supabaseOrigin : ''}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

export function cspPlugin(supabaseUrl?: string): Plugin {
  return {
    name: 'saldo-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tags =
          `<meta http-equiv="Content-Security-Policy" content="${buildCsp(supabaseUrl)}" />\n    ` +
          '<meta name="referrer" content="no-referrer" />\n    '
        return html.replace('<head>', `<head>\n    ${tags.trimEnd()}`)
      },
    },
  }
}
