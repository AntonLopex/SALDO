<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChartColumn, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { EChartsOption } from 'echarts'
import Chart from '@/components/charts/Chart.vue'
import { chartColors, eur, eur2, monthShort, reduceMotion, themeTick } from '@/components/charts/theme'
import Card from '@/components/ui/Card.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { categoryById, dataReady, settings, txs } from '@/data/appData'
import { addMonths, dayLabel, monthLabel, monthOf, todayISO } from '@/domain/dates'
import { formatCents } from '@/domain/money'
import { forecastAtMonth } from '@/engine/goals'
import { openingAmount, savingTarget, trajectoryAt } from '@/engine/plan'
import { categoryBreakdown, monthlySeries, periodRange, previousRange, rangeSummary, worthSeries, type PeriodMode, type Range } from '@/engine/stats'
import { useFinance } from '@/features/useFinance'

const today = todayISO()
const mode = ref<PeriodMode>('month')
const offset = ref(0)
const customFrom = ref(`${monthOf(today)}-01`)
const customTo = ref(today)
const { fc } = useFinance()

const modes: { k: PeriodMode; l: string }[] = [{ k: 'month', l: 'Mes' }, { k: 'quarter', l: 'Trimestre' }, { k: 'year', l: 'Año' }, { k: 'custom', l: 'Otro' }]

const range = computed<Range>(() => {
  if (mode.value === 'custom') return customFrom.value <= customTo.value ? { from: customFrom.value, to: customTo.value } : { from: customTo.value, to: customFrom.value }
  return periodRange(mode.value, today, offset.value)
})
const periodTitle = computed(() => {
  if (mode.value === 'month') return monthLabel(monthOf(range.value.from))
  if (mode.value === 'quarter') return `T${Math.floor((Number(range.value.from.slice(5, 7)) - 1) / 3) + 1} ${range.value.from.slice(0, 4)}`
  if (mode.value === 'year') return range.value.from.slice(0, 4)
  return `${dayLabel(range.value.from)} – ${dayLabel(range.value.to)}`
})
function setMode(m: PeriodMode) { mode.value = m; offset.value = 0 }

const sum = computed(() => rangeSummary(txs.value, range.value))
const prev = computed(() => rangeSummary(txs.value, previousRange(range.value)))
const hasAnyReal = computed(() => txs.value.some((t) => t.kind === 'income' || t.kind === 'expense'))

const curYm = monthOf(today)
const base = () => {
  const c = chartColors()
  return { c, animation: !reduceMotion(), textStyle: { color: c.text, fontFamily: 'inherit' } }
}
const axisStyle = (c: ReturnType<typeof chartColors>) => ({ axisLabel: { color: c.text }, axisLine: { lineStyle: { color: c.line } }, splitLine: { lineStyle: { color: c.line } } })
const moneyTip = (items: unknown) =>
  (items as { axisValueLabel: string; marker: string; seriesName: string; value: number | null }[])
    .filter((i) => i.value !== null && i.value !== undefined)
    .map((i) => `${i.marker}${i.seriesName}: <b>${eur2(Number(i.value))}</b>`).join('<br/>')
    .replace(/^/, (items as { axisValueLabel: string }[])[0]?.axisValueLabel + '<br/>')

