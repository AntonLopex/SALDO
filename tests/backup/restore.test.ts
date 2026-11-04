// @vitest-environment node
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { buildBackup, validateBackup } from '@/data/backup/format'
import {
  buildLocalBackup, collectLocalData, createSnapshot, exportCsv, exportJson, loadSnapshot, maybeAutoSnapshot, NeedPassphraseError,
  parseBackupFile, restoreBackup,
} from '@/data/backup/io'
import { txRepo } from '@/data/repositories'
import { seedIfNeeded, seedSettingsIfNeeded } from '@/data/seed'
import { runSync, syncSnapshot } from '@/data/sync/engine'
import { FakeRemote, USER } from '../sync/fakeRemote'

async function freshDevice() {
  db.close()
  await db.delete()
  await db.open()
  await seedIfNeeded()
  await seedSettingsIfNeeded()
}
const sync = (r: FakeRemote) => runSync({ remote: r, userId: USER })
const enc = (s: string) => new TextEncoder().encode(s)

const addExpense = async (note: string, cents = 350) => {
  const cat = (await db.categories.filter((c) => c.name === 'Café').first())!
  return txRepo.add({ kind: 'expense', amountCents: cents, occurredOn: '2026-11-03', categoryId: cat.parentId, subcategoryId: cat.id, note })
}
const live = () => db.transactions.filter((t) => !t.deletedAt).toArray()

beforeEach(freshDevice)

describe('exportar y volver a importar', () => {
  it('la copia exportada valida y se restaura idéntica en un dispositivo vacío', async () => {
    await addExpense('uno', 350)
    await addExpense('dos', 1200)
    const before = (await live()).map((t) => [t.id, t.kind, t.amountCents, t.note, t.occurredOn]).sort()
    const file = await exportJson()
    expect(file.encrypted).toBe(false)

    await freshDevice() // dispositivo nuevo con solo datos por defecto
    const parsed = await parseBackupFile(enc(file.data as string))
    expect(parsed.ok).toBe(true)
    await restoreBackup(parsed.backup!)

    const after = (await live()).map((t) => [t.id, t.kind, t.amountCents, t.note, t.occurredOn]).sort()
    expect(after).toEqual(before)
    // y exactamente un saldo de apertura vivo (el del dispositivo nuevo se da de baja)
    expect((await live()).filter((t) => t.kind === 'opening')).toHaveLength(1)
  })

  it('el JSON exportado cifrado exige contraseña y se restaura con ella', async () => {
    await addExpense('secreto')
    const file = await exportJson('una-contraseña-larga-segura')
    expect(file.encrypted).toBe(true)
    expect(file.filename.endsWith('.age')).toBe(true)
    await expect(parseBackupFile(file.data as Uint8Array)).rejects.toBeInstanceOf(NeedPassphraseError)
    await expect(parseBackupFile(file.data as Uint8Array, 'contraseña-equivocada')).rejects.toThrow(/incorrecta/)
    const ok = await parseBackupFile(file.data as Uint8Array, 'una-contraseña-larga-segura')
    expect(ok.ok).toBe(true)
  }, 30_000)

  it('rechaza JSON roto, archivos ajenos y copias manipuladas — sin tocar los datos', async () => {
    const tx = await addExpense('intacto')
    expect((await parseBackupFile(enc('{ no es json'))).ok).toBe(false)
    expect((await parseBackupFile(enc('{"hola":1}'))).ok).toBe(false)
    const b = JSON.parse(JSON.stringify(await buildLocalBackup()))
    b.data.transactions[0].amountCents = 1
    const r = await validateBackup(b)
    expect(r.ok).toBe(false)
    expect(await db.transactions.get(tx.id)).toBeDefined()
  })

  it('el CSV solo contiene movimientos vivos', async () => {
    const a = await addExpense('queda')
    const b = await addExpense('se borra')
    await txRepo.softDelete(b.id)
    const csv = (await exportCsv()).data as string
    expect(csv).toContain(a.id)
    expect(csv).not.toContain(b.id)
  })
})

