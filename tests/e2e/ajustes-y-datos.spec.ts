import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { dataReady, eur, fillExpense, saveExpense, serviceWorkerReady, skipWelcome } from './helpers'

test.beforeEach(async ({ page }) => {
  await skipWelcome(page)
  // En el navegador de escritorio «compartir» abriría el diálogo del sistema: se fuerza la descarga normal.
  await page.addInitScript(() => { (navigator as unknown as { canShare: () => boolean }).canShare = () => false })
})

async function addExpense(page: Page, amount: string, category = 'Café', note = '') {
  await page.goto('nuevo-gasto')
  await dataReady(page)
  await fillExpense(page, { amount, category })
  if (note) await page.getByLabel(/Descripción/).fill(note)
  await saveExpense(page)
  await expect(page.getByText('Guardado')).toBeVisible()
}

test.describe('plan de ahorro y objetivos', () => {
  test('cambiar el presupuesto se refleja en el inicio y valida entradas absurdas', async ({ page }) => {
    await page.goto('ajustes/plan')
    await dataReady(page)
    await page.getByLabel('Gasto máximo al mes (€)').fill('abc')
    await page.getByRole('button', { name: 'Guardar plan' }).click()
    await expect(page.getByRole('alert')).toContainText('Presupuesto: importe no válido')

    await page.getByLabel('Gasto máximo al mes (€)').fill('900')
    await expect(page.getByRole('status').filter({ hasText: 'Con este plan' })).toContainText('alcanza el objetivo principal')
    await page.getByRole('button', { name: 'Guardar plan' }).click()
    await expect(page.getByText('Plan guardado')).toBeVisible()
    await page.goto('./')
    await expect(page.getByText('Presupuesto 900 €')).toBeVisible()
  })

  test('el plan inicial llega al objetivo y rechaza objetivos desordenados', async ({ page }) => {
    await page.goto('ajustes/plan')
    await dataReady(page)
    await expect(page.getByRole('status').filter({ hasText: 'Con este plan' })).toContainText(eur('17.060,14 €'))
    await page.getByLabel('Mínimo (€)').fill('18000')
    await page.getByRole('button', { name: 'Guardar plan' }).click()
    await expect(page.getByRole('alert')).toContainText('de menor a mayor')
  })

  test('objetivos: estado «En línea» y previsión sin marcar nada como perdido', async ({ page }) => {
    await page.goto('objetivos')
    await dataReady(page)
    await expect(page.getByText('En línea').first()).toBeVisible()
    await expect(page.getByText(/perdid/i)).toHaveCount(0)
    await expect(page.getByText(eur('Llegas con 2.081,14 € de margen'))).toBeVisible() // mínimo: 17.081,14 − 15.000
    await expect(page.getByText(/Con tu plan actual te faltarían/)).toBeVisible() // ambicioso 20.000 €
  })

  test('un mes malo recalcula el esfuerzo y pasa a «Por detrás» sin dar el objetivo por perdido', async ({ page }) => {
    await addExpense(page, '1000', 'Ocio')
    await page.goto('objetivos')
    await dataReady(page)
    await expect(page.getByText('Por detrás').first()).toBeVisible()
    await expect(page.getByText(/Es recuperable/)).toBeVisible()
    await expect(page.getByText(/perdid/i)).toHaveCount(0)
  })

  test('gasto futuro: se planifica, se registra enlazado y queda cerrado (sin contarse dos veces)', async ({ page }) => {
    await page.goto('objetivos')
    await dataReady(page)
    await page.getByRole('tab', { name: 'Gastos futuros' }).click()
    await page.getByRole('button', { name: 'Planificar un gasto' }).click()
    await page.getByLabel('Nombre').fill('Botas de fútbol')
    await page.getByLabel('Importe estimado (€)').fill('120')
    await page.getByLabel('Fecha prevista').fill('2027-01-15')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('Botas de fútbol')).toBeVisible()
    await expect(page.getByText(eur('120,00 €')).first()).toBeVisible()

    // Sin gasto planificado la previsión a dic-2027 es 17.081,14 €; con 120 € pendientes baja a 16.961,14 €
    await page.goto('./')
    await dataReady(page)
    await expect(page.getByText(eur('≈ 16.961,14 €'))).toBeVisible() // 17.081,14 − 120 del gasto pendiente

    await page.goto('objetivos')
    await page.getByRole('tab', { name: 'Gastos futuros' }).click()
    await page.getByRole('button', { name: 'Registrar' }).click()
    await expect(page.getByLabel('Importe en euros')).toHaveValue('120')
    await expect(page.getByLabel(/Descripción/)).toHaveValue('Botas de fútbol')
    await page.getByRole('button', { name: 'Ropa de vestir', exact: true }).click()
    await saveExpense(page)
    await expect(page.getByText('Guardado')).toBeVisible()

    await page.goto('objetivos')
    await page.getByRole('tab', { name: 'Gastos futuros' }).click()
    await expect(page.getByText('Realizado')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar' })).toHaveCount(0)
    await page.goto('./')
    await dataReady(page)
    // Realizado = ya está en los movimientos reales; no se descuenta otra vez de la previsión
    await expect(page.getByText(eur('≈ 16.961,14 €'))).toBeVisible()
  })

  test('fondos virtuales: no se puede asignar más que el patrimonio', async ({ page }) => {
    await page.goto('objetivos')
    await dataReady(page)
    await page.getByRole('tab', { name: 'Independencia' }).click()
    const input = page.getByLabel('Asignado (€)').first()
    await input.fill('9000')
    await input.press('Enter')
    await expect(page.getByRole('alert').first()).toContainText(eur('Máximo asignable: 3.860,14 €'))
    await input.fill('1000')
    await input.press('Enter')
    await expect(page.getByText('Asignación guardada')).toBeVisible()
    await expect(page.getByText(eur('2.860,14 €')).first()).toBeVisible() // libre
  })
})

