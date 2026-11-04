// @vitest-environment node
/**
 * Prueba las migraciones de supabase/migrations en un Postgres real (PGlite, en memoria).
 * Se simulan solo las piezas que Supabase ya aporta: roles anon/authenticated, el esquema auth
 * (auth.users, auth.uid()). Las migraciones se ejecutan tal cual, sin modificarlas.
 *
 * Límite: PGlite no es Supabase. Esto valida SQL, restricciones, triggers y RLS; no valida la red,
 * PostgREST ni Auth. Esa parte se prueba contra el proyecto real (docs/SETUP.md).
 */
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'
const uid = () => crypto.randomUUID()
let db: PGlite

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? ''])
  try {
    return await db.query<T>(sql, params)
  } finally {
    await db.exec('reset role')
  }
}
const fails = (p: Promise<unknown>, re: RegExp) => expect(p).rejects.toThrow(re)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `)
  const dir = join(process.cwd(), 'supabase', 'migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'))
  await db.query('insert into auth.users (id) values ($1), ($2)', [A, B])
})
afterAll(() => db.close())

const cat = (user: string, id = uid(), extra = '') =>
  as(user, `insert into categories (id, name ${extra ? ', ' + extra.split('=')[0] : ''}) values ($1, 'Café' ${extra ? ', ' + extra.split('=')[1] : ''}) returning id`, [id])
const tx = (user: string, p: { id?: string; kind?: string; cents?: number; cat?: string | null; sub?: string | null; userId?: string; on?: string } = {}) =>
  as(user, `insert into transactions (id, user_id, kind, amount_cents, occurred_on, category_id, subcategory_id)
            values ($1, coalesce($2::uuid, auth.uid()), $3, $4, $5, $6, $7) returning id`,
    [p.id ?? uid(), p.userId ?? null, p.kind ?? 'expense', p.cents ?? 350, p.on ?? '2026-11-03', p.cat ?? null, p.sub ?? null])

describe('cuentas y perfiles', () => {
  it('crea el perfil automáticamente al registrarse', async () => {
    const r = await as(A, 'select id, theme, currency from profiles')
    expect(r.rows).toEqual([{ id: A, theme: 'auto', currency: 'EUR' }])
  })
  it('cada usuario ve solo su perfil', async () => {
    expect((await as(B, 'select id from profiles')).rows).toEqual([{ id: B }])
  })
  it('un usuario no puede editar el perfil de otro', async () => {
    const r = await as(B, `update profiles set display_name = 'hack' where id = $1`, [A])
    expect(r.affectedRows).toBe(0)
  })
})

describe('aislamiento RLS', () => {
  let catA = ''
  let txA = ''
  beforeAll(async () => {
    catA = (await cat(A)).rows[0]!.id as string
    txA = (await tx(A, { cat: catA })).rows[0]!.id as string
  })

  it('A ve sus datos y B no ve nada', async () => {
    expect((await as(A, 'select id from transactions')).rows).toHaveLength(1)
    expect((await as(B, 'select id from transactions')).rows).toHaveLength(0)
    expect((await as(B, 'select id from categories')).rows).toHaveLength(0)
  })
  it('B no puede insertar filas a nombre de A', async () => {
    await fails(tx(B, { userId: A }), /row-level security/i)
  })
  it('B no puede modificar ni borrar filas de A', async () => {
    expect((await as(B, 'update transactions set amount_cents = 1 where id = $1', [txA])).affectedRows).toBe(0)
    expect((await as(B, 'delete from transactions where id = $1', [txA])).affectedRows).toBe(0)
    expect((await as(A, 'select amount_cents from transactions where id = $1', [txA])).rows[0]).toEqual({ amount_cents: 350 })
  })
  it('B no puede referenciar una categoría de A (FK compuesta)', async () => {
    await fails(tx(B, { cat: catA }), /foreign key|violates/i)
  })
  it('A no puede reasignar su fila a B', async () => {
    await fails(as(A, 'update transactions set user_id = $1 where id = $2', [B, txA]), /row-level security|user_id/i)
  })
  it('user_id toma por defecto el usuario autenticado', async () => {
    const id = uid()
    await as(B, `insert into transactions (id, kind, amount_cents, occurred_on) values ($1, 'income', 100, '2026-11-01')`, [id])
    expect((await as(B, 'select user_id from transactions where id = $1', [id])).rows[0]).toEqual({ user_id: B })
  })
  it('anon (sin sesión) no tiene acceso', async () => {
    await fails(as(null, 'select * from transactions'), /permission denied/i)
    await fails(as(null, 'select * from profiles'), /permission denied/i)
  })
})

describe('integridad de movimientos', () => {
  it.each([[0], [-5]])('rechaza importes no positivos (%d)', async (c) => {
    await fails(tx(A, { cents: c }), /check constraint/i)
  })
  it('rechaza un tipo desconocido', async () => {
    await fails(tx(A, { kind: 'regalo' }), /check constraint/i)
  })
  it('solo un saldo de apertura vivo por usuario', async () => {
    const first = (await tx(B, { kind: 'opening', cents: 386014, on: '2026-11-01' })).rows[0]!.id as string
    await fails(tx(B, { kind: 'opening', cents: 1 }), /unique|duplicate/i)
    await as(B, 'update transactions set deleted_at = now() where id = $1', [first])
    await expect(tx(B, { kind: 'opening', cents: 2 })).resolves.toBeDefined()
  })
  it('el servidor fija updated_at aunque el cliente mande otro valor', async () => {
    const id = uid()
    await as(A, `insert into transactions (id, kind, amount_cents, occurred_on, updated_at) values ($1,'expense',100,'2026-11-01','2000-01-01')`, [id])
    const r = await as<{ y: number }>(A, 'select extract(year from updated_at)::int as y from transactions where id = $1', [id])
    expect(r.rows[0]!.y).toBeGreaterThanOrEqual(2025)
    const before = (await as<{ t: string }>(A, 'select updated_at::text as t from transactions where id = $1', [id])).rows[0]!.t
    await as(A, `update transactions set note = 'x', updated_at = '2000-01-01' where id = $1`, [id])
    const after = (await as<{ t: string }>(A, 'select updated_at::text as t from transactions where id = $1', [id])).rows[0]!.t
    expect(after > before).toBe(true)
  })
  it('es idempotente: reenviar el mismo UUID con upsert no duplica', async () => {
    const id = uid()
    const up = () => as(A, `insert into transactions (id, kind, amount_cents, occurred_on) values ($1,'expense',200,'2026-11-05')
                           on conflict (id) do update set amount_cents = excluded.amount_cents`, [id])
    await up(); await up()
    expect((await as(A, 'select count(*)::int as n from transactions where id = $1', [id])).rows[0]).toEqual({ n: 1 })
  })
})

describe('categorías', () => {
  it('rechaza colores no hexadecimales y nombres vacíos', async () => {
    await fails(cat(A, uid(), `color='rojo'`), /check constraint/i)
    await fails(as(A, `insert into categories (id, name) values ($1, '  ')`, [uid()]), /check constraint/i)
  })
  it('solo un nivel de subcategorías', async () => {
    const parent = (await cat(A)).rows[0]!.id as string
    const sub = uid()
    await as(A, `insert into categories (id, name, parent_id) values ($1, 'Sub', $2)`, [sub, parent])
    await fails(as(A, `insert into categories (id, name, parent_id) values ($1, 'Nieta', $2)`, [uid(), sub]), /subcategor/i)
  })
  it('la subcategoría de un movimiento debe pertenecer a su categoría', async () => {
    const p1 = (await cat(A)).rows[0]!.id as string
    const p2 = (await cat(A)).rows[0]!.id as string
    const sub = uid()
    await as(A, `insert into categories (id, name, parent_id) values ($1, 'Sub', $2)`, [sub, p1])
    await expect(tx(A, { cat: p1, sub })).resolves.toBeDefined()
    await fails(tx(A, { cat: p2, sub }), /no pertenece/i)
    await fails(tx(A, { cat: null, sub }), /no pertenece/i)
  })
  it('no se puede borrar una categoría con movimientos (se archiva)', async () => {
    const c = (await cat(A)).rows[0]!.id as string
    await tx(A, { cat: c })
    await fails(as(A, 'delete from categories where id = $1', [c]), /foreign key|violates/i)
    await as(A, 'update categories set archived_at = now() where id = $1', [c]) // archivar sí
  })
})

describe('gastos planificados, presupuestos, objetivos y fondos', () => {
  it('al borrar un gasto planificado, el movimiento enlazado conserva su fila', async () => {
    const pid = uid(); const tid = uid()
    await as(A, `insert into planned_expenses (id, name, estimated_cents, planned_on) values ($1,'Botas',12000,'2027-01-15')`, [pid])
    await as(A, `insert into transactions (id, kind, amount_cents, occurred_on, planned_expense_id) values ($1,'expense',11990,'2027-01-16',$2)`, [tid, pid])
    await as(A, 'delete from planned_expenses where id = $1', [pid])
    expect((await as(A, 'select planned_expense_id from transactions where id = $1', [tid])).rows[0]).toEqual({ planned_expense_id: null })
  })
  it('un presupuesto por mes, un objetivo por nivel, un fondo por tipo', async () => {
    const ins = (sql: string) => as(A, sql, [uid()])
    await ins(`insert into budgets (id, valid_from, amount_cents) values ($1,'2026-11-01',79000)`)
    await fails(ins(`insert into budgets (id, valid_from, amount_cents) values ($1,'2026-11-01',80000)`), /unique|duplicate/i)
    await fails(ins(`insert into budgets (id, valid_from, amount_cents) values ($1,'2026-12-15',80000)`), /check constraint/i)
    await ins(`insert into savings_goals (id, tier, name, target_cents, target_date) values ($1,'main','Principal',1700000,'2027-12-31')`)
    await fails(ins(`insert into savings_goals (id, tier, name, target_cents, target_date) values ($1,'main','Otro',1,'2027-12-31')`), /unique|duplicate/i)
    await ins(`insert into savings_funds (id, kind, name, target_cents) values ($1,'emergency','Emergencia',500000)`)
    await fails(ins(`insert into savings_funds (id, kind, name, target_cents) values ($1,'emergency','Otra',1)`), /unique|duplicate/i)
  })
  it('los fondos no pueden asignar importes negativos', async () => {
    await fails(as(A, `insert into savings_funds (id, kind, name, target_cents, allocated_cents) values ($1,'independence','Indep',1200000,-1)`, [uid()]), /check constraint/i)
  })
  it('valida los meses de un plan de ingresos', async () => {
    const ins = (months: string) => as(A, `insert into income_plans (id, name, amount_cents, months) values ($1,'Trabajo',139150,'${months}')`, [uid()])
    await ins('{1,2,3,4,5,6,7,8,9,10,11,12}')
    await fails(ins('{}'), /check constraint/i)
    await fails(ins('{13}'), /check constraint/i)
  })
})
