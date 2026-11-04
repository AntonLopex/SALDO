<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

const onKey = (e: KeyboardEvent) => e.key === 'Escape' && emit('close')
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[55] flex items-end justify-center bg-black/50" @click.self="emit('close')">
      <div class="sheet pb-safe max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-surface p-5" role="dialog" aria-modal="true" :aria-label="title">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-lg font-extrabold">{{ title }}</h2>
          <button type="button" class="press min-h-11 rounded-xl px-3 text-sm font-semibold text-muted" @click="emit('close')">Cerrar</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet { animation: up 220ms cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes up { from { transform: translateY(40px); opacity: 0; } }
</style>
