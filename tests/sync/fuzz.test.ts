// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { categoryRepo, fundRepo, plannedRepo, settingsRepo, txRepo } from '@/data/repositories'
import { seedIfNeeded, seedSettingsIfNeeded } from '@/data/seed'
import { resetBackoff, runSync, syncSnapshot } from '@/data/sync/engine'
import { FakeRemote, USER } from './fakeRemote'

/**
 * FUZZ de sincronización. Cada «semilla» es una historia aleatoria y reproducible: operaciones del usuario mezcladas con
 * cortes de red, confirmaciones perdidas, fallos del servidor y rechazos. Al final se arreglan los fallos y se exige:
 *   1) la cola queda vacía y nada queda bloqueado;
 *   2) la nube contiene EXACTAMENTE lo mismo que el dispositivo (ni de más ni de menos);
 *   3) un dispositivo nuevo que se conecta recupera el mismo estado.
 * Si falla, el mensaje indica la semilla para reproducirlo.
 */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const int = (r: () => number, a: number, b: number) => a + Math.floor(r() * (b - a + 1))
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[int(r, 0, xs.length - 1)]!

async function freshDevice() {
  db.close()
  await db.delete()
  await db.open()
  await seedIfNeeded()
  await seedSettingsIfNeeded()
}

async function randomOp(r: () => number) {
  const cats = await db.categories.filter((c) => !c.archivedAt).toArray()
  const live = await db.transactions.filter((t) => !t.deletedAt).toArray()
  const dead = await db.transactions.filter((t) => !!t.deletedAt).toArray()
  const op = int(r, 0, 11)
  const day = `2026-11-${String(int(r, 1, 28)).padStart(2, '0')}`
  switch (op) {
    case 0: case 1: case 2: {
      const cat = pick(r, cats.filter((c) => !c.parentId))
      const subs = cats.filter((c) => c.parentId === cat.id)
      const sub = subs.length && r() < 0.6 ? pick(r, subs) : null
      return void (await txRepo.add({ kind: 'expense', amountCents: int(r, 1, 80_000), occurredOn: day, categoryId: cat.id, subcategoryId: sub?.id ?? null, note: pick(r, ['', 'café', 'cena', 'bad']) }))
    }
    case 3: return void (await txRepo.add({ kind: 'income', amountCents: int(r, 1, 200_000), occurredOn: day, categoryId: null, subcategoryId: null, note: 'nómina' }))
    case 4: { if (live.length) await txRepo.update(pick(r, live).id, { amountCents: int(r, 1, 80_000), note: pick(r, ['', 'editado', 'bad']) }); return }
    case 5: { if (live.length) await txRepo.softDelete(pick(r, live).id); return }
    case 6: { if (dead.length) await txRepo.restore(pick(r, dead).id); return }
    case 7: { const c = pick(r, cats); await categoryRepo.setFavorite(c.id, !c.isFavorite); return }
    case 8: return void (await categoryRepo.create({ parentId: r() < 0.5 ? null : pick(r, cats.filter((c) => !c.parentId)).id, name: `Cat ${int(r, 1, 9999)}`, icon: 'tag', color: '#55D6A0' }))
    case 9: {
      if (r() < 0.5) return void (await plannedRepo.add({ name: `Plan ${int(r, 1, 99)}`, estimatedCents: int(r, 1, 50_000), plannedOn: '2027-01-15', categoryId: null, subcategoryId: null }))
      const p = await db.planned.filter((x) => !x.deletedAt).toArray()
      if (p.length) await plannedRepo.setStatus(pick(r, p).id, pick(r, ['pending', 'cancelled'] as const))
      return
    }
    case 10: { const st = (await db.settings.get('main'))!; await settingsRepo.save({ ...st, monthlyBudgetCents: int(r, 50_000, 120_000) }); return }
    case 11: { const fs = await db.funds.toArray(); const f = pick(r, fs); await fundRepo.save({ ...f, allocatedCents: int(r, 0, 100_000) }); return }
  }
}

async function compareWithServer(remote: FakeRemote, seed: number) {
  const msg = (what: string) => `[semilla ${seed}] ${what}`
  const cats = await db.categories.toArray()
  expect(remote.t('categories').size, msg('nº de categorías')).toBe(cats.length)
  for (const c of cats) {
    const s = remote.t('categories').get(c.id)
    expect(s, msg(`categoría ${c.name} no está en la nube`)).toBeDefined()
    expect([s!.name, s!.parent_id, s!.is_favorite, s!.fav_order, !!s!.archived_at]).toEqual([c.name, c.parentId, c.isFavorite, c.favOrder, !!c.archivedAt])
  }
  const txs = await db.transactions.toArray()
  expect(remote.t('transactions').size, msg('nº de movimientos')).toBe(txs.length)
  for (const t of txs) {
    const s = remote.t('transactions').get(t.id)
    expect(s, msg(`movimiento ${t.id} no está en la nube`)).toBeDefined()
    expect([s!.kind, s!.amount_cents, s!.occurred_on, s!.category_id, s!.subcategory_id, s!.note, !!s!.deleted_at])
      .toEqual([t.kind, t.amountCents, t.occurredOn, t.categoryId, t.subcategoryId, t.note, !!t.deletedAt])
  }
  const planned = await db.planned.toArray()
  expect(remote.t('planned_expenses').size, msg('nº de planificados')).toBe(planned.length)
  for (const p of planned) {
    const s = remote.t('planned_expenses').get(p.id)!
    expect([s.name, s.estimated_cents, s.status, !!s.deleted_at], msg(`planificado ${p.name}`)).toEqual([p.name, p.estimatedCents, p.status, !!p.deletedAt])
  }
  const settings = (await db.settings.get('main'))!
  expect([...remote.t('budgets').values()][0]!.amount_cents, msg('presupuesto')).toBe(settings.monthlyBudgetCents)
  for (const f of await db.funds.toArray()) {
    const s = [...remote.t('savings_funds').values()].find((x) => x.kind === f.kind)!
    expect([s.allocated_cents, s.target_cents], msg(`fondo ${f.kind}`)).toEqual([f.allocatedCents, f.targetCents])
  }
}

