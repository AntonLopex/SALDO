<script setup lang="ts">
import { ref } from 'vue'
import { ChevronLeft, CloudOff, ShieldAlert } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import { syncSnap } from '@/data/sync/controller'
import { authReady, session, signIn, signOut, signUp, userEmail } from '@/lib/auth'
import { supabaseStatus } from '@/lib/supabase'
import { showToast } from '@/lib/toast'

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const info = ref('')

function validate(): string {
  if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return 'Escribe un correo válido.'
  if (password.value.length < 8) return 'La contraseña debe tener al menos 8 caracteres.'
  return ''
}

async function submit() {
  error.value = validate()
  info.value = ''
  if (error.value || busy.value) return
  busy.value = true
  const r = mode.value === 'login' ? await signIn(email.value, password.value) : await signUp(email.value, password.value)
  busy.value = false
  if (!r.ok) { error.value = r.message; return }
  password.value = ''
  if (mode.value === 'register') { info.value = r.message; if (!session.value) mode.value = 'login' }
}

async function logout() {
  busy.value = true
  const r = await signOut()
  busy.value = false
  showToast(r.ok ? 'Sesión cerrada' : r.message)
}

const field = 'mt-1 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-base outline-none focus:border-accent'
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-1">
      <RouterLink to="/ajustes" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Volver a ajustes"><ChevronLeft :size="20" aria-hidden="true" /></RouterLink>
      <h1 class="text-2xl font-extrabold">Cuenta</h1>
    </div>

    <!-- Sin backend configurado: honesto, sin formulario decorativo -->
    <Card v-if="supabaseStatus === 'not-configured'">
      <div class="flex items-start gap-3">
        <CloudOff :size="22" class="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        <div class="space-y-2 text-sm">
          <h2 class="text-base font-bold">Solo en este dispositivo</h2>
          <p class="text-muted">SALDO funciona completa sin cuenta: tus datos se guardan en este navegador. La nube (Supabase) no está configurada en esta instalación.</p>
          <p class="text-muted">Para activarla sigue los pasos de <code>docs/SETUP.md</code>. Mientras tanto, haz copias de seguridad desde Ajustes cuando estén disponibles.</p>
        </div>
      </div>
    </Card>

    <Card v-else-if="supabaseStatus === 'forbidden-key'">
      <div class="flex items-start gap-3" role="alert">
        <ShieldAlert :size="22" class="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
        <div class="space-y-2 text-sm">
          <h2 class="text-base font-bold text-danger">Clave no permitida</h2>
          <p>La clave configurada es una clave de <b>servicio</b> (secreta). La app se niega a usarla en el navegador porque se saltaría la seguridad de tus datos.</p>
          <p class="text-muted">Usa solo la clave pública (<code>anon</code> / <code>publishable</code>) y revoca la que expusiste desde el panel de Supabase.</p>
        </div>
      </div>
    </Card>

    <div v-else-if="!authReady" class="skeleton h-48 rounded-3xl" aria-busy="true" />

    <Card v-else-if="session">
      <h2 class="font-bold">Sesión iniciada</h2>
      <p class="mt-1 text-sm break-all text-muted">{{ userEmail }}</p>
      <RouterLink to="/ajustes/sincronizacion" class="press mt-3 flex min-h-12 items-center justify-between rounded-xl bg-surface-2 px-4 text-sm font-semibold">
        <span>Estado de la sincronización</span><span class="text-muted">{{ syncSnap.pending ? syncSnap.pending + ' pendientes' : 'Al día' }}</span>
      </RouterLink>
      <button type="button" :disabled="busy" class="press mt-4 min-h-12 w-full rounded-2xl bg-surface-2 font-semibold disabled:opacity-60" @click="logout">Cerrar sesión</button>
    </Card>

    <Card v-else>
      <div class="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Acceso">
        <button v-for="m in [{ k: 'login', l: 'Entrar' }, { k: 'register', l: 'Crear cuenta' }] as const" :key="m.k" type="button" role="radio" :aria-checked="mode === m.k"
          class="press min-h-11 rounded-xl text-sm font-bold" :class="mode === m.k ? 'bg-surface text-ink shadow-card' : 'text-muted'" @click="mode = m.k; error = ''; info = ''">{{ m.l }}</button>
      </div>
      <form class="mt-4 space-y-3" novalidate @submit.prevent="submit">
        <label class="block"><span class="text-sm text-muted">Correo</span>
          <input v-model="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Contraseña</span>
          <input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :class="field" /></label>
        <p v-if="error" class="text-sm font-semibold text-danger" role="alert">{{ error }}</p>
        <p v-if="info" class="text-sm font-semibold text-accent" role="status">{{ info }}</p>
        <button type="submit" :disabled="busy" class="press min-h-14 w-full rounded-2xl bg-accent text-base font-bold text-on-accent disabled:opacity-60">
          {{ busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta' }}
        </button>
      </form>
      <p class="mt-3 text-xs text-muted">Usar SALDO sin cuenta es posible: la cuenta solo sirve para guardar copia en la nube y compartir entre dispositivos.</p>
    </Card>
  </div>
</template>
