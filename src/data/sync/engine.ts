import { db, type SyncStateRow } from '../db'
import { defaultSettings } from '@/domain/defaults'
import type { Settings } from '@/domain/types'
import { seedSettingsIfNeeded } from '../seed'
import {
  contentKey, fromServer, ROW_TABLES, SERVER_TABLE, settingsFromServer, SETTINGS_CONTENT, settingsToServer, toServer,
  type RowTable,
} from './mappers'
import { SyncError, type Remote } from './remote'

/**
 * Modelo (decisiones importantes):
 *  - La COLA se deriva de los datos: un registro está pendiente mientras syncedAt !== updatedAt.
 *    Así no puede perderse ni desincronizarse; syncedAt solo lo escribe la sincronización TRAS la confirmación del servidor.
 *  - Los envíos son upserts por UUID: idempotentes (reenviar nunca duplica).
 *  - Un error de sincronización jamás borra ni modifica datos locales.
 *  - Conflictos: gana la última modificación (reloj del dispositivo frente a updated_at del servidor); la versión
 *    descartada se guarda en `conflicts`. Con un solo dispositivo activo no debería haber conflictos.
 */

export interface SyncDeps {
  remote: Remote
  userId: string
  now?: () => number
}

export type SyncOutcome = 'ok' | 'offline' | 'auth' | 'account-mismatch' | 'needs-decision' | 'error'

export interface SyncReport {
  outcome: SyncOutcome
  message: string
  pushed: number
  pulled: number
  blocked: number
  conflicts: number
}

const PAGE = 500
const CHUNK = 100
const BACKOFF_BASE = 5_000
const BACKOFF_MAX = 15 * 60_000
const BLOCK_RETRY = 60 * 60_000

const backoff = (attempts: number) => Math.min(BACKOFF_BASE * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX)
const isPending = (r: { syncedAt?: string; updatedAt: string }) => r.syncedAt !== r.updatedAt
const stateKey = (table: string, id: string) => `${table}:${id}`

const getMeta = async (key: string) => (await db.meta.get(key))?.value ?? null
const setMeta = (key: string, value: string) => db.meta.put({ key, value })

// ───────────────────────── cola derivada: consulta y estado ─────────────────────────

export interface SyncSnapshot {
  pending: number
  blocked: number
  conflicts: number
  lastSyncAt: string | null
  failing: { key: string; table: string; recordId: string; lastError: string; attempts: number; blocked: boolean; nextAttemptAt: number }[]
}

export async function syncSnapshot(): Promise<SyncSnapshot> {
  let pending = 0
  const pendingKeys = new Set<string>()
  for (const t of [...ROW_TABLES, 'settings'] as const) {
    for (const r of await db.table(t).toArray()) {
      if (isPending(r)) {
        pending++
        pendingKeys.add(stateKey(t, r.id))
      }
    }
  }
  const states = (await db.syncState.toArray()).filter((s) => pendingKeys.has(s.key))
  return {
    pending,
    blocked: states.filter((s) => s.blocked).length,
    conflicts: await db.conflicts.count(),
    lastSyncAt: await getMeta('lastSyncAt'),
    failing: states.map(({ key, table, recordId, lastError, attempts, blocked, nextAttemptAt }) => ({ key, table, recordId, lastError, attempts, blocked, nextAttemptAt })),
  }
}

/** Quita esperas y bloqueos para que el siguiente ciclo reintente todo. */
export async function resetBackoff(): Promise<void> {
  await db.syncState.toCollection().modify({ nextAttemptAt: 0, blocked: false })
}

async function markFailure(table: string, ids: string[], e: SyncError, blocked: boolean, now: number) {
  await db.transaction('rw', db.syncState, async () => {
    for (const id of ids) {
      const key = stateKey(table, id)
      const prev: SyncStateRow | undefined = await db.syncState.get(key)
      const attempts = (prev?.attempts ?? 0) + 1
      await db.syncState.put({
        key, table, recordId: id, attempts, lastError: e.message, blocked,
        nextAttemptAt: now + (blocked ? BLOCK_RETRY : backoff(attempts)),
      })
    }
  })
}

