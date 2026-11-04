import { describe, expect, it } from 'vitest'
import type { Category, Fund, PlannedExpense, Settings, Tx } from '@/domain/types'
import { defaultFunds, defaultSettings } from '@/domain/defaults'
import { centsToDecimal, transactionsToCsv } from './csv'
import { decryptWithPassphrase, encryptWithPassphrase, looksEncrypted } from './crypto'
import { buildBackup, canonical, summarize, validateBackup, type BackupData } from './format'

const T = '2026-11-04T10:00:00.000Z'
const cat = (id: string, name: string, parentId: string | null = null): Category => ({
  id, parentId, name, icon: 'tag', color: '#55D6A0', isFavorite: false, favOrder: 0, sortOrder: 0, archivedAt: null, createdAt: T, updatedAt: T,
})
const tx = (id: string, p: Partial<Tx> = {}): Tx => ({
  id, kind: 'expense', amountCents: 350, occurredOn: '2026-11-03', categoryId: 'c1', subcategoryId: null, note: '', plannedExpenseId: null,
  createdAt: T, updatedAt: T, deletedAt: null, ...p,
})
const planned = (id: string): PlannedExpense => ({ id, name: 'Botas', estimatedCents: 12000, plannedOn: '2027-01-15', categoryId: null, subcategoryId: null, status: 'pending', linkedTransactionId: null, createdAt: T, updatedAt: T, deletedAt: null })

const data = (): BackupData => ({
  categories: [cat('c1', 'Restauración'), cat('c2', 'Café', 'c1')],
  transactions: [tx('t0', { kind: 'opening', amountCents: 386014, categoryId: null, occurredOn: '2026-11-01', note: 'Saldo de apertura' }), tx('t1'), tx('t2', { subcategoryId: 'c2', note: 'Con leche' })],
  planned: [planned('p1')],
  funds: defaultFunds() as Fund[],
  settings: defaultSettings() as Settings,
})

const valid = async (d: BackupData) => validateBackup(JSON.parse(JSON.stringify(await buildBackup(d))))
const rebuilt = async (mutate: (b: Record<string, unknown>) => void) => {
  const b = JSON.parse(JSON.stringify(await buildBackup(data())))
  mutate(b)
  return validateBackup(b)
}

describe('formato y checksum', () => {
  it('canonical ignora el orden de claves', () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonical({ a: [2, { c: 2, d: 1 }], b: 1 }))
  })
  it('una copia correcta valida y se resume', async () => {
    const r = await valid(data())
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    const s = summarize(r.backup!)
    expect(s).toMatchObject({ transactions: 2, firstDate: '2026-11-03', lastDate: '2026-11-03', worthCents: 386014 - 700 })
  })
  it('no incluye marcas de sincronización', async () => {
    const d = data()
    d.transactions[1] = { ...d.transactions[1]!, syncedAt: 'x', serverUpdatedAt: 'y' }
    const b = await buildBackup(d)
    expect(JSON.stringify(b)).not.toMatch(/syncedAt|serverUpdatedAt/)
  })
  it('detecta un archivo modificado a mano (checksum)', async () => {
    const r = await rebuilt((b) => { ((b.data as BackupData).transactions[1] as Tx).amountCents = 999999 })
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/suma de comprobación/)
  })
  it('es determinista: mismos datos, mismo checksum', async () => {
    const d = data() // los ajustes por defecto llevan la hora actual: se usan los mismos datos en ambas copias
    const a = await buildBackup(d, 'device', new Date(0))
    const b = await buildBackup(structuredClone(d), 'device', new Date(5000))
    expect(a.checksum).toBe(b.checksum)
  })
})

