import { expect, test, type Page } from '@playwright/test'
import { dataReady, fillExpense, saveExpense, skipWelcome } from './helpers'

/**
 * Tarjeta «Ingresos previstos pendientes» y el ahorro del mes sin ingresos.
 * Con el plan por defecto: Trabajo principal 1.391,50 € (todo el año) y Entrenador de fútbol 400 € (septiembre a junio).
 * En julio y agosto no hay fútbol: las comprobaciones se adaptan al mes en que se ejecuta la prueba.
 */
const FOOTBALL = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6].includes(new Date().getMonth() + 1)
const pendingCard = (page: Page) => page.getByRole('region', { name: 'Ingresos previstos pendientes' })

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

test.beforeEach(async ({ page }) => skipWelcome(page))

test.describe('ahorro del mes sin ingresos', () => {
  test('no muestra un «−23,40 €» alarmante: explica que falta registrar ingresos', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { amount: '23,40', category: 'Café' })
    await saveExpense(page)
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)

    // El gasto sí se ve; el ahorro no se calcula todavía
    await expect(page.getByText(/23,40\s€/).first()).toBeVisible()
    await expect(page.getByText('Sin ingresos registrados este mes: el ahorro se calcula al registrarlos.')).toBeVisible()
    const ahorro = page.getByText('Ahorro', { exact: true }).locator('xpath=following-sibling::dd')
    await expect(ahorro).toHaveText('—')
    await expect(page.getByText(/Ahorras el/)).toHaveCount(0)
  })

  test('al registrar un ingreso, el ahorro vuelve a calcularse (ingresos − gastos)', async ({ page }) => {
    await page.goto('nuevo-ingreso')
    await dataReady(page)
    await page.getByLabel('Importe en euros').fill('1391,50')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)
    const ahorro = page.getByText('Ahorro', { exact: true }).locator('xpath=following-sibling::dd')
    await expect(ahorro).toHaveText(/\+1\.391,50\s€/)
    await expect(page.getByText(/Ahorras el 100 %/)).toBeVisible()
  })
})

test.describe('tarjeta de ingresos previstos pendientes', () => {
  test('al empezar el mes aparecen los ingresos previstos con su importe', async ({ page }) => {
    await page.goto('./')
    await dataReady(page)
    const card = pendingCard(page)
    await expect(card).toBeVisible()
    await expect(card.getByText('Trabajo principal')).toBeVisible()
    await expect(card.getByText(/1\.391,50\s€/)).toBeVisible()
    await expect(card.getByText('Entrenador de fútbol')).toHaveCount(FOOTBALL ? 1 : 0)
    await expect(card.getByText('No se apunta nada hasta que pulses Guardar.')).toBeVisible()
  })

  test('«Registrar» abre el ingreso ya relleno y NO guarda nada hasta pulsar Guardar', async ({ page }) => {
    await page.goto('./')
    await dataReady(page)
    await page.getByRole('link', { name: 'Registrar ingreso: Trabajo principal' }).click()

    await expect(page.getByRole('heading', { name: 'Nuevo ingreso' })).toBeVisible()
    await expect(page.getByLabel('Importe en euros')).toHaveValue('1391,5')
    await expect(page.getByLabel(/Descripción/)).toHaveValue('Trabajo principal')
    await page.waitForTimeout(800)
    expect(await savedCount(page)).toBe(0) // rellenar no es guardar

    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText(/1\.391,50\s€ · Ingreso/)).toBeVisible()
    expect(await savedCount(page)).toBe(1)
  })

  test('cada ingreso registrado desaparece de la lista; al terminar, la tarjeta se va', async ({ page }) => {
    // Registra el trabajo principal
    await page.goto('nuevo-ingreso?importe=1391,50&nota=Trabajo%20principal')
    await dataReady(page)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)

    if (FOOTBALL) {
      const card = pendingCard(page)
      await expect(card.getByText('Trabajo principal')).toHaveCount(0)
      await expect(card.getByText('Entrenador de fútbol')).toBeVisible()
      await expect(card.getByText(/400,00\s€/)).toBeVisible()

      await page.getByRole('link', { name: 'Registrar ingreso: Entrenador de fútbol' }).click()
      await expect(page.getByLabel('Importe en euros')).toHaveValue('400')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await page.getByRole('button', { name: 'Abrir SALDO' }).click()
      await dataReady(page)
    }
    await expect(pendingCard(page)).toHaveCount(0)
  })

  test('un ingreso registrado por el total junto (1.791,50 €) también cierra los dos pendientes', async ({ page }) => {
    test.skip(!FOOTBALL, 'sin fútbol este mes el total previsto es otro')
    await page.goto('nuevo-ingreso?importe=1791,50')
    await dataReady(page)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)
    await expect(pendingCard(page)).toHaveCount(0)
  })

  test('un cobro parcial deja pendiente solo lo que falta', async ({ page }) => {
    await page.goto('nuevo-ingreso?importe=1000')
    await dataReady(page)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)
    await expect(pendingCard(page).getByText(/391,50\s€/)).toBeVisible() // 1.391,50 − 1.000
  })

  test('la previsión y la tarjeta no se contradicen: registrar lo pendiente no cambia la previsión de fin de mes', async ({ page }) => {
    await page.goto('./')
    await dataReady(page)
    const antes = await page.getByText(/^≈\s/).first().innerText() // «Fin de este mes»
    await page.getByRole('link', { name: 'Registrar ingreso: Trabajo principal' }).click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)
    const despues = await page.getByText(/^≈\s/).first().innerText()
    expect(despues).toBe(antes) // el ingreso previsto ya estaba contado en la previsión
  })
})