test.describe('categorías, tema y aspecto', () => {
  test('marcar favorita una categoría la pone en el formulario rápido; una nueva se puede usar', async ({ page }) => {
    await page.goto('ajustes/categorias')
    await dataReady(page)
    await page.getByRole('button', { name: 'Favorita: Tecnología' }).click()
    await page.getByRole('button', { name: 'Nueva categoría' }).click()
    await page.getByLabel('Nombre').fill('Mascota')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Mascota' })).toBeVisible()

    await page.goto('nuevo-gasto')
    await dataReady(page)
    await expect(page.getByRole('button', { name: 'Tecnología', exact: true })).toBeVisible() // favorita visible sin «Más…»
    await page.getByRole('button', { name: 'Más…' }).click()
    await page.getByRole('button', { name: 'Mascota' }).click()
    await fillExpense(page, { chip: '5 €' })
    await saveExpense(page)
    await expect(page.getByText(eur('5,00 € · Mascota'))).toBeVisible()
  })

  test('eliminar una categoría con movimientos conserva el historial', async ({ page }) => {
    await addExpense(page, '7', 'Café', 'cortado')
    await page.goto('ajustes/categorias')
    await dataReady(page)
    await page.getByRole('button', { name: 'Editar Restauración' }).click()
    await page.getByRole('button', { name: 'Eliminar' }).click()
    await page.getByRole('button', { name: /Confirmar: eliminar/ }).click()
    await page.goto('movimientos')
    await expect(page.getByText('cortado')).toBeVisible()
    await expect(page.getByRole('link', { name: /cortado/ })).toContainText('Café') // sigue mostrando su categoría
  })

  test('el tema se aplica y se recuerda al recargar', async ({ page }) => {
    await page.goto('ajustes')
    await page.getByRole('radio', { name: 'Oscuro' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('radio', { name: 'Claro' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await page.reload()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('el modo «automático» sigue al sistema', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 844 } })
    const p = await ctx.newPage()
    await p.addInitScript(() => localStorage.setItem('saldo-onboarded', '1'))
    await p.goto('http://localhost:4173/SALDO/')
    await expect(p.locator('html')).toHaveClass(/dark/)
    await ctx.close()
  })

  test('respeta «reducir movimiento»: sin pantalla de carga; con animaciones sí aparece y desaparece', async ({ browser }) => {
    const reduced = await browser.newContext({ reducedMotion: 'reduce' })
    const a = await reduced.newPage()
    await a.addInitScript(() => localStorage.setItem('saldo-onboarded', '1'))
    await a.goto('http://localhost:4173/SALDO/')
    await expect(a.getByText('Mi patrimonio')).toBeVisible()
    await expect(a.locator('.fixed.inset-0.z-50')).toHaveCount(0)
    await reduced.close()

    const normal = await browser.newContext({ reducedMotion: 'no-preference' })
    const b = await normal.newPage()
    await b.addInitScript(() => localStorage.setItem('saldo-onboarded', '1'))
    await b.goto('http://localhost:4173/SALDO/')
    await expect(b.locator('.fixed.inset-0.z-50')).toBeVisible()
    await expect(b.locator('.fixed.inset-0.z-50')).toHaveCount(0, { timeout: 4000 }) // breve: no bloquea
    await normal.close()
  })
})

test.describe('sin conexión (service worker real)', () => {
  test('la app abre, registra un gasto y lo muestra sin Internet', async ({ page, context }) => {
    await page.goto('nuevo-gasto')
    await dataReady(page)
    await serviceWorkerReady(page)

    await context.setOffline(true)
    await page.reload() // navegación real sin red: la sirve el service worker
    await expect(page.getByRole('heading', { name: 'Nuevo gasto' })).toBeVisible()
    await dataReady(page)
    await fillExpense(page, { chip: '3 €', category: 'Café' })
    await saveExpense(page)
    await expect(page.getByText('Guardado')).toBeVisible()
    await page.getByRole('button', { name: 'Abrir SALDO' }).click()
    await expect(page.getByText(eur('3.857,14 €')).first()).toBeVisible()

    // Otra ruta profunda también abre sin red
    await page.goto('objetivos')
    await expect(page.getByRole('heading', { name: 'Objetivos' })).toBeVisible()
    await context.setOffline(false)
  })

  test('los datos locales sobreviven a un cierre y reapertura', async ({ page }) => {
    await addExpense(page, '4', 'Café')
    await page.goto('about:blank')
    await page.goto('./')
    await expect(page.getByText(eur('3.856,14 €')).first()).toBeVisible()
  })
})

test.describe('copias de seguridad', () => {
  test('exportar JSON y CSV: formato correcto y sin datos ajenos', async ({ page }) => {
    await addExpense(page, '3,50', 'Café', 'con "leche"')
    await page.goto('ajustes/copias')
    await dataReady(page)

    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar copia completa/ }).click()])
    expect(json.suggestedFilename()).toMatch(/^saldo-copia-\d{8}-\d{4}\.json$/)
    const parsed = JSON.parse(readFileSync((await json.path())!, 'utf8'))
    expect(parsed).toMatchObject({ app: 'saldo', formatVersion: 1, source: 'device' })
    expect(parsed.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(parsed.data.transactions.filter((t: { kind: string }) => t.kind === 'expense')).toHaveLength(1)
    expect(JSON.stringify(parsed)).not.toMatch(/syncedAt|serverUpdatedAt/)
    await expect(page.getByText('hace')).toHaveCount(0)
    await expect(page.getByText(/Última exportación: hoy/)).toBeVisible()

    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar movimientos/ }).click()])
    const text = readFileSync((await csv.path())!, 'utf8')
    expect(text.charCodeAt(0)).toBe(0xfeff)
    expect(text).toContain('Fecha;Tipo;Importe (EUR);Categoría;Subcategoría;Nota;Id')
    expect(text).toContain(';Gasto;-3,50;Restauración;Café;"con ""leche""";')
  })

  test('restaurar: valida, pide confirmación y recupera lo borrado; rechaza copias manipuladas', async ({ page }) => {
    await addExpense(page, '8', 'Café', 'cena')
    await page.goto('ajustes/copias')
    await dataReady(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar copia completa/ }).click()])
    const original = readFileSync((await dl.path())!)

    // Se borra el movimiento y se intenta restaurar un archivo manipulado
    await page.goto('movimientos')
    await page.getByText('cena').click()
    await page.getByRole('button', { name: 'Eliminar' }).click()
    await page.goto('ajustes/copias')
    const tampered = JSON.parse(original.toString())
    tampered.data.transactions[1].amountCents = 1
    await page.locator('input[type=file]').setInputFiles({ name: 'manipulada.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tampered)) })
    await expect(page.getByText('No se puede restaurar este archivo')).toBeVisible()
    await expect(page.getByText(/suma de comprobación/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restaurar copia' })).toHaveCount(0)

    // El archivo bueno: vista previa, casilla de confirmación obligatoria
    await page.locator('input[type=file]').setInputFiles({ name: 'copia.json', mimeType: 'application/json', buffer: original })
    await expect(page.getByText('Archivo íntegro y válido')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Restaurar copia' })).toBeDisabled()
    await page.getByLabel('Entiendo y quiero restaurar').check()
    await page.getByRole('button', { name: 'Restaurar copia' }).click()
    await expect(page.getByText(/Copia restaurada/)).toBeVisible()

    await page.goto('movimientos')
    await expect(page.getByText('cena')).toBeVisible()
    await page.goto('ajustes/copias')
    await expect(page.getByText('Antes de restaurar')).toBeVisible() // copia interna de seguridad creada
  })

  test('copia cifrada con contraseña: exige contraseña correcta', async ({ page }) => {
    await addExpense(page, '2', 'Café', 'secreto')
    await page.goto('ajustes/copias')
    await dataReady(page)
    await page.getByLabel('Proteger con contraseña (cifrado)').check()
    await page.getByLabel(/^Contraseña \(mín/).fill('una-contraseña-larga-123')
    await page.getByLabel('Repite la contraseña').fill('otra-distinta-456')
    await page.getByRole('button', { name: /Exportar copia completa/ }).click()
    await expect(page.getByRole('alert')).toContainText('no coinciden')
    await page.getByLabel('Repite la contraseña').fill('una-contraseña-larga-123')
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar copia completa/ }).click()])
    expect(dl.suggestedFilename()).toMatch(/\.json\.age$/)
    const bytes = readFileSync((await dl.path())!)
    expect(bytes.toString('latin1')).not.toContain('secreto') // cifrado de verdad

    await page.locator('input[type=file]').setInputFiles({ name: dl.suggestedFilename(), mimeType: 'application/octet-stream', buffer: bytes })
    await page.getByLabel('Contraseña del archivo').fill('incorrecta-incorrecta')
    await page.getByRole('button', { name: 'Descifrar' }).click()
    await expect(page.getByRole('alert')).toContainText('incorrecta')
    await page.getByLabel('Contraseña del archivo').fill('una-contraseña-larga-123')
    await page.getByRole('button', { name: 'Descifrar' }).click()
    await expect(page.getByText('Archivo íntegro y válido')).toBeVisible()
  })
})

