import { monthOf } from '@/domain/dates'
import type { Cents } from '@/domain/money'
import type { Settings, Tx } from '@/domain/types'

export interface PendingIncome {
  id: string
  name: string
  plannedCents: Cents // lo previsto en el plan
  pendingCents: Cents // lo que aún no se ha registrado (> 0)
}

/**
 * Ingresos PREVISTOS del mes que todavía no se han registrado.
 *
 * Los movimientos reales no están enlazados a un ingreso previsto concreto, así que el reparto es una heurística:
 *  1) un ingreso registrado con el MISMO importe que uno previsto lo cubre entero;
 *  2) lo registrado que sobre se descuenta de los previstos restantes, de mayor a menor.
 * Garantía (probada): la suma de lo pendiente = max(0, previsto − registrado), exactamente lo que usa la previsión.
 */
export function pendingIncomePlans(txs: readonly Tx[], settings: Settings, ym: string): PendingIncome[] {
  const month = Number(ym.slice(5, 7))
  const plans = settings.incomePlans
    .filter((p) => p.amountCents > 0 && p.months.includes(month))
    .map((p) => ({ id: p.id, name: p.name, plannedCents: p.amountCents, pendingCents: p.amountCents }))
    .sort((a, b) => b.plannedCents - a.plannedCents)

  const received = txs.filter((t) => !t.deletedAt && t.kind === 'income' && monthOf(t.occurredOn) === ym).map((t) => t.amountCents)

  // 1) coincidencias exactas
  for (const p of plans) {
    const i = received.indexOf(p.plannedCents)
    if (i >= 0) {
      received.splice(i, 1)
      p.pendingCents = 0
    }
  }
  // 2) el resto de lo registrado cubre los previstos que quedan
  let rest = received.reduce((a, c) => a + c, 0)
  for (const p of plans) {
    if (p.pendingCents === 0 || rest === 0) continue
    const cover = Math.min(rest, p.pendingCents)
    p.pendingCents -= cover
    rest -= cover
  }
  return plans.filter((p) => p.pendingCents > 0)
}
