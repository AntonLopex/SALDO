import { dayLabelPlain } from './csvDates'
import type { Category, Tx } from '@/domain/types'

const KIND: Record<Tx['kind'], string> = { income: 'Ingreso', expense: 'Gasto', opening: 'Apertura', transfer: 'Transferencia' }

/** 350 → "3,50" (coma decimal, sin separador de miles: se abre bien en Excel/Numbers en español). */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

/** Evita la inyección de fórmulas: una celda de texto que empieza por = + - @ se interpretaría como fórmula en Excel. */
function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

function cell(s: string): string {
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV de movimientos vivos, de más antiguo a más reciente. Es para análisis; NO sirve para restaurar (usa el JSON). */
export function transactionsToCsv(txs: readonly Tx[], categories: readonly Category[]): string {
  const byId = new Map(categories.map((c) => [c.id, c.name]))
  const header = ['Fecha', 'Tipo', 'Importe (EUR)', 'Categoría', 'Subcategoría', 'Nota', 'Id']
  const rows = [...txs]
    .filter((t) => !t.deletedAt)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.createdAt.localeCompare(b.createdAt))
    .map((t) => [
      dayLabelPlain(t.occurredOn),
      KIND[t.kind],
      centsToDecimal(t.kind === 'expense' ? -t.amountCents : t.amountCents),
      safeText(t.categoryId ? (byId.get(t.categoryId) ?? '') : ''),
      safeText(t.subcategoryId ? (byId.get(t.subcategoryId) ?? '') : ''),
      safeText(t.note),
      t.id,
    ])
  // BOM UTF-8 para que Excel respete las tildes; separador ; por la coma decimal.
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n'
}