// ───────────────────────── ciclo completo ─────────────────────────

export async function runSync(deps: SyncDeps): Promise<SyncReport> {
  const now = deps.now ?? Date.now
  const rep: SyncReport = { outcome: 'ok', message: 'Todo sincronizado', pushed: 0, pulled: 0, blocked: 0, conflicts: 0 }
  try {
    const gate = await prepareAccount(deps)
    if (gate) return { ...rep, ...gate }
    // Primero se baja (detecta conflictos con lo pendiente) y luego se sube.
    for (const t of ROW_TABLES) await pullTable(deps, t, rep)
    await pullSettings(deps, rep)
    for (const t of ROW_TABLES) await pushTable(deps, t, rep, now())
    await pushSettings(deps, rep, now())
    await setMeta('lastSyncAt', new Date(now()).toISOString())
    if (rep.blocked) rep.message = `${rep.blocked} elemento(s) rechazado(s) por el servidor`
    return rep
  } catch (e) {
    if (e instanceof SyncError) {
      const outcome: SyncOutcome = e.kind === 'network' ? 'offline' : e.kind === 'auth' ? 'auth' : 'error'
      return { ...rep, outcome, message: e.message }
    }
    return { ...rep, outcome: 'error', message: e instanceof Error ? e.message : 'Error inesperado de sincronización' }
  }
}

// ───────────────────────── cuenta y primer uso ─────────────────────────

async function prepareAccount(deps: SyncDeps): Promise<Pick<SyncReport, 'outcome' | 'message'> | null> {
  const stored = await getMeta('syncUserId')
  if (stored && stored !== deps.userId) {
    return { outcome: 'account-mismatch', message: 'Los datos de este dispositivo pertenecen a otra cuenta. No se mezclan.' }
  }
  if (stored) return null

  const serverHasData = (await deps.remote.count('categories')) > 0 || (await deps.remote.count('transactions')) > 0
  if (serverHasData) {
    const localUserData =
      (await db.transactions.filter((t) => !t.deletedAt && t.kind !== 'opening').count()) > 0 ||
      (await db.planned.filter((p) => !p.deletedAt).count()) > 0
    if (localUserData) {
      return {
        outcome: 'needs-decision',
        message: 'Hay datos en la nube y también en este dispositivo. No se mezclan automáticamente: exporta una copia y elige cuál conservar.',
      }
    }
    // Este dispositivo solo tiene los datos iniciales por defecto: se adopta la copia de la nube.
    await db.transaction('rw', [db.categories, db.transactions, db.planned, db.funds, db.syncState, db.settings, db.meta], async () => {
      await db.categories.clear(); await db.transactions.clear(); await db.planned.clear(); await db.funds.clear(); await db.syncState.clear()
      const st = await db.settings.get('main')
      if (st) await db.settings.put({ ...st, syncedAt: st.updatedAt, serverUpdatedAt: undefined })
      for (const t of ROW_TABLES) await db.meta.delete(`cursor:${t}`)
    })
    await setMeta('syncUserId', deps.userId)
    for (const t of ROW_TABLES) await pullTable(deps, t, { pulled: 0, conflicts: 0 } as SyncReport)
    await seedSettingsIfNeeded() // restaura fondos por defecto si la nube no tenía
    return null
  }
  await setMeta('syncUserId', deps.userId)
  return null
}

// ───────────────────────── bajada ─────────────────────────

async function pullTable(deps: SyncDeps, table: RowTable, rep: SyncReport) {
  const key = `cursor:${table}`
  let cursor = await getMeta(key)
  for (;;) {
    const rows = await deps.remote.pull(SERVER_TABLE[table], cursor, PAGE)
    for (const r of rows) await applyServerRow(table, r, rep)
    rep.pulled += rows.length
    const last = rows.at(-1)?.updated_at
    if (last) await setMeta(key, last)
    if (rows.length < PAGE || !last || last === cursor) break
    cursor = last
  }
}

