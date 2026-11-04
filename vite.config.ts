import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { cspPlugin } from './scripts/csp.ts'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// GitHub Pages sirve el proyecto en /SALDO/ (repo Antonlopex/SALDO).
// En desarrollo la app cuelga de /; la compilación Y su vista previa (vite preview) usan /SALDO/ como en producción.
export default defineConfig(({ command, isPreview, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
  base: command === 'build' || isPreview ? '/SALDO/' : '/',
  build: {
    // Sin incrustar archivos como data: URI (fuentes incluidas): permite una CSP estricta (font-src 'self') y se precachean igual.
    assetsInlineLimit: 0,
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    cspPlugin(env.VITE_SUPABASE_URL), // CSP estricta solo en la compilación (en desarrollo rompería el HMR)
    vue(),
    tailwindcss(),
    VitePWA({
      // «prompt»: la versión nueva queda en espera hasta que TÚ pulses «Actualizar» (no se recarga sola mientras escribes un gasto).
      registerType: 'prompt',
      injectRegister: false, // se registra desde src/lib/pwa.ts
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'SALDO',
        short_name: 'SALDO',
        description: 'Tus finanzas personales y tu ahorro, también sin conexión.',
        lang: 'es',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#101820',
        theme_color: '#101820',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android/escritorio: pulsación larga sobre el icono. iOS ignora los accesos directos del manifest.
        shortcuts: [
          { name: 'Nuevo gasto', short_name: 'Gasto', description: 'Registrar un gasto al instante', url: 'nuevo-gasto', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Nuevo ingreso', short_name: 'Ingreso', description: 'Registrar un ingreso al instante', url: 'nuevo-ingreso', icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // Cualquier ruta de la app (p. ej. /SALDO/nuevo-gasto) sin conexión sirve el index precacheado.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Sin skipWaiting/clientsClaim: la actualización la decide el usuario.
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    // Margen para máquinas lentas o saturadas (CI): PGlite y los scripts con tsx tardan en arrancar.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    include: ['src/**/*.test.ts', 'tests/db/**/*.test.ts', 'tests/sync/**/*.test.ts', 'tests/backup/**/*.test.ts', 'tests/build/**/*.test.ts'],
  },
  }
})
