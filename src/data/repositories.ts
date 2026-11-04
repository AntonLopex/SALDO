import { db } from './db'
import { plain } from './plain'
import type { Category, Fund, PlannedExpense, Settings, Tx, TxKind } from '@/domain/types'

const now = () => new Date().toISOString()

export interface NewTx {
  kind: Extract<TxKind, 'income' | 'expense'>
  amountCents: number
  occurredOn: string
  categoryId: string | null
  subcategoryId: string | null
  note: string
  plannedExpenseId?: string | null
}

export const txRepo = {
  /** Movimientos vivos (no borrados). */
  async all(): Promise<Tx[]> {
    return db.transactions.filter((t) => t.deletedAt === null).toArray()
  },
  get: (id: string) => db.transactions.get(id),

  async add(input: NewTx): Promise<Tx> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Importe no válido')
    const t = now()
    const tx: Tx = {
      id: crypto.randomUUID(), ...input, plannedExpenseId: input.plannedExpenseId ?? null,
      note: input.note.trim(), createdAt: t, updatedAt: t, deletedAt: null,
    }
    // Si el gasto cumple uno planificado, se enlaza en la misma transacción para no contarlo dos veces.
    await db.transaction('rw', db.transactions, db.planned, async () => {
      await db.transactions.add(tx)
      if (tx.plannedExpenseId) await db.planned.update(tx.plannedExpenseId, { status: 'done', linkedTransactionId: tx.id, updatedAt: t })
    })
    return tx
  },

  async update(id: string, patch: Partial<NewTx>): Promise<void> {
    if (patch.amountCents !== undefined && (!Number.isInteger(patch.amountCents) || patch.amountCents <= 0)) {
      throw new Error('Importe no válido')
    }
    await db.transactions.update(id, { ...patch, updatedAt: now() })
  },

  /** Si el movimiento cumplía un gasto planificado, éste vuelve a pendiente. */
  async softDelete(id: string): Promise<void> {
    await db.transaction('rw', db.transactions, db.planned, async () => {
      const tx = await db.transactions.get(id)
      await db.transactions.update(id, { deletedAt: now(), updatedAt: now() })
      if (tx?.plannedExpenseId) await db.planned.update(tx.plannedExpenseId, { status: 'pending', linkedTransactionId: null, updatedAt: now() })
    })
  },
  async restore(id: string): Promise<void> {
    await db.transaction('rw', db.transactions, db.planned, async () => {
      const tx = await db.transactions.get(id)
      await db.transactions.update(id, { deletedAt: null, updatedAt: now() })
      if (tx?.plannedExpenseId) await db.planned.update(tx.plannedExpenseId, { status: 'done', linkedTransactionId: id, updatedAt: now() })
    })
  },
}

export const categoryRepo = {
  async all(): Promise<Category[]> {
    return db.categories.filter((c) => c.archivedAt === null).sortBy('sortOrder')
  },

  async setFavorite(id: string, fav: boolean): Promise<void> {
    await db.transaction('rw', db.categories, async () => {
      const max = (await db.categories.filter((c) => c.isFavorite).toArray()).reduce((m, c) => Math.max(m, c.favOrder), -1)
      await db.categories.update(id, { isFavorite: fav, favOrder: fav ? max + 1 : 0, updatedAt: now() })
    })
  },

  /** Intercambia la posición de dos favoritas. */
  async swapFavOrder(a: Category, b: Category): Promise<void> {
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(a.id, { favOrder: b.favOrder, updatedAt: now() })
      await db.categories.update(b.id, { favOrder: a.favOrder, updatedAt: now() })
    })
  },

  async create(input: { parentId: string | null; name: string; icon: string; color: string }): Promise<void> {
    const name = input.name.trim()
    if (!name) throw new Error('Pon un nombre')
    const t = now()
    const last = (await db.categories.toArray()).reduce((m, c) => Math.max(m, c.sortOrder), -1)
    await db.categories.add({
      id: crypto.randomUUID(), parentId: input.parentId, name, icon: input.icon, color: input.color,
      isFavorite: false, favOrder: 0, sortOrder: last + 1, archivedAt: null, createdAt: t, updatedAt: t,
    })
  },

  async update(id: string, patch: Partial<Pick<Category, 'name' | 'icon' | 'color'>>): Promise<void> {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('Pon un nombre')
    await db.categories.update(id, { ...patch, ...(patch.name ? { name: patch.name.trim() } : {}), updatedAt: now() })
  },

  /** Eliminar = archivar (y sus subcategorías): los movimientos históricos conservan su categoría. */
  async archive(id: string): Promise<void> {
    await db.transaction('rw', db.categories, async () => {
      const t = now()
      const kids = await db.categories.where('parentId').equals(id).primaryKeys()
      for (const k of [id, ...kids]) await db.categories.update(k, { archivedAt: t, isFavorite: false, updatedAt: t })
    })
  },
}

export const settingsRepo = {
  async save(settings: Settings): Promise<void> {
    await db.settings.put(plain({ ...settings, updatedAt: now() }))
  },
}

export interface NewPlanned {
  name: string
  estimatedCents: number
  plannedOn: string
  categoryId: string | null
  subcategoryId: string | null
}

export const plannedRepo = {
  async add(input: NewPlanned): Promise<void> {
    if (!input.name.trim()) throw new Error('Pon un nombre')
    if (!Number.isInteger(input.estimatedCents) || input.estimatedCents <= 0) throw new Error('Importe no válido')
    const t = now()
    const row: PlannedExpense = { id: crypto.randomUUID(), ...input, name: input.name.trim(), status: 'pending', linkedTransactionId: null, createdAt: t, updatedAt: t, deletedAt: null }
    await db.planned.add(row)
  },
  async update(id: string, patch: Partial<NewPlanned>): Promise<void> {
    await db.planned.update(id, { ...patch, updatedAt: now() })
  },
  setStatus: (id: string, status: 'pending' | 'cancelled') => db.planned.update(id, { status, updatedAt: now() }),
  remove: (id: string) => db.planned.update(id, { deletedAt: now(), updatedAt: now() }),
  get: (id: string) => db.planned.get(id),
}

export const fundRepo = {
  async save(fund: Fund): Promise<void> {
    await db.funds.put(plain({ ...fund, updatedAt: now() }))
  },
}
