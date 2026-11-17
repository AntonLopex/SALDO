import { addMonths, monthOf } from '@/domain/dates'
import type { Cents } from '@/domain/money'
import type { PlannedExpense, Settings, Tx } from '@/domain/types'
import { monthsBetween, openingAmount, planIncome, trajectoryAt } from './plan'
import { monthSummary, netWorth } from './summary'

/** Margen en el que se considera "en línea" (50 €). */
export const ON_TRACK_TOLERANCE: Cents = 5000

export interface ForecastPoint {
  ym: string
  worth: Cents
  isForecast: true // nunca se mezcla con cifras reales
}

export interface Forecast {
  /** Patrimonio real hoy (dato, no previsión). */
  worthNow: Cents
  /** Fin del mes actual, incluido lo que falta por cobrar/gastar. */
  endOfMonth: ForecastPoint
  /** Fin de cada mes futuro, hasta el mes objetivo. */
  future: ForecastPoint[]
  /** Desglose del mes actual, para explicarlo en pantalla. */
  pendingIncome: Cents
  pendingSpend: Cents
  pendingPlanned: Cents
}

/** Gastos planificados pendientes en un mes. Los vencidos (fecha pasada) cuentan en el mes actual. */
export function pendingPlannedIn(planned: readonly PlannedExpense[], ym: string, currentYm: string): Cents {
  let sum = 0
  for (const p of planned) {
    if (p.status !== 'pending' || p.deletedAt) continue
    const pm = monthOf(p.plannedOn)
    const bucket = pm < currentYm ? currentYm : pm
    if (bucket === ym) sum += p.estimatedCents
  }
  return sum
}

/**
 * Previsión. Supuestos (deben mostrarse al usuario):
 *  - lo que falta cobrar del mes = ingreso previsto − ingreso ya registrado (nunca negativo);
 *  - el gasto ordinario del mes llega al presupuesto;
 *  - los gastos planificados pendientes se descuentan en su mes; los ya realizados NO (ya están en los movimientos).
 */
export function forecast(txs: readonly Tx[], s: Settings, planned: readonly PlannedExpense[], today: string): Forecast {
  const cm = monthOf(today)
  const worthNow = netWorth(txs)
  const cur = monthSummary(txs, cm)
  // Gastos ya realizados que cumplían un gasto planificado no consumen el presupuesto ordinario.
  const plannedLinked = txs
    .filter((t) => !t.deletedAt && t.kind === 'expense' && t.plannedExpenseId && monthOf(t.occurredOn) === cm)
    .reduce((a, t) => a + t.amountCents, 0)
  const ordinarySpent = Math.max(0, cur.expense - plannedLinked) // con reembolsos el gasto neto puede ser menor

  const pendingIncome = Math.max(0, planIncome(s, cm) - cur.income)
  const pendingSpend = Math.max(0, s.monthlyBudgetCents - ordinarySpent)
  const pendingPlanned = pendingPlannedIn(planned, cm, cm)

  let w = worthNow + pendingIncome - pendingSpend - pendingPlanned
  const endOfMonth: ForecastPoint = { ym: cm, worth: w, isForecast: true }
  const future: ForecastPoint[] = []
  for (const m of monthsBetween(addMonths(cm, 1), s.targetMonth)) {
    w += planIncome(s, m) - s.monthlyBudgetCents - pendingPlannedIn(planned, m, cm)
    future.push({ ym: m, worth: w, isForecast: true })
  }
  return { worthNow, endOfMonth, future, pendingIncome, pendingSpend, pendingPlanned }
}

/** Previsión en un mes concreto (fin de mes). Si es posterior al objetivo, devuelve el último punto. */
export function forecastAtMonth(f: Forecast, ym: string): ForecastPoint {
  if (ym <= f.endOfMonth.ym) return f.endOfMonth
  return f.future.find((p) => p.ym === ym) ?? f.future[f.future.length - 1] ?? f.endOfMonth
}

export type TrackStatus = 'ahead' | 'on-track' | 'behind'

export interface TrackInfo {
  status: TrackStatus
  deviation: Cents // previsión fin de mes − trayectoria objetivo (positivo = por delante)
  expected: Cents // trayectoria objetivo a fin de mes
  projected: Cents
  hasData: boolean // hay movimientos reales (sin ellos, el estado sale solo del plan)
}

export function trackStatus(txs: readonly Tx[], s: Settings, f: Forecast): TrackInfo {
  const opening = openingAmount(txs)
  const expected = trajectoryAt(s, opening, f.endOfMonth.ym)
  const deviation = f.endOfMonth.worth - expected
  const status: TrackStatus = deviation > ON_TRACK_TOLERANCE ? 'ahead' : deviation < -ON_TRACK_TOLERANCE ? 'behind' : 'on-track'
  const hasData = txs.some((t) => !t.deletedAt && (t.kind === 'income' || t.kind === 'expense'))
  return { status, deviation, expected, projected: f.endOfMonth.worth, hasData }
}

export interface GoalProgress {
  target: Cents
  pct: number // patrimonio real / objetivo (0..100+)
  missing: Cents // dinero pendiente = objetivo − patrimonio (≥ 0)
  /** Fórmula base: pendiente / meses restantes (incluye el mes actual). */
  monthlyNeeded: Cents
  /** Esfuerzo recalculado para los meses SIGUIENTES, partiendo de la previsión de este mes. */
  monthlyNeededNext: Cents
  monthsLeft: number
  projectedAtTarget: Cents
  /** Diferencia prevista contra el objetivo en la fecha objetivo (≥ 0 = se alcanza). */
  gapAtTarget: Cents
  willReach: boolean
}

export function goalProgress(target: Cents, f: Forecast, s: Settings, today: string): GoalProgress {
  const cm = monthOf(today)
  const monthsLeft = Math.max(1, monthsBetween(cm, s.targetMonth).length)
  const missing = Math.max(0, target - f.worthNow)
  const monthsAfter = monthsLeft - 1
  const afterThisMonth = Math.max(0, target - f.endOfMonth.worth)
  const projectedAtTarget = (f.future[f.future.length - 1] ?? f.endOfMonth).worth
  return {
    target,
    pct: target > 0 ? (f.worthNow / target) * 100 : 0,
    missing,
    monthlyNeeded: Math.ceil(missing / monthsLeft),
    monthlyNeededNext: monthsAfter > 0 ? Math.ceil(afterThisMonth / monthsAfter) : afterThisMonth,
    monthsLeft,
    projectedAtTarget,
    gapAtTarget: projectedAtTarget - target,
    willReach: projectedAtTarget >= target,
  }
}

/** Capacidad media de ahorro de los meses siguientes según el plan (ingreso − presupuesto − planificados). */
export function nextMonthsCapacity(f: Forecast): Cents {
  if (!f.future.length) return 0
  const end = f.future[f.future.length - 1]!.worth
  return Math.round((end - f.endOfMonth.worth) / f.future.length)
}
