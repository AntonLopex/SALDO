<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import Card from '@/components/ui/Card.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { funds, txs } from '@/data/appData'
import { fundRepo } from '@/data/repositories'
import { formatCents, parseEuros } from '@/domain/money'
import type { Fund } from '@/domain/types'
import { allocation, costTotal, fundProgress, maxAllocatable } from '@/engine/funds'
import { netWorth } from '@/engine/summary'
import { showToast } from '@/lib/toast'

const worth = computed(() => netWorth(txs.value))
const alloc = computed(() => allocation(worth.value, funds.value))
const toText = (c: number) => (c ? String(c / 100).replace('.', ',') : '')

// Borradores de texto por fondo / partida
const allocText = reactive<Record<string, string>>({})
const targetText = reactive<Record<string, string>>({})
const itemText = reactive<Record<string, string>>({})
const err = ref<Record<string, string>>({})

watch(funds, (list) => {
  for (const f of list) {
    allocText[f.id] ??= toText(f.allocatedCents)
    targetText[f.id] ??= toText(f.targetCents)
    for (const i of f.items) itemText[f.id + ':' + i.id] ??= toText(i.cents)
  }
}, { immediate: true })

async function saveAlloc(f: Fund) {
  const c = parseEuros(allocText[f.id] || '0')
  if (c === null) { err.value[f.id] = 'Importe no válido'; return }
  const max = maxAllocatable(worth.value, funds.value, f.id)
  if (c > max) { err.value[f.id] = `Máximo asignable: ${formatCents(max)} (no puedes superar tu patrimonio)`; return }
  err.value[f.id] = ''
  await fundRepo.save({ ...f, allocatedCents: c })
  showToast('Asignación guardada')
}
async function saveTarget(f: Fund) {
  const c = parseEuros(targetText[f.id] || '')
  if (c === null || c <= 0) { err.value[f.id + 't'] = 'Importe no válido'; return }
  err.value[f.id + 't'] = ''
  await fundRepo.save({ ...f, targetCents: c })
}
async function saveItem(f: Fund, itemId: string) {
  const c = parseEuros(itemText[f.id + ':' + itemId] || '0')
  if (c === null) return
  await fundRepo.save({ ...f, items: f.items.map((i) => (i.id === itemId ? { ...i, cents: c } : i)) })
}
async function useTotal(f: Fund) {
  const t = costTotal(f.items)
  if (t > 0) { targetText[f.id] = toText(t); await fundRepo.save({ ...f, targetCents: t }) }
}
const field = 'min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-base outline-none focus:border-accent'
</script>

<template>
  <div class="space-y-4">
    <Card>
      <h2 class="font-bold">Cómo se reparte tu patrimonio</h2>
      <p class="mt-1 text-sm text-muted">Los fondos son partes de lo que ya tienes. No suman dinero extra.</p>
      <dl class="num mt-3 grid grid-cols-3 gap-2 text-center text-sm">
        <div><dt class="text-xs text-muted">Patrimonio</dt><dd class="font-bold">{{ formatCents(alloc.worth) }}</dd></div>
        <div><dt class="text-xs text-muted">En fondos</dt><dd class="font-bold text-accent">{{ formatCents(alloc.allocated) }}</dd></div>
        <div><dt class="text-xs text-muted">Libre</dt><dd class="font-bold" :class="alloc.free < 0 ? 'text-danger' : ''">{{ formatCents(alloc.free) }}</dd></div>
      </dl>
      <p v-if="alloc.overAllocated" class="mt-3 rounded-xl bg-danger/10 p-3 text-sm font-semibold text-danger" role="alert">
        Has asignado más de lo que tienes. Reduce alguna asignación.
      </p>
    </Card>

    <Card v-for="f in funds" :key="f.id">
      <div class="flex items-baseline justify-between"><h2 class="font-bold">{{ f.name }}</h2><span class="num text-sm text-muted">{{ formatCents(f.allocatedCents) }} / {{ formatCents(f.targetCents) }}</span></div>
      <div class="mt-3"><ProgressBar :value="fundProgress(f)" :label="`Progreso de ${f.name}`" /></div>

      <form class="mt-4 grid grid-cols-2 gap-3" novalidate @submit.prevent="saveAlloc(f)">
        <label class="block"><span class="text-xs text-muted">Asignado (€)</span><input v-model="allocText[f.id]" inputmode="decimal" :class="field" @blur="saveAlloc(f)" /></label>
        <label class="block"><span class="text-xs text-muted">Objetivo (€)</span><input v-model="targetText[f.id]" inputmode="decimal" :class="field" @blur="saveTarget(f)" /></label>
        <p v-if="err[f.id]" class="col-span-2 text-sm font-semibold text-danger" role="alert">{{ err[f.id] }}</p>
        <p v-if="err[f.id + 't']" class="col-span-2 text-sm font-semibold text-danger" role="alert">{{ err[f.id + 't'] }}</p>
        <button type="submit" class="sr-only">Guardar</button>
      </form>

      <div v-if="f.items.length" class="mt-5 border-t border-line pt-4">
        <h3 class="text-sm font-bold">Estimación de costes</h3>
        <div v-for="i in f.items" :key="i.id" class="mt-2 flex items-center gap-3">
          <label :for="f.id + i.id" class="flex-1 text-sm">{{ i.name }}</label>
          <input :id="f.id + i.id" v-model="itemText[f.id + ':' + i.id]" inputmode="decimal" placeholder="0" class="min-h-11 w-28 rounded-xl border border-line bg-bg px-3 text-right" @blur="saveItem(f, i.id)" />
        </div>
        <div class="num mt-3 flex items-center justify-between text-sm font-bold"><span>Total estimado</span><span>{{ formatCents(costTotal(f.items)) }}</span></div>
        <button v-if="costTotal(f.items) > 0 && costTotal(f.items) !== f.targetCents" type="button" class="press mt-2 min-h-11 text-sm font-semibold text-accent" @click="useTotal(f)">Usar este total como objetivo</button>
      </div>
    </Card>
  </div>
</template>
