import type { Cents } from './money'
import type { CostItem, Fund, Settings } from './types'

/** Datos reales de partida definidos por el usuario. El saldo es un saldo de APERTURA, no un ingreso. */
export const DEFAULTS = {
  openingBalance: 386014 as Cents, // 3.860,14 €
  planningStart: '2026-11',
  planningEnd: '2027-12',
  quickAmounts: [100, 200, 300, 500, 1000, 2000] as Cents[],
} as const

export function defaultSettings(): Settings {
  return {
    id: 'main',
    monthlyBudgetCents: 79000,
    incomePlans: [
      { id: 'work', name: 'Trabajo principal', amountCents: 139150, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
      { id: 'football', name: 'Entrenador de fútbol', amountCents: 40000, months: [9, 10, 11, 12, 1, 2, 3, 4, 5, 6] },
    ],
    goals: { min: 1500000, main: 1700000, stretch: 2000000 },
    planStart: DEFAULTS.planningStart,
    targetMonth: DEFAULTS.planningEnd,
    savingTargets: { regular: 100000, summer: 60000, summerMonths: [7, 8] },
    updatedAt: new Date().toISOString(),
  }
}

const item = (id: string, name: string): CostItem => ({ id, name, cents: 0 })

export function defaultFunds(): Fund[] {
  const t = new Date().toISOString()
  return [
    { id: 'fund-emergency', kind: 'emergency', name: 'Fondo de emergencia', targetCents: 500000, allocatedCents: 0, items: [], updatedAt: t },
    {
      id: 'fund-independence', kind: 'independence', name: 'Fondo de independización', targetCents: 1200000, allocatedCents: 0, updatedAt: t,
      items: [
        item('fianza', 'Fianza'), item('primer-mes', 'Primer mes de alquiler'), item('agencia', 'Agencia (si procede)'),
        item('mudanza', 'Mudanza'), item('muebles', 'Muebles'), item('electro', 'Electrodomésticos'),
        item('gastos-iniciales', 'Gastos iniciales'), item('colchon', 'Colchón de seguridad'),
      ],
    },
  ]
}
