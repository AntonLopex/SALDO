import type { SupabaseClient } from '@supabase/supabase-js'

export type ServerTable =
  | 'categories' | 'planned_expenses' | 'transactions' | 'savings_funds'
  | 'profiles' | 'budgets' | 'savings_goals' | 'income_plans'

export type SyncErrorKind =
  | 'network' // sin conexión / servidor inalcanzable: se reintenta
  | 'auth' // sesión caducada o ausente: hay que volver a entrar
  | 'rate' // límite de peticiones: se reintenta más tarde
  | 'server' // 5xx: se reintenta
  | 'rejected' // el servidor rechaza ese dato (restricción, RLS…): no se arregla reintentando

export class SyncError extends Error {
  constructor(public kind: SyncErrorKind, message: string, public code?: string) {
    super(message)
    this.name = 'SyncError'
  }
}

export interface ServerRow {
  updated_at: string
  [k: string]: unknown
}

/** Frontera con el servidor. Los tests usan una implementación en memoria. */
export interface Remote {
  /** Inserta o actualiza por id (idempotente). Devuelve el updated_at que fijó el servidor. */
  upsert(table: ServerTable, rows: Record<string, unknown>[]): Promise<{ id: string; updated_at: string }[]>
  /** Filas con updated_at >= since, ordenadas por updated_at. */
  pull(table: ServerTable, since: string | null, limit: number): Promise<ServerRow[]>
  /** Todas las filas vivas de una tabla pequeña. */
  list(table: ServerTable): Promise<ServerRow[]>
  /** Número de filas (para detectar si la nube ya tiene datos). */
  count(table: ServerTable): Promise<number>
}

interface PgErr {
  message?: string
  code?: string
  status?: number
}

export function classifyError(e: PgErr | null | undefined, status?: number): SyncError {
  const st = status ?? e?.status ?? 0
  const msg = e?.message ?? 'Error desconocido'
  const code = e?.code
  if (st === 0 || /failed to fetch|network|load failed|fetch failed/i.test(msg)) return new SyncError('network', 'Sin conexión con el servidor', code)
  if (st === 401 || code === 'PGRST301' || /jwt/i.test(msg)) return new SyncError('auth', 'La sesión ha caducado. Vuelve a iniciar sesión.', code)
  if (st === 429) return new SyncError('rate', 'Demasiadas peticiones. Se reintentará en un rato.', code)
  if (st >= 500) return new SyncError('server', 'El servidor no responde correctamente. Se reintentará.', code)
  return new SyncError('rejected', msg, code)
}

export function supabaseRemote(client: SupabaseClient): Remote {
  const wrap = async <T>(run: () => PromiseLike<{ data: T | null; error: PgErr | null; status: number }>): Promise<T> => {
    let res
    try {
      res = await run()
    } catch (e) {
      throw classifyError({ message: e instanceof Error ? e.message : String(e) }, 0)
    }
    if (res.error) throw classifyError(res.error, res.status)
    return (res.data ?? ([] as unknown)) as T
  }
  return {
    upsert: (table, rows) =>
      wrap(() => client.from(table).upsert(rows, { onConflict: 'id' }).select('id, updated_at')) as Promise<{ id: string; updated_at: string }[]>,
    pull: (table, since, limit) =>
      wrap(() => {
        let q = client.from(table).select('*')
        if (since) q = q.gte('updated_at', since)
        return q.order('updated_at', { ascending: true }).limit(limit)
      }) as Promise<ServerRow[]>,
    list: (table) => wrap(() => client.from(table).select('*').is('deleted_at', null)) as Promise<ServerRow[]>,
    async count(table) {
      let res
      try {
        res = await client.from(table).select('id', { count: 'exact', head: true })
      } catch (e) {
        throw classifyError({ message: e instanceof Error ? e.message : String(e) }, 0)
      }
      if (res.error) throw classifyError(res.error, res.status)
      return res.count ?? 0
    },
  }
}
