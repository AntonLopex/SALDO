import { expect, type Page } from '@playwright/test'

/** Espacio normalizado: Intl usa NBSP entre el número y «€». */
export const eur = (s: string) => new RegExp(s.replace(/\./g, '\\.').replace(/ €/g, '\\s€'))

/** Primera ejecución: pasa la bienvenida y llega al inicio. */
export async function start(page: Page) {
  await page.goto('./')
  await page.getByRole('button', { name: 'Empezar' }).click()
  await expect(page.getByText('Mi patrimonio')).toBeVisible()
}

/** Marca la bienvenida como vista sin pasar por ella (para pruebas que no la ejercitan). */
export async function skipWelcome(page: Page) {
  await page.addInitScript(() => localStorage.setItem('saldo-onboarded', '1'))
}

/** Registra un gasto desde el formulario rápido ya abierto. */
export async function fillExpense(page: Page, o: { amount?: string; chip?: string; category?: string }) {
  if (o.chip) await page.getByRole('button', { name: o.chip, exact: true }).click()
  if (o.amount) await page.getByLabel('Importe en euros').fill(o.amount)
  if (o.category) await page.getByRole('button', { name: o.category, exact: true }).first().click()
}

export async function saveExpense(page: Page) {
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
}

/** Espera a que los datos locales estén listos (el esqueleto de carga desaparece). */
export async function dataReady(page: Page) {
  await expect(page.locator('.skeleton')).toHaveCount(0)
}

/** Espera a que el service worker esté activo (para probar el modo sin conexión de verdad). */
export async function serviceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    for (let i = 0; i < 60; i++) {
      const r = (await navigator.serviceWorker.getRegistrations())[0]
      if (r?.active) return
      await new Promise((res) => setTimeout(res, 250))
    }
    throw new Error('El service worker no se activó')
  })
  // Deja que termine el precacheo
  await page.waitForFunction(async () => (await caches.keys()).length > 0)
  await page.waitForTimeout(1500)
}
