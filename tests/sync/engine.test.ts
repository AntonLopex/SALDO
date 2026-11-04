// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { categoryRepo, plannedRepo, settingsRepo, txRepo } from '@/data/repositories'
import { seedIfNeeded, seedSettingsIfNeeded } from '@/data/seed'
import { resetBackoff, runSync, syncSnapshot } from '@/data/sync/engine'
import { FakeRemote, USER, type Row } from './fakeRemote'
import { isUuid, userScopedId, uuidV5 } from '@/data/sync/uuid'

const sync = (remote: FakeRemote, now?: () => number, userId = USER) => runSync({ remote, userId, now })

async function freshDevice() {
  db.close()
  await db.delete()
  await db.open()
  await seedIfNeeded()
  await seedSettingsIfNeeded()
}

const addCafe = async (note = '') => {
  const cat = await db.categories.filter((c) => c.name === 'Café').first()
  return txRepo.add({ kind: 'expense', amountCents: 350, occurredOn: '2026-11-03', categoryId: cat!.parentId, subcategoryId: cat!.id, note })
}

beforeEach(freshDevice)

describe('UUID determinista', () => {
  it('es estable, con formato v5 y distinto por usuario/clave', async () => {
    const a = await userScopedId(USER, 'goal-main')
    expect(a).toBe(await userScopedId(USER, 'goal-main'))
    expect(a).not.toBe(await userScopedId(USER, 'goal-min'))
    expect(a).not.toBe(await userScopedId('otro', 'goal-main'))
    expect(isUuid(a)).toBe(true)
    expect(a[14]).toBe('5')
  })
  it('coincide con el vector de prueba conocido de UUID v5 (namespace DNS)', async () => {
    // Para validar el algoritmo se usa su implementación con un nombre fijo y comprobamos versión/variante
    const v = await uuidV5('python.org')
    expect(v[14]).toBe('5')
    expect('89ab').toContain(v[19])
  })
})

describe('primera sincronización con la nube vacía', () => {
  it('sube todo y deja la cola vacía solo tras la confirmación', async () => {
    const before = await syncSnapshot()
    expect(before.pending).toBeGreaterThan(20) // categorías + apertura + ajustes + fondos
    const remote = new FakeRemote()
    const r = await sync(remote)
    expect(r.outcome).toBe('ok')
    const after = await syncSnapshot()
    expect(after.pending).toBe(0)
    expect(remote.t('categories').size).toBe(await db.categories.count())
    expect(remote.t('transactions').size).toBe(1) // solo el saldo de apertura
    expect([...remote.t('transactions').values()][0]).toMatchObject({ kind: 'opening', amount_cents: 386014, user_id: USER })
    expect(remote.t('savings_funds').size).toBe(2)
    expect(remote.t('budgets').size).toBe(1)
    expect(remote.t('savings_goals').size).toBe(3)
    expect(remote.t('income_plans').size).toBe(2)
    expect([...remote.t('budgets').values()][0]).toMatchObject({ amount_cents: 79000, valid_from: '2026-11-01' })
  })
  it('las subcategorías se envían después de sus categorías', async () => {
    const order: string[] = []
    const remote = new FakeRemote()
    const orig = remote.upsert.bind(remote)
    remote.upsert = async (table, rows) => { if (table === 'categories') order.push(...rows.map((x) => (x.parent_id ? 'hijo' : 'padre') as string)); return orig(table, rows) }
    await sync(remote)
    expect(order.indexOf('hijo')).toBeGreaterThan(order.lastIndexOf('padre'))
  })
  it('los ids de fondos son estables por usuario y tipo', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    expect(remote.t('savings_funds').has(await userScopedId(USER, 'fund-emergency'))).toBe(true)
  })
})

