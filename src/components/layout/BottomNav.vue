<script setup lang="ts">
import { House, ReceiptText, Plus, ChartColumn, Target } from 'lucide-vue-next'

const items = [
  { to: '/', label: 'Inicio', icon: House },
  { to: '/movimientos', label: 'Movimientos', icon: ReceiptText },
  { to: '/anadir', label: 'Añadir', icon: Plus, primary: true },
  { to: '/estadisticas', label: 'Estadísticas', icon: ChartColumn },
  { to: '/objetivos', label: 'Objetivos', icon: Target },
]
</script>

<template>
  <nav
    class="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/90 backdrop-blur-xl"
    aria-label="Navegación principal"
  >
    <ul class="mx-auto flex max-w-xl items-end justify-around px-2 pt-2 pb-2">
      <li v-for="it in items" :key="it.to" class="flex-1">
        <RouterLink
          :to="it.to"
          class="press flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted"
          active-class="!text-accent"
          :aria-label="it.label"
        >
          <span
            v-if="it.primary"
            class="-mt-6 grid size-14 place-items-center rounded-full bg-accent text-on-accent shadow-card ring-4 ring-bg"
          >
            <component :is="it.icon" :size="28" :stroke-width="2.5" aria-hidden="true" />
          </span>
          <component :is="it.icon" v-else :size="24" aria-hidden="true" />
          <span :class="it.primary ? 'sr-only' : ''">{{ it.label }}</span>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
