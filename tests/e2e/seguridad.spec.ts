import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { buildBackup, type BackupData } from '../../src/data/backup/format'
import { dataReady, fillExpense, saveExpense, skipWelcome } from './helpers'

const EVIL = `<img src=x onerror="window.__xss=1">`

test.beforeEach(async ({ page }) => {
  await skipWelcome(page)
  await page.addInitScript(() => { (navigator as unknown as { canShare: () => boolean }).canShare = () => false })
})

async function exportBackup(page: Page) {
  await page.goto('ajustes/copias')
  await dataReady(page)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar copia completa/ }).click()])
  return JSON.parse(readFileSync((await dl.path())!, 'utf8')) as { data: BackupData }
}

test.describe('política de seguridad de contenido (CSP) en el sitio servido', () => {
  test('la CSP está activa: bloquea scripts en línea y conexiones a dominios no previstos', async ({ page }) => {
    const csp: string[] = []
    page.on('console', (m) => /Content Security Policy/i.test(m.text()) && csp.push(m.text()))
    await page.goto('./')
    await dataReady(page)

    const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(meta).toContain("script-src 'self'")
    expect(meta).not.toMatch(/unsafe-/)

    // Un script inyectado en línea NO debe ejecutarse
    const ran = await page.evaluate(() => {
      const s = document.createElement('script')
      s.textContent = 'window.__pwn = 1'
      document.head.append(s)
      return (window as unknown as { __pwn?: number }).__pwn === 1
    })
    expect(ran).toBe(false)

    // Una conexión a un dominio ajeno NO debe salir del navegador
    const result = await page.evaluate(() => fetch('https://example.com/').then(() => 'permitida', () => 'bloqueada'))
    expect(result).toBe('bloqueada')
    await expect.poll(() => csp.some((t) => /connect-src/.test(t))).toBe(true) // bloqueada por la CSP, no por casualidad de red
  })

  test('sin sesión no se guarda ningún token ni cookie; solo claves propias de la app', async ({ page, context }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    expect(await context.cookies()).toEqual([])
    const keys = await page.evaluate(() => Object.keys(localStorage))
    for (const k of keys) expect(k).toMatch(/^saldo-|^sb-.*-auth-token-code-verifier$/)
    const text = await page.evaluate(() => JSON.stringify({ ...localStorage }))
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./) // ningún JWT
  })
})

test.describe('datos hostiles: un nombre de categoría con HTML no ejecuta nada', () => {
  test('copia importada con checksum VÁLIDO y categoría maliciosa: se muestra como texto', async ({ page }) => {
    // Un gasto, para que exista una porción en el gráfico de categorías
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { chip: '5 €', category: 'Café' })
    await saveExpense(page)
    await expect(page.getByText('Guardado')).toBeVisible()

    // Se fabrica una copia válida (checksum recalculado) con el nombre malicioso en la categoría «Restauración»
    const real = await exportBackup(page)
    const cats = real.data.categories.map((c) => (c.name === 'Restauración' ? { ...c, name: EVIL } : c))
    const forged = await buildBackup({ ...real.data, categories: cats }, 'device')
    expect(forged.data.categories.some((c) => c.name === EVIL)).toBe(true)

    await page.goto('ajustes/copias')
    await page.locator('input[type=file]').setInputFiles({ name: 'hostil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)) })
    await expect(page.getByText('Archivo íntegro y válido')).toBeVisible() // la validación estructural NO es una defensa contra HTML
    await page.getByLabel('Entiendo y quiero restaurar').check()
    await page.getByRole('button', { name: 'Restaurar copia' }).click()
    await expect(page.getByText(/Copia restaurada/)).toBeVisible()

    // Recorre las pantallas donde aparece el nombre y comprueba que es texto literal, no un elemento
    for (const r of ['ajustes/categorias', 'movimientos', 'estadisticas', 'nuevo-gasto']) {
      await page.goto(r)
      await dataReady(page)
      await page.waitForTimeout(400)
      expect(await page.locator('img[src="x"]').count(), `en ${r}`).toBe(0)
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss), `en ${r}`).toBeUndefined()
    }
    await page.goto('ajustes/categorias')
    await expect(page.getByRole('heading', { name: EVIL })).toBeVisible() // visible como texto
  })

  test('el tooltip del gráfico de categorías escapa el nombre al pasar el dedo/ratón', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { chip: '5 €', category: 'Café' })
    await saveExpense(page)
    const real = await exportBackup(page)
    const forged = await buildBackup({ ...real.data, categories: real.data.categories.map((c) => (c.name === 'Restauración' ? { ...c, name: EVIL } : c)) }, 'device')
    await page.goto('ajustes/copias')
    await page.locator('input[type=file]').setInputFiles({ name: 'hostil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)) })
    await page.getByLabel('Entiendo y quiero restaurar').check()
    await page.getByRole('button', { name: 'Restaurar copia' }).click()
    await expect(page.getByText(/Copia restaurada/)).toBeVisible()

    await page.goto('estadisticas')
    await dataReady(page)
    const chart = page.getByRole('img', { name: 'Gráfico de gastos por categoría' })
    await expect(chart).toBeVisible()
    await page.waitForTimeout(900) // animación del gráfico
    const box = (await chart.boundingBox())!
    // Anillo del donut: radio exterior = 82 % de la mitad del lado menor; el medio del anillo ≈ 70 %
    const r = (Math.min(box.width, box.height) / 2) * 0.7
    await page.mouse.move(box.x + box.width / 2 + r, box.y + box.height / 2)
    await page.mouse.move(box.x + box.width / 2 + r + 2, box.y + box.height / 2 + 1)
    await expect(chart.getByText(/<img src=x/)).toBeVisible() // el tooltip muestra el nombre como TEXTO
    expect(await page.locator('img[src="x"]').count()).toBe(0)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })
})