// ----- Patrimonio: real (continuo) + previsión (discontinuo) -----
const startYm = computed(() => settings.value.planStart)
const monthsAxis = computed(() => {
  const out: string[] = []
  for (let m = startYm.value; m <= settings.value.targetMonth; m = addMonths(m, 1)) out.push(m)
  return out
})
const worthOption = computed<EChartsOption>(() => {
  void themeTick.value
  const { c, animation, textStyle } = base()
  const real = worthSeries(txs.value, startYm.value, curYm < startYm.value ? startYm.value : curYm)
  const realMap = new Map(real.map((p) => [p.ym, p.worth]))
  const fcMap = new Map(fc.value.future.map((p) => [p.ym, p.worth]))
  const nowWorth = fc.value.worthNow
  return {
    animation, textStyle, grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', formatter: moneyTip as never },
    xAxis: { type: 'category', data: monthsAxis.value.map(monthShort), ...axisStyle(c), axisLabel: { color: c.text, interval: 'auto' } },
    yAxis: { type: 'value', scale: true, ...axisStyle(c), axisLabel: { color: c.text, formatter: (v: number) => eur(v * 100) } },
    series: [
      { name: 'Real', type: 'line', smooth: false, symbolSize: 6, itemStyle: { color: c.accent }, lineStyle: { width: 3, color: c.accent },
        data: monthsAxis.value.map((m) => (m === curYm ? nowWorth : m < curYm ? (realMap.get(m) ?? null) : null)).map((v) => (v === null ? null : Math.round(v) / 100)) },
      { name: 'Previsión', type: 'line', symbol: 'none', itemStyle: { color: c.text }, lineStyle: { width: 2, type: 'dashed', color: c.text },
        data: monthsAxis.value.map((m) => (m === curYm ? nowWorth : (fcMap.get(m) ?? null))).map((v) => (v === null ? null : Math.round(v) / 100)) },
    ],
  }
})

// ----- Evolución hacia los objetivos: real vs trayectoria + metas -----
const goalOption = computed<EChartsOption>(() => {
  void themeTick.value
  const { c, animation, textStyle } = base()
  const open = openingAmount(txs.value)
  const real = new Map(worthSeries(txs.value, startYm.value, curYm < startYm.value ? startYm.value : curYm).map((p) => [p.ym, p.worth]))
  const g = settings.value.goals
  return {
    animation, textStyle, grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', formatter: moneyTip as never },
    xAxis: { type: 'category', data: monthsAxis.value.map(monthShort), ...axisStyle(c) },
    yAxis: { type: 'value', ...axisStyle(c), axisLabel: { color: c.text, formatter: (v: number) => eur(v * 100) } },
    series: [
      { name: 'Trayectoria objetivo', type: 'line', symbol: 'none', lineStyle: { width: 2, type: 'dashed', color: c.warning }, itemStyle: { color: c.warning },
        data: monthsAxis.value.map((m) => Math.round(trajectoryAt(settings.value, open, m)) / 100),
        markLine: { silent: true, symbol: 'none', label: { color: c.text, formatter: '{b}' }, lineStyle: { color: c.line, type: 'solid' },
          data: [{ name: 'Mín.', yAxis: g.min / 100 }, { name: 'Principal', yAxis: g.main / 100 }, { name: 'Ambicioso', yAxis: g.stretch / 100 }] } },
      { name: 'Real', type: 'line', symbolSize: 6, lineStyle: { width: 3, color: c.accent }, itemStyle: { color: c.accent },
        data: monthsAxis.value.map((m) => (m <= curYm ? (m === curYm ? fc.value.worthNow : (real.get(m) ?? null)) : null)).map((v) => (v === null ? null : Math.round(v) / 100)) },
    ],
  }
})

