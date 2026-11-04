<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, ReceiptText, Search } from 'lucide-vue-next'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import TxRow from '@/components/ui/TxRow.vue'
import { categoryLabel, dataReady, topCategories, txs } from '@/data/appData'
import { addMonths, dayLabel, daysInMonth, firstWeekdayMonday, monthLabel, monthOf, todayISO } from '@/domain/dates'
import { formatCents } from '@/domain/money'
import type { Tx } from '@/domain/types'

const view = ref<'list' | 'calendar'>('list')
const query = ref('')
const kind = ref<'all' | 'income' | 'expense'>('all')
const catFilter = ref('')
const from = ref('')
const to = ref('')

const real = computed(() => txs.value.filter((t) => t.kind === 'income' || t.kind === 'expense'))
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const filtered = computed(() => {
  const q = norm(query.value.trim())
  return real.value
    .filter((t) => kind.value === 'all' || t.kind === kind.value)
    .filter((t) => !catFilter.value || t.categoryId === catFilter.value)
    .filter((t) => (!from.value || t.occurredOn >= from.value) && (!to.value || t.occurredOn <= to.value))
    .filter((t) => !q || norm(`${t.note} ${categoryLabel(t)} ${t.kind === 'income' ? 'ingreso' : ''}`).includes(q))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt))
})

const net = (list: Tx[]) => list.reduce((s, t) => s + (t.kind === 'income' ? t.amountCents : -t.amountCents), 0)

const groups = computed(() => {
  const m = new Map<string, Tx[]>()
  for (const t of filtered.value) (m.get(t.occurredOn) ?? m.set(t.occurredOn, []).get(t.occurredOn)!).push(t)
  return [...m].map(([day, items]) => ({ day, items, total: net(items) }))
})

// Se pintan por tandas (días completos, así los totales siguen siendo exactos): con cientos de movimientos,
// pintarlos todos de golpe tardaba varios segundos en un móvil modesto.
const PAGE = 100
const limit = ref(PAGE)
watch([query, kind, catFilter, from, to], () => { limit.value = PAGE })
const visibleGroups = computed(() => {
  const out: typeof groups.value = []
  let count = 0
  for (const g of groups.value) {
    if (count >= limit.value) break
    out.push(g)
    count += g.items.length
  }
  return out
})
const remaining = computed(() => filtered.value.length - visibleGroups.value.reduce((n, g) => n + g.items.length, 0))

// Calendario
const calMonth = ref(monthOf(todayISO()))
const selected = ref<string | null>(todayISO())
const byDay = computed(() => {
  const m = new Map<string, Tx[]>()
  for (const t of real.value) if (monthOf(t.occurredOn) === calMonth.value) (m.get(t.occurredOn) ?? m.set(t.occurredOn, []).get(t.occurredOn)!).push(t)
  return m
})
const cells = computed(() => {
  const blanks = Array.from({ length: firstWeekdayMonday(calMonth.value) }, () => null)
  const days = Array.from({ length: daysInMonth(calMonth.value) }, (_, i) => `${calMonth.value}-${String(i + 1).padStart(2, '0')}`)
  return [...blanks, ...days]
})
const dayItems = computed(() => (selected.value ? (byDay.value.get(selected.value) ?? []) : []))
const dayIncome = computed(() => dayItems.value.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amountCents, 0))
const dayExpense = computed(() => dayItems.value.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amountCents, 0))
const hasFilters = computed(() => !!(query.value || catFilter.value || from.value || to.value || kind.value !== 'all'))
function clear() { query.value = ''; catFilter.value = ''; from.value = ''; to.value = ''; kind.value = 'all' }
</script>

