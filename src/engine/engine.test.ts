import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@/domain/defaults'
import type { Fund, PlannedExpense, Tx, TxKind } from '@/domain/types'
import { allocation, costTotal, maxAllocatable } from './funds'
import { forecast, forecastAtMonth, goalProgress, nextMonthsCapacity, trackStatus } from './goals'
import { monthsBetween, plannedSavingTotal, planIncome, savingTarget, trajectoryAt } from './plan'
import { categoryBreakdown, monthlySeries, periodRange, worthSeries } from './stats'

let n = 0
const tx = (kind: TxKind, amountCents: number, occurredOn: string, extra: Partial<Tx> = {}): Tx => ({
  id: String(n++), kind, amountCents, occurredOn, categoryId: null, subcategoryId: null, note: '',
  plannedExpenseId: null, createdAt: '', updatedAt: '', deletedAt: null, ...extra,
})
const planned = (estimatedCents: number, plannedOn: string, status: PlannedExpense['status'] = 'pending'): PlannedExpense => ({
  id: String(n++), name: 'x', estimatedCents, plannedOn, categoryId: null, subcategoryId: null, status,
  linkedTransactionId: null, createdAt: '', updatedAt: '', deletedAt: null,
})

const S = defaultSettings()
const OPEN = tx('opening', 386014, '2026-11-01')
const TODAY = '2026-11-04'

describe('plan', () => {
  it('meses entre fechas (inclusive)', () => {
    expect(monthsBetween('2026-11', '2027-12')).toHaveLength(14)
    expect(monthsBetween('2027-02', '2027-01')).toEqual([])
  })
  it('ingreso previsto por mes: con y sin fútbol', () => {
    expect(planIncome(S, '2026-11')).toBe(179150)
    expect(planIncome(S, '2027-07')).toBe(139150)
    expect(planIncome(S, '2027-08')).toBe(139150)
  })
  it('ahorro objetivo: 1.000 € salvo julio-agosto 600 €', () => {
    expect(savingTarget(S, '2027-03')).toBe(100000)
    expect(savingTarget(S, '2027-07')).toBe(60000)
  })
  it('el plan suma 13.200 € y la trayectoria final es 17.060,14 €', () => {
    expect(plannedSavingTotal(S)).toBe(1320000)
    expect(trajectoryAt(S, 386014, '2027-12')).toBe(1706014)
    expect(trajectoryAt(S, 386014, '2030-01')).toBe(1706014) // se mantiene tras el objetivo
    expect(trajectoryAt(S, 386014, '2026-10')).toBe(386014) // antes del plan = apertura
  })
})

