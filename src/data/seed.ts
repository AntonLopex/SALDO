import { db } from './db'
import { DEFAULTS, defaultFunds, defaultSettings } from '@/domain/defaults'
import type { Category, Tx } from '@/domain/types'

interface SeedCat {
  name: string
  icon: string
  color: string
  fav?: boolean
  subs: { name: string; icon: string; fav?: boolean }[]
}

// Categorías y subcategorías precargadas (las marcadas fav son tus favoritas iniciales).
const SEED: SeedCat[] = [
  { name: 'Restauración', icon: 'utensils', color: '#F2C66D', subs: [
    { name: 'Café', icon: 'coffee', fav: true },
    { name: 'Tomar algo en un bar', icon: 'beer', fav: true },
    { name: 'Coca-Cola y bebidas', icon: 'cup-soda' },
    { name: 'Desayuno fuera', icon: 'croissant' },
    { name: 'Comida en restaurante', icon: 'utensils', fav: true },
    { name: 'Cena en restaurante', icon: 'moon', fav: true },
    { name: 'Comida rápida', icon: 'pizza' },
  ] },
  { name: 'Ropa', icon: 'shirt', color: '#B79CED', subs: [
    { name: 'Ropa de vestir', icon: 'shirt', fav: true },
    { name: 'Ropa de entrenamiento', icon: 'dumbbell', fav: true },
    { name: 'Calzado', icon: 'footprints' },
    { name: 'Accesorios', icon: 'watch' },
  ] },
  { name: 'Fútbol y deporte', icon: 'goal', color: '#55D6A0', fav: true, subs: [
    { name: 'Botas de fútbol', icon: 'footprints' },
    { name: 'Material deportivo', icon: 'trophy' },
    { name: 'Equipamiento', icon: 'shirt' },
    { name: 'Otros gastos deportivos', icon: 'tag' },
  ] },
  { name: 'Ocio', icon: 'party-popper', color: '#FF8FB1', fav: true, subs: [
    { name: 'Salir de fiesta', icon: 'party-popper' },
    { name: 'Copas y bebidas', icon: 'wine' },
    { name: 'Cine', icon: 'clapperboard' },
    { name: 'Actividades', icon: 'ticket' },
    { name: 'Otros planes', icon: 'tag' },
  ] },
  { name: 'Pareja', icon: 'heart', color: '#FF786B', subs: [
    { name: 'Comidas juntos', icon: 'utensils' },
    { name: 'Cenas juntos', icon: 'moon' },
    { name: 'Viajes juntos', icon: 'plane' },
    { name: 'Regalos', icon: 'gift' },
    { name: 'Otros', icon: 'tag' },
  ] },
  { name: 'Viajes', icon: 'plane', color: '#6CC4F2', subs: [
    { name: 'Transporte', icon: 'bus' },
    { name: 'Alojamiento', icon: 'bed' },
    { name: 'Comidas', icon: 'utensils' },
    { name: 'Actividades', icon: 'ticket' },
    { name: 'Otros gastos de viaje', icon: 'tag' },
  ] },
  { name: 'Transporte', icon: 'bus', color: '#8FA3B3', subs: [] },
  { name: 'Tecnología', icon: 'laptop', color: '#6C8CF2', subs: [] },
  { name: 'Suscripciones', icon: 'repeat', color: '#C4A26C', subs: [] },
  { name: 'Salud', icon: 'heart-pulse', color: '#7BD88F', subs: [] },
  { name: 'Regalos', icon: 'gift', color: '#F29C6C', subs: [] },
  { name: 'Otros', icon: 'tag', color: '#929DA5', subs: [] },
]

const now = () => new Date().toISOString()

/** Crea categorías y saldo de apertura la primera vez. Idempotente. */
export async function seedIfNeeded(): Promise<void> {
  await db.transaction('rw', db.categories, db.transactions, db.meta, async () => {
    if (await db.meta.get('seeded')) return
    const t = now()
    const cats: Category[] = []
    let sort = 0
    let fav = 0
    for (const c of SEED) {
      const parent: Category = {
        id: crypto.randomUUID(), parentId: null, name: c.name, icon: c.icon, color: c.color,
        isFavorite: !!c.fav, favOrder: 0, sortOrder: sort++, archivedAt: null, createdAt: t, updatedAt: t,
      }
      cats.push(parent)
      for (const s of c.subs) {
        cats.push({
          id: crypto.randomUUID(), parentId: parent.id, name: s.name, icon: s.icon, color: c.color,
          isFavorite: !!s.fav, favOrder: 0, sortOrder: sort++, archivedAt: null, createdAt: t, updatedAt: t,
        })
      }
    }
    // Orden inicial de favoritas según el orden de aparición
    for (const c of cats) if (c.isFavorite) c.favOrder = fav++
    await db.categories.bulkAdd(cats)

    const opening: Tx = {
      id: crypto.randomUUID(), kind: 'opening', amountCents: DEFAULTS.openingBalance,
      occurredOn: `${DEFAULTS.planningStart}-01`, categoryId: null, subcategoryId: null,
      note: 'Saldo de apertura', plannedExpenseId: null, createdAt: t, updatedAt: t, deletedAt: null,
    }
    await db.transactions.add(opening)
    await db.meta.put({ key: 'seeded', value: t })
  })
}

/** Ajustes y fondos iniciales (Fase 4). Idempotente e independiente del seed anterior. */
export async function seedSettingsIfNeeded(): Promise<void> {
  await db.transaction('rw', db.settings, db.funds, async () => {
    if (!(await db.settings.get('main'))) await db.settings.add(defaultSettings())
    if ((await db.funds.count()) === 0) await db.funds.bulkAdd(defaultFunds())
  })
}
