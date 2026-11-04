<script setup lang="ts">
import { useRouter } from 'vue-router'
import Logo from '@/components/brand/Logo.vue'
import Button from '@/components/ui/Button.vue'
import { markOnboarded } from '@/app/router'

const router = useRouter()
function start() {
  markOnboarded()
  router.replace('/')
}
</script>

<template>
  <div class="pt-safe pb-safe flex min-h-full flex-col items-center justify-between px-6 py-10 text-center">
    <div class="flex flex-1 flex-col items-center justify-center gap-6">
      <Logo :size="104" animate />
      <h1 class="text-4xl font-extrabold tracking-[0.12em]">SALDO</h1>
      <p class="max-w-xs text-lg text-muted">Registra un gasto en segundos y mira cómo te acercas a tus 17.000 €.</p>
    </div>
    <Button class="w-full max-w-sm" @click="start">Empezar</Button>
  </div>
</template>
