<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ChevronLeft, Plus, Trash2 } from 'lucide-vue-next'
import { dataReady, settings, txs } from '@/data/appData'
import { settingsRepo } from '@/data/repositories'
import { monthLabel } from '@/domain/dates'
import { formatCents, parseEuros } from '@/domain/money'
import type { Settings } from '@/domain/types'
import { openingAmount, plannedSavingTotal } from '@/engine/plan'
import { showToast } from '@/lib/toast'

// Nombre completo: se ve abreviado («Ene») pero el nombre accesible es el completo («Enero»), sin aria-label que contradiga el texto visible.
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const toText = (c: number) => String(c / 100).replace('.', ',')

interface Draft {
  budget: string
  goalMin: string
  goalMain: string
  goalStretch: string
  targetMonth: string
  planStart: string
  regular: string
  summer: string
  summerMonths: number[]
  incomes: { id: string; name: string; amount: string; months: number[] }[]
}

const d = reactive<Draft>({ budget: '', goalMin: '', goalMain: '', goalStretch: '', targetMonth: '', planStart: '', regular: '', summer: '', summerMonths: [], incomes: [] })
const errors = ref<string[]>([])
let loaded = false

function load(s: Settings) {
  d.budget = toText(s.monthlyBudgetCents)
  d.goalMin = toText(s.goals.min)
  d.goalMain = toText(s.goals.main)
  d.goalStretch = toText(s.goals.stretch)
  d.targetMonth = s.targetMonth
  d.planStart = s.planStart
  d.regular = toText(s.savingTargets.regular)
  d.summer = toText(s.savingTargets.summer)
  d.summerMonths = [...s.savingTargets.summerMonths]
  d.incomes = s.incomePlans.map((p) => ({ id: p.id, name: p.name, amount: toText(p.amountCents), months: [...p.months] }))
}
// Se carga una sola vez cuando los datos están listos (no machaca lo que estés editando)
watch(dataReady, (r) => { if (r && !loaded) { load(settings.value); loaded = true } }, { immediate: true })

const toggle = (arr: number[], m: number) => { const i = arr.indexOf(m); if (i >= 0) arr.splice(i, 1); else arr.push(m) }
const addIncome = () => d.incomes.push({ id: crypto.randomUUID(), name: '', amount: '', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })

// Resumen en vivo: ¿el plan llega al objetivo principal?
const summary = computed(() => {
  const reg = parseEuros(d.regular)
  const sum = parseEuros(d.summer)
  const main = parseEuros(d.goalMain)
  if (reg === null || sum === null || main === null || !/^\d{4}-\d{2}$/.test(d.targetMonth) || d.targetMonth < d.planStart) return null
  const draft = { ...settings.value, planStart: d.planStart, targetMonth: d.targetMonth, savingTargets: { regular: reg, summer: sum, summerMonths: d.summerMonths } }
  const saved = plannedSavingTotal(draft)
  const end = openingAmount(txs.value) + saved
  return { saved, end, reaches: end >= main }
})

async function save() {
  const errs: string[] = []
  const money = (label: string, v: string, allowZero = false) => {
    const c = parseEuros(v)
    if (c === null || (!allowZero && c <= 0)) { errs.push(`${label}: importe no válido`); return 0 }
    return c
  }
  const budget = money('Presupuesto', d.budget)
  const goals = { min: money('Objetivo mínimo', d.goalMin), main: money('Objetivo principal', d.goalMain), stretch: money('Objetivo ambicioso', d.goalStretch) }
  const regular = money('Ahorro mensual', d.regular, true)
  const summer = money('Ahorro de verano', d.summer, true)
  if (!(goals.min <= goals.main && goals.main <= goals.stretch)) errs.push('Los objetivos deben ir de menor a mayor')
  if (!/^\d{4}-\d{2}$/.test(d.targetMonth)) errs.push('Elige la fecha objetivo')
  if (d.targetMonth < d.planStart) errs.push('La fecha objetivo debe ser posterior al inicio del plan')
  const incomePlans = d.incomes.map((i) => {
    if (!i.name.trim()) errs.push('Cada ingreso necesita un nombre')
    if (!i.months.length) errs.push(`${i.name || 'Ingreso'}: elige al menos un mes`)
    return { id: i.id, name: i.name.trim(), amountCents: money(i.name || 'Ingreso', i.amount, true), months: [...i.months].sort((a, b) => a - b) }
  })
  errors.value = errs
  if (errs.length) return
  await settingsRepo.save({
    ...settings.value, monthlyBudgetCents: budget, goals, incomePlans, targetMonth: d.targetMonth,
    savingTargets: { regular, summer, summerMonths: [...d.summerMonths].sort((a, b) => a - b) },
  })
  showToast('Plan guardado')
}

