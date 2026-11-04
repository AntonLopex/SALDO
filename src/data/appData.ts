import { liveQuery } from 'dexie'
import { computed, ref } from 'vue'
import { db } from './db'
import { seedIfNeeded, seedSettingsIfNeeded } from './seed'
import { maybeAutoSnapshot } from './backup/io'
import { defaultSettings } from '@/domain/defaults'
import type { Category, Fund, PlannedExpense, Settings, Tx } from '@/domain/types'

/** Estado compartido y reactivo de la app, alimentado directamente desde IndexedDB. */
export const txs = ref<Tx[]>([])
/** Incluye archivadas: el historial puede seguir apuntando a ellas. */
export const allCategories = ref<Category[]>([])
export const categories = computed(() => allCategories.value.filter((c) => c.archivedAt === null))
export const settings = ref<Settings>(defaultSettings())
export const planned = ref<PlannedExpense[]>([])
export const funds = ref<Fund[]>([])
/** Última exportación manual (ISO) o null. */
export const lastExport = ref<string | null>(null)
export const dataReady = ref(false)
export const dataError = ref<string | null>(null)

let started = false
export async function startData(): Promise<void> {
  if (started) return
  started = true
  try {
    await seedIfNeeded()
    await seedSettingsIfNeeded()
    let gotTx = false
    let gotCat = false
    let gotSet = false
    const check = () => {
      if (gotTx && gotCat && gotSet && !dataReady.value) {
        dataReady.value = true
        void maybeAutoSnapshot().catch(() => undefined) // copia interna semanal, sin bloquear la app
      }
    }
    liveQuery(() => db.transactions.filter((t) => t.deletedAt === null).toArray()).subscribe({
      next: (v) => { txs.value = v; gotTx = true; check() },
      error: (e) => { dataError.value = String(e) },
    })
    liveQuery(() => db.categories.orderBy('sortOrder').toArray()).subscribe({
      next: (v) => { allCategories.value = v; gotCat = true; check() },
      error: (e) => { dataError.value = String(e) },
    })
    liveQuery(async () => ({ s: await db.settings.get('main'), p: await db.planned.filter((x) => x.deletedAt === null).toArray(), f: await db.funds.toArray() })).subscribe({
      next: (v) => { if (v.s) settings.value = v.s; planned.value = v.p; funds.value = v.f; gotSet = true; check() },
      error: (e) => { dataError.value = String(e) },
    })
    liveQuery(() => db.meta.get('lastExportAt')).subscribe({ next: (m) => { lastExport.value = m?.value ?? null } })
  } catch (e) {
    dataError.value = e instanceof Error ? e.message : String(e)
  }
}

export const categoryById = computed(() => new Map(allCategories.value.map((c) => [c.id, c])))
export const topCategories = computed(() => categories.value.filter((c) => c.parentId === null))
export const subsOf = (id: string) => categories.value.filter((c) => c.parentId === id)
export const favorites = computed(() =>
  categories.value.filter((c) => c.isFavorite).sort((a, b) => a.favOrder - b.favOrder),
)

/** Etiqueta "Categoría › Sub" o solo la categoría. */
export function categoryLabel(t: Pick<Tx, 'categoryId' | 'subcategoryId'>): string {
  const sub = t.subcategoryId ? categoryById.value.get(t.subcategoryId) : undefined
  const cat = t.categoryId ? categoryById.value.get(t.categoryId) : undefined
  return sub?.name ?? cat?.name ?? 'Sin categoría'
}
