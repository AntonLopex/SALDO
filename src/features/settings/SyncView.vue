<script setup lang="ts">
import { computed, ref } from 'vue'
import { liveQuery } from 'dexie'
import { ChevronLeft, CloudAlert, CloudCheck, CloudOff, RefreshCw } from 'lucide-vue-next'
import { onScopeDispose } from 'vue'
import Card from '@/components/ui/Card.vue'
import { db, type ConflictRow } from '@/data/db'
import { retryNow, syncMessage, syncSnap, syncStatus } from '@/data/sync/controller'
import { session } from '@/lib/auth'
import { supabaseStatus } from '@/lib/supabase'

const conflicts = ref<ConflictRow[]>([])
const sub = liveQuery(() => db.conflicts.orderBy('at').reverse().toArray()).subscribe((v) => (conflicts.value = v))
onScopeDispose(() => sub.unsubscribe())

const TABLE = { categories: 'Categoría', planned: 'Gasto planificado', transactions: 'Movimiento', funds: 'Fondo', settings: 'Plan de ahorro' } as Record<string, string>

const head = computed(() => {
  if (supabaseStatus !== 'ready') return { icon: CloudOff, tone: 'text-muted', title: 'Solo en este dispositivo', text: 'La nube no está configurada en esta instalación.' }
  if (!session.value) return { icon: CloudOff, tone: 'text-muted', title: 'Sin sesión', text: 'Inicia sesión en Cuenta para guardar copia en la nube.' }
  switch (syncStatus.value) {
    case 'syncing': return { icon: RefreshCw, tone: 'text-accent animate-spin', title: 'Sincronizando…', text: 'Enviando y recibiendo cambios.' }
    case 'offline': return { icon: CloudOff, tone: 'text-warning', title: 'Sin conexión', text: 'Tus datos están seguros en este dispositivo y se enviarán al volver Internet.' }
    case 'error': return { icon: CloudAlert, tone: 'text-warning', title: 'Fallo temporal', text: syncMessage.value || 'Se reintentará automáticamente.' }
    case 'auth': return { icon: CloudAlert, tone: 'text-danger', title: 'Sesión caducada', text: 'Vuelve a iniciar sesión en Cuenta. No has perdido datos.' }
    case 'attention': return { icon: CloudAlert, tone: 'text-warning', title: 'Requiere tu atención', text: syncMessage.value || 'Hay elementos que el servidor no ha aceptado.' }
    default:
      return syncSnap.value.pending > 0
        ? { icon: RefreshCw, tone: 'text-warning', title: 'Cambios pendientes', text: 'Se enviarán en unos segundos.' }
        : { icon: CloudCheck, tone: 'text-accent', title: 'Todo sincronizado', text: syncSnap.value.lastSyncAt ? `Última vez: ${new Date(syncSnap.value.lastSyncAt).toLocaleString('es-ES')}` : 'Aún no se ha sincronizado.' }
  }
})
const busy = computed(() => syncStatus.value === 'syncing')
const enabled = computed(() => supabaseStatus === 'ready' && !!session.value)
const waitLabel = (ms: number) => {
  const s = Math.max(0, Math.round((ms - Date.now()) / 1000))
  return s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-1">
      <RouterLink to="/ajustes/cuenta" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Volver a cuenta"><ChevronLeft :size="20" aria-hidden="true" /></RouterLink>
      <h1 class="text-2xl font-extrabold">Sincronización</h1>
    </div>

    <Card>
      <div class="flex items-start gap-3" role="status">
        <component :is="head.icon" :size="26" class="mt-0.5 shrink-0" :class="head.tone" aria-hidden="true" />
        <div>
          <h2 class="font-bold">{{ head.title }}</h2>
          <p class="mt-1 text-sm text-muted">{{ head.text }}</p>
        </div>
      </div>
      <dl class="mt-4 grid grid-cols-3 gap-2 text-center">
        <div><dt class="text-xs text-muted">Pendientes</dt><dd class="num mt-0.5 text-xl font-extrabold" :class="syncSnap.pending ? 'text-warning' : ''">{{ syncSnap.pending }}</dd></div>
        <div><dt class="text-xs text-muted">Rechazados</dt><dd class="num mt-0.5 text-xl font-extrabold" :class="syncSnap.blocked ? 'text-danger' : ''">{{ syncSnap.blocked }}</dd></div>
        <div><dt class="text-xs text-muted">Conflictos</dt><dd class="num mt-0.5 text-xl font-extrabold">{{ syncSnap.conflicts }}</dd></div>
      </dl>
      <button type="button" :disabled="!enabled || busy" class="press mt-4 min-h-12 w-full rounded-2xl bg-accent font-bold text-on-accent disabled:opacity-50" @click="retryNow">
        {{ busy ? 'Sincronizando…' : syncSnap.pending || syncSnap.failing.length ? 'Reintentar ahora' : 'Sincronizar ahora' }}
      </button>
    </Card>

    <Card v-if="syncSnap.failing.length">
      <h2 class="font-bold">Elementos con problemas</h2>
      <p class="mt-1 text-sm text-muted">Siguen guardados en este dispositivo. Nada se ha borrado.</p>
      <ul class="mt-2 divide-y divide-line">
        <li v-for="f in syncSnap.failing" :key="f.key" class="py-3 text-sm">
          <div class="flex justify-between gap-3"><span class="font-semibold">{{ TABLE[f.table] ?? f.table }}</span>
            <span class="text-muted">{{ f.blocked ? 'Rechazado' : 'Reintento en ' + waitLabel(f.nextAttemptAt) }} · {{ f.attempts }} {{ f.attempts === 1 ? 'intento' : 'intentos' }}</span></div>
          <p class="mt-1 break-words text-danger">{{ f.lastError }}</p>
        </li>
      </ul>
    </Card>

    <Card v-if="conflicts.length">
      <div class="flex items-center justify-between">
        <h2 class="font-bold">Conflictos resueltos</h2>
        <button type="button" class="press min-h-11 px-2 text-sm font-semibold text-accent" @click="db.conflicts.clear()">Limpiar</button>
      </div>
      <p class="mt-1 text-sm text-muted">Cambios hechos a la vez en dos sitios. Se conservó el más reciente; aquí queda lo descartado.</p>
      <ul class="mt-2 divide-y divide-line text-sm">
        <li v-for="c in conflicts" :key="c.id" class="py-3">
          <span class="font-semibold">{{ TABLE[c.table] ?? c.table }}</span>
          <span class="text-muted"> · se descartó la versión {{ c.loser === 'local' ? 'de este dispositivo' : 'de la nube' }} · {{ new Date(c.at).toLocaleString('es-ES') }}</span>
        </li>
      </ul>
    </Card>

    <p class="text-xs text-muted">
      Los datos se guardan primero en este dispositivo y se envían cuando hay Internet. Un fallo de sincronización nunca borra ni modifica tus movimientos.
    </p>
  </div>
</template>