async function applyServerRow(table: RowTable, r: Parameters<typeof fromServer>[1], rep: SyncReport) {
  const incoming = fromServer(table, r)
  const tbl = db.table(table)
  await db.transaction('rw', [tbl, db.conflicts], async () => {
    const existing = await tbl.get(incoming.id)
    if (!existing) return void (await tbl.put(incoming))
    if (existing.serverUpdatedAt === r.updated_at) return // ya conocida (eco de nuestro propio envío)
    if (!isPending(existing)) return void (await tbl.put(incoming))
    if (contentKey(table, existing) === contentKey(table, incoming)) {
      return void (await tbl.put({ ...existing, updatedAt: r.updated_at, syncedAt: r.updated_at, serverUpdatedAt: r.updated_at }))
    }
    // Conflicto real: cambió en la nube y también aquí sin enviar.
    const localWins = Date.parse(existing.updatedAt) > Date.parse(r.updated_at)
    await db.conflicts.add({
      id: crypto.randomUUID(), table, recordId: incoming.id, loser: localWins ? 'server' : 'local',
      data: JSON.stringify(localWins ? incoming : existing), at: new Date().toISOString(),
    })
    rep.conflicts++
    if (localWins) await tbl.update(incoming.id, { serverUpdatedAt: r.updated_at }) // sigue pendiente y se enviará
    else await tbl.put(incoming)
  })
}

async function pullSettings(deps: SyncDeps, rep: SyncReport) {
  const rows = await deps.remote.pull('profiles', null, 5)
  const p = rows.find((x) => x.id === deps.userId)
  if (!p) return
  const local = await db.settings.get('main')
  if (local?.serverUpdatedAt === p.updated_at) return
  const [budgets, goals, incomes] = await Promise.all([deps.remote.list('budgets'), deps.remote.list('savings_goals'), deps.remote.list('income_plans')])
  const merged = settingsFromServer(local ?? defaultSettings(), p, budgets, goals, incomes)
  const fromCloud: Settings = { ...merged, id: 'main', updatedAt: p.updated_at, syncedAt: p.updated_at, serverUpdatedAt: p.updated_at }
  if (!local || !isPending(local)) {
    await db.settings.put(fromCloud)
    rep.pulled++
    return
  }
  if (SETTINGS_CONTENT(local) === SETTINGS_CONTENT(merged)) {
    // Mismo contenido: se anota la versión base, pero sigue pendiente para completar las tablas del servidor la primera vez.
    await db.settings.update('main', { serverUpdatedAt: p.updated_at })
    return
  }
  const localWins = Date.parse(local.updatedAt) > Date.parse(p.updated_at)
  await db.conflicts.add({
    id: crypto.randomUUID(), table: 'settings', recordId: 'main', loser: localWins ? 'server' : 'local',
    data: JSON.stringify(localWins ? fromCloud : local), at: new Date().toISOString(),
  })
  rep.conflicts++
  if (localWins) await db.settings.update('main', { serverUpdatedAt: p.updated_at })
  else await db.settings.put(fromCloud)
}

// ───────────────────────── subida ─────────────────────────

type LocalRow = { id: string; updatedAt: string; syncedAt?: string; parentId?: string | null }

async function dueRows(table: string, rows: LocalRow[], now: number): Promise<LocalRow[]> {
  const states = new Map((await db.syncState.where('table').equals(table).toArray()).map((s) => [s.recordId, s]))
  return rows.filter((r) => (states.get(r.id)?.nextAttemptAt ?? 0) <= now)
}

async function pushTable(deps: SyncDeps, table: RowTable, rep: SyncReport, now: number) {
  let rows = (await db.table(table).toArray()).filter(isPending) as LocalRow[]
  rows = await dueRows(table, rows, now)
  if (table === 'categories') rows.sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId)) // padres antes que hijos
  // Los borrados primero: al restaurar una copia con otro saldo de apertura, el antiguo debe darse de baja
  // antes de insertar el nuevo (en el servidor solo puede haber uno vivo).
  if (table === 'transactions') rows.sort((a, b) => Number(!(a as { deletedAt?: string | null }).deletedAt) - Number(!(b as { deletedAt?: string | null }).deletedAt))
  for (let i = 0; i < rows.length; i += CHUNK) await pushChunk(deps, table, rows.slice(i, i + CHUNK), rep, now)
}

