<script setup lang="ts">
withDefaults(defineProps<{ size?: number; wordmark?: boolean; animate?: boolean }>(), { size: 32 })
</script>

<template>
  <span class="inline-flex items-center gap-2.5" role="img" aria-label="SALDO">
    <svg :width="size" :height="size" viewBox="0 0 512 512" aria-hidden="true">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="256" cy="256" r="150" stroke="var(--accent-deep)" stroke-width="36" />
        <circle
          :class="{ 'logo-draw': animate }"
          cx="256" cy="256" r="150" stroke="var(--accent)" stroke-width="36"
          stroke-dasharray="707 236" transform="rotate(135 256 256)"
        />
        <path :class="{ 'logo-rise': animate }" d="M182 318 L238 262 L274 292 L336 220" stroke="var(--accent)" stroke-width="32" />
      </g>
      <circle :class="{ 'logo-pop': animate }" cx="336" cy="220" r="24" fill="var(--text)" />
    </svg>
    <span v-if="wordmark" class="text-lg font-extrabold tracking-[0.14em] text-ink">SALDO</span>
  </span>
</template>

<style scoped>
.logo-draw { animation: draw 700ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes draw { from { stroke-dasharray: 0 943; } }
.logo-rise { stroke-dasharray: 300; animation: rise 500ms 250ms ease-out both; }
@keyframes rise { from { stroke-dashoffset: 300; } }
.logo-pop { transform-origin: 336px 220px; animation: pop 300ms 650ms ease-out both; }
@keyframes pop { from { transform: scale(0); } }
</style>