// ----- Meses: ingresos vs gastos y ahorro -----
const seriesRange = computed(() => {
  const toYm = monthOf(range.value.to) > curYm ? curYm : monthOf(range.value.to)
  const fromRaw = monthOf(range.value.from)
  const from = fromRaw < addMonths(toYm, -5) ? fromRaw : addMonths(toYm, -5)
  // Nunca antes del inicio del plan: antes de eso no hay datos de la app
  const start = settings.value.planStart
  const fromClamped = from < start ? start : from
  return { from: fromClamped > toYm ? toYm : fromClamped, to: toYm }
})
const series = computed(() => monthlySeries(txs.value, seriesRange.value.from, seriesRange.value.to))
const incExpOption = computed<EChartsOption>(() => {
  void themeTick.value
  const { c, animation, textStyle } = base()
  return {
    animation, textStyle, grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', formatter: moneyTip as never },
    xAxis: { type: 'category', data: series.value.map((p) => monthShort(p.ym)), ...axisStyle(c) },
    yAxis: { type: 'value', ...axisStyle(c), axisLabel: { color: c.text, formatter: (v: number) => eur(v * 100) } },
    series: [
      { name: 'Ingresos', type: 'bar', itemStyle: { color: c.accent, borderRadius: [6, 6, 0, 0] }, data: series.value.map((p) => p.income / 100) },
      { name: 'Gastos', type: 'bar', itemStyle: { color: c.danger, borderRadius: [6, 6, 0, 0] }, data: series.value.map((p) => p.expense / 100) },
    ],
  }
})
const savingOption = computed<EChartsOption>(() => {
  void themeTick.value
  const { c, animation, textStyle } = base()
  return {
    animation, textStyle, grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', formatter: moneyTip as never },
    xAxis: { type: 'category', data: series.value.map((p) => monthShort(p.ym)), ...axisStyle(c) },
    yAxis: { type: 'value', ...axisStyle(c), axisLabel: { color: c.text, formatter: (v: number) => eur(v * 100) } },
    series: [
      { name: 'Ahorro real', type: 'bar', data: series.value.map((p) => ({ value: p.saving / 100, itemStyle: { color: p.saving >= 0 ? c.accent : c.danger, borderRadius: 6 } })) },
      { name: 'Objetivo', type: 'line', symbol: 'circle', symbolSize: 6, lineStyle: { type: 'dashed', color: c.warning, width: 2 }, itemStyle: { color: c.warning },
        data: series.value.map((p) => (p.ym >= settings.value.planStart && p.ym <= settings.value.targetMonth ? savingTarget(settings.value, p.ym) / 100 : null)) },
    ],
  }
})

// ----- Gastos por categoría -----
const slices = computed(() => categoryBreakdown(txs.value, range.value).map((s) => {
  const cat = s.categoryId ? categoryById.value.get(s.categoryId) : undefined
  return { ...s, name: cat?.name ?? 'Sin categoría', color: cat?.color ?? '#929DA5' }
}))
const donutOption = computed<EChartsOption>(() => {
  void themeTick.value
  const { c, animation, textStyle } = base()
  return {
    animation, textStyle,
    tooltip: { trigger: 'item', formatter: (p: unknown) => { const q = p as { name: string; value: number; percent: number }; return `${q.name}: <b>${eur2(q.value * 100)}</b> (${q.percent.toFixed(0)} %)` } },
    series: [{ type: 'pie', radius: ['58%', '82%'], avoidLabelOverlap: true, label: { show: false }, itemStyle: { borderColor: c.surface, borderWidth: 3, borderRadius: 6 },
      data: slices.value.map((s) => ({ name: s.name, value: s.cents / 100, itemStyle: { color: s.color } })) }],
  }
})

const diff = (a: number, b: number) => a - b
const fmtDiff = (n: number) => (n === 0 ? '=' : (n > 0 ? '+' : '−') + formatCents(Math.abs(n)))
const targetReach = computed(() => forecastAtMonth(fc.value, settings.value.targetMonth).worth)
</script>

