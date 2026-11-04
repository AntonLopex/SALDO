<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import { liveQuery } from 'dexie'
import { AlertTriangle, ChevronLeft, FileDown, FileUp, ShieldCheck } from 'lucide-vue-next'
import Card from '@/components/ui/Card.vue'
import { db, type SnapshotRow } from '@/data/db'
import { lastExport } from '@/data/appData'
import { MIN_PASSPHRASE } from '@/data/backup/crypto'
import { summarize, type BackupFile, type ValidationResult } from '@/data/backup/format'
import {
  createSnapshot, deliverFile, exportCsv, exportJson, loadSnapshot, markExported, NeedPassphraseError, parseBackupFile, restoreBackup,
} from '@/data/backup/io'
import { formatCents } from '@/domain/money'
import { showToast } from '@/lib/toast'

// ───── exportar ─────
const protect = ref(false)
const pass = ref('')
const pass2 = ref('')
const busy = ref('')
const exportError = ref('')

async function doExport(kind: 'json' | 'csv') {
  exportError.value = ''
  if (kind === 'json' && protect.value) {
    if (pass.value.length < MIN_PASSPHRASE) { exportError.value = `La contraseña debe tener al menos ${MIN_PASSPHRASE} caracteres.`; return }
    if (pass.value !== pass2.value) { exportError.value = 'Las contraseñas no coinciden.'; return }
  }
  busy.value = kind
  try {
    const file = kind === 'json' ? await exportJson(protect.value ? pass.value : undefined) : await exportCsv()
    const r = await deliverFile(file)
    if (r !== 'cancelled' && kind === 'json') { await markExported(); showToast(file.encrypted ? 'Copia cifrada exportada' : 'Copia exportada') }
    else if (r !== 'cancelled') showToast('CSV exportado')
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : 'No se pudo exportar'
  } finally {
    busy.value = ''
  }
}

// ───── importar / restaurar ─────
const preview = ref<{ result: ValidationResult; source: string } | null>(null)
const importError = ref('')
const needPass = ref<Uint8Array | null>(null)
const importPass = ref('')
const confirm = ref(false)
const restoring = ref(false)

const summary = computed(() => (preview.value?.result.backup ? summarize(preview.value.result.backup) : null))
const counts = computed(() => preview.value?.result.backup?.counts)
const fmtDate = (iso: string) => new Date(iso).toLocaleString('es-ES')

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  importError.value = ''
  preview.value = null
  needPass.value = null
  if (f.size > 25_000_000) { importError.value = 'El archivo es demasiado grande para ser una copia de SALDO.'; return }
  await tryParse(new Uint8Array(await f.arrayBuffer()), f.name)
}
async function tryParse(bytes: Uint8Array, name: string, passphrase?: string) {
  try {
    const result = await parseBackupFile(bytes, passphrase)
    needPass.value = null
    importPass.value = ''
    preview.value = { result, source: name }
    confirm.value = false
  } catch (e) {
    if (e instanceof NeedPassphraseError) { needPass.value = bytes; preview.value = null; importError.value = ''; return }
    importError.value = e instanceof Error ? e.message : 'No se pudo leer el archivo'
  }
}
function unlock() { if (needPass.value) void tryParse(needPass.value, 'archivo cifrado', importPass.value) }

async function doRestore() {
  const b: BackupFile | undefined = preview.value?.result.backup
  if (!b || !confirm.value || restoring.value) return
  restoring.value = true
  try {
    await createSnapshot('pre-restore') // red de seguridad: se puede volver atrás desde «Copias internas»
    const r = await restoreBackup(b)
    showToast(`Copia restaurada (${r.written} registros). Se sincronizará en unos segundos.`)
    preview.value = null
  } catch (e) {
    importError.value = e instanceof Error ? e.message : 'No se pudo restaurar. Tus datos no se han modificado.'
  } finally {
    restoring.value = false
  }
}

// ───── copias internas ─────
const snaps = ref<SnapshotRow[]>([])
const sub = liveQuery(() => db.snapshots.orderBy('at').reverse().toArray()).subscribe((v) => (snaps.value = v))
onScopeDispose(() => sub.unsubscribe())
async function openSnapshot(s: SnapshotRow) {
  importError.value = ''
  preview.value = { result: await loadSnapshot(s.id), source: `copia interna del ${fmtDate(s.at)}` }
  confirm.value = false
}
async function snapNow() {
  await createSnapshot('auto')
  showToast('Copia interna creada')
}