const faults = { offline: 0, failUpsert: 0, loseAck: 0, reject: 0, ok: 0, syncs: 0, blockedSeen: 0 }
const SEEDS = 25
const OPS = 30

describe('fuzz de sincronización: historias aleatorias con fallos inyectados', () => {
  it(`${SEEDS} historias × ${OPS} operaciones convergen exactamente`, async () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = rng(seed)
      await freshDevice()
      const remote = new FakeRemote()
      let clock = 1_800_000_000_000
      const sync = () => runSync({ remote, userId: USER, now: () => clock })

      for (let i = 0; i < OPS; i++) {
        await randomOp(r)
        if (r() < 0.45) {
          // fallo aleatorio del entorno antes de intentar sincronizar
          remote.offline = remote.failUpsert = remote.loseAck = false
          remote.reject = () => false
          const f = r()
          if (f < 0.2) { remote.offline = true; faults.offline++ }
          else if (f < 0.35) { remote.failUpsert = true; faults.failUpsert++ }
          else if (f < 0.5) { remote.loseAck = true; faults.loseAck++ }
          else if (f < 0.6) { remote.reject = (t, row) => t === 'transactions' && row.note === 'bad'; faults.reject++ }
          else faults.ok++
          clock += int(r, 0, 120_000)
          const rep = await sync()
          faults.syncs++
          faults.blockedSeen += rep.blocked
        }
      }

      // Se arreglan los fallos y se deja pasar el tiempo: debe converger
      remote.offline = remote.failUpsert = remote.loseAck = false
      remote.reject = () => false
      clock += 3 * 86_400_000
      await resetBackoff()
      for (let k = 0; k < 4 && (await syncSnapshot()).pending > 0; k++) await sync()

      const snap = await syncSnapshot()
      expect(snap.pending, `[semilla ${seed}] pendientes tras arreglar fallos`).toBe(0)
      expect(snap.blocked, `[semilla ${seed}] bloqueados`).toBe(0)
      await compareWithServer(remote, seed)

      // Dispositivo nuevo: recupera exactamente el mismo estado
      const live = (await db.transactions.filter((t) => !t.deletedAt).toArray()).map((t) => [t.id, t.amountCents, t.note]).sort()
      const archived = (await db.categories.toArray()).map((c) => [c.id, !!c.archivedAt, c.isFavorite]).sort()
      const budget = (await db.settings.get('main'))!.monthlyBudgetCents
      const alloc = (await db.funds.toArray()).map((f) => [f.kind, f.allocatedCents]).sort()

      await freshDevice()
      const adopt = await sync()
      expect(adopt.outcome, `[semilla ${seed}] adopción: ${adopt.message}`).toBe('ok')
      expect((await db.transactions.filter((t) => !t.deletedAt).toArray()).map((t) => [t.id, t.amountCents, t.note]).sort(), `[semilla ${seed}] movimientos del 2.º dispositivo`).toEqual(live)
      expect((await db.categories.toArray()).map((c) => [c.id, !!c.archivedAt, c.isFavorite]).sort(), `[semilla ${seed}] categorías del 2.º dispositivo`).toEqual(archived)
      expect((await db.settings.get('main'))!.monthlyBudgetCents, `[semilla ${seed}] presupuesto del 2.º dispositivo`).toBe(budget)
      expect((await db.funds.toArray()).map((f) => [f.kind, f.allocatedCents]).sort(), `[semilla ${seed}] fondos del 2.º dispositivo`).toEqual(alloc)
      expect((await syncSnapshot()).pending, `[semilla ${seed}] el 2.º dispositivo no debe quedar con cambios pendientes`).toBe(0)
    }
    // El fuzz debe haber provocado de verdad todos los tipos de fallo (si no, no prueba nada)
    expect(faults.offline).toBeGreaterThan(10)
    expect(faults.failUpsert).toBeGreaterThan(10)
    expect(faults.loseAck).toBeGreaterThan(10)
    expect(faults.reject).toBeGreaterThan(5)
    expect(faults.blockedSeen).toBeGreaterThan(0)
    console.log('fuzz:', JSON.stringify(faults))
  }, 240_000)
})
