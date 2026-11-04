import { SyncError, type Remote, type ServerRow, type ServerTable } from '@/data/sync/remote'

export const USER = '11111111-1111-1111-1111-111111111111'
export type Row = Record<string, unknown>

/** Servidor en memoria con fallos programables. Imita a Postgres en lo que importa a la sincronización. */
export class FakeRemote implements Remote {
  tables = new Map<string, Map<string, Row>>()
  seq = 0
  offline = false
  authFail = false
  loseAck = false // guarda la fila pero la respuesta "se pierde"
  failUpsert = false // la bajada funciona pero la subida falla
  reject: (table: string, row: Row) => boolean = () => false
  beforeReturn?: () => Promise<void>
  upserts: Record<string, number> = {}

  constructor(user = USER) {
    this.t('profiles').set(user, {
      id: user, plan_start: '2026-11-01', target_month: '2027-12-01', saving_regular_cents: 100000,
      saving_summer_cents: 60000, summer_months: [7, 8], updated_at: this.ts(),
    })
  }
  t(name: string) { return this.tables.get(name) ?? this.tables.set(name, new Map()).get(name)! }
  ts() { return new Date(Date.UTC(2026, 10, 4, 12, 0, 0) + ++this.seq * 1000).toISOString() }
  private gate() {
    if (this.offline) throw new SyncError('network', 'Sin conexión con el servidor')
    if (this.authFail) throw new SyncError('auth', 'La sesión ha caducado')
  }

  async upsert(table: ServerTable, rows: Row[]) {
    this.gate()
    if (this.failUpsert) throw new SyncError('server', 'El servidor no responde correctamente. Se reintentará.')
    // Como Postgres: la sentencia es atómica (si una fila falla no se guarda ninguna) y las filas se aplican EN ORDEN.
    const staged = new Map(this.t(table))
    const out = rows.map((r) => {
      if (this.reject(table, r)) throw new SyncError('rejected', `violates constraint (${table})`, '23514')
      if (table === 'transactions' && r.kind === 'opening' && !r.deleted_at) {
        const other = [...staged.values()].find((x) => x.kind === 'opening' && !x.deleted_at && x.id !== r.id)
        if (other) throw new SyncError('rejected', 'duplicate key value violates unique constraint "transactions_one_opening_per_user"', '23505')
      }
      const updated_at = this.ts()
      staged.set(r.id as string, { ...staged.get(r.id as string), ...r, updated_at })
      return { id: r.id as string, updated_at }
    })
    this.tables.set(table, staged)
    for (const o of out) this.upserts[o.id] = (this.upserts[o.id] ?? 0) + 1
    await this.beforeReturn?.()
    if (this.loseAck) throw new SyncError('network', 'Sin conexión con el servidor')
    return out
  }
  async pull(table: ServerTable, since: string | null, limit: number): Promise<ServerRow[]> {
    this.gate()
    return [...this.t(table).values()].filter((r) => !since || (r.updated_at as string) >= since)
      .sort((a, b) => (a.updated_at as string).localeCompare(b.updated_at as string)).slice(0, limit) as ServerRow[]
  }
  async list(table: ServerTable): Promise<ServerRow[]> {
    this.gate()
    return [...this.t(table).values()].filter((r) => !r.deleted_at) as ServerRow[]
  }
  async count(table: ServerTable) {
    this.gate()
    return [...this.t(table).values()].filter((r) => !r.deleted_at).length
  }
  /** Edición hecha "desde otro dispositivo". */
  edit(table: string, id: string, patch: Row) {
    this.t(table).set(id, { ...this.t(table).get(id), ...patch, updated_at: this.ts() })
  }
}
