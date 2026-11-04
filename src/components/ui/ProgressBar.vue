<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const props = defineProps<{ value: number; tone?: 'accent' | 'warning' | 'danger'; label: string }>()
const clamped = computed(() => Math.max(0, Math.min(100, props.value)))
const mounted = ref(false) // la barra entra desde 0
onMounted(() => requestAnimationFrame(() => (mounted.value = true)))
const colour = computed(() => ({ accent: 'bg-accent', warning: 'bg-warning', danger: 'bg-danger' })[props.tone ?? 'accent'])
</script>

<template>
  <div
    class="h-3 w-full overflow-hidden rounded-full bg-accent-deep"
    role="progressbar" :aria-label="label" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(clamped)"
  >
    <div
      class="h-full rounded-full transition-[width] duration-700 ease-out"
      :class="colour"
      :style="{ width: (mounted ? clamped : 0) + '%' }"
    />
  </div>
</template>
