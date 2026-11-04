<script setup lang="ts">
import { computed } from 'vue'
import { Cloud, CloudAlert, CloudCheck, CloudOff, RefreshCw, UserRound } from 'lucide-vue-next'
import Logo from '@/components/brand/Logo.vue'
import { syncSnap, syncStatus } from '@/data/sync/controller'

// Estado real de la sincronización (no decorativo)
const ui = computed(() => {
  const pending = syncSnap.value.pending
  switch (syncStatus.value) {
    case 'disabled': return { icon: CloudOff, cls: 'text-muted', label: 'Datos solo en este dispositivo' }
    case 'syncing': return { icon: RefreshCw, cls: 'text-accent animate-spin', label: 'Sincronizando' }
    case 'offline': return { icon: CloudOff, cls: 'text-warning', label: `Sin conexión${pending ? `, ${pending} pendientes` : ''}` }
    case 'error': return { icon: CloudAlert, cls: 'text-warning', label: 'Fallo temporal de sincronización' }
    case 'auth': case 'attention': return { icon: CloudAlert, cls: 'text-danger', label: 'La sincronización requiere tu atención' }
    default: return pending > 0
      ? { icon: Cloud, cls: 'text-warning', label: `${pending} cambios pendientes de sincronizar` }
      : { icon: CloudCheck, cls: 'text-accent', label: 'Todo sincronizado' }
  }
})
</script>

<template>
  <header class="pt-safe sticky top-0 z-20 bg-bg/85 backdrop-blur-xl">
    <div class="mx-auto flex h-14 max-w-xl items-center justify-between px-5">
      <Logo :size="28" wordmark />
      <div class="flex items-center gap-1">
        <RouterLink to="/ajustes/sincronizacion" class="press relative grid size-11 place-items-center" :class="ui.cls" :aria-label="ui.label">
          <component :is="ui.icon" :size="20" aria-hidden="true" />
          <span v-if="syncSnap.pending > 0 && syncStatus !== 'disabled'" class="num absolute top-1.5 right-1 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] leading-4 font-bold text-bg">{{ syncSnap.pending > 99 ? '99+' : syncSnap.pending }}</span>
        </RouterLink>
        <RouterLink to="/ajustes" class="press grid size-11 place-items-center rounded-full bg-surface-2 text-ink" aria-label="Perfil y ajustes">
          <UserRound :size="20" aria-hidden="true" />
        </RouterLink>
      </div>
    </div>
  </header>
</template>
