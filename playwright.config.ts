import { defineConfig } from '@playwright/test'

/**
 * Pruebas funcionales (E2E) sobre la compilación de producción servida con `vite preview` (con service worker real).
 * Usa Google Chrome ya instalado (`channel: 'chrome'`): no descarga navegadores. En CI se instala con
 * `npx playwright install --with-deps chromium` y se pone CHANNEL=chromium.
 *
 * Límite honesto: es Chromium emulando un iPhone (pantalla, táctil), NO Safari/WebKit real. Lo específico de iOS
 * (teclado, hoja de compartir, almacenamiento) se comprueba a mano: ver docs/TESTING.md.
 */
const PORT = 4173
const BASE = `http://localhost:${PORT}/SALDO/`

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: BASE,
    channel: process.env.CHANNEL ?? 'chrome',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    // Determinista por defecto; la animación se prueba aparte
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Rendimiento aparte y SIN paralelismo: sus tiempos se falsean si otras pruebas compiten por la CPU.
  //   npm run test:e2e   → funcionales, accesibilidad y seguridad (en paralelo)
  //   npm run test:perf  → presupuestos de peso y tiempo (de una en una)
  projects: [
    { name: 'funcional', testIgnore: /rendimiento\.spec\.ts/ },
    { name: 'rendimiento', testMatch: /rendimiento\.spec\.ts/, fullyParallel: false },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