const days = computed(() => (lastExport.value ? Math.floor((Date.now() - Date.parse(lastExport.value)) / 86_400_000) : null))
const field = 'mt-1 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-base outline-none focus:border-accent'
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center gap-1">
      <RouterLink to="/ajustes" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Volver a ajustes"><ChevronLeft :size="20" aria-hidden="true" /></RouterLink>
      <h1 class="text-2xl font-extrabold">Copias de seguridad</h1>
    </div>

    <Card>
      <p class="text-sm" role="status">
        <template v-if="days === null">Aún no has exportado ninguna copia.</template>
        <template v-else>Última exportación: <b>{{ days === 0 ? 'hoy' : `hace ${days} ${days === 1 ? 'día' : 'días'}` }}</b>.</template>
      </p>
      <p class="mt-2 text-sm text-muted">Tus datos viven en este dispositivo. Exportar una copia es lo único que los protege si pierdes el móvil o borras los datos del navegador.</p>
    </Card>

    <!-- Exportar -->
    <Card>
      <h2 class="flex items-center gap-2 font-bold"><FileDown :size="18" aria-hidden="true" />Exportar</h2>
      <label class="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold"><input v-model="protect" type="checkbox" class="size-5 accent-[var(--accent)]" />Proteger con contraseña (cifrado)</label>
      <template v-if="protect">
        <label class="mt-2 block"><span class="text-sm text-muted">Contraseña (mín. {{ MIN_PASSPHRASE }} caracteres)</span><input v-model="pass" type="password" autocomplete="new-password" :class="field" /></label>
        <label class="mt-2 block"><span class="text-sm text-muted">Repite la contraseña</span><input v-model="pass2" type="password" autocomplete="new-password" :class="field" /></label>
        <p class="mt-2 flex gap-2 text-xs text-warning"><AlertTriangle :size="14" class="mt-0.5 shrink-0" aria-hidden="true" />Si olvidas la contraseña, la copia no se puede recuperar. Nadie puede restablecerla.</p>
      </template>
      <p v-else class="mt-2 flex gap-2 text-xs text-muted"><AlertTriangle :size="14" class="mt-0.5 shrink-0" aria-hidden="true" />Sin contraseña, el archivo contiene todos tus datos financieros en texto legible. Guárdalo en un sitio privado.</p>
      <p v-if="exportError" class="mt-2 text-sm font-semibold text-danger" role="alert">{{ exportError }}</p>
      <button type="button" :disabled="!!busy" class="press mt-4 min-h-14 w-full rounded-2xl bg-accent font-bold text-on-accent disabled:opacity-60" @click="doExport('json')">
        {{ busy === 'json' ? 'Preparando…' : 'Exportar copia completa (JSON)' }}
      </button>
      <button type="button" :disabled="!!busy" class="press mt-2 min-h-12 w-full rounded-2xl bg-surface-2 font-semibold disabled:opacity-60" @click="doExport('csv')">Exportar movimientos (CSV para Excel)</button>
      <p class="mt-2 text-xs text-muted">El CSV sirve para analizar; para restaurar usa siempre el JSON.</p>
    </Card>

    <!-- Importar -->
    <Card>
      <h2 class="flex items-center gap-2 font-bold"><FileUp :size="18" aria-hidden="true" />Restaurar una copia</h2>
      <p class="mt-1 text-sm text-muted">Primero se valida el archivo y verás un resumen. No se cambia nada hasta que confirmes.</p>
      <label class="press mt-3 flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-surface-2 font-semibold">
        Elegir archivo (.json o .age)
        <input type="file" accept=".json,.age,application/json" class="sr-only" @change="onFile" />
      </label>

      <form v-if="needPass" class="mt-3 space-y-2" novalidate @submit.prevent="unlock">
        <label class="block"><span class="text-sm text-muted">Contraseña del archivo</span><input v-model="importPass" type="password" autocomplete="off" :class="field" /></label>
        <button type="submit" class="press min-h-12 w-full rounded-2xl bg-accent font-bold text-on-accent">Descifrar</button>
      </form>

      <p v-if="importError" class="mt-3 text-sm font-semibold text-danger" role="alert">{{ importError }}</p>

      <div v-if="preview" class="mt-4 space-y-3 border-t border-line pt-4">
        <p class="text-xs font-semibold tracking-wide text-muted uppercase">Origen: {{ preview.source }}</p>
        <template v-if="preview.result.ok && summary && counts">
          <p class="flex items-center gap-2 text-sm font-bold text-accent" role="status"><ShieldCheck :size="18" aria-hidden="true" />Archivo íntegro y válido</p>
          <dl class="num grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt class="text-muted">Creada</dt><dd class="text-right">{{ fmtDate(summary.exportedAt) }}</dd>
            <dt class="text-muted">Movimientos</dt><dd class="text-right">{{ summary.transactions }}</dd>
            <dt v-if="summary.firstDate" class="text-muted">Periodo</dt><dd v-if="summary.firstDate" class="text-right">{{ summary.firstDate }} → {{ summary.lastDate }}</dd>
            <dt class="text-muted">Patrimonio</dt><dd class="text-right font-bold">{{ formatCents(summary.worthCents) }}</dd>
            <dt class="text-muted">Categorías</dt><dd class="text-right">{{ counts.categories }}</dd>
            <dt class="text-muted">Gastos planificados</dt><dd class="text-right">{{ counts.planned }}</dd>
          </dl>
          <ul v-if="preview.result.warnings.length" class="space-y-1 text-sm text-warning"><li v-for="w in preview.result.warnings" :key="w">⚠ {{ w }}</li></ul>
          <p class="rounded-xl bg-warning/15 p-3 text-sm">Esto <b>reemplaza los datos de este dispositivo</b> por los de la copia. Lo que no esté en la copia se dará de baja (no se borra del todo). Antes se guarda una copia interna para poder volver atrás.</p>
          <label class="flex min-h-11 items-center gap-3 text-sm font-semibold"><input v-model="confirm" type="checkbox" class="size-5 accent-[var(--accent)]" />Entiendo y quiero restaurar</label>
          <button type="button" :disabled="!confirm || restoring" class="press min-h-14 w-full rounded-2xl bg-accent font-bold text-on-accent disabled:opacity-50" @click="doRestore">
            {{ restoring ? 'Restaurando…' : 'Restaurar copia' }}
          </button>
        </template>
        <template v-else>
          <p class="text-sm font-bold text-danger" role="alert">No se puede restaurar este archivo</p>
          <ul class="space-y-1 text-sm text-danger"><li v-for="e in preview.result.errors" :key="e">• {{ e }}</li></ul>
          <p class="text-xs text-muted">No se ha modificado ningún dato.</p>
        </template>
        <button type="button" class="press min-h-11 text-sm font-semibold text-muted" @click="preview = null">Cancelar</button>
      </div>
    </Card>

    <!-- Copias internas -->
    <Card>
      <div class="flex items-center justify-between">
        <h2 class="font-bold">Copias internas</h2>
        <button type="button" class="press min-h-11 px-2 text-sm font-semibold text-accent" @click="snapNow">Crear ahora</button>
      </div>
      <p class="mt-1 text-sm text-muted">Una a la semana (si hay movimientos), guardadas en este mismo navegador. Te protegen de un error de la app o de una restauración equivocada, <b>no</b> de perder el dispositivo.</p>
      <ul v-if="snaps.length" class="mt-2 divide-y divide-line">
        <li v-for="s in snaps" :key="s.id" class="flex min-h-14 items-center justify-between gap-3 text-sm">
          <span><span class="font-semibold">{{ fmtDate(s.at) }}</span><br /><span class="text-muted">{{ s.reason === 'auto' ? 'Automática' : 'Antes de restaurar' }} · {{ s.transactions }} mov.</span></span>
          <button type="button" class="press min-h-11 px-3 font-semibold text-accent" @click="openSnapshot(s)">Ver</button>
        </li>
      </ul>
      <p v-else class="mt-2 text-sm text-muted">Todavía no hay copias internas.</p>
    </Card>

    <!-- Copia externa -->
    <Card>
      <h2 class="font-bold">Copia externa automática</h2>
      <p class="mt-1 text-sm text-muted">Un flujo de GitHub Actions puede guardar cada semana una copia <b>cifrada</b> de tus datos de la nube. Es opcional y se configura fuera de la app (<code>docs/BACKUPS.md</code>). Esta pantalla no puede comprobar si está funcionando: hazlo desde la pestaña Actions de tu repositorio.</p>
    </Card>
  </div>
</template>