test.describe('seguridad y red', () => {
  test('durante el uso normal no hay errores de consola ni peticiones a otros dominios', async ({ page }) => {
    const errors: string[] = []
    const external: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('request', (r) => {
      const u = new URL(r.url())
      if (!['data:', 'blob:'].includes(u.protocol) && u.origin !== 'http://localhost:4173') external.push(r.url())
    })
    await addExpense(page, '3', 'Café')
    for (const r of ['./', 'movimientos', 'estadisticas', 'objetivos', 'ajustes', 'ajustes/plan', 'ajustes/categorias', 'ajustes/copias', 'ajustes/cuenta', 'ajustes/sincronizacion']) {
      await page.goto(r)
      await expect(page.locator('main, body').first()).toBeVisible()
      await page.waitForTimeout(250)
    }
    expect(errors).toEqual([])
    expect(external).toEqual([]) // sin sesión no se contacta con Supabase; fuentes y librerías son propias
  })

  test('una ruta inexistente muestra una pantalla de error útil, no una página en blanco', async ({ page }) => {
    await page.goto('esto-no-existe')
    await expect(page.getByText('Página no encontrada')).toBeVisible()
    await page.getByRole('link', { name: 'Ir al inicio' }).click()
    await expect(page.getByText('Mi patrimonio')).toBeVisible()
  })

  test('sin sesión, la cuenta explica que se usa solo en este dispositivo o ofrece acceso', async ({ page }) => {
    await page.goto('ajustes/cuenta')
    await expect(page.getByRole('heading', { name: 'Cuenta' })).toBeVisible()
    await expect(page.getByText(/Solo en este dispositivo|Entrar/).first()).toBeVisible()
  })
})
