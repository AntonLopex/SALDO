import { addMonths } from '@/domain/dates'
import type { Cents } from '@/domain/money'
import type { Settings, Tx } from '@/domain/types'

/** Meses "YYYY-MM" entre dos meses, ambos incluidos. Vacío si from > to. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m)
  return out
}

const monthNum = (ym: string) => Number(ym.slice(5, 7))

/** Ingresos PREVISTOS (plan), no reales. */
export function planIncome(s: Settings, ym: string): Cents {
  return s.incomePlans.reduce((sum, p) => (p.months.includes(monthNum(ym)) ? sum + p.amountCents : sum), 0)
}

export function savingTarget(s: Settings, ym: string): Cents {
  return s.savingTargets.summerMonths.includes(monthNum(ym)) ? s.savingTargets.summer : s.savingTargets.regular
}

export function openingAmount(txs: readonly Tx[]): Cents {
  return txs.filter((t) => t.kind === 'opening' && !t.deletedAt).reduce((a, t) => a + t.amountCents, 0)
}

/**
 * Trayectoria objetivo: patrimonio esperado al FINAL de cada mes si se cumple el ahorro objetivo.
 * Antes del inicio del plan = saldo de apertura; después del objetivo se mantiene.
 */
export function trajectoryAt(s: Settings, opening: Cents, ym: string): Cents {
  let total = opening
  for (const m of monthsBetween(s.planStart, ym < s.targetMonth ? ym : s.targetMonth)) total += savingTarget(s, m)
  return total
}

/** Ahorro objetivo acumulado del plan completo (para validar que el plan llega a la meta). */
export function plannedSavingTotal(s: Settings): Cents {
  return monthsBetween(s.planStart, s.targetMonth).reduce((a, m) => a + savingTarget(s, m), 0)
}
