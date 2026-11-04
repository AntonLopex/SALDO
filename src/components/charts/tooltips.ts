import { eur2 } from './theme'

/**
 * ECharts construye los tooltips como HTML. Los nombres de categoría son datos del usuario (y pueden venir de una
 * copia importada), así que NUNCA se insertan sin escapar: un nombre como `<img onerror=…>` sería código ejecutable.
 */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface AxisItem {
  axisValueLabel: string
  marker: string // HTML generado por ECharts (un círculo de color): de confianza
  seriesName: string
  value: number | null | undefined
}

/** Tooltip de eje: «etiqueta» y una línea por serie con valor. Importes en euros (el valor llega ya en euros). */
export function moneyTooltip(items: unknown): string {
  const list = (Array.isArray(items) ? items : []) as AxisItem[]
  const lines = list
    .filter((i) => i.value !== null && i.value !== undefined)
    .map((i) => `${i.marker ?? ''}${esc(i.seriesName)}: <b>${esc(eur2(Number(i.value) * 100))}</b>`)
  return [esc(list[0]?.axisValueLabel ?? ''), ...lines].join('<br/>')
}

/** Tooltip de sector (gráfico de categorías). */
export function itemTooltip(p: { name: string; value: number; percent: number }): string {
  return `${esc(p.name)}: <b>${esc(eur2(p.value * 100))}</b> (${Math.round(p.percent)} %)`
}
