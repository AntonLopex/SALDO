<script setup lang="ts">
import { dismissToast, toasts } from '@/lib/toast'

async function act(id: number, fn?: () => void | Promise<void>) {
  dismissToast(id)
  await fn?.()
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-28 z-[60] flex flex-col items-center gap-2 px-5" aria-live="polite">
    <TransitionGroup name="page">
      <div
        v-for="t in toasts" :key="t.id"
        class="pointer-events-auto flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-card"
        role="status"
      >
        <span>{{ t.message }}</span>
        <button v-if="t.actionLabel" type="button" class="press min-h-11 rounded-xl px-3 font-bold text-accent" @click="act(t.id, t.onAction)">
          {{ t.actionLabel }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
