import { addDaysISO, addMonths, monthOf, toISODate } from '@/domain/dates'
import type { Cents } from '@/domain/money'
import type { Tx } from '@/domain/types'
import { monthsBetween } from './plan'
import { isReimbursement, netWorth } from './summary'

export type PeriodMode = 'month' | 'quarter' | 'year' | 'custom'
export interface Range {
  from: string // YYYY-MM-DD
  to: string
}

const lastDay = (ym: string) => addDaysISO(`${addMonths(ym, 1)}-01`, -1)

/** Rango de fechas del periodo; offset desplaza hacia atrás (-1) o adelante (+1) respecto a hoy. */
export function periodRange(mode: Exclude<PeriodMode, 'custom'>, today: string, offset = 0): Range {
  const ym = monthOf(today)
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  if (mode === 'month') {
    const t = addMonths(ym, offset)
    return { from: `${t}-01`, to: lastDay(t) }
  }
  if (mode === 'quarter') {
    const startMonth = Math.floor((m - 1) / 3) * 3 + 1 + offset * 3
    const start = toISODate(new Date(y, startMonth - 1, 1)).slice(0, 7)
    return { from: `${start}-01`, to: lastDay(addMonths(start, 2)) }
  }
  return { from: `${y + offset}-01-01`, to: `${y + offset}-12-31` }
}

export interface CategorySlice {
  categoryId: string | null
  cents: Cents
  pct: number
}

/** Gastos por categoría principal (las subcategorías se agrupan en su categoría). Solo gastos reales. */
export function categoryBreakdown(txs: readonly Tx[], range: Range): CategorySlice[] {
  const sums = new Map<string | null, Cents>()
  let total = 0
  for (const t of txs) {
    if (t.deletedAt || t.occurredOn < range.from || t.occurredOn > range.to) continue
    if (t.kind !== 'expense' && !isReimbursement(t)) continue
    const signed = t.kind === 'expense' ? t.amountCents : -t.amountCents // el reembolso resta de su categoría
    sums.set(t.categoryId, (sums.get(t.categoryId) ?? 0) + signed)
  }
  for (const [k, v] of sums) if (v <= 0) sums.delete(k) // categoría totalmente reembolsada: no aparece
  for (const v of sums.values()) total += v
  return [...sums]
    .map(([categoryId, cents]) => ({ categoryId, cents, pct: total ? (cents / total) * 100 : 0 }))
    .sort((a, b) => b.cents - a.cents)
}

export interface MonthPoint {
  ym: string
  income: Cents
  expense: Cents
  saving: Cents
}

export function monthlySeries(txs: readonly Tx[], fromYm: string, toYm: string): MonthPoint[] {
  const pts = new Map(monthsBetween(fromYm, toYm).map((ym) => [ym, { ym, income: 0, expense: 0, saving: 0 }]))
  for (const t of txs) {
    if (t.deletedAt) continue
    const p = pts.get(monthOf(t.occurredOn))
    if (!p) continue
    if (isReimbursement(t)) p.expense -= t.amountCents
    else if (t.kind === 'income') p.income += t.amountCents
    else if (t.kind === 'expense') p.expense += t.amountCents
  }
  for (const p of pts.values()) p.saving = p.income - p.expense
  return [...pts.values()]
}

/** Patrimonio REAL al final de cada mes (sin previsiones). */
export function worthSeries(txs: readonly Tx[], fromYm: string, toYm: string): { ym: string; worth: Cents }[] {
  return monthsBetween(fromYm, toYm).map((ym) => ({ ym, worth: netWorth(txs, lastDay(ym)) }))
}

export interface RangeSummary {
  income: Cents
  expense: Cents
  saving: Cents
  count: number
}

/** Totales reales de un rango de fechas (sin apertura ni transferencias). */
export function rangeSummary(txs: readonly Tx[], range: Range): RangeSummary {
  const s: RangeSummary = { income: 0, expense: 0, saving: 0, count: 0 }
  for (const t of txs) {
    if (t.deletedAt || t.occurredOn < range.from || t.occurredOn > range.to) continue
    if (isReimbursement(t)) { s.expense -= t.amountCents; s.count++ }
    else if (t.kind === 'income') { s.income += t.amountCents; s.count++ }
    else if (t.kind === 'expense') { s.expense += t.amountCents; s.count++ }
  }
  s.saving = s.income - s.expense
  return s
}

/** Rango anterior de la misma longitud (para comparar periodos, incluido el personalizado). */
export function previousRange(r: Range): Range {
  const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86400000) + 1
  return { from: addDaysISO(r.from, -days), to: addDaysISO(r.from, -1) }
}
