import { describe, expect, it } from 'vitest'
import { centsToDecimal, transactionsToCsv } from '@/data/backup/csv'
import { buildBackup, validateBackup } from '@/data/backup/format'
import { defaultFunds, defaultSettings } from '@/domain/defaults'
import { parseEuros } from '@/domain/money'
import type { Category, PlannedExpense, Tx } from '@/domain/types'
import { allocation, maxAllocatable } from './funds'
import { forecast, goalProgress } from './goals'
import { monthsBetween, planIncome } from './plan'
import { categoryBreakdown, monthlySeries, periodRange } from './stats'
import { monthSummary, netWorth } from './summary'

/**
 * Pruebas de PROPIEDADES: en vez de casos escritos a mano, se generan cientos de situaciones aleatorias (con semilla fija,
 * reproducibles) y se comprueban reglas que SIEMPRE deben cumplirse. Si una falla, el mensaje incluye la semilla.
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
const pick = <T,>(r: () => number, xs: readonly T[]) => xs[int(r, 0, xs.length - 1)]!
const T0 = '2026-11-04T10:00:00.000Z'
const TODAY = '2026-11-04'
const S = defaultSettings()
const CATS = ['c1', 'c2', 'c3', 'c4']

function randomDay(r: () => number) {
  const m = int(r, 0, 13) // nov-2026 … dic-2027
  const ym = monthsBetween('2026-11', '2027-12')[m]!
  return `${ym}-${String(int(r, 1, 28)).padStart(2, '0')}`
}
function randomTxs(r: () => number, n = int(r, 0, 60)): Tx[] {
  const out: Tx[] = [{ id: 'open', kind: 'opening', amountCents: int(r, 1, 900_000), occurredOn: '2026-11-01', categoryId: null, subcategoryId: null, note: '', plannedExpenseId: null, createdAt: T0, updatedAt: T0, deletedAt: null }]
  for (let i = 0; i < n; i++) {
    const kind = pick(r, ['income', 'expense', 'expense', 'expense', 'transfer'] as const)
    out.push({
      id: `t${i}`, kind, amountCents: int(r, 1, 500_000), occurredOn: randomDay(r), categoryId: kind === 'expense' ? pick(r, CATS) : null,
      subcategoryId: null, note: pick(r, ['', 'café', '=1+1', '-3', 'a;b', 'dice "hola"']), plannedExpenseId: null, createdAt: T0, updatedAt: T0, deletedAt: r() < 0.15 ? T0 : null,
    })
  }
  return out
}
const ITER = 200
const each = (name: string, fn: (r: () => number, seed: number) => void) =>
  it(name, () => { for (let seed = 1; seed <= ITER; seed++) { try { fn(rng(seed), seed) } catch (e) { throw new Error(`[semilla ${seed}] ${(e as Error).message}`) } } })

describe('patrimonio y resúmenes', () => {
  each('patrimonio = apertura + ingresos − gastos; ignora transferencias y borrados', (r) => {
    const txs = randomTxs(r)
    let expected = 0
    for (const t of txs) {
      if (t.deletedAt) continue
      if (t.kind === 'opening' || t.kind === 'income') expected += t.amountCents
      else if (t.kind === 'expense') expected -= t.amountCents
    }
    expect(netWorth(txs)).toBe(expected)
    expect(Number.isInteger(netWorth(txs))).toBe(true) // céntimos enteros, sin decimales flotantes
  })

  each('el patrimonio hasta una fecha + lo posterior = patrimonio total', (r) => {
    const txs = randomTxs(r)
    const d = randomDay(r)
    const after = txs.filter((t) => t.occurredOn > d)
    const afterNet = after.reduce((a, t) => a + (t.deletedAt ? 0 : t.kind === 'income' ? t.amountCents : t.kind === 'expense' ? -t.amountCents : 0), 0)
    expect(netWorth(txs, d) + afterNet).toBe(netWorth(txs))
  })

  each('borrar un movimiento cambia el patrimonio exactamente por su importe', (r) => {
    const txs = randomTxs(r, 20)
    const target = txs.find((t) => !t.deletedAt && (t.kind === 'income' || t.kind === 'expense'))
    if (!target) return
    const before = netWorth(txs)
    const after = netWorth(txs.map((t) => (t.id === target.id ? { ...t, deletedAt: T0 } : t)))
    expect(before - after).toBe(target.kind === 'income' ? target.amountCents : -target.amountCents)
  })

  each('la suma de los resúmenes mensuales = totales globales (nada se cuenta dos veces ni se pierde)', (r) => {
    const txs = randomTxs(r)
    const months = monthsBetween('2026-11', '2027-12')
    const sums = months.map((m) => monthSummary(txs, m))
    const live = txs.filter((t) => !t.deletedAt)
    expect(sums.reduce((a, s) => a + s.income, 0)).toBe(live.filter((t) => t.kind === 'income').reduce((a, t) => a + t.amountCents, 0))
    expect(sums.reduce((a, s) => a + s.expense, 0)).toBe(live.filter((t) => t.kind === 'expense').reduce((a, t) => a + t.amountCents, 0))
    for (const s of sums) expect(s.saving).toBe(s.income - s.expense)
    // la serie mensual coincide con los resúmenes
    const series = monthlySeries(txs, '2026-11', '2027-12')
    series.forEach((p, i) => expect([p.income, p.expense, p.saving]).toEqual([sums[i]!.income, sums[i]!.expense, sums[i]!.saving]))
  })

  each('gastos por categoría: suman exactamente los gastos del periodo y los % suman 100', (r) => {
    const txs = randomTxs(r)
    const range = periodRange('year', TODAY, int(r, 0, 1))
    const slices = categoryBreakdown(txs, range)
    const total = txs.filter((t) => !t.deletedAt && t.kind === 'expense' && t.occurredOn >= range.from && t.occurredOn <= range.to).reduce((a, t) => a + t.amountCents, 0)
    expect(slices.reduce((a, s) => a + s.cents, 0)).toBe(total)
    if (total > 0) expect(slices.reduce((a, s) => a + s.pct, 0)).toBeCloseTo(100, 6)
    for (let i = 1; i < slices.length; i++) expect(slices[i - 1]!.cents).toBeGreaterThanOrEqual(slices[i]!.cents) // ordenado
  })
})

describe('previsión (nunca mezcla lo real con lo previsto)', () => {
  const base = (txs: Tx[], planned: PlannedExpense[] = []) => forecast(txs, S, planned, TODAY)

  each('todos los puntos son previsión y cubren hasta el mes objetivo, y el patrimonio real no se altera', (r) => {
    const txs = randomTxs(r)
    const f = base(txs)
    expect(f.worthNow).toBe(netWorth(txs))
    expect(f.endOfMonth.isForecast && f.future.every((p) => p.isForecast)).toBe(true)
    expect(f.future.map((p) => p.ym)).toEqual(monthsBetween('2026-12', S.targetMonth))
    for (const p of [f.endOfMonth, ...f.future]) expect(Number.isInteger(p.worth)).toBe(true)
  })

  each('el orden de los movimientos no cambia la previsión', (r) => {
    const txs = randomTxs(r)
    const shuffled = [...txs].sort(() => r() - 0.5)
    expect(base(shuffled).endOfMonth.worth).toBe(base(txs).endOfMonth.worth)
    expect(base(shuffled).future.at(-1)!.worth).toBe(base(txs).future.at(-1)!.worth)
  })

  each('un gasto dentro del presupuesto restante no cambia la previsión de fin de mes; el exceso la baja exactamente', (r) => {
    const txs = randomTxs(r, 10).filter((t) => !t.occurredOn.startsWith('2026-11')) // mes actual limpio
    const f0 = base(txs)
    const room = S.monthlyBudgetCents // presupuesto íntegro disponible
    const within = int(r, 1, room)
    const withIn: Tx = { ...txs[0]!, id: 'x1', kind: 'expense', amountCents: within, occurredOn: '2026-11-03', categoryId: 'c1', deletedAt: null, plannedExpenseId: null }
    expect(base([...txs, withIn]).endOfMonth.worth).toBe(f0.endOfMonth.worth)
    const excess = int(r, 1, 100_000)
    const over: Tx = { ...withIn, id: 'x2', amountCents: room + excess }
    expect(base([...txs, over]).endOfMonth.worth).toBe(f0.endOfMonth.worth - excess)
  })

  each('cobrar lo previsto no altera la previsión; el ingreso extra la sube exactamente', (r) => {
    const txs = randomTxs(r, 8).filter((t) => !t.occurredOn.startsWith('2026-11'))
    const f0 = base(txs)
    const planned = planIncome(S, '2026-11')
    const mk = (id: string, cents: number): Tx => ({ ...txs[0]!, id, kind: 'income', amountCents: cents, occurredOn: '2026-11-02', categoryId: null, deletedAt: null, plannedExpenseId: null })
    expect(base([...txs, mk('i1', planned)]).endOfMonth.worth).toBe(f0.endOfMonth.worth)
    const extra = int(r, 1, 50_000)
    expect(base([...txs, mk('i2', planned + extra)]).endOfMonth.worth).toBe(f0.endOfMonth.worth + extra)
  })

  each('un gasto planificado pendiente reduce la previsión final EXACTAMENTE por su importe; realizado o cancelado, no', (r) => {
    const txs = randomTxs(r, 6)
    const cents = int(r, 1, 300_000)
    const mk = (status: PlannedExpense['status']): PlannedExpense => ({ id: 'p', name: 'x', estimatedCents: cents, plannedOn: randomDay(r), categoryId: null, subcategoryId: null, status, linkedTransactionId: null, createdAt: T0, updatedAt: T0, deletedAt: null })
    const f0 = base(txs)
    const withPending = base(txs, [mk('pending')])
    expect(f0.future.at(-1)!.worth - withPending.future.at(-1)!.worth).toBe(cents)
    expect(base(txs, [mk('done')]).future.at(-1)!.worth).toBe(f0.future.at(-1)!.worth)
    expect(base(txs, [mk('cancelled')]).future.at(-1)!.worth).toBe(f0.future.at(-1)!.worth)
  })
})

describe('objetivos y fondos', () => {
  each('dinero pendiente y esfuerzo mensual cumplen las fórmulas (con redondeo hacia arriba)', (r) => {
    const txs = randomTxs(r)
    const f = forecast(txs, S, [], TODAY)
    const target = int(r, 1_000_000, 3_000_000)
    const g = goalProgress(target, f, S, TODAY)
    expect(g.missing).toBe(Math.max(0, target - f.worthNow))
    expect(g.monthlyNeeded * g.monthsLeft).toBeGreaterThanOrEqual(g.missing)
    expect(g.monthlyNeeded * g.monthsLeft).toBeLessThan(g.missing + g.monthsLeft)
    expect(g.willReach).toBe(g.gapAtTarget >= 0)
    expect(g.pct).toBeCloseTo((f.worthNow / target) * 100, 9)
  })

  each('los fondos son asignaciones: asignado + libre = patrimonio; nunca se puede asignar de más', (r) => {
    const worth = int(r, 0, 2_000_000)
    const funds = defaultFunds().map((f) => ({ ...f, allocatedCents: int(r, 0, 1_500_000) }))
    const a = allocation(worth, funds)
    expect(a.allocated + a.free).toBe(worth)
    expect(a.overAllocated).toBe(a.free < 0)
    for (const f of funds) {
      const max = maxAllocatable(worth, funds, f.id)
      expect(max).toBeGreaterThanOrEqual(0)
      expect(max).toBeLessThanOrEqual(worth)
    }
  })
})

describe('copias, CSV e importes', () => {
  const cats = (): Category[] => CATS.map((id, i) => ({ id, parentId: null, name: `Cat ${i}`, icon: 'tag', color: '#55D6A0', isFavorite: false, favOrder: 0, sortOrder: i, archivedAt: null, createdAt: T0, updatedAt: T0 }))
  const data = (txs: Tx[]) => ({ categories: cats(), transactions: txs, planned: [], funds: defaultFunds(), settings: defaultSettings() })

  it('toda copia generada valida; y cualquier alteración de un solo campo se detecta', async () => {
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed)
      const txs = randomTxs(r, int(r, 1, 25))
      const backup = await buildBackup(data(txs))
      const ok = await validateBackup(JSON.parse(JSON.stringify(backup)))
      expect(ok.errors, `semilla ${seed}`).toEqual([])
      // altera un campo de un movimiento: el checksum debe delatarlo
      const tampered = JSON.parse(JSON.stringify(backup))
      const i = int(r, 0, tampered.data.transactions.length - 1)
      tampered.data.transactions[i].amountCents += 1
      const bad = await validateBackup(tampered)
      expect(bad.ok, `semilla ${seed}`).toBe(false)
    }
  })

  each('CSV: una fila por movimiento vivo y ninguna celda de texto empieza como fórmula', (r) => {
    const txs = randomTxs(r)
    const csv = transactionsToCsv(txs, cats())
    const lines = csv.replace('﻿', '').trimEnd().split('\r\n')
    // las notas con salto de línea no se generan aquí, así que 1 línea = 1 fila
    expect(lines.length - 1).toBe(txs.filter((t) => !t.deletedAt).length)
    for (const l of lines.slice(1)) {
      const note = l.split(';')[5] ?? ''
      expect(/^[=+\-@]/.test(note.replace(/^"/, ''))).toBe(false)
    }
  })

  each('importes: texto ↔ céntimos son inversos exactos (sin errores de coma flotante)', (r) => {
    const c = int(r, 0, 99_999_999)
    expect(parseEuros(centsToDecimal(c))).toBe(c)
  })
})
