// Comprobación de la compilación (PWA + seguridad). Se ejecuta tras `npm run build`, también en el despliegue.
//   node scripts/check-dist.mjs [carpeta]      (por defecto: dist)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const errors = []
const fail = (m) => errors.push(m)
const need = (f) => {
  if (!existsSync(join(dist, f))) fail(`Falta ${dist}/${f}`)
}

// 1) Archivos imprescindibles de la PWA y de GitHub Pages
for (const f of ['index.html', '404.html', 'manifest.webmanifest', 'sw.js', 'favicon.svg', 'apple-touch-icon.png']) need(f)

// 2) El 404.html debe ser la app (así /nuevo-gasto abre directamente en GitHub Pages)
if (existsSync(join(dist, 'index.html')) && existsSync(join(dist, '404.html'))) {
  if (readFileSync(join(dist, 'index.html'), 'utf8') !== readFileSync(join(dist, '404.html'), 'utf8')) fail('404.html no es copia de index.html')
}

// 3) Manifest coherente con el despliegue
if (existsSync(join(dist, 'manifest.webmanifest'))) {
  const m = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8'))
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color']) if (!m[k]) fail(`manifest: falta «${k}»`)
  if (m.display !== 'standalone') fail('manifest: display debe ser standalone')
  const sizes = new Set((m.icons ?? []).map((i) => `${i.sizes}:${i.purpose ?? 'any'}`))
  for (const s of ['192x192:any', '512x512:any', '512x512:maskable']) if (!sizes.has(s)) fail(`manifest: falta el icono ${s}`)
  for (const i of m.icons ?? []) if (!existsSync(join(dist, i.src))) fail(`manifest: no existe el icono ${i.src}`)
}

// 4) index.html: base correcta, manifest enlazado, sin rutas absolutas a la raíz del dominio
if (existsSync(join(dist, 'index.html'))) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  if (!html.includes('/SALDO/')) fail('index.html no usa la base /SALDO/')
  if (!/rel="manifest"/.test(html)) fail('index.html no enlaza el manifest')
  if (!/apple-touch-icon/.test(html)) fail('index.html no enlaza el icono de Apple')
  if (/(src|href)="\/(?!SALDO\/)[^"/]/.test(html)) fail('index.html tiene rutas absolutas fuera de /SALDO/')
}

// 5) El service worker precachea el index (navegación sin conexión) y no cachea llamadas a la API
if (existsSync(join(dist, 'sw.js'))) {
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
  if (!/index\.html/.test(sw)) fail('sw.js no precachea index.html')
  if (/supabase\.co/.test(sw)) fail('sw.js menciona supabase.co: las llamadas a la API no deben cachearse')
}

// 6) Ningún secreto REAL en lo que se publica. Se buscan VALORES de claves, no palabras: el código de la app y la
//    librería de cifrado mencionan prefijos como «sb_secret_» o «AGE-SECRET-KEY-» de forma legítima.
const SECRET_VALUES = [
  [/sb_secret_[A-Za-z0-9_-]{20,}/, 'clave secreta de Supabase (sb_secret_…)'],
  [/AGE-SECRET-KEY-1[0-9A-Z]{50,}/, 'clave privada age'],
  [/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'clave privada PEM'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'token de GitHub'],
]
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g

function scan(path, text) {
  for (const [re, name] of SECRET_VALUES) if (re.test(text)) fail(`Posible ${name} en ${path}`)
  for (const m of text.matchAll(JWT)) {
    try {
      const role = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')).role
      if (role === 'service_role') fail(`JWT con rol service_role en ${path}`)
    } catch {
      /* no era un JWT */
    }
  }
}

function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(js|css|html|json|webmanifest|svg|map|txt)$/.test(n)) scan(p, readFileSync(p, 'utf8'))
    else if (/\.(env|age|pem|key)$/.test(n) || n.startsWith('.env')) fail(`Archivo sensible publicado: ${p}`)
  }
}

if (existsSync(dist)) {
  walk(dist)
  if (readdirSync(dist, { recursive: true }).some((f) => String(f).endsWith('.map'))) fail('Hay sourcemaps publicados')
} else {
  fail(`No existe ${dist}/: ejecuta antes npm run build`)
}

if (errors.length) {
  console.error('✗ Comprobación de dist FALLIDA:\n' + errors.map((e) => ' - ' + e).join('\n'))
  process.exit(1)
}
console.log('✓ dist correcto: PWA completa, base /SALDO/, 404.html de respaldo, sin secretos ni sourcemaps.')
