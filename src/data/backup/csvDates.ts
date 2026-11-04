/** "2026-11-03" → "03/11/2026" (formato habitual en España; las hojas de cálculo lo reconocen como fecha). */
export function dayLabelPlain(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
