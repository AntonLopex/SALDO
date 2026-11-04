import type { Category, Fund, PlannedExpense, Settings, Tx } from '@/domain/types'
import { netWorth } from '@/engine/summary'

/**
 * Formato de copia de seguridad de SALDO (versión 1).
 * - Importes siempre en céntimos (enteros).
 * - `checksum` = SHA-256 del contenido canónico de `data`: detecta archivos dañados o editados a mano.
 * - No incluye marcas de sincronización: una copia se puede restaurar en cualquier dispositivo.
 */
export const FORMAT_VERSION = 1

export interface BackupData {
  categories: Category[]
  transactions: Tx[]
  planned: PlannedExpense[]
  funds: Fund[]
  settings: Settings | null
}

export interface BackupFile {
  app: 'saldo'
  formatVersion: number
  exportedAt: string
  source: 'device' | 'cloud'
  counts: { categories: number; transactions: number; planned: number; funds: number }
  checksum: string
  data: BackupData
}

// ───────────────────────── canonicalización y checksum ─────────────────────────

/** JSON con claves ordenadas: mismo contenido → mismo texto, independientemente del orden de inserción. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Quita marcas de sincronización: no forman parte de la copia. */
const strip = <T extends object>(row: T): T => {
  const { syncedAt: _a, serverUpdatedAt: _b, ...rest } = row as T & { syncedAt?: string; serverUpdatedAt?: string }
  return rest as T
}

export async function buildBackup(data: BackupData, source: BackupFile['source'] = 'device', now = new Date()): Promise<BackupFile> {
  const clean: BackupData = {
    categories: data.categories.map(strip),
    transactions: data.transactions.map(strip),
    planned: data.planned.map(strip),
    funds: data.funds.map(strip),
    settings: data.settings ? strip(data.settings) : null,
  }
  return {
    app: 'saldo',
    formatVersion: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    source,
    counts: { categories: clean.categories.length, transactions: clean.transactions.length, planned: clean.planned.length, funds: clean.funds.length },
    checksum: await sha256Hex(canonical(clean)),
    data: clean,
  }
}

// ───────────────────────── validación ─────────────────────────

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  backup?: BackupFile
}

const MAX_CENTS = 100_000_000_000
const MAX_ERRORS = 20
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const nullableStr = (v: unknown) => v === null || isStr(v)

