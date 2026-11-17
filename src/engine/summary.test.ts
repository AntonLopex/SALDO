import { describe, expect, it } from 'vitest'
import type { Tx, TxKind } from '@/domain/types'
import { budgetStatus, compareMonths, monthSummary, netWorth } from './summary'

let n = 0
const tx = (kind: TxKind, amountCents: number, occurredOn: string, deleted = false): Tx => ({
  id: String(n++), kind, amountCents, occurredOn, categoryId: null, subcategoryId: null, note: '',
  plannedExpenseId: null, createdAt: '', updatedAt: '', deletedAt: deleted ? 'x' : null,
})

describe('netWorth', () => {
  it('apertura + ingresos - gastos; ignora transferencias y borrados', () => {
    const txs = [
      tx('opening', 386014, '2026-11-01'), tx('income', 100000, '2026-11-05'), tx('expense', 14000, '2026-11-06'),
      tx('transfer', 50000, '2026-11-07'), tx('expense', 99999, '2026-11-08', true),
    ]
    expect(netWorth(txs)).toBe(386014 + 100000 - 14000)
  })
  it('puede limitarse a una fecha', () => {
    const txs = [tx('opening', 1000, '2026-11-01'), tx('expense', 300, '2026-12-01')]
    expect(netWorth(txs, '2026-11-30')).toBe(1000)
  })
})

describe('monthSummary', () => {
  it('la apertura no cuenta como ingreso', () => {
    const txs = [tx('opening', 386014, '2026-11-01'), tx('income', 179000, '2026-11-28'), tx('expense', 1500, '2026-11-02'), tx('expense', 500, '2026-12-01')]
    expect(monthSummary(txs, '2026-11')).toEqual({ income: 179000, expense: 1500, saving: 177500, count: 2, reimbursed: 0 })
  })
})

describe('reembolsos (ingreso con categoría)', () => {
  const reimb = (c: number, on: string): Tx => ({ ...tx('income', c, on), categoryId: 'viajes' })
  it('descuentan del gasto del mes y del presupuesto; no cuentan como ingreso', () => {
    // Viaje de 1.000 € pagado entero; la pareja devuelve 500 €; sueldo 1.391,50 €
    const txs = [tx('income', 139150, '2026-11-01'), tx('expense', 100000, '2026-11-10'), reimb(50000, '2026-11-12')]
    const m = monthSummary(txs, '2026-11')
    expect(m).toEqual({ income: 139150, expense: 50000, saving: 89150, count: 3, reimbursed: 50000 })
    expect(budgetStatus(m.expense, 79000).remaining).toBe(29000) // antes: superado en 210 €
  })
  it('el ahorro no cambia con el reembolso (mismo dinero), y el patrimonio tampoco', () => {
    const base = [tx('opening', 1000, '2026-10-01'), tx('income', 139150, '2026-11-01'), tx('expense', 100000, '2026-11-10')]
    const con = [...base, reimb(50000, '2026-11-12')]
    expect(netWorth(con)).toBe(netWorth(base) + 50000)
    expect(monthSummary(con, '2026-11').saving).toBe(monthSummary(base, '2026-11').saving + 50000)
  })
  it('un ingreso normal (sin categoría) sigue siendo ingreso', () => {
    expect(monthSummary([tx('income', 100, '2026-11-01')], '2026-11')).toMatchObject({ income: 100, expense: 0, reimbursed: 0 })
  })
})

describe('budgetStatus', () => {
  it.each([
    [0, 'ok'], [39499, 'ok'], [39500, 'info'], [59250, 'caution'], [71100, 'important'], [79000, 'exceeded'], [90000, 'exceeded'],
  ])('gastado %d → %s', (spent, level) => expect(budgetStatus(spent, 79000).level).toBe(level))
  it('resto negativo si se supera', () => expect(budgetStatus(80000, 79000).remaining).toBe(-1000))
})

describe('compareMonths', () => {
  it('sin datos del mes anterior no genera mensajes', () => {
    expect(compareMonths([tx('expense', 100, '2026-12-02')], '2026-12', '2026-11')).toEqual([])
  })
  it('genera mensajes con datos reales', () => {
    const txs = [tx('income', 100000, '2026-11-01'), tx('expense', 40000, '2026-11-02'), tx('income', 100000, '2026-12-01'), tx('expense', 34000, '2026-12-02')]
    const m = compareMonths(txs, '2026-12', '2026-11')
    expect(m[0]).toContain('60 € más')
    expect(m[1]).toBe('Has reducido tus gastos un 15 %.')
  })
})
