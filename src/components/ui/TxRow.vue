<script setup lang="ts">
import { computed } from 'vue'
import { Banknote } from 'lucide-vue-next'
import { categoryById, categoryLabel } from '@/data/appData'
import { formatCents } from '@/domain/money'
import type { Tx } from '@/domain/types'
import { iconFor } from '@/lib/icons'

const props = defineProps<{ tx: Tx }>()
const isIncome = computed(() => props.tx.kind === 'income')
const cat = computed(() => (props.tx.categoryId ? categoryById.value.get(props.tx.categoryId) : undefined))
const sub = computed(() => (props.tx.subcategoryId ? categoryById.value.get(props.tx.subcategoryId) : undefined))
const icon = computed(() => (isIncome.value ? Banknote : iconFor((sub.value ?? cat.value)?.icon ?? 'tag')))
const color = computed(() => (isIncome.value ? 'var(--accent)' : (cat.value?.color ?? 'var(--muted)')))
</script>

<template>
  <RouterLink :to="`/movimientos/${tx.id}`" class="press flex min-h-16 items-center gap-3 py-2">
    <span class="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2" :style="{ color }">
      <component :is="icon" :size="22" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate font-semibold">{{ isIncome ? 'Ingreso' : categoryLabel(tx) }}</span>
      <span v-if="tx.note" class="block truncate text-sm text-muted">{{ tx.note }}</span>
    </span>
    <span class="num font-bold" :class="isIncome ? 'text-accent' : 'text-ink'">{{ isIncome ? '+' : '−' }}{{ formatCents(tx.amountCents) }}</span>
  </RouterLink>
</template>
