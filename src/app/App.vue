<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import BottomNav from '@/components/layout/BottomNav.vue'
import Splash from '@/components/brand/Splash.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import UpdateBanner from '@/components/ui/UpdateBanner.vue'

const route = useRoute()
// Splash breve; nunca en el atajo rápido ni con movimiento reducido.
const skipSplash =
  location.pathname.endsWith('/nuevo-gasto') || matchMedia('(prefers-reduced-motion: reduce)').matches
const splash = ref(!skipSplash)
onMounted(() => {
  if (splash.value) setTimeout(() => (splash.value = false), 900)
})
</script>

<template>
  <Transition name="page"><Splash v-if="splash" /></Transition>
  <ToastHost />
  <UpdateBanner />

  <template v-if="route.meta.layout !== 'bare'">
    <AppHeader />
    <main class="mx-auto max-w-xl px-5 pt-2 pb-32">
      <RouterView v-slot="{ Component }">
        <Transition name="page" mode="out-in"><component :is="Component" /></Transition>
      </RouterView>
    </main>
    <BottomNav />
  </template>
  <RouterView v-else v-slot="{ Component }">
    <Transition name="page" mode="out-in"><component :is="Component" /></Transition>
  </RouterView>
</template>
