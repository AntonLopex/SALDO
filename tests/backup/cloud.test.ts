// @vitest-environment node
import 'fake-indexeddb/auto'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Decrypter, generateIdentity, identityToRecipient } from 'age-encryption'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/data/db'
import { validateBackup } from '@/data/backup/format'
import { restoreBackup } from '@/data/backup/io'
import { txRepo } from '@/data/repositories'
import { seedIfNeeded, seedSettingsIfNeeded } from '@/data/seed'
import { runSync } from '@/data/sync/engine'
import { BackupError, createEncryptedCloudBackup } from '../../scripts/backup/cloud-backup'
import { FakeRemote, USER } from '../sync/fakeRemote'

const run = promisify(execFile)
const EMAIL = 'yo@example.com'
const PASSWORD = 'contraseña-de-prueba-muy-secreta'
const ANON = 'sb_publishable_clave-publica-de-prueba'

let remote: FakeRemote
let server: Server
let url = ''
let requests: { path: string; auth: string | undefined; apikey: string | undefined }[] = []

/** "Supabase" mínimo: login por contraseña + lectura REST de las tablas del FakeRemote (como haría PostgREST con RLS). */
beforeAll(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x')
    requests.push({ path: u.pathname, auth: req.headers.authorization, apikey: req.headers.apikey as string | undefined })
    const json = (code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (req.headers.apikey !== ANON) return json(401, { message: 'No API key' })
    if (u.pathname === '/auth/v1/token') {
      let body = ''
      req.on('data', (c) => (body += c))
      req.on('end', () => {
        const b = JSON.parse(body) as { email: string; password: string }
        if (b.email === EMAIL && b.password === PASSWORD) json(200, { access_token: 'token-de-prueba' })
        else json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      })
      return
    }
    const m = u.pathname.match(/^\/rest\/v1\/(\w+)$/)
    if (!m) return json(404, {})
    if (req.headers.authorization !== 'Bearer token-de-prueba') return json(401, { message: 'JWT required' })
    const rows = [...(remote.tables.get(m[1]!)?.values() ?? [])].sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
    const limit = Number(u.searchParams.get('limit') ?? 1000)
    const offset = Number(u.searchParams.get('offset') ?? 0)
    json(200, rows.slice(offset, offset + limit))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => new Promise((r) => server.close(() => r(undefined))))

async function freshDevice() {
  db.close()
  await db.delete()
  await db.open()
  await seedIfNeeded()
  await seedSettingsIfNeeded()
}

const addExpense = async (note: string, cents: number) => {
  const cat = (await db.categories.filter((c) => c.name === 'Café').first())!
  return txRepo.add({ kind: 'expense', amountCents: cents, occurredOn: '2026-11-03', categoryId: cat.parentId, subcategoryId: cat.id, note })
}
const liveTx = async () => (await db.transactions.filter((t) => !t.deletedAt).toArray()).map((t) => [t.id, t.kind, t.amountCents, t.note]).sort()

beforeEach(async () => {
  requests = []
  remote = new FakeRemote()
  await freshDevice()
  await addExpense('café de la mañana', 350)
  await addExpense('cena con amigos', 2450)
  const del = await addExpense('esta se borra', 999)
  await runSync({ remote, userId: USER })
  await txRepo.softDelete(del.id)
  await runSync({ remote, userId: USER })
})

describe('copia externa cifrada de extremo a extremo', () => {
  it('descarga, valida, cifra, se descifra con la clave privada y se restaura idéntica', async () => {
    const identity = await generateIdentity()
    const recipient = await identityToRecipient(identity)
    const r = await createEncryptedCloudBackup({ url, anonKey: ANON, email: EMAIL, password: PASSWORD, recipient, pageSize: 3 })

    // 1) el archivo no contiene nada legible
    const raw = Buffer.from(r.bytes).toString('latin1')
    for (const secret of ['café de la mañana', 'cena con amigos', 'Restauración', EMAIL, PASSWORD, '"app"']) expect(raw).not.toContain(secret)
    expect(r.counts.transactions).toBe(4) // apertura + 3 gastos (el borrado lógico también viaja)

    // 2) sin la clave privada no se abre
    const wrong = new Decrypter()
    wrong.addIdentity(await generateIdentity())
    await expect(wrong.decrypt(r.bytes, 'text')).rejects.toThrow()

    // 3) con la clave privada, vuelve el contenido y valida
    const d = new Decrypter()
    d.addIdentity(identity)
    const check = await validateBackup(JSON.parse(await d.decrypt(r.bytes, 'text')))
    expect(check.ok).toBe(true)
    expect(check.backup!.source).toBe('cloud')

    // 4) restaurar en un dispositivo vacío reproduce los datos originales
    const original = await liveTx()
    await freshDevice()
    await restoreBackup(check.backup!)
    expect(await liveTx()).toEqual(original)
    const settings = (await db.settings.get('main'))!
    expect(settings.monthlyBudgetCents).toBe(79000)
    expect(settings.incomePlans).toHaveLength(2)
    expect(await db.funds.count()).toBe(2)
  }, 30_000)

  it('pagina correctamente y usa la sesión del usuario (nunca solo la clave pública)', async () => {
    const recipient = await identityToRecipient(await generateIdentity())
    await createEncryptedCloudBackup({ url, anonKey: ANON, email: EMAIL, password: PASSWORD, recipient, pageSize: 2 })
    const rest = requests.filter((q) => q.path.startsWith('/rest/v1/transactions'))
    expect(rest.length).toBeGreaterThan(1) // varias páginas
    expect(rest.every((q) => q.auth === 'Bearer token-de-prueba')).toBe(true)
  }, 30_000)

  it('con credenciales incorrectas falla sin revelar la contraseña', async () => {
    const recipient = await identityToRecipient(await generateIdentity())
    const err = await createEncryptedCloudBackup({ url, anonKey: ANON, email: EMAIL, password: 'mala-contraseña', recipient }).catch((e) => e)
    expect(err).toBeInstanceOf(BackupError)
    expect(String(err.message)).toMatch(/rechazado/)
    expect(String(err.message)).not.toContain('mala-contraseña')
    expect(String(err.stack)).not.toContain('mala-contraseña')
  })

  it('rechaza una clave de cifrado no válida y un servidor inalcanzable', async () => {
    await expect(createEncryptedCloudBackup({ url, anonKey: ANON, email: EMAIL, password: PASSWORD, recipient: 'no-es-una-clave' })).rejects.toThrow(/age1/)
    await expect(createEncryptedCloudBackup({ url: 'http://127.0.0.1:1', anonKey: ANON, email: EMAIL, password: PASSWORD, recipient: await identityToRecipient(await generateIdentity()) })).rejects.toThrow(/red/)
  }, 30_000)

  it('si los datos de la nube son inconsistentes, NO guarda una copia dañada', async () => {
    const t = [...remote.t('transactions').values()].find((x) => x.kind === 'expense')!
    remote.t('transactions').set(t.id as string, { ...t, amount_cents: -5 })
    const recipient = await identityToRecipient(await generateIdentity())
    await expect(createEncryptedCloudBackup({ url, anonKey: ANON, email: EMAIL, password: PASSWORD, recipient })).rejects.toThrow(/validación/)
  }, 30_000)
})

describe('scripts de línea de comandos', () => {
  it('keygen → cloud-backup → decrypt funcionan encadenados y no filtran secretos por pantalla', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'saldo-bk-'))
    try {
      const sh = { cwd: process.cwd(), shell: true, timeout: 60_000 }
      const keys = (await run('npx tsx scripts/backup/keygen.ts', [], sh)).stdout
      const recipient = keys.match(/age1[0-9a-z]+/)![0]
      const identity = keys.match(/AGE-SECRET-KEY-[0-9A-Z]+/)![0]

      const out = join(dir, 'copia.json.age')
      const env = { ...process.env, SUPABASE_URL: url, SUPABASE_ANON_KEY: ANON, BACKUP_EMAIL: EMAIL, BACKUP_PASSWORD: PASSWORD, AGE_RECIPIENT: recipient }
      const cloud = await run(`npx tsx scripts/backup/cloud-backup.ts "${out}"`, [], { ...sh, env })
      expect(cloud.stdout).toContain('4 movimientos')
      for (const secret of [PASSWORD, 'token-de-prueba', 'café de la mañana']) expect(cloud.stdout + cloud.stderr).not.toContain(secret)

      const plain = join(dir, 'copia.json')
      const dec = await run(`npx tsx scripts/backup/decrypt.ts "${out}" "${plain}"`, [], { ...sh, env: { ...process.env, AGE_IDENTITY: identity } })
      expect(dec.stdout).toContain('Validación: correcta')
      expect((await validateBackup(JSON.parse(await readFile(plain, 'utf8')))).ok).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  it('el script falla con código ≠ 0 y mensaje claro si falta configuración', async () => {
    const env = { ...process.env, SUPABASE_URL: '', SUPABASE_ANON_KEY: '', BACKUP_EMAIL: '', BACKUP_PASSWORD: '', AGE_RECIPIENT: '' }
    const err = await run('npx tsx scripts/backup/cloud-backup.ts x.age', [], { cwd: process.cwd(), shell: true, env, timeout: 60_000 }).catch((e) => e)
    expect(err.code).toBe(1)
    expect(err.stderr).toMatch(/Falta la variable/)
  }, 60_000)

  it('rechaza una clave de servicio como clave pública', async () => {
    const env = { ...process.env, SUPABASE_URL: url, SUPABASE_ANON_KEY: 'sb_secret_xxx', BACKUP_EMAIL: EMAIL, BACKUP_PASSWORD: PASSWORD, AGE_RECIPIENT: 'age1xxxx' }
    const err = await run('npx tsx scripts/backup/cloud-backup.ts x.age', [], { cwd: process.cwd(), shell: true, env, timeout: 60_000 }).catch((e) => e)
    expect(err.code).toBe(1)
    expect(err.stderr).toMatch(/clave de servicio/)
  }, 60_000)
})
