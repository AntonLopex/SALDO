/** Todos los importes internos son enteros en céntimos. */
export type Cents = number

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true })
const eurNoDec = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: true })

export function formatCents(cents: Cents): string {
  return eur.format(cents / 100)
}

export function formatCentsRounded(cents: Cents): string {
  return eurNoDec.format(cents / 100)
}

/** Convierte texto de usuario ("3,5", "1.391,50", "2.5") a céntimos. Devuelve null si no es válido. */
export function parseEuros(input: string): Cents | null {
  let s = input.trim().replace(/[€\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '') // "1.000" = mil
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [int = '0', dec = ''] = s.split('.')
  return Number(int) * 100 + Number(dec.padEnd(2, '0'))
}
