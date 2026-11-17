import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@/domain/defaults'
import type { Tx } from '@/domain/types'
import { forecast } from './goals'
import { pendingIncomePlans } from './pending'

const S = defaultSettings() // trabajo 1.391,50 € todo el año + fútbol 400 € de septiembre a junio
const T0 = '2026-11-04T10:00:00.000Z'
let n = 0
const income = (cents: number, on = '2026-11-02', extra: Partial<Tx> = {}): Tx => ({
  id: `i${n++}`, kind: 'income', amountCents: cents, occurredOn: on, categoryId: null, subcategoryId: null, note: '',
  plannedExpenseId: null, createdAt: T0, updatedAt: T0, deletedAt: null, ...extra,
})
const names = (r: ReturnType<typeof pendingIncomePlans>) => r.map((p) => `${p.name}:${p.pendingCents}`)

describe('ingresos previstos pendientes', () => {
  it('un reembolso (ingreso con categoría) no cubre el sueldo previsto', () => {
    const r = income(139150, '2026-11-12', { categoryId: 'viajes' })
    expect(names(pendingIncomePlans([r], S, '2026-11'))).toEqual(['Trabajo principal:139150', 'Entrenador de fútbol:40000'])
    expect(forecast([r], S, [], '2026-11-15').pendingIncome).toBe(139150 + 40000)
  })

  it('sin ingresos registrados: pendientes los dos previstos de noviembre', () => {
    expect(names(pendingIncomePlans([], S, '2026-11'))).toEqual(['Trabajo principal:139150', 'Entrenador de fútbol:40000'])
  })

  it('en julio y agosto el fútbol no está previsto', () => {
    expect(names(pendingIncomePlans([], S, '2027-07'))).toEqual(['Trabajo principal:139150'])
    expect(names(pendingIncomePlans([], S, '2027-08'))).toEqual(['Trabajo principal:139150'])
  })

  it('un ingreso con el mismo importe cubre ese previsto y deja el otro', () => {
    expect(names(pendingIncomePlans([income(139150)], S, '2026-11'))).toEqual(['Entrenador de fútbol:40000'])
    expect(names(pendingIncomePlans([income(40000)], S, '2026-11'))).toEqual(['Trabajo principal:139150'])
  })

  it('los dos registrados: no queda nada pendiente', () => {
    expect(pendingIncomePlans([income(139150), income(40000)], S, '2026-11')).toEqual([])
  })

  it('un ingreso por el total junto (1.791,50 €) cubre ambos', () => {
    expect(pendingIncomePlans([income(179150)], S, '2026-11')).toEqual([])
  })

  it('un cobro parcial descuenta de lo previsto', () => {
    expect(names(pendingIncomePlans([income(100000)], S, '2026-11'))).toEqual(['Trabajo principal:39150', 'Entrenador de fútbol:40000'])
  })

  it('un ingreso mayor que lo previsto no deja pendiente nada (ni importes negativos)', () => {
    expect(pendingIncomePlans([income(500000)], S, '2026-11')).toEqual([])
  })

  it('ignora ingresos de otros meses, borrados, gastos y la apertura', () => {
    const txs = [
      income(139150, '2026-10-30'), income(139150, '2026-12-01'), income(40000, '2026-11-03', { deletedAt: T0 }),
      income(139150, '2026-11-03', { kind: 'expense' }), income(386014, '2026-11-01', { kind: 'opening' }),
    ]
    expect(names(pendingIncomePlans(txs, S, '2026-11'))).toEqual(['Trabajo principal:139150', 'Entrenador de fútbol:40000'])
  })

  it('un previsto con importe 0 no genera un aviso', () => {
    const s = { ...S, incomePlans: [{ id: 'x', name: 'Cero', amountCents: 0, months: [11] }] }
    expect(pendingIncomePlans([], s, '2026-11')).toEqual([])
  })

  it('SUMA = lo que usa la previsión (nunca se contradicen), con 300 situaciones aleatorias', () => {
    let seed = 7
    const r = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    for (let i = 0; i < 300; i++) {
      const txs: Tx[] = []
      for (let k = 0; k < Math.floor(r() * 5); k++) {
        const cents = r() < 0.4 ? (r() < 0.5 ? 139150 : 40000) : 1 + Math.floor(r() * 250000)
        txs.push(income(cents, '2026-11-0' + (1 + Math.floor(r() * 8)), { deletedAt: r() < 0.15 ? T0 : null }))
      }
      const pending = pendingIncomePlans(txs, S, '2026-11').reduce((a, p) => a + p.pendingCents, 0)
      const f = forecast(txs, S, [], '2026-11-04')
      expect(pending, `caso ${i}`).toBe(f.pendingIncome)
    }
  })
})