function isRealDate(s: unknown): boolean {
  if (!isStr(s) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}
const isMonth = (s: unknown) => isStr(s) && /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export async function validateBackup(input: unknown): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const err = (m: string) => { if (errors.length < MAX_ERRORS) errors.push(m); else if (errors.length === MAX_ERRORS) errors.push('… y más errores.') }
  const fail = (): ValidationResult => ({ ok: false, errors, warnings })

  if (!isObj(input) || input.app !== 'saldo') { err('El archivo no es una copia de SALDO.'); return fail() }
  if (!isInt(input.formatVersion)) { err('Falta la versión del formato.'); return fail() }
  if (input.formatVersion > FORMAT_VERSION) { err(`La copia es de una versión más nueva del formato (${input.formatVersion}). Actualiza la app.`); return fail() }
  if (!isObj(input.data)) { err('La copia no contiene datos.'); return fail() }
  const d = input.data
  for (const k of ['categories', 'transactions', 'planned', 'funds'] as const) {
    if (!Array.isArray(d[k])) err(`Falta la sección «${k}».`)
  }
  if (errors.length) return fail()

  const cats = d.categories as unknown[]
  const txs = d.transactions as unknown[]
  const planned = d.planned as unknown[]
  const funds = d.funds as unknown[]

  // Integridad del contenido
  const expected = await sha256Hex(canonical(d))
  if (input.checksum !== expected) err('La suma de comprobación no coincide: el archivo está dañado o se modificó.')

  // Categorías
  const catById = new Map<string, Record<string, unknown>>()
  cats.forEach((c, i) => {
    const w = `Categoría ${i + 1}`
    if (!isObj(c) || !isStr(c.id) || !c.id) return err(`${w}: sin identificador.`)
    if (catById.has(c.id)) return err(`${w}: identificador repetido.`)
    catById.set(c.id, c)
    if (!isStr(c.name) || !c.name.trim() || c.name.length > 40) err(`${w}: nombre no válido.`)
    if (!isStr(c.color) || !/^#[0-9A-Fa-f]{6}$/.test(c.color)) err(`${w} («${String(c.name)}»): color no válido.`)
    if (!isStr(c.icon)) err(`${w}: icono no válido.`)
    if (!nullableStr(c.parentId)) err(`${w}: padre no válido.`)
    if (typeof c.isFavorite !== 'boolean' || !isInt(c.favOrder) || !isInt(c.sortOrder)) err(`${w}: campos de orden no válidos.`)
  })
  for (const [id, c] of catById) {
    if (c.parentId == null) continue
    const p = catById.get(c.parentId as string)
    if (!p) err(`La subcategoría «${String(c.name)}» apunta a una categoría que no existe.`)
    else if (p.parentId != null) err(`La subcategoría «${String(c.name)}» cuelga de otra subcategoría.`)
    if (c.parentId === id) err(`La categoría «${String(c.name)}» es su propio padre.`)
  }

  // Gastos planificados
  const plannedIds = new Set<string>()
  planned.forEach((p, i) => {
    const w = `Gasto planificado ${i + 1}`
    if (!isObj(p) || !isStr(p.id) || !p.id) return err(`${w}: sin identificador.`)
    if (plannedIds.has(p.id)) return err(`${w}: identificador repetido.`)
    plannedIds.add(p.id)
    if (!isStr(p.name) || !p.name.trim()) err(`${w}: nombre no válido.`)
    if (!isInt(p.estimatedCents) || p.estimatedCents <= 0 || p.estimatedCents > MAX_CENTS) err(`${w}: importe no válido.`)
    if (!isRealDate(p.plannedOn)) err(`${w}: fecha no válida.`)
    if (!['pending', 'done', 'cancelled'].includes(p.status as string)) err(`${w}: estado no válido.`)
    if (p.categoryId != null && !catById.has(p.categoryId as string)) err(`${w}: categoría inexistente.`)
    if (p.subcategoryId != null && catById.get(p.subcategoryId as string)?.parentId !== p.categoryId) err(`${w}: la subcategoría no pertenece a su categoría.`)
  })

  // Movimientos
  const txIds = new Set<string>()
  let openings = 0
  txs.forEach((t, i) => {
    const w = `Movimiento ${i + 1}`
    if (!isObj(t) || !isStr(t.id) || !t.id) return err(`${w}: sin identificador.`)
    if (txIds.has(t.id)) return err(`${w}: identificador repetido (duplicado).`)
    txIds.add(t.id)
    if (!['income', 'expense', 'opening', 'transfer'].includes(t.kind as string)) err(`${w}: tipo no válido.`)
    if (!isInt(t.amountCents) || t.amountCents <= 0 || t.amountCents > MAX_CENTS) err(`${w}: importe no válido (debe ser un entero de céntimos mayor que 0).`)
    if (!isRealDate(t.occurredOn)) err(`${w}: fecha no válida.`)
    if (!isStr(t.note) || t.note.length > 500) err(`${w}: nota no válida.`)
    if (t.categoryId != null && !catById.has(t.categoryId as string)) err(`${w}: categoría inexistente.`)
    if (t.subcategoryId != null && (t.categoryId == null || catById.get(t.subcategoryId as string)?.parentId !== t.categoryId)) err(`${w}: la subcategoría no pertenece a su categoría.`)
    if (t.plannedExpenseId != null && !plannedIds.has(t.plannedExpenseId as string)) err(`${w}: gasto planificado inexistente.`)
    if (!nullableStr(t.deletedAt)) err(`${w}: fecha de borrado no válida.`)
    if (t.kind === 'opening' && t.deletedAt == null) openings++
  })
  if (openings > 1) err('Hay más de un saldo de apertura activo.')
  if (openings === 0 && txs.length) warnings.push('La copia no incluye saldo de apertura: el patrimonio no partirá de tu saldo inicial.')

  // Fondos
  const kinds = new Set<string>()
  funds.forEach((f, i) => {
    const w = `Fondo ${i + 1}`
    if (!isObj(f) || !isStr(f.id)) return err(`${w}: sin identificador.`)
    if (!['emergency', 'independence'].includes(f.kind as string)) err(`${w}: tipo no válido.`)
    else if (kinds.has(f.kind as string)) err(`${w}: tipo de fondo repetido.`)
    else kinds.add(f.kind as string)
    if (!isInt(f.targetCents) || f.targetCents <= 0) err(`${w}: objetivo no válido.`)
    if (!isInt(f.allocatedCents) || f.allocatedCents < 0) err(`${w}: importe asignado no válido.`)
    if (!Array.isArray(f.items) || f.items.some((x) => !isObj(x) || !isStr(x.id) || !isStr(x.name) || !isInt(x.cents) || x.cents < 0)) err(`${w}: desglose de costes no válido.`)
  })

  // Ajustes
  const s = d.settings
  if (s != null) {
    if (!isObj(s)) err('Los ajustes no son válidos.')
    else {
      if (!isInt(s.monthlyBudgetCents) || s.monthlyBudgetCents <= 0) err('Ajustes: presupuesto no válido.')
      const g = s.goals
      if (!isObj(g) || !isInt(g.min) || !isInt(g.main) || !isInt(g.stretch) || g.min <= 0 || !(g.min <= g.main && g.main <= g.stretch)) err('Ajustes: objetivos no válidos.')
      if (!isMonth(s.planStart) || !isMonth(s.targetMonth) || (s.targetMonth as string) < (s.planStart as string)) err('Ajustes: fechas del plan no válidas.')
      const st = s.savingTargets
      if (!isObj(st) || !isInt(st.regular) || !isInt(st.summer) || st.regular < 0 || st.summer < 0 || !Array.isArray(st.summerMonths) || st.summerMonths.some((m) => !isInt(m) || m < 1 || m > 12)) err('Ajustes: ahorro objetivo no válido.')
      if (!Array.isArray(s.incomePlans) || s.incomePlans.some((p) => !isObj(p) || !isStr(p.name) || !isInt(p.amountCents) || p.amountCents < 0 || !Array.isArray(p.months) || !p.months.length || p.months.some((m) => !isInt(m) || m < 1 || m > 12))) err('Ajustes: ingresos previstos no válidos.')
    }
  } else warnings.push('La copia no incluye ajustes: se conservarán los actuales.')

  if (errors.length) return fail()
  return { ok: true, errors, warnings, backup: input as unknown as BackupFile }
}

export interface BackupSummary {
  transactions: number // movimientos reales vivos (ingresos y gastos)
  firstDate: string | null
  lastDate: string | null
  worthCents: number
  exportedAt: string
}

export function summarize(b: BackupFile): BackupSummary {
  const real = b.data.transactions.filter((t) => !t.deletedAt && (t.kind === 'income' || t.kind === 'expense'))
  const dates = real.map((t) => t.occurredOn).sort()
  return { transactions: real.length, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, worthCents: netWorth(b.data.transactions), exportedAt: b.exportedAt }
}
