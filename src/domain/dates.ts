const pad = (n: number) => String(n).padStart(2, '0')

/** Fecha local en formato YYYY-MM-DD. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const todayISO = () => toISODate(new Date())

export function addDaysISO(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

/** "2026-11-04" -> "2026-11" */
export const monthOf = (iso: string) => iso.slice(0, 7)

export function addMonths(ym: string, delta: number): string {
  const [y = 0, m = 1] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function monthLabel(ym: string): string {
  const [y = 0, m = 1] = ym.split('-').map(Number)
  const s = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function dayLabel(iso: string): string {
  const today = todayISO()
  if (iso === today) return 'Hoy'
  if (iso === addDaysISO(today, -1)) return 'Ayer'
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number)
  const s = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const daysInMonth = (ym: string) => {
  const [y = 0, m = 1] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
/** Lunes=0 … domingo=6 del primer día del mes. */
export const firstWeekdayMonday = (ym: string) => {
  const [y = 0, m = 1] = ym.split('-').map(Number)
  return (new Date(y, m - 1, 1).getDay() + 6) % 7
}