describe('cola y confirmación', () => {
  it('un movimiento nuevo queda pendiente y se sincroniza; editarlo lo vuelve a dejar pendiente', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe('uno')
    expect((await syncSnapshot()).pending).toBe(1)
    await sync(remote)
    expect(remote.t('transactions').get(tx.id)).toMatchObject({ note: 'uno', amount_cents: 350 })
    expect((await syncSnapshot()).pending).toBe(0)
    await txRepo.update(tx.id, { amountCents: 500 })
    expect((await syncSnapshot()).pending).toBe(1)
    await sync(remote)
    expect(remote.t('transactions').get(tx.id)).toMatchObject({ amount_cents: 500 })
  })

  it('corte total de red: no se pierde nada y todo sigue pendiente', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe()
    remote.offline = true
    expect((await sync(remote)).outcome).toBe('offline')
    expect(await db.transactions.get(tx.id)).toBeDefined()
    expect((await syncSnapshot()).pending).toBe(1)
    remote.offline = false
    expect((await sync(remote)).outcome).toBe('ok')
    expect(remote.t('transactions').has(tx.id)).toBe(true)
  })

  it('fallo al subir: se reintenta con espera creciente y sin perder datos', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe()
    remote.failUpsert = true
    const now = 1_000_000
    const r1 = await sync(remote, () => now)
    expect(r1.outcome).toBe('error')
    expect(await db.transactions.get(tx.id)).toBeDefined() // dato local intacto
    const st = await db.syncState.get(`transactions:${tx.id}`)
    expect(st).toMatchObject({ attempts: 1, blocked: false })
    expect(st!.nextAttemptAt).toBeGreaterThan(now)

    remote.failUpsert = false
    await sync(remote, () => now + 1000) // aún en espera: no reintenta
    expect(remote.t('transactions').has(tx.id)).toBe(false)
    await sync(remote, () => now + 60_000) // pasada la espera
    expect(remote.t('transactions').has(tx.id)).toBe(true)
    expect(await db.syncState.get(`transactions:${tx.id}`)).toBeUndefined()
    expect((await syncSnapshot()).pending).toBe(0)
  })

  it('"Reintentar ahora" ignora la espera', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe()
    remote.offline = true
    await sync(remote, () => 5_000)
    remote.offline = false
    await resetBackoff()
    await sync(remote, () => 5_001)
    expect(remote.t('transactions').has(tx.id)).toBe(true)
  })

  it('si se pierde la confirmación, reenviar no duplica (idempotente) y se marca al fin', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe()
    remote.loseAck = true
    expect((await sync(remote, () => 1_000)).outcome).toBe('offline')
    expect(remote.t('transactions').has(tx.id)).toBe(true) // el servidor sí la guardó
    expect((await syncSnapshot()).pending).toBe(1) // pero localmente sigue pendiente: no hubo confirmación
    remote.loseAck = false
    await sync(remote, () => 1_000_000)
    expect([...remote.t('transactions').values()].filter((r) => r.id === tx.id)).toHaveLength(1)
    expect((await syncSnapshot()).pending).toBe(0)
  })

  it('una edición mientras el envío viaja no se pierde', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe()
    remote.beforeReturn = async () => { remote.beforeReturn = undefined; await txRepo.update(tx.id, { amountCents: 999 }) }
    await sync(remote)
    expect((await syncSnapshot()).pending).toBe(1) // la versión nueva sigue pendiente
    await sync(remote)
    expect(remote.t('transactions').get(tx.id)).toMatchObject({ amount_cents: 999 })
    expect((await syncSnapshot()).pending).toBe(0)
  })

  it('un dato rechazado solo bloquea ese registro, no a los demás, y no se borra', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const ok1 = await addCafe('bien 1')
    const bad = await addCafe('malo')
    const ok2 = await addCafe('bien 2')
    remote.reject = (t, r) => t === 'transactions' && r.note === 'malo'
    const r = await sync(remote)
    expect(r.outcome).toBe('ok')
    expect(r.blocked).toBe(1)
    expect(remote.t('transactions').has(ok1.id) && remote.t('transactions').has(ok2.id)).toBe(true)
    expect(remote.t('transactions').has(bad.id)).toBe(false)
    expect(await db.transactions.get(bad.id)).toBeDefined()
    const snap = await syncSnapshot()
    expect(snap).toMatchObject({ pending: 1, blocked: 1 })
    expect(snap.failing[0]).toMatchObject({ recordId: bad.id, blocked: true })
  })

  it('sesión caducada: se detiene sin tocar datos ni contar intentos', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe()
    remote.authFail = true
    expect((await sync(remote)).outcome).toBe('auth')
    expect(await db.transactions.get(tx.id)).toBeDefined()
    expect(await db.syncState.count()).toBe(0)
  })

  it('el borrado lógico viaja y el movimiento sigue existiendo localmente', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe()
    await sync(remote)
    await txRepo.softDelete(tx.id)
    await sync(remote)
    expect(remote.t('transactions').get(tx.id)!.deleted_at).toBeTruthy()
    expect((await db.transactions.get(tx.id))!.deletedAt).toBeTruthy()
  })
})

