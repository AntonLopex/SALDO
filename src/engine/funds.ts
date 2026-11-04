import type { Cents } from '@/domain/money'
import type { CostItem, Fund } from '@/domain/types'

/**
 * Los fondos son ASIGNACIONES del patrimonio: no generan movimientos ni suman al total.
 * Patrimonio = asignado a fondos + libre.
 */
export interface Allocation {
  worth: Cents
  allocated: Cents
  free: Cents // patrimonio − asignado (puede ser negativo si se redujo el patrimonio)
  overAllocated: boolean
}

export function allocation(worth: Cents, funds: readonly Fund[]): Allocation {
  const allocated = funds.reduce((a, f) => a + f.allocatedCents, 0)
  return { worth, allocated, free: worth - allocated, overAllocated: allocated > worth }
}

/** Máximo que se puede asignar a un fondo sin superar el patrimonio (≥ 0). */
export function maxAllocatable(worth: Cents, funds: readonly Fund[], fundId: string): Cents {
  const others = funds.filter((f) => f.id !== fundId).reduce((a, f) => a + f.allocatedCents, 0)
  return Math.max(0, worth - others)
}

export const fundProgress = (f: Fund) => (f.targetCents > 0 ? Math.min(100, (f.allocatedCents / f.targetCents) * 100) : 0)

export const costTotal = (items: readonly CostItem[]): Cents => items.reduce((a, i) => a + i.cents, 0)