describe('validación estructural', () => {
  const bad = async (mutate: (d: BackupData) => void, re: RegExp) => {
    const d = data(); mutate(d)
    const r = await valid(d)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' | ')).toMatch(re)
  }
  it('rechaza lo que no es una copia de SALDO', async () => {
    expect((await validateBackup({ hola: 1 })).ok).toBe(false)
    expect((await validateBackup(null)).ok).toBe(false)
    expect((await validateBackup('texto')).ok).toBe(false)
  })
  it('rechaza una versión de formato más nueva', async () => {
    const r = await rebuilt((b) => { b.formatVersion = 99 })
    expect(r.errors.join()).toMatch(/versión más nueva/)
  })
  it('importes: enteros, positivos', async () => {
    await bad((d) => { d.transactions[1]!.amountCents = 3.5 }, /importe no válido/)
    await bad((d) => { d.transactions[1]!.amountCents = 0 }, /importe no válido/)
    await bad((d) => { d.transactions[1]!.amountCents = -100 }, /importe no válido/)
    await bad((d) => { d.transactions[1]!.amountCents = '350' as unknown as number }, /importe no válido/)
  })
  it('fechas reales', async () => {
    await bad((d) => { d.transactions[1]!.occurredOn = '2026-02-30' }, /fecha no válida/)
    await bad((d) => { d.transactions[1]!.occurredOn = '03/11/2026' }, /fecha no válida/)
  })
  it('identificadores únicos', async () => {
    await bad((d) => { d.transactions.push(tx('t1')) }, /duplicado/)
    await bad((d) => { d.categories.push(cat('c1', 'Otra')) }, /repetido/)
  })
  it('referencias entre registros', async () => {
    await bad((d) => { d.transactions[1]!.categoryId = 'no-existe' }, /categoría inexistente/)
    await bad((d) => { d.transactions[1]!.plannedExpenseId = 'no-existe' }, /planificado inexistente/)
    await bad((d) => { d.categories[1]!.parentId = 'fantasma' }, /no existe/)
    await bad((d) => { d.transactions[2]!.categoryId = null }, /subcategoría no pertenece/)
  })
  it('categorías: un solo nivel y datos válidos', async () => {
    await bad((d) => { d.categories.push(cat('c3', 'Nieta', 'c2')) }, /cuelga de otra subcategoría/)
    await bad((d) => { d.categories[0]!.color = 'rojo' }, /color no válido/)
  })
  it('un único saldo de apertura vivo', async () => {
    await bad((d) => { d.transactions.push(tx('t9', { kind: 'opening', categoryId: null })) }, /más de un saldo de apertura/)
  })
  it('un saldo de apertura borrado no cuenta como duplicado', async () => {
    const d = data(); d.transactions.push(tx('t9', { kind: 'opening', categoryId: null, deletedAt: T }))
    expect((await valid(d)).ok).toBe(true)
  })
  it('fondos y ajustes', async () => {
    await bad((d) => { d.funds[0]!.allocatedCents = -1 }, /asignado no válido/)
    await bad((d) => { d.funds[1]!.kind = 'emergency' }, /repetido/)
    await bad((d) => { d.settings!.monthlyBudgetCents = 0 }, /presupuesto/)
    await bad((d) => { d.settings!.goals = { min: 2, main: 1, stretch: 3 } }, /objetivos/)
    await bad((d) => { d.settings!.targetMonth = '2025-01' }, /fechas del plan/)
    await bad((d) => { d.settings!.incomePlans[0]!.months = [13] }, /ingresos previstos/)
  })
  it('avisa (sin bloquear) si falta el saldo de apertura o los ajustes', async () => {
    const d = data(); d.transactions = d.transactions.filter((t) => t.kind !== 'opening'); d.settings = null
    const r = await valid(d)
    expect(r.ok).toBe(true)
    expect(r.warnings).toHaveLength(2)
  })
  it('limita el número de errores mostrados', async () => {
    const d = data()
    for (let i = 0; i < 60; i++) d.transactions.push(tx(`x${i}`, { amountCents: 0 }))
    const r = await valid(d)
    expect(r.errors.length).toBeLessThanOrEqual(21)
  })
})

describe('CSV', () => {
  it('importes con coma decimal y signo', () => {
    expect(centsToDecimal(350)).toBe('3,50')
    expect(centsToDecimal(-350)).toBe('-3,50')
    expect(centsToDecimal(5)).toBe('0,05')
    expect(centsToDecimal(139150)).toBe('1391,50')
  })
  it('exporta solo vivos, ordenados, con BOM y separador ;', () => {
    const d = data()
    d.transactions.push(tx('t3', { deletedAt: T }))
    const csv = transactionsToCsv(d.transactions, d.categories)
    const lines = csv.replace('﻿', '').trim().split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(lines[0]).toBe('Fecha;Tipo;Importe (EUR);Categoría;Subcategoría;Nota;Id')
    expect(lines).toHaveLength(4) // cabecera + apertura + 2 gastos (el borrado no sale)
    expect(lines[1]).toContain('01/11/2026;Apertura;3860,14')
    expect(lines[3]).toBe('03/11/2026;Gasto;-3,50;Restauración;Café;Con leche;t2')
  })
  it('escapa comillas, saltos de línea y separadores', () => {
    const d = data(); d.transactions[1]!.note = 'cena; "con" amigos\nsegunda línea'
    const csv = transactionsToCsv(d.transactions, d.categories)
    expect(csv).toContain('"cena; ""con"" amigos\nsegunda línea"')
  })
  it('neutraliza la inyección de fórmulas en texto', () => {
    const d = data(); d.transactions[1]!.note = '=HYPERLINK("http://malo")'
    const csv = transactionsToCsv(d.transactions, d.categories)
    expect(csv).not.toMatch(/;=HYPERLINK/)
    expect(csv).toContain(`'=HYPERLINK`)
    const d2 = data(); d2.transactions[1]!.note = '-1+1'; d2.categories[0]!.name = '@SUM(A1)'
    const csv2 = transactionsToCsv(d2.transactions, d2.categories)
    expect(csv2).toContain(`;'-1+1;`)
    expect(csv2).toContain(`'@SUM(A1)`)
  })
})

describe('cifrado con contraseña (age)', () => {
  it('ida y vuelta, y el texto cifrado no contiene datos legibles', async () => {
    const plain = JSON.stringify(await buildBackup(data()))
    const enc = await encryptWithPassphrase(plain, 'una-contraseña-muy-larga-123')
    expect(looksEncrypted(enc)).toBe(true)
    expect(new TextDecoder().decode(enc)).not.toContain('Restauración')
    expect(await decryptWithPassphrase(enc, 'una-contraseña-muy-larga-123')).toBe(plain)
  }, 30_000)
  it('contraseña incorrecta falla con mensaje claro', async () => {
    const enc = await encryptWithPassphrase('secreto', 'una-contraseña-muy-larga-123')
    await expect(decryptWithPassphrase(enc, 'otra-contraseña-distinta')).rejects.toThrow(/incorrecta/)
  }, 30_000)
  it('exige una contraseña mínima', async () => {
    await expect(encryptWithPassphrase('x', 'corta')).rejects.toThrow(/al menos/)
  })
  it('un JSON normal no se confunde con un archivo cifrado', () => {
    expect(looksEncrypted(new TextEncoder().encode('{"app":"saldo"}'))).toBe(false)
  })
})
