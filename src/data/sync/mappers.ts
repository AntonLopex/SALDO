import type { Category, Fund, IncomePlan, PlannedExpense, Settings, Tx } from '@/domain/types'
import { isUuid, userScopedId } from './uuid'
import type { ServerRow, ServerTable } from './remote'

/** Tablas locales sincronizadas como "un registro = una fila". `settings` va aparte (varias filas en el servidor). */
export type RowTable = 'categories' | 'planned' | 'transactions' | 'funds'
export type LocalTable = RowTable | 'settings'

export const SERVER_TABLE: Record<RowTable, ServerTable> = {
  categories: 'categories', planned: 'planned_expenses', transactions: 'transactions', funds: 'savings_funds',
}

/** Orden de subida: respeta las claves foráneas (categorías → gastos planificados → movimientos). */
export const ROW_TABLES: RowTable[] = ['categories', 'planned', 'transactions', 'funds']

/** Campos que forman el contenido sincronizable (sin marcas de sincronización ni fechas de auditoría). */
export const CONTENT_FIELDS: Record<RowTable, string[]> = {
  categories: ['parentId', 'name', 'icon', 'color', 'isFavorite', 'favOrder', 'sortOrder', 'archivedAt'],
  planned: ['name', 'estimatedCents', 'plannedOn', 'categoryId', 'subcategoryId', 'status', 'linkedTransactionId', 'deletedAt'],
  transactions: ['kind', 'amountCents', 'occurredOn', 'categoryId', 'subcategoryId', 'note', 'plannedExpenseId', 'deletedAt'],
  funds: ['kind', 'name', 'targetCents', 'allocatedCents', 'items'],
}

export const contentKey = (table: RowTable, row: object): string =>
  JSON.stringify(CONTENT_FIELDS[table].map((k) => (row as Record<string, unknown>)[k] ?? null))

type Json = Record<string, unknown>

export async function toServer(table: RowTable, row: object, userId: string): Promise<Json> {
  switch (table) {
    case 'categories': {
      const c = row as Category
      return { id: c.id, user_id: userId, parent_id: c.parentId, name: c.name, icon: c.icon, color: c.color, is_favorite: c.isFavorite,
        fav_order: c.favOrder, sort_order: c.sortOrder, archived_at: c.archivedAt, created_at: c.createdAt }
    }
    case 'planned': {
      const p = row as PlannedExpense
      return { id: p.id, user_id: userId, name: p.name, estimated_cents: p.estimatedCents, planned_on: p.plannedOn, category_id: p.categoryId,
        subcategory_id: p.subcategoryId, status: p.status, linked_transaction_id: p.linkedTransactionId, created_at: p.createdAt, deleted_at: p.deletedAt }
    }
    case 'transactions': {
      const t = row as Tx
      return { id: t.id, user_id: userId, kind: t.kind, amount_cents: t.amountCents, occurred_on: t.occurredOn, category_id: t.categoryId,
        subcategory_id: t.subcategoryId, note: t.note, planned_expense_id: t.plannedExpenseId, created_at: t.createdAt, deleted_at: t.deletedAt }
    }
    case 'funds': {
      const f = row as Fund
      // El id local no es un UUID: en el servidor es estable por usuario y tipo de fondo.
      return { id: await userScopedId(userId, `fund-${f.kind}`), user_id: userId, kind: f.kind, name: f.name, target_cents: f.targetCents,
        allocated_cents: f.allocatedCents, items: f.items, deleted_at: null }
    }
  }
}

const s = (v: unknown) => v as string
const sn = (v: unknown) => (v ?? null) as string | null

