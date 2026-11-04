/**
 * Copia externa cifrada de los datos de la nube (se ejecuta en GitHub Actions o a mano).
 *
 *   SUPABASE_URL, SUPABASE_ANON_KEY   → públicos (nunca service_role)
 *   BACKUP_EMAIL, BACKUP_PASSWORD     → tu cuenta; RLS garantiza que solo se leen TUS filas
 *   AGE_RECIPIENT                     → clave PÚBLICA age ("age1…") con la que se cifra
 *
 *   npx tsx scripts/backup/cloud-backup.ts <ruta-de-salida>.json.age
 *
 * Reglas: no escribe nada si la copia no valida; no imprime datos, contraseñas ni tokens; el archivo se guarda SOLO cifrado.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Encrypter } from 'age-encryption'
import { buildBackup, validateBackup, type BackupFile } from '../../src/data/backup/format'
import { defaultSettings } from '../../src/domain/defaults'
import { fromServer, settingsFromServer, type RowTable } from '../../src/data/sync/mappers'
import type { ServerRow } from '../../src/data/sync/remote'
import type { Category, Fund, PlannedExpense, Settings, Tx } from '../../src/domain/types'

export interface CloudOptions {
  url: string
  anonKey: string
  email: string
  password: string
  pageSize?: number
  fetchImpl?: typeof fetch
}

/** Los mensajes de error nunca incluyen credenciales ni cuerpos de respuesta con datos. */
export class BackupError extends Error {}

async function signIn(o: Required<Pick<CloudOptions, 'url' | 'anonKey' | 'email' | 'password'>> & { f: typeof fetch }): Promise<string> {
  let res: Response
  try {
    res = await o.f(`${o.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: o.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email: o.email, password: o.password }),
    })
  } catch {
    throw new BackupError('No se pudo conectar con Supabase (red).')
  }
  if (!res.ok) throw new BackupError(`Inicio de sesión rechazado (HTTP ${res.status}). Revisa BACKUP_EMAIL y BACKUP_PASSWORD.`)
  const token = ((await res.json()) as { access_token?: string }).access_token
  if (!token) throw new BackupError('Supabase no devolvió una sesión.')
  return token
}

async function fetchAll(o: { url: string; anonKey: string; token: string; f: typeof fetch; page: number }, table: string): Promise<ServerRow[]> {
  const out: ServerRow[] = []
  for (let offset = 0; ; offset += o.page) {
    let res: Response
    try {
      res = await o.f(`${o.url}/rest/v1/${table}?select=*&order=updated_at.asc&limit=${o.page}&offset=${offset}`, {
        headers: { apikey: o.anonKey, authorization: `Bearer ${o.token}` },
      })
    } catch {
      throw new BackupError(`No se pudo leer «${table}» (red).`)
    }
    if (!res.ok) throw new BackupError(`No se pudo leer «${table}» (HTTP ${res.status}).`)
    const rows = (await res.json()) as ServerRow[]
    out.push(...rows)
    if (rows.length < o.page) return out
  }
}

/** Descarga TODAS las filas del usuario (incluidos borrados lógicos) y las convierte al formato de copia de la app. */
export async function fetchCloudBackup(opts: CloudOptions): Promise<BackupFile> {
  const f = opts.fetchImpl ?? fetch
  const url = opts.url.replace(/\/+$/, '')
  const token = await signIn({ url, anonKey: opts.anonKey, email: opts.email, password: opts.password, f })
  const ctx = { url, anonKey: opts.anonKey, token, f, page: opts.pageSize ?? 1000 }

  const rows = async (table: string) => fetchAll(ctx, table)
  const local = <T>(t: RowTable, r: ServerRow[]) => r.map((x) => fromServer(t, x) as unknown as T)

  const [cats, planned, txs, funds, profiles, budgets, goals, incomes] = await Promise.all([
    rows('categories'), rows('planned_expenses'), rows('transactions'), rows('savings_funds'),
    rows('profiles'), rows('budgets'), rows('savings_goals'), rows('income_plans'),
  ])
  const live = (r: ServerRow[]) => r.filter((x) => !x.deleted_at)
  const profile = profiles[0]
  const settings: Settings | null = profile
    ? { ...settingsFromServer(defaultSettings(), profile, live(budgets), live(goals), live(incomes)), id: 'main', updatedAt: profile.updated_at }
    : null

  return buildBackup(
    {
      categories: local<Category>('categories', cats),
      transactions: local<Tx>('transactions', txs),
      planned: local<PlannedExpense>('planned', planned),
      funds: local<Fund>('funds', live(funds)),
      settings,
    },
    'cloud',
  )
}

export async function encryptForRecipient(backup: BackupFile, recipient: string): Promise<Uint8Array> {
  if (!/^age1[0-9a-z]{50,}$/.test(recipient.trim())) throw new BackupError('AGE_RECIPIENT no es una clave pública age válida (empieza por "age1").')
  const e = new Encrypter()
  e.addRecipient(recipient.trim())
  return e.encrypt(JSON.stringify(backup, null, 2))
}

/** Descarga, VALIDA, cifra. Devuelve el archivo cifrado y un resumen sin datos sensibles. */
export async function createEncryptedCloudBackup(opts: CloudOptions & { recipient: string }) {
  const backup = await fetchCloudBackup(opts)
  const check = await validateBackup(JSON.parse(JSON.stringify(backup)))
  if (!check.ok) throw new BackupError(`La copia descargada no supera la validación (${check.errors.length} problemas). No se guarda.`)
  return { bytes: await encryptForRecipient(backup, opts.recipient), counts: backup.counts, warnings: check.warnings }
}

async function main() {
  const need = (k: string) => {
    const v = process.env[k]?.trim()
    if (!v) throw new BackupError(`Falta la variable ${k}.`)
    return v
  }
  const out = process.argv[2]
  if (!out) throw new BackupError('Indica la ruta de salida: cloud-backup.ts <archivo>.json.age')
  const anonKey = need('SUPABASE_ANON_KEY')
  if (/service_role|^sb_secret_/.test(anonKey)) throw new BackupError('SUPABASE_ANON_KEY parece una clave de servicio. Usa solo la clave pública.')

  const r = await createEncryptedCloudBackup({
    url: need('SUPABASE_URL'), anonKey, email: need('BACKUP_EMAIL'), password: need('BACKUP_PASSWORD'), recipient: need('AGE_RECIPIENT'),
  })
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, r.bytes, { mode: 0o600 })
  console.log(`Copia cifrada creada: ${out} (${r.bytes.length} bytes)`)
  console.log(`Contenido: ${r.counts.transactions} movimientos, ${r.counts.categories} categorías, ${r.counts.planned} gastos planificados, ${r.counts.funds} fondos`)
  for (const w of r.warnings) console.log(`Aviso: ${w}`)
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop()!)
if (isMain) {
  main().catch((e) => {
    console.error(`ERROR: ${e instanceof BackupError ? e.message : 'Fallo inesperado al crear la copia.'}`)
    process.exit(1)
  })
}
