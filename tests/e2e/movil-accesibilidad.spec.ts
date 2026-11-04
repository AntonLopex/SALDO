import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { dataReady, fillExpense, saveExpense, skipWelcome } from './helpers'

/** Pantallas a auditar. Se rellenan con datos reales para que listas, gráficos y calendario estén «vivos». */
const ROUTES = [
  './', 'movimientos', 'estadisticas', 'objetivos', 'ajustes', 'ajustes/plan', 'ajustes/categorias',
  'ajustes/copias', 'ajustes/cuenta', 'ajustes/sincronizacion', 'nuevo-gasto',
]

async function seed(page: Page) {
  await skipWelcome(page)
  await page.addInitScript(() => { (navigator as unknown as { canShare: () => boolean }).canShare = () => false })
  await page.goto('nuevo-gasto')
  await dataReady(page)
  await page.getByRole('radio', { name: 'Ingreso' }).click()
  await fillExpense(page, { amount: '1391,50' })
  await saveExpense(page)
  await page.getByRole('button', { name: 'Añadir otro' }).click()
  await page.getByRole('radio', { name: 'Gasto' }).click() // «Añadir otro» conserva el tipo (Ingreso)
  await fillExpense(page, { amount: '3,50', category: 'Café' })
  await page.getByLabel(/Descripción/).fill('café de prueba')
  await saveExpense(page)
  await expect(page.getByText('Guardado')).toBeVisible()
}

async function settle(page: Page, route: string) {
  await page.goto(route)
  await expect(page.locator('main, h1').first()).toBeVisible()
  await page.waitForFunction(() => document.querySelectorAll('.skeleton').length === 0)
  await page.waitForTimeout(400) // transiciones y gráficos
}

test.describe('móvil: sin desbordes y con letra legible', () => {
  for (const width of [320, 375, 390, 430]) {
    test(`ninguna pantalla se desborda en horizontal a ${width}px`, async ({ page }) => {
      await seed(page)
      await page.setViewportSize({ width, height: 800 })
      const bad: string[] = []
      for (const r of ROUTES) {
        await settle(page, r)
        const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
        if (over.sw > over.iw) bad.push(`${r}: contenido ${over.sw}px > pantalla ${over.iw}px`)
      }
      expect(bad).toEqual([])
    })
  }

  test('todos los campos de texto tienen ≥16px (iOS hace zoom al enfocar por debajo)', async ({ page }) => {
    await seed(page)
    const bad: string[] = []
    for (const r of ROUTES) {
      await settle(page, r)
      const found = await page.evaluate(() =>
        [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea')]
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => ({ id: (e as HTMLInputElement).type + ':' + (e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? e.id), px: parseFloat(getComputedStyle(e).fontSize) }))
          .filter((x) => x.px < 16))
      for (const f of found) bad.push(`${r} → ${f.id} (${f.px}px)`)
    }
    expect(bad).toEqual([])
  })

  test('zonas táctiles: botones, enlaces y campos de al menos 44×44 px (guía de Apple)', async ({ page }) => {
    await seed(page)
    const bad: string[] = []
    for (const r of ROUTES) {
      await settle(page, r)
      const found = await page.evaluate(() => {
        const sel = 'a[href], button, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), [role=tab], [role=radio]'
        return [...document.querySelectorAll<HTMLElement>(sel)]
          .filter((el) => !el.closest('.sr-only') && !el.classList.contains('sr-only'))
          .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
          .filter((x) => x.r.width > 2 && x.r.height > 2 && x.cs.visibility !== 'hidden' && x.cs.display !== 'none' && x.cs.opacity !== '0')
          .filter((x) => x.r.height < 43.5 || x.r.width < 43.5)
          .map((x) => `${x.el.tagName.toLowerCase()} «${(x.el.getAttribute('aria-label') ?? x.el.textContent ?? '').trim().slice(0, 28)}» ${Math.round(x.r.width)}×${Math.round(x.r.height)}`)
      })
      for (const f of found) bad.push(`${r} → ${f}`)
    }
    expect(bad).toEqual([])
  })

  test('contenido bajo la barra inferior: la última tarjeta no queda tapada', async ({ page }) => {
    await seed(page)
    await settle(page, 'ajustes')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    const r = await page.evaluate(() => {
      const nav = document.querySelector('nav')!.getBoundingClientRect()
      const cards = [...document.querySelectorAll('main section, main a')]
      const last = cards.at(-1)!.getBoundingClientRect()
      return { navTop: nav.top, lastBottom: last.bottom }
    })
    expect(r.lastBottom).toBeLessThanOrEqual(r.navTop + 1)
  })

  test('el formulario rápido cabe en pantalla pequeña y «Guardar» siempre es visible', async ({ page }) => {
    await skipWelcome(page)
    await page.setViewportSize({ width: 320, height: 568 }) // iPhone SE 1.ª gen.
    await page.goto('nuevo-gasto')
    await dataReady(page)
    const save = page.getByRole('button', { name: 'Guardar', exact: true })
    await expect(save).toBeInViewport()
    const box = (await save.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByLabel('Importe en euros')).toBeInViewport()
  })
})

test.describe('accesibilidad (axe-core, WCAG 2.1 A/AA)', () => {
  test.describe.configure({ timeout: 150_000 }) // recorre 11 pantallas × 2 temas con análisis completo
  for (const scheme of ['light', 'dark'] as const) {
    test(`sin infracciones graves en ninguna pantalla — tema ${scheme}`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', locale: 'es-ES', hasTouch: true, isMobile: true })
      const page = await ctx.newPage()
      await seed(page)
      const report: string[] = []
      for (const r of ROUTES) {
        await settle(page, r)
        const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        for (const v of res.violations) report.push(`${r} [${v.impact}] ${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
      }
      await ctx.close()
      expect(report).toEqual([])
    })
  }

  test('la pantalla de bienvenida y la de error también son accesibles', async ({ page }) => {
    const out: string[] = []
    for (const r of ['bienvenida', 'esto-no-existe']) {
      await page.goto(r)
      await page.waitForTimeout(500)
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      for (const v of res.violations) out.push(`${r} [${v.impact}] ${v.id}: ${v.help}`)
    }
    expect(out).toEqual([])
  })

  test('el teclado puede completar un gasto (orden de foco, Enter, Escape en hojas)', async ({ page }) => {
    await skipWelcome(page)
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await page.getByLabel('Importe en euros').focus()
    await page.keyboard.type('2')
    await page.getByRole('button', { name: 'Más…' }).press('Enter')
    await expect(page.getByRole('dialog', { name: 'Todas las categorías' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Café', exact: true }).first().press('Enter')
    await page.getByLabel('Importe en euros').press('Enter') // enviar el formulario con el teclado
    await expect(page.getByText('Guardado')).toBeVisible()
  })
})
