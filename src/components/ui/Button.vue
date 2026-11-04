<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'ghost' }>(), { variant: 'primary' })
</script>

<template>
  <button
    class="press inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold"
    :class="variant === 'primary' ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink'"
  >
    <slot />
  </button>
</template>
