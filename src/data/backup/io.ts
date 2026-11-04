import { db, type SnapshotRow } from '../db'
import { plain } from '../plain'
import { buildBackup, validateBackup, type BackupData, type BackupFile, type ValidationResult } from './format'
import { transactionsToCsv } from './csv'
import { decryptWithPassphrase, encryptWithPassphrase, looksEncrypted } from './crypto'

const nowIso = () => new Date().toISOString()
const stamp = (d = new Date()) => d.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')

// ───────────────────────── recoger y exportar ─────────────────────────

/** Todos los datos locales, incluidos borrados lógicos y categorías archivadas (copia fiel). */
export async function collectLocalData(): Promise<BackupData> {
  const [categories, transactions, planned, funds, settings] = await Promise.all([
    db.categories.toArray(), db.transactions.toArray(), db.planned.toArray(), db.funds.toArray(), db.settings.get('main'),
  ])
  return { categories, transactions, planned, funds, settings: settings ?? null }
}

export async function buildLocalBackup(): Promise<BackupFile> {
  return buildBackup(await collectLocalData(), 'device')
}

export interface ExportFile {
  filename: string
  mime: string
  data: string | Uint8Array
  encrypted: boolean
}

export async function exportJson(passphrase?: string): Promise<ExportFile> {
  const text = JSON.stringify(await buildLocalBackup(), null, 2)
  if (passphrase) {
    return { filename: `saldo-copia-${stamp()}.json.age`, mime: 'application/octet-stream', data: await encryptWithPassphrase(text, passphrase), encrypted: true }
  }
  return { filename: `saldo-copia-${stamp()}.json`, mime: 'application/json', data: text, encrypted: false }
}

export async function exportCsv(): Promise<ExportFile> {
  const d = await collectLocalData()
  return { filename: `saldo-movimientos-${stamp()}.csv`, mime: 'text/csv;charset=utf-8', data: transactionsToCsv(d.transactions, d.categories), encrypted: false }
}

export type DeliverResult = 'shared' | 'downloaded' | 'cancelled'