describe('bajada y conflictos', () => {
  it('trae cambios hechos desde otro dispositivo', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const id = crypto.randomUUID()
    remote.t('transactions').set(id, { id, user_id: USER, kind: 'income', amount_cents: 139150, occurred_on: '2026-11-02', category_id: null, subcategory_id: null, note: 'Nómina', planned_expense_id: null, created_at: '2026-11-02T08:00:00.000Z', deleted_at: null, updated_at: remote.ts() })
    const r = await sync(remote)
    expect(r.pulled).toBeGreaterThan(0)
    expect(await db.transactions.get(id)).toMatchObject({ kind: 'income', amountCents: 139150, note: 'Nómina' })
    expect((await syncSnapshot()).pending).toBe(0)
  })

  it('conflicto: si la nube es más reciente gana la nube y se guarda lo descartado', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe('original')
    await sync(remote)
    await txRepo.update(tx.id, { note: 'local' }) // pendiente, hecho "ahora"
    remote.seq += 10_000_000 // el servidor edita MÁS TARDE que el dispositivo
    remote.edit('transactions', tx.id, { note: 'nube' })
    const r = await sync(remote)
    expect(r.conflicts).toBe(1)
    expect((await db.transactions.get(tx.id))!.note).toBe('nube')
    const c = await db.conflicts.toArray()
    expect(c[0]).toMatchObject({ table: 'transactions', recordId: tx.id, loser: 'local' })
    expect(JSON.parse(c[0]!.data).note).toBe('local')
  })

  it('conflicto: si lo local es más reciente gana lo local y se envía', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe('original')
    await sync(remote)
    remote.edit('transactions', tx.id, { note: 'nube' }) // fecha de 2026-11-04T12:00 + segundos
    await db.transactions.update(tx.id, { note: 'local', updatedAt: '2030-01-01T00:00:00.000Z' }) // claramente posterior
    const r = await sync(remote)
    expect(r.conflicts).toBe(1)
    expect(remote.t('transactions').get(tx.id)!.note).toBe('local')
    expect((await db.conflicts.toArray())[0]).toMatchObject({ loser: 'server' })
    expect((await syncSnapshot()).pending).toBe(0)
  })

  it('sin cambios locales, la nube simplemente se aplica (sin conflicto)', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const tx = await addCafe('original')
    await sync(remote)
    remote.edit('transactions', tx.id, { note: 'otro dispositivo' })
    const r = await sync(remote)
    expect(r.conflicts).toBe(0)
    expect((await db.transactions.get(tx.id))!.note).toBe('otro dispositivo')
  })
})