<template>
  <div v-if="!dataReady" class="space-y-3" aria-busy="true"><div class="skeleton h-12 rounded-2xl" /><div class="skeleton h-64 rounded-3xl" /></div>

  <div v-else class="space-y-4">
    <h1 class="text-2xl font-extrabold">Movimientos</h1>

    <div class="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Vista">
      <button v-for="v in [{ k: 'list', l: 'Lista' }, { k: 'calendar', l: 'Calendario' }] as const" :key="v.k" type="button" role="radio" :aria-checked="view === v.k"
        class="press min-h-11 rounded-xl text-sm font-bold" :class="view === v.k ? 'bg-surface text-ink shadow-card' : 'text-muted'" @click="view = v.k">{{ v.l }}</button>
    </div>

    <template v-if="view === 'list'">
      <label class="relative block">
        <span class="sr-only">Buscar movimientos</span>
        <Search :size="18" class="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input v-model="query" type="search" placeholder="Buscar por nota o categoría" class="min-h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-11 outline-none focus:border-accent" />
      </label>
      <div class="flex gap-2 overflow-x-auto pb-1">
        <Chip :selected="kind === 'all'" @click="kind = 'all'">Todo</Chip>
        <Chip :selected="kind === 'expense'" @click="kind = 'expense'">Gastos</Chip>
        <Chip :selected="kind === 'income'" @click="kind = 'income'">Ingresos</Chip>
      </div>
      <div class="grid grid-cols-3 gap-2 text-sm">
        <label class="col-span-3 block">
          <span class="sr-only">Filtrar por categoría</span>
          <select v-model="catFilter" class="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base">
            <option value="">Todas las categorías</option>
            <option v-for="c in topCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="col-span-3 grid grid-cols-2 gap-2">
          <span class="sr-only">Desde y hasta</span>
          <input v-model="from" type="date" aria-label="Desde" class="min-h-12 rounded-2xl border border-line bg-surface px-3 text-base" />
          <input v-model="to" type="date" aria-label="Hasta" class="min-h-12 rounded-2xl border border-line bg-surface px-3 text-base" />
        </label>
      </div>
      <button v-if="hasFilters" type="button" class="press min-h-11 text-sm font-semibold text-accent" @click="clear">Quitar filtros</button>

      <section v-for="g in visibleGroups" :key="g.day" class="rounded-card border border-line bg-surface px-5 py-3 shadow-card">
        <div class="flex items-baseline justify-between py-1 text-sm">
          <h2 class="font-bold">{{ dayLabel(g.day) }}</h2>
          <span class="num font-semibold text-muted">{{ g.total < 0 ? '−' : '+' }}{{ formatCents(Math.abs(g.total)) }}</span>
        </div>
        <div class="divide-y divide-line"><TxRow v-for="t in g.items" :key="t.id" :tx="t" /></div>
      </section>
      <button v-if="remaining > 0" type="button" class="press min-h-14 w-full rounded-2xl bg-surface-2 font-semibold" @click="limit += PAGE">
        Mostrar más ({{ remaining }} restantes)
      </button>
      <EmptyState v-if="!groups.length" :icon="ReceiptText" :title="real.length ? 'Sin resultados' : 'Aún no hay movimientos'" :text="real.length ? 'Prueba con otros filtros.' : 'Tus ingresos y gastos aparecerán aquí.'" />
    </template>

    <template v-else>
      <div class="flex items-center justify-between">
        <button type="button" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Mes anterior" @click="calMonth = addMonths(calMonth, -1); selected = null"><ChevronLeft :size="20" aria-hidden="true" /></button>
        <h2 class="font-bold">{{ monthLabel(calMonth) }}</h2>
        <button type="button" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Mes siguiente" @click="calMonth = addMonths(calMonth, 1); selected = null"><ChevronRight :size="20" aria-hidden="true" /></button>
      </div>
      <div class="rounded-card border border-line bg-surface p-3 shadow-card">
        <div class="grid grid-cols-7 pb-1 text-center text-xs font-semibold text-muted"><span v-for="d in ['L', 'M', 'X', 'J', 'V', 'S', 'D']" :key="d">{{ d }}</span></div>
        <div class="grid grid-cols-7 gap-1">
          <template v-for="(c, i) in cells" :key="i">
            <span v-if="!c" />
            <button v-else type="button" class="press relative grid min-h-12 place-items-center rounded-xl text-sm font-semibold"
              :class="[selected === c ? 'bg-accent text-on-accent' : 'bg-surface-2', c === todayISO() && selected !== c ? 'ring-2 ring-accent' : '']"
              :aria-label="dayLabel(c) + (byDay.get(c) ? ', con movimientos' : '')" :aria-pressed="selected === c" @click="selected = c">
              {{ Number(c.slice(8)) }}
              <span v-if="byDay.get(c)" class="absolute bottom-1.5 size-1.5 rounded-full" :class="selected === c ? 'bg-on-accent' : 'bg-accent'" />
            </button>
          </template>
        </div>
      </div>
      <section v-if="selected" class="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
        <h2 class="font-bold">{{ dayLabel(selected) }}</h2>
        <template v-if="dayItems.length">
          <p class="num mt-1 text-sm text-muted">Ingresos {{ formatCents(dayIncome) }} · Gastos {{ formatCents(dayExpense) }}</p>
          <div class="mt-2 divide-y divide-line"><TxRow v-for="t in dayItems" :key="t.id" :tx="t" /></div>
        </template>
        <p v-else class="mt-1 text-sm text-muted">Sin movimientos este día.</p>
      </section>
    </template>
  </div>
</template>
