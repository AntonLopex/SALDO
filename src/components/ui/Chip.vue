<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ selected?: boolean; icon?: Component; color?: string }>()
</script>

<template>
  <button
    type="button"
    class="press inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold"
    :class="selected ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface-2 text-ink'"
    :aria-pressed="selected"
  >
    <component :is="icon" v-if="icon" :size="18" aria-hidden="true" :style="!selected && color ? { color } : undefined" />
    <slot />
  </button>
</template>
