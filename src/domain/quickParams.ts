import { parseEuros } from './money'
import type { Category } from './types'

/**
 * Parámetros de la URL del formulario rápido, pensados para los Atajos de iOS:
 *   /nuevo-gasto?importe=3,50&categoria=Café&nota=Con%20leche
 *   /nuevo-gasto?tipo=ingreso&importe=1391,50
 *
 * REGLA DE SEGURIDAD: estos parámetros solo RELLENAN el formulario. Nunca guardan nada: un enlace o una web ajena
 * no debe poder registrarte movimientos con solo abrirlo. El último toque (Guardar) es siempre tuyo.
 * Todo valor no válido o ambiguo se IGNORA en silencio (nunca se adivina ni se rompe la pantalla).
 */
export interface QuickParams {
  kind?: 'expense' | 'income'
  amountText?: string
  categoryId?: string
  subcategoryId?: string | null
  note?: string
}

type Raw = string | null | undefined | (string | null)[]
export type QuickQuery = Record<string, Raw>

/** Tope razonable (999.999,99 €): protege de valores absurdos en un enlace. */
export const MAX_QUICK_CENTS = 99_999_999
export const MAX_NOTE = 120

const first = (v: Raw): string | undefined => {
  const x = Array.isArray(v) ? v[0] : v
  return typeof x === 'string' ? x : undefined
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const KINDS: Record<string, 'expense' | 'income'> = { gasto: 'expense', expense: 'expense', ingreso: 'income', income: 'income' }

export function parseQuickParams(query: QuickQuery, cats: readonly Category[], defaultKind: 'expense' | 'income' = 'expense'): QuickParams {
  const out: QuickParams = {}

  const tipo = first(query.tipo)
  if (tipo !== undefined && KINDS[norm(tipo)]) out.kind = KINDS[norm(tipo)]
  const kind = out.kind ?? defaultKind

  const importe = first(query.importe)
  if (importe !== undefined) {
    const c = parseEuros(importe)
    if (c !== null && c > 0 && c <= MAX_QUICK_CENTS) out.amountText = String(c / 100).replace('.', ',')
  }

  const categoria = first(query.categoria)
  if (categoria !== undefined && kind === 'expense') {
    const m = matchCategory(categoria, cats)
    if (m) Object.assign(out, m)
  }

  const nota = first(query.nota)
  if (nota !== undefined) {
    // sin caracteres de control; longitud acotada. Se muestra siempre como TEXTO (Vue escapa), nunca como HTML.
    // eslint-disable-next-line no-control-regex
    const clean = nota.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_NOTE)
    if (clean) out.note = clean
  }
  return out
}

/** «Café», «cafe», «Viajes/Transporte». Si el nombre es ambiguo entre subcategorías, no se elige ninguna. */
function matchCategory(raw: string, cats: readonly Category[]): { categoryId: string; subcategoryId: string | null } | null {
  const active = cats.filter((c) => !c.archivedAt)
  const tops = active.filter((c) => !c.parentId)

  if (raw.includes('/')) {
    const [p, s] = raw.split('/', 2) as [string, string]
    const parent = tops.find((c) => norm(c.name) === norm(p))
    const sub = parent && active.find((c) => c.parentId === parent.id && norm(c.name) === norm(s))
    return parent && sub ? { categoryId: parent.id, subcategoryId: sub.id } : null
  }

  const name = norm(raw)
  if (!name) return null
  const top = tops.filter((c) => norm(c.name) === name)
  if (top.length === 1) return { categoryId: top[0]!.id, subcategoryId: null } // la categoría principal manda (p. ej. «Regalos»)
  if (top.length > 1) return null
  const subs = active.filter((c) => c.parentId && norm(c.name) === name)
  if (subs.length === 1) return { categoryId: subs[0]!.parentId!, subcategoryId: subs[0]!.id }
  return null // inexistente o ambigua («Actividades» está en Ocio y en Viajes): no se adivina
}