/** Fila del servidor → registro local ya marcado como sincronizado. */
export function fromServer(table: RowTable, r: ServerRow): { id: string } & Json {
  const synced = { updatedAt: r.updated_at, syncedAt: r.updated_at, serverUpdatedAt: r.updated_at }
  switch (table) {
    case 'categories':
      return { id: s(r.id), parentId: sn(r.parent_id), name: s(r.name), icon: s(r.icon), color: s(r.color), isFavorite: r.is_favorite as boolean,
        favOrder: r.fav_order as number, sortOrder: r.sort_order as number, archivedAt: sn(r.archived_at), createdAt: s(r.created_at), ...synced }
    case 'planned':
      return { id: s(r.id), name: s(r.name), estimatedCents: Number(r.estimated_cents), plannedOn: s(r.planned_on), categoryId: sn(r.category_id),
        subcategoryId: sn(r.subcategory_id), status: s(r.status), linkedTransactionId: sn(r.linked_transaction_id), createdAt: s(r.created_at),
        deletedAt: sn(r.deleted_at), ...synced }
    case 'transactions':
      return { id: s(r.id), kind: s(r.kind), amountCents: Number(r.amount_cents), occurredOn: s(r.occurred_on), categoryId: sn(r.category_id),
        subcategoryId: sn(r.subcategory_id), note: s(r.note ?? ''), plannedExpenseId: sn(r.planned_expense_id), createdAt: s(r.created_at),
        deletedAt: sn(r.deleted_at), ...synced }
    case 'funds':
      return { id: `fund-${s(r.kind)}`, kind: s(r.kind), name: s(r.name), targetCents: Number(r.target_cents), allocatedCents: Number(r.allocated_cents),
        items: (r.items ?? []) as unknown[], ...synced }
  }
}

// ───────────────────────── Ajustes: un objeto local ↔ varias filas del servidor ─────────────────────────

const lastDayOfMonth = (ym: string) => {
  const [y = 0, m = 1] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
}
const GOAL_NAMES = { min: 'Objetivo mínimo', main: 'Objetivo principal', stretch: 'Objetivo ambicioso' } as const

export interface SettingsServerRows {
  budgets: Json[]
  savings_goals: Json[]
  income_plans: Json[]
  profiles: Json
}

export async function settingsToServer(st: Settings, userId: string): Promise<SettingsServerRows> {
  const budgetId = await userScopedId(userId, 'budget-current')
  const goals = await Promise.all(
    (['min', 'main', 'stretch'] as const).map(async (tier) => ({
      id: await userScopedId(userId, `goal-${tier}`), user_id: userId, tier, name: GOAL_NAMES[tier],
      target_cents: st.goals[tier], target_date: lastDayOfMonth(st.targetMonth), deleted_at: null,
    })),
  )
  const incomes = await Promise.all(
    st.incomePlans.map(async (p) => ({
      id: isUuid(p.id) ? p.id : await userScopedId(userId, `income-${p.id}`), user_id: userId, name: p.name,
      amount_cents: p.amountCents, months: p.months, deleted_at: null,
    })),
  )
  return {
    budgets: [{ id: budgetId, user_id: userId, valid_from: `${st.planStart}-01`, amount_cents: st.monthlyBudgetCents, deleted_at: null }],
    savings_goals: goals,
    income_plans: incomes,
    profiles: {
      id: userId, plan_start: `${st.planStart}-01`, target_month: `${st.targetMonth}-01`,
      saving_regular_cents: st.savingTargets.regular, saving_summer_cents: st.savingTargets.summer, summer_months: st.savingTargets.summerMonths,
    },
  }
}

/** Reconstruye ajustes desde el servidor; lo que el servidor aún no tiene se conserva del valor local. */
export function settingsFromServer(
  base: Settings,
  p: ServerRow,
  budgets: ServerRow[],
  goals: ServerRow[],
  incomes: ServerRow[],
): Settings {
  const out: Settings = structuredClone(base)
  out.planStart = s(p.plan_start).slice(0, 7)
  out.targetMonth = s(p.target_month).slice(0, 7)
  out.savingTargets = { regular: Number(p.saving_regular_cents), summer: Number(p.saving_summer_cents), summerMonths: (p.summer_months as number[]).map(Number) }
  const b = [...budgets].sort((x, y) => s(y.valid_from).localeCompare(s(x.valid_from)))[0]
  if (b) out.monthlyBudgetCents = Number(b.amount_cents)
  for (const g of goals) {
    const tier = g.tier as 'min' | 'main' | 'stretch'
    if (tier in out.goals) out.goals[tier] = Number(g.target_cents)
  }
  if (incomes.length) {
    out.incomePlans = incomes.map((i): IncomePlan => ({ id: s(i.id), name: s(i.name), amountCents: Number(i.amount_cents), months: (i.months as number[]).map(Number) }))
  }
  return out
}

export const SETTINGS_CONTENT = (st: Settings): string =>
  JSON.stringify([
    st.monthlyBudgetCents, st.goals, st.planStart, st.targetMonth, st.savingTargets,
    // El id de un ingreso no forma parte del contenido (puede cambiar de local a UUID del servidor).
    st.incomePlans.map((p) => [p.name, p.amountCents, p.months]),
  ])
