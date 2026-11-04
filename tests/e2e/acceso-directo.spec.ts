import { expect, test, type Page } from '@playwright/test'
import { dataReady, serviceWorkerReady, skipWelcome } from './helpers'

/**
 * Accesos directos de iOS (Atajos, iconos de la pantalla de inicio): /nuevo-gasto, /nuevo-ingreso y sus parámetros.
 * Regla principal: los enlaces RELLENAN el formulario, jamás guardan.
 * Ninguna de estas pruebas pasa por la bienvenida: un atajo debe abrir el formulario aunque sea la primera vez.
 */
const chip = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const amount = (page: Page) => page.getByLabel('Importe en euros')

/** Movimientos reales guardados (lee IndexedDB directamente, sin pasar por la interfaz). */
const savedCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((res) => {
        const o = indexedDB.open('saldo')
        o.onsuccess = () => {
          const g = o.result.transaction('transactions').objectStore('transactions').getAll()
          g.onsuccess = () => { o.result.close(); res((g.result as { kind: string }[]).filter((t) => t.kind !== 'opening').length) }
        }
      }),
  )

test.describe('/nuevo-ingreso (un icono por acción)', () => {
  test('abre directamente en «Ingreso», sin bienvenida ni categorías, con el importe enfocado', async ({ page }) => {
    await page.goto('nuevo-ingreso')
    await dataReady(page)
    await expect(page.getByRole('heading', { name: 'Nuevo ingreso' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Ingreso' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Categoría', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Mi patrimonio')).toHaveCount(0)
    await expect(amount(page)).toBeFocused()
  })

  test('un ingreso se registra con dos toques: importe y Guardar', async ({ page }) => {
    await page.goto('nuevo-ingreso')
    await dataReady(page)
    await amount(page).fill('1391,50')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Guardado')).toBeVisible()
    await expect(page.getByText(/1\.391,50\s€ · Ingreso/)).toBeVisible()
  })

  test('también se puede volver a Gasto desde ahí', async ({ page }) => {
    await page.goto('nuevo-ingreso')
    await dataReady(page)
    await page.getByRole('radio', { name: 'Gasto' }).click()
    await expect(chip(page, 'Café')).toBeVisible()
  })
})

test.describe('/nuevo-gasto con parámetros: rellenan, no guardan', () => {
  test('importe, categoría (sin tildes) y nota llegan al formulario', async ({ page }) => {
    await page.goto('nuevo-gasto?importe=3,5&categoria=cafe&nota=' + encodeURIComponent('Con leche'))
    await dataReady(page)
    await expect(amount(page)).toHaveValue('3,5')
    // «Café» aparece dos veces (favoritas y subcategorías de Restauración) y en ambos sitios está marcada
    await expect(chip(page, 'Café')).toHaveCount(2)
    for (const c of await chip(page, 'Café').all()) await expect(c).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel(/Descripción/)).toHaveValue('Con leche')
  })

  test('después de abrir el enlace NO hay ningún movimiento guardado; solo se guarda al pulsar Guardar', async ({ page }) => {
    await skipWelcome(page)
    await page.goto('nuevo-gasto?importe=3,5&categoria=cafe')
    await dataReady(page)
    await page.waitForTimeout(1200)
    await expect(page.getByText('Guardado')).toHaveCount(0)
    expect(await savedCount(page)).toBe(0)

    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText(/3,50\s€ · Café/)).toBeVisible()
    expect(await savedCount(page)).toBe(1)
  })

  test('ningún parámetro puede forzar el guardado (guardar, auto, confirmar…)', async ({ page }) => {
    await page.goto('nuevo-gasto?guardar=1&auto=1&confirmar=si&save=true&submit=1&importe=5&categoria=Caf%C3%A9')
    await dataReady(page)
    await page.waitForTimeout(1500)
    await expect(page.getByText('Guardado')).toHaveCount(0)
    expect(await savedCount(page)).toBe(0)
    await expect(amount(page)).toHaveValue('5') // sí rellena lo que es válido
  })

  test('tipo=ingreso con importe', async ({ page }) => {
    await page.goto('nuevo-gasto?tipo=ingreso&importe=1391,50')
    await dataReady(page)
    await expect(page.getByRole('radio', { name: 'Ingreso' })).toHaveAttribute('aria-checked', 'true')
    await expect(amount(page)).toHaveValue('1391,5')
  })

  test('un ingreso ignora la categoría del enlace', async ({ page }) => {
    await page.goto('nuevo-ingreso?categoria=cafe&importe=10')
    await dataReady(page)
    await expect(page.getByText('Categoría', { exact: true })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Gasto' }).click()
    await expect(chip(page, 'Café')).toHaveAttribute('aria-pressed', 'false') // no se coló
  })

  test('valores basura se ignoran sin romper nada: queda el formulario normal', async ({ page }) => {
    await page.goto('nuevo-gasto?tipo=xx&importe=abc&categoria=nope&nota=')
    await dataReady(page)
    await expect(page.getByRole('heading', { name: 'Nuevo gasto' })).toBeVisible()
    await expect(amount(page)).toHaveValue('')
    await expect(chip(page, 'Café')).toHaveAttribute('aria-pressed', 'false')
    await expect(amount(page)).toBeFocused()
  })

  test('importes absurdos o negativos se ignoran', async ({ page }) => {
    for (const v of ['-5', '0', '99999999999', '1e9']) {
      await page.goto('nuevo-gasto?importe=' + v)
      await dataReady(page)
      await expect(amount(page), `importe=${v}`).toHaveValue('')
    }
  })

  test('categoría ambigua no se adivina; «Padre/Sub» la desambigua', async ({ page }) => {
    await page.goto('nuevo-gasto?categoria=Actividades')
    await dataReady(page)
    await expect(page.getByText(/Subcategoría de/)).toHaveCount(0)

    await page.goto('nuevo-gasto?categoria=' + encodeURIComponent('Viajes/Transporte'))
    await dataReady(page)
    await expect(page.getByText('Subcategoría de Viajes')).toBeVisible()
    await expect(chip(page, 'Transporte')).toHaveAttribute('aria-pressed', 'true')
  })

  test('una nota con HTML se muestra como texto y no ejecuta nada', async ({ page }) => {
    const evil = '<img src=x onerror="window.__xss=1">'
    await page.goto('nuevo-gasto?nota=' + encodeURIComponent(evil))
    await dataReady(page)
    await expect(page.getByLabel(/Descripción/)).toHaveValue(evil)
    expect(await page.locator('img[src="x"]').count()).toBe(0)
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  })

  test('el importe está enfocado si no vino en el enlace, y se respeta el foco si ya vino rellenado', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await expect(amount(page)).toBeFocused()
    await page.goto('nuevo-gasto?importe=3')
    await dataReady(page)
    await expect(amount(page)).not.toBeFocused() // el siguiente paso es elegir categoría o guardar
  })

  test('«Añadir otro» deja el formulario limpio: los parámetros no se reaplican', async ({ page }) => {
    await page.goto('nuevo-gasto?importe=3&categoria=cafe')
    await dataReady(page)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Añadir otro' }).click()
    await expect(amount(page)).toHaveValue('')
    await expect(chip(page, 'Café')).toHaveAttribute('aria-pressed', 'false')
  })
})

test.describe('instalación y sin conexión', () => {
  test('el manifest ofrece «Nuevo gasto» y «Nuevo ingreso» como accesos directos', async ({ page }) => {
    const m = await (await page.request.get('manifest.webmanifest')).json()
    expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(['nuevo-gasto', 'nuevo-ingreso'])
    expect(m.scope).toBe('./')
  })

  test('/nuevo-ingreso con parámetros abre y funciona sin conexión', async ({ page, context }) => {
    await page.goto('nuevo-ingreso')
    await dataReady(page)
    await serviceWorkerReady(page)
    await context.setOffline(true)
    await page.goto('nuevo-ingreso?importe=2')
    await expect(page.getByRole('heading', { name: 'Nuevo ingreso' })).toBeVisible()
    await dataReady(page)
    await expect(amount(page)).toHaveValue('2')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Guardado')).toBeVisible()
    await context.setOffline(false)
  })
})
