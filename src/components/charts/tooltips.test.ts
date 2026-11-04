import { describe, expect, it } from 'vitest'
import { esc, itemTooltip, moneyTooltip } from './tooltips'

const EVIL = `<img src=x onerror="window.__xss=1">`

describe('tooltips de gráficos: nunca devuelven HTML de datos del usuario sin escapar', () => {
  it('esc neutraliza los cinco caracteres peligrosos', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
    expect(esc('Café')).toBe('Café')
  })

  it('el tooltip de categoría escapa el nombre (p. ej. importado en una copia manipulada)', () => {
    const html = itemTooltip({ name: EVIL, value: 12.5, percent: 40 })
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain('&lt;img')
    expect(html).toContain('12,50')
  })

  it('el tooltip de series escapa nombres de serie y etiquetas de eje', () => {
    const html = moneyTooltip([{ axisValueLabel: EVIL, marker: '<span class="m"></span>', seriesName: EVIL, value: 3.5 }])
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain('<span class="m"></span>') // el marcador lo genera ECharts, es de confianza
    expect(html).toContain('3,50')
  })

  it('omite los puntos sin valor', () => {
    const html = moneyTooltip([
      { axisValueLabel: 'nov 26', marker: '', seriesName: 'Real', value: 10 },
      { axisValueLabel: 'nov 26', marker: '', seriesName: 'Previsión', value: null },
    ])
    expect(html).toContain('Real')
    expect(html).not.toContain('Previsión')
  })
})