describe('forecast', () => {
  it('sin movimientos: cobra lo previsto y gasta el presupuesto', () => {
    const f = forecast([OPEN], S, [], TODAY)
    expect(f.worthNow).toBe(386014)
    expect(f.pendingIncome).toBe(179150)
    expect(f.pendingSpend).toBe(79000)
    expect(f.endOfMonth.worth).toBe(486164)
    expect(f.future).toHaveLength(13)
    expect(f.future.at(-1)!.worth).toBe(1708114)
    expect(f.endOfMonth.isForecast).toBe(true)
  })
  it('gastar dentro del presupuesto no cambia la previsión de fin de mes', () => {
    const f = forecast([OPEN, tx('expense', 30000, '2026-11-02')], S, [], TODAY)
    expect(f.worthNow).toBe(356014)
    expect(f.endOfMonth.worth).toBe(486164)
  })
  it('superar el presupuesto reduce la previsión', () => {
    const f = forecast([OPEN, tx('expense', 100000, '2026-11-02')], S, [], TODAY)
    expect(f.endOfMonth.worth).toBe(465164)
  })
  it('ingreso ya cobrado no se cuenta dos veces', () => {
    const f = forecast([OPEN, tx('income', 139150, '2026-11-01')], S, [], TODAY)
    expect(f.pendingIncome).toBe(40000)
    expect(f.endOfMonth.worth).toBe(486164)
  })
  it('gasto planificado pendiente se descuenta en su mes; el vencido en el actual', () => {
    const f = forecast([OPEN], S, [planned(50000, '2027-01-15'), planned(10000, '2026-10-15')], TODAY)
    expect(f.pendingPlanned).toBe(10000)
    expect(f.endOfMonth.worth).toBe(476164)
    expect(f.future.at(-1)!.worth).toBe(1708114 - 60000)
  })
  it('gasto planificado realizado no se cuenta dos veces', () => {
    const p = planned(20000, '2026-11-10', 'done')
    const real = tx('expense', 20000, '2026-11-10', { plannedExpenseId: p.id })
    const f = forecast([OPEN, real], S, [p], TODAY)
    expect(f.pendingPlanned).toBe(0)
    expect(f.pendingSpend).toBe(79000) // no consume el presupuesto ordinario
    expect(f.endOfMonth.worth).toBe(386014 - 20000 + 179150 - 79000)
  })
  it('ignora planificados cancelados y borrados', () => {
    const del = { ...planned(5000, '2026-11-20'), deletedAt: 'x' }
    expect(forecast([OPEN], S, [planned(5000, '2026-11-20', 'cancelled'), del], TODAY).pendingPlanned).toBe(0)
  })
  it('forecastAtMonth', () => {
    const f = forecast([OPEN], S, [], TODAY)
    expect(forecastAtMonth(f, '2026-11').worth).toBe(486164)
    expect(forecastAtMonth(f, '2027-12').worth).toBe(1708114)
    expect(forecastAtMonth(f, '2030-01').worth).toBe(1708114)
  })
})

describe('trackStatus (nunca marca el objetivo como perdido)', () => {
  const st = (txs: Tx[]) => trackStatus(txs, S, forecast(txs, S, [], TODAY))
  it('en línea con el plan', () => {
    const t = st([OPEN])
    expect(t.status).toBe('on-track')
    expect(t.deviation).toBe(150)
    expect(t.hasData).toBe(false)
  })
  it('por delante', () => {
    const t = st([OPEN, tx('income', 200000, '2026-11-02')])
    expect(t.status).toBe('ahead')
    expect(t.deviation).toBe(21000)
    expect(t.hasData).toBe(true)
  })
  it('por detrás tras un mal mes, pero sigue siendo recuperable', () => {
    const txs = [OPEN, tx('expense', 100000, '2026-11-02')]
    const t = st(txs)
    expect(t.status).toBe('behind')
    const g = goalProgress(1700000, forecast(txs, S, [], TODAY), S, TODAY)
    const base = goalProgress(1700000, forecast([OPEN], S, [], TODAY), S, TODAY)
    expect(g.monthlyNeededNext).toBeGreaterThan(base.monthlyNeededNext) // tras un mal mes, el esfuerzo siguiente sube
    expect(g.missing).toBeGreaterThan(0)
    // 1.000 € gastados = 210 € sobre el presupuesto: 1.708.114 − 21.000 = 1.687.114 (faltan 128,86 € en lo previsto)
    expect(g.gapAtTarget).toBe(-12886)
    expect(g.missing).toBe(1700000 - 286014) // el objetivo no se da por perdido: solo se recalcula el esfuerzo
  })
})

describe('goalProgress', () => {
  const f = forecast([OPEN], S, [], TODAY)
  const g = goalProgress(1700000, f, S, TODAY)
  it('fórmulas base', () => {
    expect(g.missing).toBe(1313986)
    expect(g.monthsLeft).toBe(14)
    expect(g.monthlyNeeded).toBe(93857)
    expect(g.pct).toBeCloseTo(22.7, 1)
  })
  it('esfuerzo recalculado para los meses siguientes', () => {
    expect(g.monthlyNeededNext).toBe(93372)
  })
  it('previsión de cumplimiento', () => {
    expect(g.willReach).toBe(true)
    expect(g.gapAtTarget).toBe(8114)
    const ambitious = goalProgress(2000000, f, S, TODAY)
    expect(ambitious.willReach).toBe(false)
    expect(ambitious.gapAtTarget).toBe(1708114 - 2000000)
  })
  it('capacidad media de ahorro futuro', () => {
    expect(nextMonthsCapacity(f)).toBe(Math.round((1708114 - 486164) / 13))
  })
  it('en el último mes no divide por cero', () => {
    const last = goalProgress(1700000, forecast([OPEN], S, [], '2027-12-05'), S, '2027-12-05')
    expect(last.monthsLeft).toBe(1)
    expect(Number.isFinite(last.monthlyNeededNext)).toBe(true)
  })
})

