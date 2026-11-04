<script setup lang="ts">
import { watch } from 'vue'
import { applyUpdate, dismissOfflineReady, dismissUpdate, needRefresh, offlineReady } from '@/lib/pwa'
import { showToast } from '@/lib/toast'

// «Lista sin conexión»: solo la primera vez que se instala el service worker
const KEY = 'saldo-offline-notified'
watch(offlineReady, (ready) => {
  if (!ready) return
  try {
    if (localStorage.getItem(KEY)) return dismissOfflineReady()
    localStorage.setItem(KEY, '1')
  } catch { /* sin almacenamiento: se avisa igualmente */ }
  showToast('SALDO ya funciona sin conexión', { ms: 5000 })
  dismissOfflineReady()
})
</script>

<template>
  <Transition name="page">
    <div v-if="needRefresh" class="fixed inset-x-0 bottom-28 z-[58] flex justify-center px-5" role="alertdialog" aria-labelledby="upd-t">
      <div class="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
        <div class="min-w-0 flex-1">
          <p id="upd-t" class="text-sm font-bold">Nueva versión disponible</p>
          <p class="text-xs text-muted">Se actualizará al recargar. Tus datos no se tocan.</p>
        </div>
        <button type="button" class="press min-h-11 rounded-xl px-3 text-sm font-semibold text-muted" @click="dismissUpdate">Luego</button>
        <button type="button" class="press min-h-11 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent" @click="applyUpdate">Actualizar</button>
      </div>
    </div>
  </Transition>
</template>