test.describe('reembolsos: un ingreso con categoría descuenta del gasto y del presupuesto', () => {
  test('viaje de 1.000 € y la pareja devuelve 500 €: el presupuesto se recalcula', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { amount: '1000', category: 'Café' })
    await saveExpense(page)
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)
    await expect(page.getByText(/Superado en 210,00\s€/)).toBeVisible()

    // El reembolso: ingreso de 500 € con la categoría del gasto
    await page.goto('nuevo-ingreso')
    await dataReady(page)
    await page.getByRole('radio', { name: 'Reembolso' }).click()
    await page.getByLabel('Importe en euros').fill('500')
    await page.getByRole('button', { name: 'Café' }).click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText(/500,00\s€ · Reembolso · Café/)).toBeVisible()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)

    await expect(page.getByText(/Quedan 290,00\s€/)).toBeVisible()
    await expect(page.getByText(/Superado en/)).toHaveCount(0)
    await expect(page.getByText(/Incluye 500,00\s€ de reembolsos/)).toBeVisible()
    // El sueldo previsto sigue pendiente, intacto
    await expect(pendingCard(page).getByText(/1\.391,50\s€/)).toBeVisible()
  })

  test('un reembolso exige elegir de qué gasto es', async ({ page }) => {
    await page.goto('nuevo-ingreso')
    await dataReady(page)
    await page.getByRole('radio', { name: 'Reembolso' }).click()
    await page.getByLabel('Importe en euros').fill('50')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Elige de qué gasto es el reembolso')).toBeVisible()
  })

  test('un ingreso normal NO es reembolso: cubre el sueldo previsto', async ({ page }) => {
    await page.goto('nuevo-ingreso?importe=1391,50')
    await dataReady(page)
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await dataReady(page)
    await expect(pendingCard(page).getByText('Trabajo principal')).toHaveCount(0)
  })

  test('cambiar de gasto a ingreso no arrastra la categoría (no se crea un reembolso sin querer)', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await page.getByRole('button', { name: 'Café' }).click()
    await page.getByRole('radio', { name: 'Ingreso' }).click()
    await page.getByLabel('Importe en euros').fill('100')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText(/100,00\s€ · Ingreso$/)).toBeVisible()
  })
})