/** Entrega el archivo: hoja de compartir en el móvil si existe; si no, descarga. */
export async function deliverFile(f: ExportFile): Promise<DeliverResult> {
  const blob = new Blob([f.data as BlobPart], { type: f.mime })
  const file = new File([blob], f.filename, { type: f.mime })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Copia de SALDO' })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
      // otro fallo (p. ej. se perdió el gesto del usuario): se cae a la descarga normal
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = f.filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

export const markExported = () => db.meta.put({ key: 'lastExportAt', value: nowIso() })
export const lastExportAt = async () => (await db.meta.get('lastExportAt'))?.value ?? null

// ───────────────────────── importar ─────────────────────────

export class NeedPassphraseError extends Error {
  constructor() {
    super('Este archivo está cifrado: escribe su contraseña.')
    this.name = 'NeedPassphraseError'
  }
}

/** Lee, descifra si hace falta y VALIDA. No modifica nada. */
export async function parseBackupFile(bytes: Uint8Array, passphrase?: string): Promise<ValidationResult> {
  let text: string
  if (looksEncrypted(bytes)) {
    if (!passphrase) throw new NeedPassphraseError()
    text = await decryptWithPassphrase(bytes, passphrase)
  } else {
    text = new TextDecoder().decode(bytes)
  }
  let json: unknown
  try {
    json = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { ok: false, errors: ['El archivo no es un JSON válido.'], warnings: [] }
  }
  return validateBackup(json)
}

// ───────────────────────── restaurar ─────────────────────────

/**
 * Restaura sobre este dispositivo SIN borrar físicamente nada:
 *  - lo que viene en la copia se escribe (y queda pendiente de sincronizar);
 *  - lo que existe aquí y no está en la copia se da de baja (movimientos/planificados: borrado lógico;
 *    categorías: archivadas). Así la nube refleja el resultado y el historial no se rompe.
 * El llamador debe haber creado antes una copia de seguridad (createSnapshot('pre-restore')).
 */
export async function restoreBackup(input: BackupFile): Promise<{ written: number; removed: number }> {
  const b = plain(input) // la copia llega de la interfaz como objeto reactivo: IndexedDB no puede clonar Proxy
  const now = nowIso()
  let written = 0
  let removed = 0
  await db.transaction('rw', [db.categories, db.transactions, db.planned, db.funds, db.settings], async () => {
    const mark = <T extends { id: string }>(row: T, existing?: { serverUpdatedAt?: string }) =>
      ({ ...row, updatedAt: now, syncedAt: undefined, serverUpdatedAt: existing?.serverUpdatedAt }) as T

    const cats = new Map((await db.categories.toArray()).map((c) => [c.id, c]))
    const catIds = new Set(b.data.categories.map((c) => c.id))
    for (const c of b.data.categories) { await db.categories.put(mark(c, cats.get(c.id))); written++ }
    for (const ex of cats.values()) {
      if (!catIds.has(ex.id) && !ex.archivedAt) { await db.categories.put({ ...ex, archivedAt: now, isFavorite: false, updatedAt: now }); removed++ }
    }

    const txs = new Map((await db.transactions.toArray()).map((t) => [t.id, t]))
    const txIds = new Set(b.data.transactions.map((t) => t.id))
    for (const t of b.data.transactions) { await db.transactions.put(mark(t, txs.get(t.id))); written++ }
    for (const ex of txs.values()) {
      if (!txIds.has(ex.id) && !ex.deletedAt) { await db.transactions.put({ ...ex, deletedAt: now, updatedAt: now }); removed++ }
    }

    const pl = new Map((await db.planned.toArray()).map((p) => [p.id, p]))
    const plIds = new Set(b.data.planned.map((p) => p.id))
    for (const p of b.data.planned) { await db.planned.put(mark(p, pl.get(p.id))); written++ }
    for (const ex of pl.values()) {
      if (!plIds.has(ex.id) && !ex.deletedAt) { await db.planned.put({ ...ex, deletedAt: now, updatedAt: now }); removed++ }
    }

    const fs = new Map((await db.funds.toArray()).map((f) => [f.id, f]))
    for (const f of b.data.funds) { await db.funds.put(mark(f, fs.get(f.id))); written++ }

    if (b.data.settings) {
      const ex = await db.settings.get('main')
      await db.settings.put({ ...mark({ ...b.data.settings, id: 'main' as const }, ex) })
      written++
    }
  })
  return { written, removed }
}

// ───────────────────────── copias internas automáticas ─────────────────────────

const AUTO_EVERY_MS = 7 * 86_400_000
const KEEP = { auto: 6, 'pre-restore': 3 } as const

export async function createSnapshot(reason: SnapshotRow['reason']): Promise<SnapshotRow> {
  const backup = await buildLocalBackup()
  const row: SnapshotRow = {
    id: crypto.randomUUID(), at: nowIso(), reason, json: JSON.stringify(backup),
    transactions: backup.data.transactions.filter((t) => !t.deletedAt && (t.kind === 'income' || t.kind === 'expense')).length,
  }
  await db.snapshots.add(row)
  for (const r of ['auto', 'pre-restore'] as const) {
    const all = await db.snapshots.where('reason').equals(r).sortBy('at')
    const extra = all.slice(0, Math.max(0, all.length - KEEP[r]))
    if (extra.length) await db.snapshots.bulkDelete(extra.map((x) => x.id))
  }
  return row
}

/** Una copia interna a la semana, solo si ya hay movimientos reales. */
export async function maybeAutoSnapshot(now = Date.now()): Promise<boolean> {
  const hasReal = (await db.transactions.filter((t) => !t.deletedAt && (t.kind === 'income' || t.kind === 'expense')).count()) > 0
  if (!hasReal) return false
  const last = (await db.snapshots.where('reason').equals('auto').sortBy('at')).at(-1)
  if (last && now - Date.parse(last.at) < AUTO_EVERY_MS) return false
  await createSnapshot('auto')
  return true
}

export async function loadSnapshot(id: string): Promise<ValidationResult> {
  const row = await db.snapshots.get(id)
  if (!row) return { ok: false, errors: ['La copia interna ya no existe.'], warnings: [] }
  return validateBackup(JSON.parse(row.json))
}