async function pushChunk(deps: SyncDeps, table: RowTable, chunk: LocalRow[], rep: SyncReport, now: number): Promise<void> {
  const payload = await Promise.all(chunk.map((r) => toServer(table, r, deps.userId)))
  try {
    const res = await deps.remote.upsert(SERVER_TABLE[table], payload)
    const updated = new Map(res.map((x) => [x.id, x.updated_at]))
    await db.transaction('rw', [db.table(table), db.syncState], async () => {
      for (let i = 0; i < chunk.length; i++) {
        const sent = chunk[i]!
        const serverTs = updated.get(payload[i]!.id as string)
        if (!serverTs) continue // sin confirmación para esta fila: sigue pendiente
        const cur = (await db.table(table).get(sent.id)) as LocalRow | undefined
        if (!cur) continue
        // Si se editó mientras viajaba, solo se anota la versión base: sigue pendiente.
        if (cur.updatedAt === sent.updatedAt) await db.table(table).update(sent.id, { syncedAt: sent.updatedAt, serverUpdatedAt: serverTs })
        else await db.table(table).update(sent.id, { serverUpdatedAt: serverTs })
        await db.syncState.delete(stateKey(table, sent.id))
        rep.pushed++
      }
    })
  } catch (e) {
    await handlePushError(e, table, chunk.map((r) => r.id), rep, now, () => Promise.all(chunk.map((r) => pushChunk(deps, table, [r], rep, now))))
  }
}

/** Reglas de error: red/servidor → reintento con espera y se detiene el ciclo; auth → se detiene; rechazo → aislar y bloquear. */
async function handlePushError(e: unknown, table: string, ids: string[], rep: SyncReport, now: number, isolate: () => Promise<unknown>) {
  if (!(e instanceof SyncError)) throw e
  if (e.kind === 'auth') throw e
  if (e.kind === 'rejected') {
    if (ids.length > 1) return void (await isolate()) // una fila mala no bloquea a las demás
    await markFailure(table, ids, e, true, now)
    rep.blocked++
    return
  }
  await markFailure(table, ids, e, false, now)
  throw e
}

async function pushSettings(deps: SyncDeps, rep: SyncReport, now: number) {
  const local = await db.settings.get('main')
  if (!local || !isPending(local)) return
  if (((await db.syncState.get(stateKey('settings', 'main')))?.nextAttemptAt ?? 0) > now) return
  try {
    const rows = await settingsToServer(local, deps.userId)
    // Ingresos eliminados localmente: se marcan como borrados en el servidor.
    const keep = new Set(rows.income_plans.map((r) => r.id))
    for (const old of await deps.remote.list('income_plans')) {
      if (!keep.has(old.id as string)) {
        rows.income_plans.push({ id: old.id, user_id: deps.userId, name: old.name, amount_cents: old.amount_cents, months: old.months, deleted_at: new Date(now).toISOString() })
      }
    }
    await deps.remote.upsert('budgets', rows.budgets)
    await deps.remote.upsert('savings_goals', rows.savings_goals)
    await deps.remote.upsert('income_plans', rows.income_plans)
    const [prof] = await deps.remote.upsert('profiles', [rows.profiles]) // el perfil va último: es el "commit" del conjunto
    const cur = await db.settings.get('main')
    if (cur && prof) {
      if (cur.updatedAt === local.updatedAt) await db.settings.update('main', { syncedAt: local.updatedAt, serverUpdatedAt: prof.updated_at })
      else await db.settings.update('main', { serverUpdatedAt: prof.updated_at })
      await db.syncState.delete(stateKey('settings', 'main'))
      rep.pushed++
    }
  } catch (e) {
    await handlePushError(e, 'settings', ['main'], rep, now, async () => undefined)
  }
}
