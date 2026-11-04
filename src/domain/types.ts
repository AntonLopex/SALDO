import type { Cents } from './money'

export type TxKind = 'income' | 'expense' | 'opening' | 'transfer'

export interface Tx {
  id: string // UUID generado en cliente (idempotencia en la sincronización)
  kind: TxKind
  amountCents: Cents // siempre > 0
  occurredOn: string // fecha local YYYY-MM-DD (nunca instante UTC)
  categoryId: string | null
  subcategoryId: string | null
  note: string
  plannedExpenseId: string | null
  createdAt: string // ISO
  updatedAt: string // ISO
  deletedAt: string | null // borrado lógico
  /** Sincronización: valor de updatedAt que el servidor confirmó. Pendiente = syncedAt !== updatedAt. */
  syncedAt?: string
  /** updated_at del servidor en la última sincronización (versión base para detectar conflictos). */
  serverUpdatedAt?: string
}

export interface Category {
  id: string
  parentId: string | null // null = categoría; si no, subcategoría
  name: string
  icon: string
  color: string
  isFavorite: boolean
  favOrder: number
  sortOrder: number
  archivedAt: string | null // "eliminar" = archivar, para no romper el historial
  createdAt: string
  updatedAt: string
  /** Sincronización: valor de updatedAt que el servidor confirmó. Pendiente = syncedAt !== updatedAt. */
  syncedAt?: string
  /** updated_at del servidor en la última sincronización (versión base para detectar conflictos). */
  serverUpdatedAt?: string
}

export interface IncomePlan {
  id: string
  name: string
  amountCents: number
  months: number[] // 1..12
}

export interface Settings {
  id: 'main'
  monthlyBudgetCents: number
  incomePlans: IncomePlan[]
  goals: { min: number; main: number; stretch: number }
  planStart: string // YYYY-MM
  targetMonth: string // YYYY-MM
  savingTargets: { regular: number; summer: number; summerMonths: number[] }
  updatedAt: string
  /** Sincronización: valor de updatedAt que el servidor confirmó. Pendiente = syncedAt !== updatedAt. */
  syncedAt?: string
  /** updated_at del servidor en la última sincronización (versión base para detectar conflictos). */
  serverUpdatedAt?: string
}

export type PlannedStatus = 'pending' | 'done' | 'cancelled'

export interface PlannedExpense {
  id: string
  name: string
  estimatedCents: number
  plannedOn: string // YYYY-MM-DD
  categoryId: string | null
  subcategoryId: string | null
  status: PlannedStatus
  linkedTransactionId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  /** Sincronización: valor de updatedAt que el servidor confirmó. Pendiente = syncedAt !== updatedAt. */
  syncedAt?: string
  /** updated_at del servidor en la última sincronización (versión base para detectar conflictos). */
  serverUpdatedAt?: string
}

export interface CostItem {
  id: string
  name: string
  cents: number
}

/** Fondo virtual: una ASIGNACIÓN del patrimonio existente, nunca dinero adicional. */
export interface Fund {
  id: string
  kind: 'emergency' | 'independence'
  name: string
  targetCents: number
  allocatedCents: number
  items: CostItem[] // desglose estimado (solo informativo)
  updatedAt: string
  /** Sincronización: valor de updatedAt que el servidor confirmó. Pendiente = syncedAt !== updatedAt. */
  syncedAt?: string
  /** updated_at del servidor en la última sincronización (versión base para detectar conflictos). */
  serverUpdatedAt?: string
}
