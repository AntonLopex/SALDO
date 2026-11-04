import { gzipSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'
import { dataReady, skipWelcome } from './helpers'

/**
 * Presupuestos de rendimiento sobre la compilación de producción. Se miden BYTES comprimidos (lo que pagaría una
 * conexión móvil real; `vite preview` no comprime, GitHub Pages sí) y TIEMPO con la CPU 4× más lenta (un móvil modesto).
 * Si alguien añade una dependencia pesada al arranque, estos tests fallan.
 */
const KB = 1024

async function measureColdLoad(page: Page, path: string) {
  const bodies: { url: string; type: string; gz: number }[] = []
  page.on('response', async (res) => {
    const type = res.request().resourceType()
    if (!['script', 'stylesheet', 'font', 'document'].includes(type)) return
    try {
      bodies.push({ url: res.url(), type, gz: gzipSync(await res.body()).length })
    } catch { /* respuesta redirigida */ }
  })
  await page.goto(path)
  await page.getByLabel('Importe en euros').waitFor()
  await dataReady(page)
  await page.waitForTimeout(300)
  return bodies
}
const sum = (xs: { gz: number }[]) => xs.reduce((a, x) => a + x.gz, 0)

test.beforeEach(async ({ page }) => skipWelcome(page))

test.describe('peso del arranque (formulario /nuevo-gasto, primera visita)', () => {
  test('el JavaScript inicial está dentro del presupuesto y no incluye cargas que no hacen falta', async ({ page }) => {
    const res = await measureColdLoad(page, 'nuevo-gasto')
    const js = res.filter((r) => r.type === 'script')
    const css = res.filter((r) => r.type === 'stylesheet')
    const fonts = res.filter((r) => r.type === 'font')
    console.log(`arranque: JS ${(sum(js) / KB).toFixed(1)} KB gz en ${js.length} archivos · CSS ${(sum(css) / KB).toFixed(1)} KB · fuentes ${(sum(fonts) / KB).toFixed(1)} KB (${fonts.length})`)

    expect(sum(js) / KB, 'JS inicial (gzip)').toBeLessThan(115)
    expect(sum(css) / KB, 'CSS inicial (gzip)').toBeLessThan(10)
    expect(fonts.length, 'subconjuntos de fuente descargados').toBeLessThanOrEqual(2)

    // Lo pesado no debe cargarse hasta que se necesita: nube, cifrado y gráficos
    const bodies = await Promise.all(js.map((j) => page.request.get(j.url).then((r) => r.text())))
    const all = bodies.join('\n')
    expect(all, 'el cliente de Supabase no debe cargarse sin sesión').not.toMatch(/supabase-js-/)
    expect(all, 'age-encryption no debe cargarse hasta exportar/importar').not.toMatch(/\bscrypt\b.*\bchacha|ChaCha20Poly1305/is)
    expect(all, 'ECharts no debe cargarse hasta abrir Estadísticas').not.toMatch(/zrender|echarts/i)
  })

  test('las demás pantallas cargan sus piezas pesadas solo al abrirse', async ({ page }) => {
    await page.goto('./')
    await dataReady(page)
    const loaded: string[] = []
    page.on('response', (r) => r.request().resourceType() === 'script' && loaded.push(r.url()))
    await page.getByRole('link', { name: 'Estadísticas' }).click()
    await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible()
    await expect.poll(() => loaded.length).toBeGreaterThan(0) // el gráfico se descarga al entrar en Estadísticas, no antes
  })
})

test.describe('tiempo (CPU 4× más lenta)', () => {
  async function throttle(page: Page, rate = 4) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
  }

  test('primera visita: el formulario es utilizable en menos de 5,5 s', async ({ page }) => {
    await throttle(page)
    const t0 = Date.now()
    await page.goto('nuevo-gasto')
    await page.getByLabel('Importe en euros').waitFor()
    await expect(page.getByRole('button', { name: 'Café', exact: true })).toBeVisible()
    const ms = Date.now() - t0
    console.log(`primera visita con CPU 4×: ${ms} ms`)
    expect(ms).toBeLessThan(5500)
  })

  test('con la app ya instalada (service worker): el formulario abre en menos de 3,5 s', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await page.evaluate(async () => { for (let i = 0; i < 40; i++) { if ((await navigator.serviceWorker.getRegistrations())[0]?.active) return; await new Promise((r) => setTimeout(r, 250)) } })
    await page.waitForTimeout(1500) // precacheo
    await throttle(page)
    const t0 = Date.now()
    await page.reload()
    await page.getByLabel('Importe en euros').waitFor()
    await expect(page.getByRole('button', { name: 'Café', exact: true })).toBeVisible()
    const ms = Date.now() - t0
    console.log(`visita repetida con CPU 4×: ${ms} ms`)
    expect(ms).toBeLessThan(3500)
  })

  test('registrar un gasto responde al instante (guardado local, sin esperar a la red)', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await throttle(page)
    await page.getByRole('button', { name: '3 €', exact: true }).click()
    await page.getByRole('button', { name: 'Café', exact: true }).first().click()
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Guardado')).toBeVisible()
    const ms = Date.now() - t0
    console.log(`guardar un gasto con CPU 4×: ${ms} ms`)
    expect(ms).toBeLessThan(1200)
  })

  test('el inicio con 500 movimientos sigue siendo fluido', async ({ page }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    // Se insertan 500 movimientos reales directamente en la base local
    await page.evaluate(async () => {
      const open = indexedDB.open('saldo')
      const db: IDBDatabase = await new Promise((res) => { open.onsuccess = () => res(open.result) })
      const cats: { id: string; parentId: string | null }[] = await new Promise((res) => { const g = db.transaction('categories').objectStore('categories').getAll(); g.onsuccess = () => res(g.result) })
      const top = cats.filter((c) => !c.parentId)
      const tx = db.transaction('transactions', 'readwrite')
      const st = tx.objectStore('transactions')
      for (let i = 0; i < 500; i++) {
        const d = new Date(2026, 10, 1 + (i % 28)).toISOString().slice(0, 10)
        st.add({ id: crypto.randomUUID(), kind: i % 9 === 0 ? 'income' : 'expense', amountCents: 100 + ((i * 37) % 9000), occurredOn: d, categoryId: top[i % top.length]!.id, subcategoryId: null, note: `mov ${i}`, plannedExpenseId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null })
      }
      await new Promise((res) => { tx.oncomplete = () => res(null) })
      db.close()
    })
    await throttle(page)
    const t0 = Date.now()
    await page.goto('./')
    await expect(page.getByText('Mi patrimonio')).toBeVisible()
    await dataReady(page)
    const home = Date.now() - t0
    const t1 = Date.now()
    await page.getByRole('link', { name: 'Movimientos' }).click()
    await expect(page.getByText('mov 0', { exact: true }).or(page.getByText('mov 499', { exact: true })).first()).toBeVisible()
    const list = Date.now() - t1
    console.log(`500 movimientos con CPU 4×: inicio ${home} ms · lista ${list} ms`)
    expect(home).toBeLessThan(5500)
    expect(list).toBeLessThan(4500)
    // Se pinta por tandas: solo una parte de los 500, con opción de ver más
    await expect(page.getByRole('button', { name: /Mostrar más \(\d+ restantes\)/ })).toBeVisible()
    const rows = page.locator('main a[href^="/SALDO/movimientos/"]')
    const before = await rows.count()
    expect(before).toBeLessThan(200)
    await page.getByRole('button', { name: /Mostrar más/ }).click()
    await expect.poll(() => rows.count()).toBeGreaterThan(before) // cada pulsación añade otra tanda
  })
})
