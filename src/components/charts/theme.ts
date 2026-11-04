/** Lee los tokens de color vigentes (claro/oscuro) para pintar los gráficos. Se llama al construir cada opción. */
export function chartColors() {
  const s = getComputedStyle(document.documentElement)
  const v = (n: string) => s.getPropertyValue(n).trim()
  return {
    text: v('--muted'), ink: v('--text'), line: v('--border'), accent: v('--accent'), accentDeep: v('--accent-deep'),
    danger: v('--danger'), warning: v('--warning'), surface: v('--surface'),
  }
}

export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** Euros compactos para ejes y tooltips: 17000 -> "17.000 €". */
export const eur = (cents: number) => Math.round(cents / 100).toLocaleString('es-ES') + ' €'
export const eur2 = (cents: number) => (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

const SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const monthShort = (ym: string) => `${SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`

import { ref } from 'vue'
/** Cambia cada vez que cambia el tema; las opciones de gráfico dependen de él para repintarse. */
export const themeTick = ref(0)
new MutationObserver(() => themeTick.value++).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
