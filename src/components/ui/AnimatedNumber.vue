<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { formatCents } from '@/domain/money'

const props = defineProps<{ cents: number }>()
const shown = ref(props.cents)
let raf = 0

watch(
  () => props.cents,
  (to) => {
    cancelAnimationFrame(raf)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shown.value = to
      return
    }
    const from = shown.value
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 500)
      shown.value = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  },
)
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <span class="num">{{ formatCents(shown) }}</span>
</template>
