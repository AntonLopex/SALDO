<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Receipt } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import AnimatedNumber from '@/components/ui/AnimatedNumber.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Button from '@/components/ui/Button.vue'
import TxRow from '@/components/ui/TxRow.vue'
import { dataReady, lastExport, settings, txs } from '@/data/appData'
import { addMonths, monthLabel, monthOf } from '@/domain/dates'
import { formatCents, formatCentsRounded } from '@/domain/money'
import { budgetStatus, compareMonths, monthSummary } from '@/engine/summary'
import { useFinance } from '@/features/useFinance'

const { today, fc, track, goals, horizon } = useFinance()
const ym = monthOf(today)

const goal = computed(() => settings.value.goals.main)
const worth = computed(() => fc.value.worthNow)
const g = computed(() => goals.value.main)
const month = computed(() => monthSummary(txs.value, ym))
const bud = computed(() => budgetStatus(month.value.expense, settings.value.monthlyBudgetCents))
const savingPct = computed(() => (month.value.income > 0 ? Math.round((month.value.saving / month.value.income) * 100) : null))
const recent = computed(() =>
  txs.value.filter((t) => t.kind === 'income' || t.kind === 'expense')
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
)

// Recordatorio de copia: solo si hay datos reales y llevan más de 30 días sin exportarse
const needsBackup = computed(() => {
  const real = txs.value.filter((t) => t.kind === 'income' || t.kind === 'expense')
  if (!real.length) return false
  const DAY = 86_400_000
  const base = lastExport.value ? Date.parse(lastExport.value) : Math.min(...real.map((t) => Date.parse(t.createdAt)))
  return Date.now() - base > 30 * DAY
})

// Mensajes: solo con datos reales suficientes
const insights = computed(() => {
  const out = compareMonths(txs.value, ym, addMonths(ym, -1))
  const t = track.value
  if (t.hasData && Math.abs(t.deviation) >= 1000) {
    out.push(t.deviation > 0 ? `Vas ${formatCentsRounded(t.deviation)} por delante de tu objetivo.` : `Vas ${formatCentsRounded(-t.deviation)} por detrás de tu objetivo.`)
  }
  return out
})

const trackUi = computed(() => ({
  ahead: { label: 'Por delante', cls: 'bg-accent text-on-accent' },
  'on-track': { label: 'En línea', cls: 'bg-accent-deep text-accent' },
  behind: { label: 'Por detrás', cls: 'bg-warning/20 text-warning' },
})[track.value.status])

const budgetTone = computed(() => (bud.value.level === 'exceeded' ? 'danger' : bud.value.level === 'caution' || bud.value.level === 'important' ? 'warning' : 'accent'))
const budgetMsg = computed(
  () => ({ ok: '', info: 'Has llegado a la mitad del presupuesto.', caution: 'Precaución: has gastado el 75 % del presupuesto.', important: 'Aviso: te queda menos del 10 % del presupuesto.', exceeded: 'Has superado el presupuesto de este mes.' })[bud.value.level],
)
const signed = (c: number) => (c > 0 ? '+' : c < 0 ? '−' : '') + formatCents(Math.abs(c))

const horizons = computed(() => [
  { label: 'Fin de este mes', p: horizon.value.endOfMonth },
  { label: 'En 3 meses', p: horizon.value.in3 },
  { label: 'En 6 meses', p: horizon.value.in6 },
  { label: monthLabel(settings.value.targetMonth), p: horizon.value.target },
])
</script>