describe('restaurar sobre un dispositivo con datos', () => {
  it('lo que no está en la copia se da de baja (no se borra) y lo de la copia vuelve', async () => {
    const keep = await addExpense('estaba en la copia')
    const backup = await buildLocalBackup()
    const extra = await addExpense('posterior a la copia')
    await txRepo.softDelete(keep.id) // se borró después de la copia

    const r = await restoreBackup(backup)
    expect(r.removed).toBeGreaterThanOrEqual(1)
    expect((await db.transactions.get(keep.id))!.deletedAt).toBeNull() // recuperado
    const gone = (await db.transactions.get(extra.id))!
    expect(gone.deletedAt).toBeTruthy() // dado de baja, pero la fila sigue existiendo
    expect(gone.note).toBe('posterior a la copia')
  })

  it('lo restaurado queda pendiente y la nube lo refleja, incluso un saldo de apertura distinto', async () => {
    const remote = new FakeRemote()
    await sync(remote)
    const expense = await addExpense('del dispositivo A')
    await sync(remote)

    // Copia hecha en OTRO dispositivo, con otro saldo de apertura (otro id)
    const data = await collectLocalData()
    const otherOpening = { ...data.transactions.find((t) => t.kind === 'opening')!, id: crypto.randomUUID(), amountCents: 500000 }
    const foreign = await buildBackup({ ...data, transactions: [otherOpening] })

    const res = await restoreBackup(foreign)
    expect(res.written).toBeGreaterThan(0)
    expect((await syncSnapshot()).pending).toBeGreaterThan(0)

    const rep = await sync(remote)
    expect(rep.outcome).toBe('ok')
    expect(rep.blocked).toBe(0) // el saldo antiguo se dio de baja antes de insertar el nuevo
    const liveOpenings = [...remote.t('transactions').values()].filter((t) => t.kind === 'opening' && !t.deleted_at)
    expect(liveOpenings).toHaveLength(1)
    expect(liveOpenings[0]).toMatchObject({ id: otherOpening.id, amount_cents: 500000 })
    expect(remote.t('transactions').get(expense.id)!.deleted_at).toBeTruthy() // no estaba en la copia
    expect((await syncSnapshot()).pending).toBe(0)
  })

  it('restaura ajustes y fondos', async () => {
    const data = await collectLocalData()
    const custom = await buildBackup({ ...data, settings: { ...data.settings!, monthlyBudgetCents: 90000 }, funds: data.funds.map((f) => ({ ...f, allocatedCents: 12345 })) })
    await restoreBackup(custom)
    expect((await db.settings.get('main'))!.monthlyBudgetCents).toBe(90000)
    expect((await db.funds.toArray()).every((f) => f.allocatedCents === 12345)).toBe(true)
  })
})

describe('copias internas automáticas', () => {
  it('no crea copia mientras no haya movimientos reales', async () => {
    expect(await maybeAutoSnapshot()).toBe(false)
    expect(await db.snapshots.count()).toBe(0)
  })
  it('crea una a la semana como máximo y conserva las últimas 6', async () => {
    await addExpense('x')
    const t0 = Date.now()
    expect(await maybeAutoSnapshot(t0)).toBe(true)
    expect(await maybeAutoSnapshot(t0 + 3 * 86_400_000)).toBe(false) // aún no ha pasado una semana
    expect(await maybeAutoSnapshot(t0 + 8 * 86_400_000)).toBe(true)
    for (let i = 0; i < 10; i++) await createSnapshot('auto')
    expect(await db.snapshots.where('reason').equals('auto').count()).toBe(6)
  })
  it('una copia interna se puede validar y restaurar; las de antes de restaurar se conservan 3', async () => {
    await addExpense('guardado')
    const snap = await createSnapshot('pre-restore')
    for (let i = 0; i < 5; i++) await createSnapshot('pre-restore')
    expect(await db.snapshots.where('reason').equals('pre-restore').count()).toBe(3)
    const some = (await db.snapshots.toArray())[0]!
    const r = await loadSnapshot(some.id)
    expect(r.ok).toBe(true)
    expect((await loadSnapshot('no-existe')).ok).toBe(false)
    void snap
  })
})

// Regresión: la interfaz entrega objetos REACTIVOS de Vue (Proxy). IndexedDB no puede clonarlos (DataCloneError).
// Este fallo rompía en producción la restauración de copias y el guardado de fondos, y las pruebas con objetos
// planos no lo detectaban.
import { reactive } from 'vue'
import { fundRepo, settingsRepo } from '@/data/repositories'

describe('datos reactivos de Vue (Proxy) hacia IndexedDB', () => {
  it('restaurar una copia que viene de la interfaz reactiva no falla', async () => {
    await addExpense('reactiva', 777)
    const backup = reactive(await buildLocalBackup()) // como `preview.value.result.backup` en BackupView
    await expect(restoreBackup(backup as never)).resolves.toMatchObject({ written: expect.any(Number) })
    expect((await live()).some((t) => t.note === 'reactiva')).toBe(true)
  })
  it('guardar un fondo reactivo (con su desglose de costes) no falla y persiste', async () => {
    const funds = reactive(await db.funds.toArray())
    const f = funds.find((x) => x.kind === 'independence')!
    await expect(fundRepo.save({ ...f, allocatedCents: 123456, items: f.items.map((i) => (i.id === 'fianza' ? { ...i, cents: 90000 } : i)) })).resolves.toBeUndefined()
    const saved = (await db.funds.get(f.id))!
    expect(saved.allocatedCents).toBe(123456)
    expect(saved.items.find((i) => i.id === 'fianza')!.cents).toBe(90000)
  })
  it('guardar ajustes reactivos no falla', async () => {
    const st = reactive((await db.settings.get('main'))!)
    await expect(settingsRepo.save({ ...st, monthlyBudgetCents: 91000 })).resolves.toBeUndefined()
    expect((await db.settings.get('main'))!.monthlyBudgetCents).toBe(91000)
  })
})
