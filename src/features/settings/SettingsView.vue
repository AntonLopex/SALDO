<script setup lang="ts">
import { ref } from 'vue'
import { ChevronRight, Sun, Moon, SunMoon } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import { themeMode, type ThemeMode } from '@/lib/theme'
import { canPromptInstall, checkForUpdate, isIos, isStandalone, needRefresh, persistence, promptInstall } from '@/lib/pwa'
import { showToast } from '@/lib/toast'

const modes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'auto', label: 'Automático', icon: SunMoon },
]

const version = __APP_VERSION__
const buildDate = __BUILD_DATE__
const standalone = isStandalone()
const ios = isIos()
const checking = ref(false)

async function lookForUpdate() {
  checking.value = true
  await checkForUpdate()
  // El service worker tarda un instante en descargar la versión nueva si la hay
  setTimeout(() => {
    checking.value = false
    if (!needRefresh.value) showToast('Ya tienes la última versión')
  }, 2500)
}

const persistenceText = {
  granted: 'Activado: el navegador no borrará tus datos locales por falta de espacio.',
  denied: 'No concedido. Instala la app en la pantalla de inicio y haz copias de seguridad.',
  unsupported: 'Este navegador no lo permite. Haz copias de seguridad con frecuencia.',
  unknown: 'Comprobando…',
} as const
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-2xl font-extrabold">Ajustes</h1>
    <RouterLink to="/ajustes/copias" class="press flex min-h-16 items-center justify-between rounded-card border border-line bg-surface px-5 shadow-card">
      <span class="font-bold">Copias de seguridad</span><ChevronRight :size="20" class="text-muted" aria-hidden="true" />
    </RouterLink>
    <RouterLink to="/ajustes/cuenta" class="press flex min-h-16 items-center justify-between rounded-card border border-line bg-surface px-5 shadow-card">
      <span class="font-bold">Cuenta y sincronización</span><ChevronRight :size="20" class="text-muted" aria-hidden="true" />
    </RouterLink>
    <RouterLink to="/ajustes/plan" class="press flex min-h-16 items-center justify-between rounded-card border border-line bg-surface px-5 shadow-card">
      <span class="font-bold">Plan de ahorro, ingresos y objetivos</span><ChevronRight :size="20" class="text-muted" aria-hidden="true" />
    </RouterLink>
    <RouterLink to="/ajustes/categorias" class="press flex min-h-16 items-center justify-between rounded-card border border-line bg-surface px-5 shadow-card">
      <span class="font-bold">Categorías y favoritos</span><ChevronRight :size="20" class="text-muted" aria-hidden="true" />
    </RouterLink>
    <Card>
      <h2 class="font-bold">Tema</h2>
      <div class="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema visual">
        <button
          v-for="m in modes" :key="m.value" type="button" role="radio" :aria-checked="themeMode === m.value"
          class="press flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-sm font-semibold"
          :class="themeMode === m.value ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink'"
          @click="themeMode = m.value"
        >
          <component :is="m.icon" :size="20" aria-hidden="true" />{{ m.label }}
        </button>
      </div>
    </Card>

    <Card>
      <h2 class="font-bold">Instalar y mantener la app</h2>
      <template v-if="standalone">
        <p class="mt-2 text-sm font-semibold text-accent" role="status">✓ Estás usando SALDO como app instalada.</p>
      </template>
      <template v-else-if="ios">
        <p class="mt-2 text-sm text-muted">En el iPhone se instala desde Safari:</p>
        <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Abre esta web en <b>Safari</b> (no en otro navegador).</li>
          <li>Pulsa el botón <b>Compartir</b> (cuadrado con flecha).</li>
          <li>Elige <b>Añadir a pantalla de inicio</b> y confirma.</li>
        </ol>
        <p class="mt-2 text-xs text-muted">Instalada funciona a pantalla completa, sin conexión, y iOS no borra sus datos por inactividad.</p>
      </template>
      <template v-else>
        <p class="mt-2 text-sm text-muted">Puedes instalarla para abrirla como una app y usarla sin conexión.</p>
        <button v-if="canPromptInstall" type="button" class="press mt-3 min-h-12 w-full rounded-2xl bg-accent font-bold text-on-accent" @click="promptInstall">Instalar SALDO</button>
        <p v-else class="mt-2 text-xs text-muted">Usa el menú del navegador → «Instalar aplicación» o «Añadir a pantalla de inicio».</p>
      </template>

      <dl class="mt-4 space-y-2 border-t border-line pt-3 text-sm">
        <div><dt class="font-semibold">Almacenamiento persistente</dt><dd class="text-muted">{{ persistenceText[persistence] }}</dd></div>
        <div class="flex items-center justify-between"><dt class="font-semibold">Versión</dt><dd class="num text-muted">{{ version }} · {{ buildDate }}</dd></div>
      </dl>
      <button type="button" :disabled="checking" class="press mt-3 min-h-12 w-full rounded-2xl bg-surface-2 font-semibold disabled:opacity-60" @click="lookForUpdate">
        {{ checking ? 'Buscando…' : 'Buscar actualización' }}
      </button>
    </Card>
  </div>
</template>