describe('fondos virtuales', () => {
  const fund = (id: string, allocatedCents: number): Fund => ({ id, kind: 'emergency', name: id, targetCents: 500000, allocatedCents, items: [], updatedAt: '' })
  it('son asignaciones: patrimonio = asignado + libre', () => {
    const a = allocation(386014, [fund('a', 100000), fund('b', 50000)])
    expect(a.allocated + a.free).toBe(386014)
    expect(a.overAllocated).toBe(false)
  })
  it('detecta sobreasignación', () => {
    expect(allocation(100000, [fund('a', 150000)]).overAllocated).toBe(true)
  })
  it('máximo asignable descuenta los otros fondos', () => {
    expect(maxAllocatable(386014, [fund('a', 100000), fund('b', 50000)], 'b')).toBe(286014)
    expect(maxAllocatable(1000, [fund('a', 5000), fund('b', 0)], 'b')).toBe(0)
  })
  it('suma del desglose de costes', () => {
    expect(costTotal([{ id: '1', name: 'a', cents: 150000 }, { id: '2', name: 'b', cents: 99900 }])).toBe(249900)
  })
})

describe('estadísticas', () => {
  it('rangos de periodo', () => {
    expect(periodRange('month', TODAY)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodRange('month', TODAY, -1)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('quarter', TODAY)).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(periodRange('quarter', TODAY, 1)).toEqual({ from: '2027-01-01', to: '2027-03-31' })
    expect(periodRange('year', TODAY, 1)).toEqual({ from: '2027-01-01', to: '2027-12-31' })
  })
  it('gastos por categoría suman 100 % y excluyen ingresos y borrados', () => {
    const txs = [
      tx('expense', 3000, '2026-11-02', { categoryId: 'a' }), tx('expense', 1000, '2026-11-03', { categoryId: 'b' }),
      tx('income', 99999, '2026-11-03'), tx('expense', 5000, '2026-11-04', { categoryId: 'a', deletedAt: 'x' }),
      tx('expense', 700, '2026-12-01', { categoryId: 'b' }),
    ]
    const r = categoryBreakdown(txs, periodRange('month', TODAY))
    expect(r).toEqual([{ categoryId: 'a', cents: 3000, pct: 75 }, { categoryId: 'b', cents: 1000, pct: 25 }])
  })
  it('serie mensual y patrimonio real', () => {
    const txs = [OPEN, tx('income', 179000, '2026-11-28'), tx('expense', 1500, '2026-12-02')]
    expect(monthlySeries(txs, '2026-11', '2026-12')).toEqual([
      { ym: '2026-11', income: 179000, expense: 0, saving: 179000 },
      { ym: '2026-12', income: 0, expense: 1500, saving: -1500 },
    ])
    expect(worthSeries(txs, '2026-11', '2026-12').map((p) => p.worth)).toEqual([386014 + 179000, 386014 + 179000 - 1500])
  })
})

import { previousRange, rangeSummary } from './stats'
describe('comparativa de periodos', () => {
  it('resume un rango con datos reales', () => {
    const txs = [tx('opening', 100, '2026-11-01'), tx('income', 5000, '2026-11-05'), tx('expense', 1200, '2026-11-06'), tx('expense', 900, '2026-12-01')]
    expect(rangeSummary(txs, periodRange('month', '2026-11-04'))).toEqual({ income: 5000, expense: 1200, saving: 3800, count: 2 })
  })
  it('rango anterior con la misma longitud', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ from: '2026-10-02', to: '2026-10-31' })
    expect(previousRange({ from: '2026-11-10', to: '2026-11-12' })).toEqual({ from: '2026-11-07', to: '2026-11-09' })
  })
})