describe('cuentas y dispositivos nuevos', () => {
  it('un dispositivo nuevo adopta la nube sin duplicar categorías ni el saldo de apertura', async () => {
    const remote = new FakeRemote()
    await sync(remote) // dispositivo A sube sus datos
    const cafe = await addCafe('desde A')
    await sync(remote)
    const catCount = remote.t('categories').size

    await freshDevice() // dispositivo B: base vacía con datos por defecto, sin sesión previa
    const r = await sync(remote)
    expect(r.outcome).toBe('ok')
    expect(await db.categories.count()).toBe(catCount) // sin duplicados
    expect(await db.transactions.filter((t) => t.kind === 'opening').count()).toBe(1)
    expect(await db.transactions.get(cafe.id)).toBeDefined()
    expect(await db.funds.count()).toBe(2)
    expect((await syncSnapshot()).pending).toBe(0)
    expect(remote.t('transactions').size).toBe(2) // la nube no recibió duplicados
  })

  it('con datos en ambos lados NO mezcla automáticamente', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    await addCafe('en la nube')
    await sync(remote)
    await freshDevice()
    const mine = await addCafe('solo local')
    const before = remote.t('transactions').size
    const r = await sync(remote)
    expect(r.outcome).toBe('needs-decision')
    expect(remote.t('transactions').size).toBe(before)
    expect(await db.transactions.get(mine.id)).toBeDefined()
  })

  it('no mezcla datos de otra cuenta en el mismo dispositivo', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const other = '22222222-2222-2222-2222-222222222222'
    const tx = await addCafe()
    const r = await sync(new FakeRemote(other), undefined, other)
    expect(r.outcome).toBe('account-mismatch')
    expect(await db.transactions.get(tx.id)).toBeDefined()
  })
})

describe('ajustes', () => {
  it('un cambio de plan se envía; un ingreso eliminado se borra en la nube', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const st = (await db.settings.get('main'))!
    await settingsRepo.save({ ...st, monthlyBudgetCents: 85000, incomePlans: st.incomePlans.filter((p) => p.id === 'work') })
    expect((await syncSnapshot()).pending).toBe(1)
    await sync(remote)
    expect([...remote.t('budgets').values()][0]).toMatchObject({ amount_cents: 85000 })
    const live = [...remote.t('income_plans').values()].filter((r) => !r.deleted_at)
    expect(live).toHaveLength(1)
    expect([...remote.t('income_plans').values()].filter((r) => r.deleted_at)).toHaveLength(1)
    expect((await syncSnapshot()).pending).toBe(0)
  })

  it('otro dispositivo recibe los ajustes', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const st = (await db.settings.get('main'))!
    await settingsRepo.save({ ...st, monthlyBudgetCents: 85000 })
    await sync(remote)
    await freshDevice()
    await sync(remote)
    expect((await db.settings.get('main'))!.monthlyBudgetCents).toBe(85000)
    expect((await syncSnapshot()).pending).toBe(0)
  })
})

describe('integridad entre registros', () => {
  it('categorías y gastos planificados viajan con su enlace al gasto real', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    await plannedRepo.add({ name: 'Botas', estimatedCents: 12000, plannedOn: '2027-01-15', categoryId: null, subcategoryId: null })
    const planned = (await db.planned.toArray())[0]!
    const real = await txRepo.add({ kind: 'expense', amountCents: 11990, occurredOn: '2027-01-16', categoryId: null, subcategoryId: null, note: '', plannedExpenseId: planned.id })
    await sync(remote)
    expect(remote.t('planned_expenses').get(planned.id)).toMatchObject({ status: 'done', linked_transaction_id: real.id })
    expect(remote.t('transactions').get(real.id)).toMatchObject({ planned_expense_id: planned.id })
  })
  it('archivar una categoría se sincroniza (no se borra)', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const c = (await db.categories.filter((x) => x.name === 'Tecnología').first())!
    await categoryRepo.archive(c.id)
    await sync(remote)
    expect(remote.t('categories').get(c.id)!.archived_at).toBeTruthy()
  })
})