const field = 'mt-1 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-base outline-none focus:border-accent'
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-1">
      <RouterLink to="/ajustes" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Volver a ajustes"><ChevronLeft :size="20" aria-hidden="true" /></RouterLink>
      <h1 class="text-2xl font-extrabold">Plan de ahorro</h1>
    </div>
    <div v-if="!dataReady" class="skeleton h-64 rounded-3xl" />

    <form v-else class="space-y-5" novalidate @submit.prevent="save">
      <section class="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 class="font-bold">Presupuesto mensual</h2>
        <label class="block"><span class="text-sm text-muted">Gasto máximo al mes (€)</span><input v-model="d.budget" inputmode="decimal" :class="field" /></label>
      </section>

      <section class="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 class="font-bold">Ingresos previstos</h2>
        <p class="text-sm text-muted">Solo alimentan las previsiones. Los ingresos reales los registras tú.</p>
        <div v-for="(inc, i) in d.incomes" :key="inc.id" class="space-y-3 rounded-2xl bg-surface-2 p-4">
          <div class="grid grid-cols-[1fr_7rem] gap-2">
            <label class="block"><span class="sr-only">Nombre del ingreso</span><input v-model="inc.name" placeholder="Nombre" :class="field" class="!mt-0" /></label>
            <label class="block"><span class="sr-only">Importe mensual en euros</span><input v-model="inc.amount" inputmode="decimal" placeholder="€/mes" :class="field" class="!mt-0" /></label>
          </div>
          <div class="grid grid-cols-4 gap-1.5" role="group" :aria-label="`Meses de ${inc.name || 'ingreso'}`">
            <button v-for="(l, mi) in MONTHS" :key="mi" type="button" class="press min-h-11 rounded-xl text-sm font-bold"
              :class="inc.months.includes(mi + 1) ? 'bg-accent text-on-accent' : 'bg-surface text-muted'" :aria-pressed="inc.months.includes(mi + 1)"
              @click="toggle(inc.months, mi + 1)">{{ l.slice(0, 3) }}<span class="sr-only">{{ l.slice(3) }}</span></button>
          </div>
          <button type="button" class="press flex min-h-11 items-center gap-1 text-sm font-semibold text-danger" @click="d.incomes.splice(i, 1)"><Trash2 :size="16" aria-hidden="true" />Quitar</button>
        </div>
        <button type="button" class="press flex min-h-11 items-center gap-1 text-sm font-semibold text-accent" @click="addIncome"><Plus :size="16" aria-hidden="true" />Añadir ingreso</button>
      </section>

      <section class="space-y-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 class="font-bold">Objetivos</h2>
        <label class="block"><span class="text-sm text-muted">Mínimo (€)</span><input v-model="d.goalMin" inputmode="decimal" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Principal (€)</span><input v-model="d.goalMain" inputmode="decimal" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Ambicioso (€)</span><input v-model="d.goalStretch" inputmode="decimal" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Fecha objetivo</span><input v-model="d.targetMonth" type="month" :class="field" /></label>
      </section>

      <section class="space-y-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 class="font-bold">Ahorro objetivo por mes</h2>
        <label class="block"><span class="text-sm text-muted">Mes normal (€)</span><input v-model="d.regular" inputmode="decimal" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Meses de verano (€)</span><input v-model="d.summer" inputmode="decimal" :class="field" /></label>
        <div class="grid grid-cols-4 gap-1.5" role="group" aria-label="Meses de verano">
          <button v-for="(l, mi) in MONTHS" :key="mi" type="button" class="press min-h-11 rounded-xl text-sm font-bold"
            :class="d.summerMonths.includes(mi + 1) ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted'" :aria-pressed="d.summerMonths.includes(mi + 1)"
            @click="toggle(d.summerMonths, mi + 1)">{{ l.slice(0, 3) }}<span class="sr-only">{{ l.slice(3) }}</span></button>
        </div>
      </section>

      <p v-if="summary" class="rounded-2xl bg-surface-2 p-4 text-sm" role="status">
        Con este plan ahorrarías <b class="num">{{ formatCents(summary.saved) }}</b> hasta {{ monthLabel(d.targetMonth) }} y llegarías a
        <b class="num">{{ formatCents(summary.end) }}</b>
        <span :class="summary.reaches ? 'text-accent' : 'text-warning'"> · {{ summary.reaches ? 'alcanza' : 'no alcanza' }} el objetivo principal.</span>
      </p>

      <ul v-if="errors.length" class="space-y-1 rounded-2xl bg-danger/10 p-4 text-sm font-semibold text-danger" role="alert"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
      <button type="submit" class="press min-h-14 w-full rounded-2xl bg-accent text-lg font-extrabold text-on-accent">Guardar plan</button>
    </form>
  </div>
</template>
