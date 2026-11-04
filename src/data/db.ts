import Dexie, { type Table } from 'dexie'
import type { Category, Fund, PlannedExpense, Settings, Tx } from '@/domain/types'

/** Estado de reintento por registro. La cola de envío se DERIVA de los datos (syncedAt !== updatedAt): no puede desincronizarse. */
export interface SyncStateRow {
  key: string // tabla:id
  table: string
  recordId: string
  attempts: number
  lastError: string
  nextAttemptAt: number // ms epoch
  blocked: boolean // el servidor lo rechazó (no es un fallo de red)
}

/** Copia interna (en este mismo navegador): protege de errores de la app o de una restauración equivocada. NO sustituye a una copia externa. */
export interface SnapshotRow {
  id: string
  at: string
  reason: 'auto' | 'pre-restore'
  json: string
  transactions: number
}

/** Registro de conflictos: la versión descartada se conserva aquí. */
export interface ConflictRow {
  id: string
  table: string
  recordId: string
  loser: 'local' | 'server'
  data: string // JSON de la versión descartada
  at: string
}

export interface MetaRow {
  key: string
  value: string
}

class SaldoDB extends Dexie {
  transactions!: Table<Tx, string>
  categories!: Table<Category, string>
  meta!: Table<MetaRow, string>
  settings!: Table<Settings, string>
  planned!: Table<PlannedExpense, string>
  funds!: Table<Fund, string>
  syncState!: Table<SyncStateRow, string>
  conflicts!: Table<ConflictRow, string>
  snapshots!: Table<SnapshotRow, string>

  constructor() {
    super('saldo')
    // La Fase 6 añadirá la cola de sincronización en una versión posterior.
    this.version(1).stores({
      transactions: 'id, occurredOn, kind, categoryId, subcategoryId, deletedAt, updatedAt',
      categories: 'id, parentId, isFavorite, archivedAt',
      meta: 'key',
    })
    this.version(2).stores({ categories: 'id, parentId, isFavorite, archivedAt, sortOrder' })
    this.version(3).stores({ settings: 'id', planned: 'id, status, plannedOn, deletedAt', funds: 'id, kind' })
    this.version(4).stores({ syncState: 'key, table, blocked', conflicts: 'id, at' })
    this.version(5).stores({ snapshots: 'id, at, reason' })
  }
}

export const db = new SaldoDB()
