<script setup lang="ts">
import { computed, ref } from 'vue'
import Card from '@/components/ui/Card.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { dataReady, settings } from '@/data/appData'
import { monthLabel } from '@/domain/dates'
import { formatCents, formatCentsRounded } from '@/domain/money'
import { useFinance } from '@/features/useFinance'
import IndependenceTab from './IndependenceTab.vue'
import PlannedTab from './PlannedTab.vue'

const tab = ref<'goals' | 'independence' | 'planned'>('goals')
const tabs = [{ k: 'goals', l: 'Objetivos' }, { k: 'independence', l: 'Independencia' }, { k: 'planned', l: 'Gastos futuros' }] as const

const { track, goals, capacity } = useFinance()

const tiers = computed(() => [
  { key: 'min', label: 'Mínimo', g: goals.value.min },
  { key: 'main', label: 'Principal', g: goals.value.main },
  { key: 'stretch', label: 'Ambicioso', g: goals.value.stretch },
] as const)

const trackUi = computed(() => ({
  ahead: { label: 'Por delante', cls: 'bg-accent text-on-accent' },
  'on-track': { label: 'En línea', cls: 'bg-accent-deep text-accent' },
  behind: { label: 'Por detrás', cls: 'bg-warning/20 text-warning' },
})[track.value.status])
const abs = (c: number) => formatCents(Math.abs(c))
</script>

<template>
  <div v-if="!dataReady" class="space-y-3" aria-busy="true"><div class="skeleton h-12 rounded-2xl" /><div class="skeleton h-48 rounded-3xl" /></div>

  <div v-else class="space-y-4">
    <h1 class="text-2xl font-extrabold">Objetivos</h1>
    <div class="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Secciones">
      <button v-for="t in tabs" :key="t.k" type="button" role="tab" :aria-selected="tab === t.k"
        class="press min-h-11 rounded-xl text-xs font-bold" :class="tab === t.k ? 'bg-surface text-ink shadow-card' : 'text-muted'" @click="tab = t.k">{{ t.l }}</button>
    </div>

    <template v-if="tab === 'goals'">
      <Card>
        <div class="flex items-center justify-between">
          <h2 class="font-bold">Tu ritmo</h2>
          <span class="rounded-full px-3 py-1.5 text-xs font-bold" :class="trackUi.cls">{{ trackUi.label }}</span>
        </div>
        <p class="mt-2 text-sm text-muted">
          <template v-if="Math.abs(track.deviation) < 100">Vas en línea con tu trayectoria prevista.</template>
          <template v-else-if="track.deviation > 0">Vas <b class="num text-ink">{{ abs(track.deviation) }}</b> por delante de tu trayectoria a fin de mes.</template>
          <template v-else>Vas <b class="num text-ink">{{ abs(track.deviation) }}</b> por detrás de tu trayectoria a fin de mes. Es recuperable: abajo ves cuánto ajustar.</template>
        </p>
        <p v-if="!track.hasData" class="mt-2 text-xs text-muted">Aún no hay movimientos: el estado sale solo de tu plan.</p>
      </Card>

      <Card v-for="t in tiers" :key="t.key">
        <div class="flex items-baseline justify-between">
          <h2 class="font-bold">{{ t.label }}</h2>
          <span class="num text-sm font-semibold">{{ formatCentsRounded(t.g.target) }}</span>
        </div>
        <div class="mt-3"><ProgressBar :value="t.g.pct" :label="`Progreso objetivo ${t.label}`" /></div>
        <div class="num mt-2 flex justify-between text-sm"><span class="text-accent font-bold">{{ t.g.pct.toFixed(1).replace('.', ',') }} %</span><span class="text-muted">Faltan {{ formatCents(t.g.missing) }}</span></div>

        <dl class="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-muted">Ahorro mensual necesario</dt><dd class="num font-bold">{{ formatCents(t.g.monthlyNeeded) }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-muted">Desde el mes que viene ({{ t.g.monthsLeft - 1 }} meses)</dt><dd class="num font-bold">{{ formatCents(t.g.monthlyNeededNext) }}</dd></div>
        </dl>

        <p class="mt-3 rounded-xl bg-surface-2 p-3 text-sm" role="status">
          <span class="text-[11px] font-bold tracking-wide text-muted uppercase">Previsión en {{ monthLabel(settings.targetMonth) }}</span><br />
          <template v-if="t.g.willReach">Llegas con <b class="num text-accent">{{ formatCents(t.g.gapAtTarget) }}</b> de margen.</template>
          <template v-else>
            Con tu plan actual te faltarían <b class="num text-warning">{{ formatCents(-t.g.gapAtTarget) }}</b>.
            <template v-if="t.g.monthlyNeededNext > capacity">Necesitarías ahorrar {{ formatCents(t.g.monthlyNeededNext - capacity) }} más al mes que lo previsto.</template>
          </template>
        </p>
      </Card>
      <p class="text-xs text-muted">Ahorro previsto de los próximos meses según tu plan: <span class="num">{{ formatCents(capacity) }}</span> al mes de media.</p>
    </template>

    <IndependenceTab v-else-if="tab === 'independence'" />
    <PlannedTab v-else />
  </div>
</template>
