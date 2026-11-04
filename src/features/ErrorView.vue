<script setup lang="ts">
import { SearchX } from 'lucide-vue-next'
import EmptyState from '@/components/ui/EmptyState.vue'
import Button from '@/components/ui/Button.vue'
</script>

<template>
  <div class="pt-safe grid min-h-full place-items-center px-6">
    <EmptyState :icon="SearchX" title="Página no encontrada" text="La dirección no existe o ha cambiado.">
      <RouterLink to="/"><Button>Ir al inicio</Button></RouterLink>
    </EmptyState>
  </div>
</template>
