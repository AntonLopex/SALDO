import type { Cents } from '@/domain/money'
import { monthOf } from '@/domain/dates'
import type { Tx } from '@/domain/types'

/**
 * Motor básico (Fase 3). Las transferencias internas nunca cuentan como ingreso ni gasto.
 * El saldo de apertura forma parte del patrimonio, no de los ingresos.
 */
export function netWorth(txs: readonly Tx[], upTo?: string): Cents {
  let total = 0
  for (const t of txs) {
    if (t.deletedAt || (upTo && t.occurredOn > upTo)) continue
    if (t.kind === 'opening' || t.kind === 'income') total += t.amountCents
    else if (t.kind === 'expense') total -= t.amountCents
  }
  return total
}

export interface MonthSummary {
  income: Cents
  expense: Cents
  saving: Cents // ahorro real = ingresos - gastos
  count: number // movimientos reales del mes (sin apertura)
}

export function monthSummary(txs: readonly Tx[], ym: string): MonthSummary {
  const s: MonthSummary = { income: 0, expense: 0, saving: 0, count: 0 }
  for (const t of txs) {
    if (t.deletedAt || monthOf(t.occurredOn) !== ym) continue
    if (t.kind === 'income') { s.income += t.amountCents; s.count++ }
    else if (t.kind === 'expense') { s.expense += t.amountCents; s.count++ }
  }
  s.saving = s.income - s.expense
  return s
}

export type BudgetLevel = 'ok' | 'info' | 'caution' | 'important' | 'exceeded'
export interface BudgetStatus {
  pct: number // puede superar 100
  remaining: Cents // negativo si se supera
  level: BudgetLevel
}

/** Umbrales: 50 % informativa, 75 % precaución, 90 % aviso importante, 100 % superado. */
export function budgetStatus(spent: Cents, budget: Cents): BudgetStatus {
  const pct = budget > 0 ? (spent / budget) * 100 : 0
  const level: BudgetLevel = pct >= 100 ? 'exceeded' : pct >= 90 ? 'important' : pct >= 75 ? 'caution' : pct >= 50 ? 'info' : 'ok'
  return { pct, remaining: budget - spent, level }
}

/** Mensajes comparativos: solo si el mes anterior tiene datos reales suficientes. */
export function compareMonths(txs: readonly Tx[], ym: string, prevYm: string): string[] {
  const cur = monthSummary(txs, ym)
  const prev = monthSummary(txs, prevYm)
  const out: string[] = []
  if (cur.count === 0 || prev.count === 0) return out
  const eur = (c: Cents) => Math.abs(Math.round(c / 100)).toLocaleString('es-ES') + ' €'
  const diff = cur.saving - prev.saving
  if (Math.abs(diff) >= 100) out.push(diff > 0 ? `Este mes has ahorrado ${eur(diff)} más que el mes pasado.` : `Este mes has ahorrado ${eur(diff)} menos que el mes pasado.`)
  if (prev.expense > 0 && cur.expense < prev.expense) {
    const p = Math.round((1 - cur.expense / prev.expense) * 100)
    if (p >= 1) out.push(`Has reducido tus gastos un ${p} %.`)
  }
  return out
}
