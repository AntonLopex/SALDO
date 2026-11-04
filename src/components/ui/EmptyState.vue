<script setup lang="ts">
import type { Component } from 'vue'
defineProps<{ icon: Component; title: string; text: string }>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-12 text-center">
    <div class="grid size-14 place-items-center rounded-2xl bg-accent-deep text-accent">
      <component :is="icon" :size="26" aria-hidden="true" />
    </div>
    <h2 class="text-lg font-bold">{{ title }}</h2>
    <p class="max-w-xs text-sm text-muted">{{ text }}</p>
    <slot />
  </div>
</template>
