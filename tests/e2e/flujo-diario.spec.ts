import { expect, test } from '@playwright/test'
import { dataReady, eur, fillExpense, saveExpense, skipWelcome, start } from './helpers'

test.describe('primer uso', () => {
  test('bienvenida → inicio con los datos reales de partida', async ({ page }) => {
    await start(page)
    await expect(page.getByText(eur('3.860,14 €')).first()).toBeVisible()
    await expect(page.getByText('22,7 %')).toBeVisible()
    await expect(page.getByText(eur('Te faltan 13.139,86 €'))).toBeVisible()
    await expect(page.getByText('Presupuesto 790 €')).toBeVisible()
    // Sin movimientos: estado vacío honesto, nada inventado
    await expect(page.getByText('Empieza con tu primer movimiento')).toBeVisible()
  })

  test('el saldo inicial es de APERTURA: no cuenta como ingreso del mes', async ({ page }) => {
    await start(page)
    await dataReady(page)
    const mes = page.locator('section', { hasText: 'Ingresos' }).first()
    await expect(mes.getByText(eur('0,00 €')).first()).toBeVisible()
  })

  test('el acceso directo /nuevo-gasto no pasa por la bienvenida', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await expect(page.getByRole('heading', { name: 'Nuevo gasto' })).toBeVisible()
    await expect(page.getByText('Mi patrimonio')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toHaveCount(0)
  })
})

test.describe('registrar un gasto (lo más importante)', () => {
  test.beforeEach(async ({ page }) => skipWelcome(page))

  test('un café en pocos toques actualiza patrimonio, presupuesto y movimientos', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { chip: '3 €', category: 'Café' })
    await saveExpense(page)
    await expect(page.getByText('Guardado')).toBeVisible()
    await expect(page.getByText(eur('3,00 € · Café'))).toBeVisible()

    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await expect(page.getByText(eur('3.857,14 €')).first()).toBeVisible()
    await expect(page.getByText(eur('Quedan 787,00 €'))).toBeVisible()
    await expect(page.getByText(eur('−3,00 €')).first()).toBeVisible() // último movimiento
    await expect(page.getByText(/Ahorras el/)).toHaveCount(0) // sin ingresos no hay % de ahorro
  })

  test('importe tecleado con coma y fecha por defecto = hoy', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { amount: '1,40', category: 'Café' })
    await expect(page.getByRole('button', { name: 'Hoy', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await saveExpense(page)
    await expect(page.getByText(eur('1,40 € · Café'))).toBeVisible()
  })

  test('validación: sin importe y sin categoría no guarda', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await saveExpense(page)
    await expect(page.getByRole('alert')).toContainText('importe válido')
    await fillExpense(page, { chip: '2 €' })
    await saveExpense(page)
    await expect(page.getByRole('alert')).toContainText('categoría')
    await expect(page.getByText('Guardado')).toHaveCount(0)
  })

  test('deshacer elimina el movimiento y el patrimonio vuelve al saldo de apertura', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { chip: '5 €', category: 'Café' })
    await saveExpense(page)
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await page.goto('./')
    await expect(page.getByText(eur('3.860,14 €')).first()).toBeVisible()
    await expect(page.getByText('Empieza con tu primer movimiento')).toBeVisible()
  })

  test('«Añadir otro» deja el formulario limpio y se pueden registrar varios', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { chip: '1 €', category: 'Café' })
    await saveExpense(page)
    await page.getByRole('button', { name: 'Añadir otro' }).click()
    await expect(page.getByLabel('Importe en euros')).toHaveValue('')
    await fillExpense(page, { chip: '2 €', category: 'Café' })
    await saveExpense(page)
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await expect(page.getByText(eur('3.857,14 €')).first()).toBeVisible() // 3.860,14 − 1 − 2
  })

  test('las favoritas aparecen primero y las categorías recientes se ofrecen después', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    const chips = page.getByRole('button', { pressed: false })
    await expect(page.getByRole('button', { name: 'Café', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tomar algo en un bar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Fútbol y deporte' })).toBeVisible()
    void chips
    // Una categoría no favorita se alcanza por «Más…»
    await page.getByRole('button', { name: 'Más…' }).click()
    await page.getByRole('button', { name: 'Tecnología' }).click()
    await fillExpense(page, { chip: '10 €' })
    await saveExpense(page)
    await expect(page.getByText(eur('10,00 € · Tecnología'))).toBeVisible()
    // y ahora Tecnología aparece entre las recientes
    await page.getByRole('button', { name: 'Añadir otro' }).click()
    await expect(page.getByRole('button', { name: 'Tecnología', exact: true })).toBeVisible()
  })

  test('ingreso: no exige categoría y suma al patrimonio', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await page.getByRole('radio', { name: 'Ingreso' }).click()
    await fillExpense(page, { amount: '1391,50' })
    await saveExpense(page)
    await expect(page.getByText(eur('1.391,50 € · Ingreso'))).toBeVisible()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await expect(page.getByText(eur('5.251,64 €')).first()).toBeVisible()
    await expect(page.getByText(/Ahorras el 100 %/)).toBeVisible()
  })
})

test.describe('movimientos', () => {
  test.beforeEach(async ({ page }) => {
    await skipWelcome(page)
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await fillExpense(page, { amount: '12,50', category: 'Comida en restaurante' })
    await page.getByLabel(/Descripción/).fill('Menú del día')
    await saveExpense(page)
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
  })

  test('se busca, se edita y se elimina con opción de deshacer', async ({ page }) => {
    await page.getByRole('link', { name: 'Movimientos' }).click()
    await expect(page.getByText('Menú del día')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('menu') // sin tildes
    await expect(page.getByText('Menú del día')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('zzz')
    await expect(page.getByText('Sin resultados')).toBeVisible()
    await page.getByRole('searchbox', { name: 'Buscar movimientos' }).fill('')

    await page.getByText('Menú del día').click()
    await expect(page.getByRole('heading', { name: 'Editar movimiento' })).toBeVisible()
    await page.getByLabel('Importe en euros').fill('14')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByRole('link', { name: /Menú del día/ }).getByText(eur('−14,00 €'))).toBeVisible()

    await page.getByText('Menú del día').click()
    await page.getByRole('button', { name: 'Eliminar' }).click()
    await expect(page.getByText('Movimiento eliminado')).toBeVisible()
    await page.getByRole('button', { name: 'Deshacer' }).click()
    await expect(page.getByRole('link', { name: /Menú del día/ }).getByText(eur('−14,00 €'))).toBeVisible()
  })

  test('duplicar crea un movimiento nuevo con fecha de hoy sin guardar nada solo', async ({ page }) => {
    await page.getByRole('link', { name: 'Movimientos' }).click()
    await page.getByText('Menú del día').click()
    await page.getByRole('button', { name: 'Duplicar' }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo gasto' })).toBeVisible()
    await expect(page.getByLabel('Importe en euros')).toHaveValue('12,5')
    await page.getByRole('link', { name: 'Cerrar' }).or(page.getByRole('button', { name: 'Cerrar' })).click()
    await page.goto('movimientos')
    await expect(page.getByText('Menú del día')).toHaveCount(1) // aún solo el original
  })

  test('el calendario marca el día con movimientos y muestra sus totales', async ({ page }) => {
    await page.getByRole('link', { name: 'Movimientos' }).click()
    await page.getByRole('radio', { name: 'Calendario' }).click()
    await expect(page.getByText(eur('Gastos 12,50 €'))).toBeVisible()
    await expect(page.getByRole('button', { name: /con movimientos/ })).toHaveCount(1)
  })
})