<template>
  <div v-if="!dataReady" class="space-y-3" aria-busy="true"><div class="skeleton h-12 rounded-2xl" /><div class="skeleton h-64 rounded-3xl" /></div>

  <div v-else class="space-y-4">
    <h1 class="text-2xl font-extrabold">Estadísticas</h1>

    <div class="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Periodo">
      <Chip v-for="m in modes" :key="m.k" :selected="mode === m.k" @click="setMode(m.k)">{{ m.l }}</Chip>
    </div>

    <div v-if="mode !== 'custom'" class="flex items-center justify-between">
      <button type="button" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Periodo anterior" @click="offset--"><ChevronLeft :size="20" aria-hidden="true" /></button>
      <h2 class="font-bold">{{ periodTitle }}</h2>
      <button type="button" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Periodo siguiente" @click="offset++"><ChevronRight :size="20" aria-hidden="true" /></button>
    </div>
    <div v-else class="grid grid-cols-2 gap-2">
      <input v-model="customFrom" type="date" aria-label="Desde" class="min-h-12 rounded-2xl border border-line bg-surface px-3" />
      <input v-model="customTo" type="date" aria-label="Hasta" class="min-h-12 rounded-2xl border border-line bg-surface px-3" />
    </div>

    <Card>
      <dl class="grid grid-cols-3 gap-2 text-center">
        <div><dt class="text-xs text-muted">Ingresos</dt><dd class="num mt-0.5 font-bold text-accent">{{ formatCents(sum.income) }}</dd></div>
        <div><dt class="text-xs text-muted">Gastos</dt><dd class="num mt-0.5 font-bold text-danger">{{ formatCents(sum.expense) }}</dd></div>
        <div><dt class="text-xs text-muted">Ahorro</dt><dd class="num mt-0.5 font-bold">{{ fmtDiff(sum.saving) }}</dd></div>
      </dl>
      <template v-if="prev.count && sum.count">
        <p class="mt-3 border-t border-line pt-3 text-center text-xs text-muted">
          Frente al periodo anterior: gastos <b class="num text-ink">{{ fmtDiff(diff(sum.expense, prev.expense)) }}</b> · ahorro <b class="num text-ink">{{ fmtDiff(diff(sum.saving, prev.saving)) }}</b>
        </p>
      </template>
    </Card>

    <EmptyState v-if="!hasAnyReal" :icon="ChartColumn" title="Sin datos suficientes" text="Los gráficos se generan con tus movimientos reales. No mostramos datos de ejemplo." />

    <template v-else>
      <Card>
        <h2 class="font-bold">Gastos por categoría</h2>
        <template v-if="slices.length">
          <Chart :option="donutOption" :height="200" label="Gráfico de gastos por categoría" />
          <ul class="mt-2 divide-y divide-line">
            <li v-for="s in slices" :key="s.categoryId ?? 'none'" class="flex min-h-11 items-center gap-3 text-sm">
              <span class="size-3 rounded-full" :style="{ background: s.color }" aria-hidden="true" />
              <span class="flex-1">{{ s.name }}</span><span class="num text-muted">{{ s.pct.toFixed(0) }} %</span><span class="num w-24 text-right font-semibold">{{ formatCents(s.cents) }}</span>
            </li>
          </ul>
        </template>
        <p v-else class="mt-2 text-sm text-muted">Sin gastos en este periodo.</p>
      </Card>

      <Card>
        <h2 class="font-bold">Ingresos frente a gastos</h2>
        <p class="text-xs text-muted">Últimos meses hasta {{ monthLabel(seriesRange.to) }}</p>
        <Chart :option="incExpOption" label="Gráfico de ingresos y gastos por mes" />
      </Card>

      <Card>
        <h2 class="font-bold">Ahorro mensual</h2>
        <p class="text-xs text-muted">Barras: ahorro real · línea discontinua: objetivo</p>
        <Chart :option="savingOption" label="Gráfico de ahorro mensual frente al objetivo" />
      </Card>
    </template>

    <Card>
      <h2 class="font-bold">Evolución del patrimonio</h2>
      <p class="text-xs text-muted">Línea continua: real · discontinua: <b>previsión</b> (supone que cobras lo previsto y gastas tu presupuesto)</p>
      <Chart :option="worthOption" label="Evolución real y prevista del patrimonio" />
      <p class="num mt-2 text-sm text-muted">Previsto en {{ monthLabel(settings.targetMonth) }}: ≈ {{ formatCents(targetReach) }}</p>
    </Card>

    <Card>
      <h2 class="font-bold">Hacia tus objetivos</h2>
      <p class="text-xs text-muted">Patrimonio real frente a la trayectoria que necesitas y tus tres metas</p>
      <Chart :option="goalOption" :height="260" label="Patrimonio real frente a la trayectoria hacia los objetivos" />
    </Card>
  </div>
</template>