<template>
  <div v-if="!dataReady" class="flex flex-col gap-4" aria-busy="true">
    <div class="skeleton h-52 rounded-3xl" /><div class="skeleton h-60 rounded-3xl" />
  </div>

  <div v-else class="flex flex-col gap-4">
    <Card>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-semibold text-muted">Mi patrimonio</p>
          <p class="mt-1 text-4xl font-extrabold tracking-tight"><AnimatedNumber :cents="worth" /></p>
        </div>
        <RouterLink to="/objetivos" class="press inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold" :class="trackUi.cls">{{ trackUi.label }}</RouterLink>
      </div>
      <p v-if="month.count" class="num mt-1 text-sm font-semibold" :class="month.saving >= 0 ? 'text-accent' : 'text-danger'">
        {{ signed(month.saving) }} <span class="font-normal text-muted">en {{ monthLabel(ym).toLowerCase() }}</span>
      </p>
      <p v-else class="mt-1 text-xs text-muted">Saldo de apertura · sin movimientos este mes</p>

      <div class="mt-5 flex items-baseline justify-between text-sm">
        <span class="font-semibold">Objetivo {{ formatCentsRounded(goal) }}</span>
        <span class="num font-bold text-accent">{{ g.pct.toFixed(1).replace('.', ',') }} %</span>
      </div>
      <div class="mt-2"><ProgressBar :value="g.pct" label="Progreso hacia el objetivo principal" /></div>
      <p class="mt-3 text-sm text-muted">Te faltan <span class="num font-semibold text-ink">{{ formatCents(g.missing) }}</span></p>
    </Card>

    <Card>
      <h2 class="font-bold">{{ monthLabel(ym) }}</h2>
      <dl class="mt-3 grid grid-cols-3 gap-2 text-center">
        <div><dt class="text-xs text-muted">Ingresos</dt><dd class="num mt-0.5 font-bold text-accent">{{ formatCents(month.income) }}</dd></div>
        <div><dt class="text-xs text-muted">Gastos</dt><dd class="num mt-0.5 font-bold text-danger">{{ formatCents(month.expense) }}</dd></div>
        <div><dt class="text-xs text-muted">Ahorro</dt><dd class="num mt-0.5 font-bold">{{ signed(month.saving) }}</dd></div>
      </dl>
      <p v-if="savingPct !== null" class="mt-2 text-center text-xs text-muted">Ahorras el {{ savingPct }} % de tus ingresos</p>

      <div class="mt-5 flex items-baseline justify-between text-sm">
        <span class="font-semibold">Presupuesto {{ formatCentsRounded(settings.monthlyBudgetCents) }}</span>
        <span class="num font-bold" :class="bud.remaining < 0 ? 'text-danger' : ''">
          {{ bud.remaining < 0 ? 'Superado en ' + formatCents(-bud.remaining) : 'Quedan ' + formatCents(bud.remaining) }}
        </span>
      </div>
      <div class="mt-2"><ProgressBar :value="bud.pct" :tone="budgetTone" label="Presupuesto gastado este mes" /></div>
      <p v-if="budgetMsg" class="mt-3 text-sm font-semibold" :class="budgetTone === 'danger' ? 'text-danger' : budgetTone === 'warning' ? 'text-warning' : 'text-muted'" role="status">{{ budgetMsg }}</p>
    </Card>

    <RouterLink v-if="needsBackup" to="/ajustes/copias" class="press block rounded-card border border-warning/40 bg-warning/10 p-4 text-sm" role="status">
      <b>Haz una copia de seguridad.</b> {{ lastExport ? 'Hace más de 30 días de tu última exportación.' : 'Todavía no has exportado ninguna.' }}
    </RouterLink>

    <Card v-if="insights.length">
      <ul class="space-y-2 text-sm font-semibold"><li v-for="m in insights" :key="m">{{ m }}</li></ul>
    </Card>

    <!-- Previsión: visualmente distinta de los datos reales (borde discontinuo, etiqueta, tono atenuado) -->
    <section class="rounded-card border-2 border-dashed border-line bg-transparent p-5" aria-labelledby="prev-h">
      <div class="flex items-center justify-between">
        <h2 id="prev-h" class="font-bold">Previsión</h2>
        <span class="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold tracking-wide text-muted uppercase">Estimado</span>
      </div>
      <dl class="mt-3 divide-y divide-line">
        <div v-for="h in horizons" :key="h.label" class="flex min-h-12 items-center justify-between">
          <dt class="text-sm text-muted">{{ h.label }}</dt>
          <dd class="num font-bold text-muted">≈ {{ formatCents(h.p.worth) }}</dd>
        </div>
      </dl>
      <p class="mt-3 text-xs text-muted">
        Supone que cobras lo previsto, que gastas el presupuesto de cada mes y que haces los gastos futuros planificados.
      </p>
    </section>

    <Card>
      <div class="flex items-center justify-between">
        <h2 class="font-bold">Últimos movimientos</h2>
        <RouterLink v-if="recent.length" to="/movimientos" class="press min-h-11 content-center text-sm font-semibold text-accent">Ver todos</RouterLink>
      </div>
      <div v-if="recent.length" class="divide-y divide-line">
        <TxRow v-for="t in recent" :key="t.id" :tx="t" />
      </div>
      <EmptyState v-else :icon="Receipt" title="Empieza con tu primer movimiento" text="Registra un gasto en segundos y verás aquí tu resumen, presupuesto y progreso.">
        <RouterLink to="/anadir"><Button><Plus :size="20" aria-hidden="true" /> Añadir gasto</Button></RouterLink>
      </EmptyState>
    </Card>
  </div>
</template>
