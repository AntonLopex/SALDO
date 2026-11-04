<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Check, Copy, Trash2, X } from 'lucide-vue-next'
import Chip from '@/components/ui/Chip.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { categories, categoryById, categoryLabel, dataReady, favorites, subsOf, topCategories, txs } from '@/data/appData'
import { plannedRepo, txRepo } from '@/data/repositories'
import { DEFAULTS } from '@/domain/defaults'
import { addDaysISO, dayLabel, todayISO } from '@/domain/dates'
import { formatCents, parseEuros } from '@/domain/money'
import { parseQuickParams } from '@/domain/quickParams'
import type { Tx } from '@/domain/types'
import { iconFor } from '@/lib/icons'
import { showToast } from '@/lib/toast'

const route = useRoute()
const router = useRouter()

const editId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
// /nuevo-ingreso abre directamente en «Ingreso»; el resto, en «Gasto»
const kind = ref<'expense' | 'income'>(route.name === 'nuevo-ingreso' ? 'income' : 'expense')
const amountText = ref('')
const categoryId = ref<string | null>(null)
const subcategoryId = ref<string | null>(null)
const date = ref(todayISO())
const note = ref('')
const error = ref('')
const saving = ref(false)
const saved = ref<Tx | null>(null) // confirmación tras guardar
const canUndo = ref(false)
const moreOpen = ref(false)
const plannedId = ref<string | null>(null) // gasto planificado que se está cumpliendo
const amountEl = ref<HTMLInputElement | null>(null)

const cents = computed(() => parseEuros(amountText.value))

interface Option { key: string; label: string; icon: string; color: string; categoryId: string; subcategoryId: string | null }

function optionOf(catId: string, subId: string | null): Option | null {
  const sub = subId ? categoryById.value.get(subId) : undefined
  const cat = categoryById.value.get(catId)
  if (!cat) return null
  const base = sub ?? cat
  return { key: `${catId}:${subId ?? ''}`, label: base.name, icon: base.icon, color: cat.color, categoryId: catId, subcategoryId: subId }
}

// Favoritas primero (en su orden), luego las usadas recientemente. Nunca se registra nada solo.
const options = computed<Option[]>(() => {
  const out: Option[] = []
  const seen = new Set<string>()
  const push = (o: Option | null) => { if (o && !seen.has(o.key)) { seen.add(o.key); out.push(o) } }
  for (const f of favorites.value) push(f.parentId ? optionOf(f.parentId, f.id) : optionOf(f.id, null))
  const recent = [...txs.value].filter((t) => t.kind === 'expense' && t.categoryId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  let extra = 0
  for (const t of recent) {
    const o = optionOf(t.categoryId!, t.subcategoryId)
    if (o && !seen.has(o.key) && extra < 4) { push(o); extra++ }
  }
  return out
})

const subOptions = computed(() => (categoryId.value ? subsOf(categoryId.value) : []))
const selectedKey = computed(() => (categoryId.value ? `${categoryId.value}:${subcategoryId.value ?? ''}` : ''))

// Sugerencias basadas en los últimos gastos distintos (rellenan el formulario; no guardan)
const suggestions = computed(() => {
  const seen = new Set<string>()
  const out: Tx[] = []
  for (const t of [...txs.value].filter((x) => x.kind === 'expense').sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const k = `${t.amountCents}:${t.categoryId}:${t.subcategoryId}`
    if (!seen.has(k)) { seen.add(k); out.push(t) }
    if (out.length === 3) break
  }
  return out
})

function pick(o: Option) {
  categoryId.value = o.categoryId
  subcategoryId.value = o.subcategoryId
  error.value = ''
}
function pickSub(id: string | null) {
  subcategoryId.value = subcategoryId.value === id ? null : id
}
function pickCategoryOnly(id: string) {
  categoryId.value = id
  subcategoryId.value = null
  moreOpen.value = false
  error.value = ''
}
function pickFromSheet(catId: string, subId: string) {
  categoryId.value = catId
  subcategoryId.value = subId
  moreOpen.value = false
  error.value = ''
}
function setQuick(c: number) {
  amountText.value = String(c / 100).replace('.', ',')
  error.value = ''
}
function applySuggestion(t: Tx) {
  amountText.value = String(t.amountCents / 100).replace('.', ',')
  categoryId.value = t.categoryId
  subcategoryId.value = t.subcategoryId
  note.value = t.note
}

const isToday = computed(() => date.value === todayISO())
const isYesterday = computed(() => date.value === addDaysISO(todayISO(), -1))

function resetForm() {
  amountText.value = ''
  categoryId.value = null
  subcategoryId.value = null
  note.value = ''
  date.value = todayISO()
  error.value = ''
  saved.value = null
  plannedId.value = null
  canUndo.value = false
  nextTick(() => amountEl.value?.focus())
}

function validate(): string {
  if (cents.value === null || cents.value <= 0) return 'Introduce un importe válido'
  if (kind.value === 'expense' && !categoryId.value) return 'Elige una categoría'
  return ''
}

async function save() {
  error.value = validate()
  if (error.value || saving.value) return
  saving.value = true
  try {
    const payload = {
      kind: kind.value, amountCents: cents.value!, occurredOn: date.value, note: note.value,
      categoryId: kind.value === 'expense' ? categoryId.value : null,
      subcategoryId: kind.value === 'expense' ? subcategoryId.value : null,
      plannedExpenseId: kind.value === 'expense' ? plannedId.value : null,
    }
    if (editId.value) {
      await txRepo.update(editId.value, payload)
      showToast('Cambios guardados')
      leave()
    } else {
      saved.value = await txRepo.add(payload)
      canUndo.value = true
      setTimeout(() => (canUndo.value = false), 10000)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar'
  } finally {
    saving.value = false
  }
}

async function undo() {
  if (!saved.value) return
  await txRepo.softDelete(saved.value.id)
  showToast('Movimiento deshecho')
  resetForm()
}

async function remove() {
  if (!editId.value) return
  const id = editId.value
  await txRepo.softDelete(id)
  showToast('Movimiento eliminado', { actionLabel: 'Deshacer', onAction: () => txRepo.restore(id).then(() => undefined) })
  leave()
}

function duplicate() {
  if (!editId.value) return
  router.replace({ path: '/anadir', query: { duplicar: editId.value } })
}

function leave() {
  if (history.state?.back) router.back()
  else router.push('/')
}

function load(t: Tx, asCopy: boolean) {
  kind.value = t.kind === 'income' ? 'income' : 'expense'
  amountText.value = String(t.amountCents / 100).replace('.', ',')
  categoryId.value = t.categoryId
  subcategoryId.value = t.subcategoryId
  note.value = t.note
  date.value = asCopy ? todayISO() : t.occurredOn
}

onMounted(async () => {
  const dupId = typeof route.query.duplicar === 'string' ? route.query.duplicar : null
  const planId = typeof route.query.planificado === 'string' ? route.query.planificado : null
  if (planId) {
    const p = await plannedRepo.get(planId)
    if (p && p.status === 'pending' && !p.deletedAt) {
      plannedId.value = p.id
      amountText.value = String(p.estimatedCents / 100).replace('.', ',')
      categoryId.value = p.categoryId
      subcategoryId.value = p.subcategoryId
      note.value = p.name
    } else showToast('Ese gasto planificado ya no está pendiente')
  }
  const source = editId.value ?? dupId
  if (source) {
    const t = await txRepo.get(source)
    if (t && !t.deletedAt && (t.kind === 'income' || t.kind === 'expense')) load(t, !!dupId)
    else if (editId.value) { showToast('No se encontró el movimiento'); leave(); return }
  }
})

/**
 * Cuando los datos locales están listos:
 *  1) se aplican los parámetros de la URL (/nuevo-gasto?importe=3,50&categoria=Café) SOLO como relleno del formulario;
 *     nunca se guarda nada desde un enlace (ver src/domain/quickParams.ts);
 *  2) se enfoca el importe. Antes se intentaba en onMounted, cuando el campo aún no existía (se pinta tras cargar los datos).
 */
let startupDone = false
watch(
  dataReady,
  async (ready) => {
    if (!ready || startupDone) return
    startupDone = true
    const dupId = typeof route.query.duplicar === 'string'
    const prefilled = !!editId.value || dupId || typeof route.query.planificado === 'string'
    if (!prefilled) {
      const q = parseQuickParams(route.query, categories.value, kind.value)
      if (q.kind) kind.value = q.kind
      if (q.amountText) amountText.value = q.amountText
      if (q.categoryId && kind.value === 'expense') {
        categoryId.value = q.categoryId
        subcategoryId.value = q.subcategoryId ?? null
      }
      if (q.note) note.value = q.note
    }
    await nextTick()
    // Con el importe ya relleno no se roba el foco: el siguiente paso es elegir categoría o guardar.
    if (!editId.value && !dupId && !amountText.value) amountEl.value?.focus()
  },
  { immediate: true },
)

const title = computed(() => (editId.value ? 'Editar movimiento' : kind.value === 'expense' ? 'Nuevo gasto' : 'Nuevo ingreso'))
</script>

<template>
  <div class="pt-safe flex min-h-full flex-col">
    <!-- Cabecera -->
    <div class="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-5">
      <h1 class="text-lg font-extrabold">{{ title }}</h1>
      <button type="button" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Cerrar" @click="leave">
        <X :size="20" aria-hidden="true" />
      </button>
    </div>

    <!-- Carga -->
    <div v-if="!dataReady" class="mx-auto w-full max-w-xl space-y-4 px-5 pt-6">
      <div class="skeleton h-20 rounded-3xl" /><div class="skeleton h-12 rounded-2xl" /><div class="skeleton h-32 rounded-3xl" />
    </div>

    <!-- Confirmación -->
    <div v-else-if="saved" class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
      <div class="done grid size-24 place-items-center rounded-full bg-accent text-on-accent"><Check :size="48" :stroke-width="3" aria-hidden="true" /></div>
      <p class="text-2xl font-extrabold" role="status">Guardado</p>
      <p class="num text-lg text-muted">{{ formatCents(saved.amountCents) }} · {{ saved.kind === 'income' ? 'Ingreso' : categoryLabel(saved) }}</p>
      <div class="mt-4 flex w-full max-w-sm flex-col gap-3">
        <button type="button" class="press min-h-14 rounded-2xl bg-accent text-base font-bold text-on-accent" @click="resetForm">Añadir otro</button>
        <button type="button" class="press min-h-14 rounded-2xl bg-surface-2 text-base font-semibold" @click="router.push('/')">Abrir SALDO</button>
        <button v-if="canUndo" type="button" class="press min-h-12 rounded-2xl text-base font-semibold text-danger" @click="undo">Deshacer</button>
      </div>
    </div>

    <!-- Formulario -->
    <form v-else class="mx-auto flex w-full max-w-xl flex-1 flex-col" novalidate @submit.prevent="save">
      <div class="flex-1 space-y-5 px-5 pt-2 pb-6">
        <div class="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Tipo de movimiento">
          <button
            v-for="k in [{ v: 'expense', l: 'Gasto' }, { v: 'income', l: 'Ingreso' }] as const" :key="k.v"
            type="button" role="radio" :aria-checked="kind === k.v"
            class="press min-h-11 rounded-xl text-sm font-bold"
            :class="kind === k.v ? 'bg-surface text-ink shadow-card' : 'text-muted'"
            @click="kind = k.v"
          >{{ k.l }}</button>
        </div>

        <!-- Importe -->
        <div class="text-center">
          <label for="amount" class="sr-only">Importe en euros</label>
          <div class="flex items-baseline justify-center gap-2">
            <input
              id="amount" ref="amountEl" v-model="amountText" inputmode="decimal" autocomplete="off" placeholder="0,00"
              class="num w-48 bg-transparent text-center text-6xl font-extrabold tracking-tight outline-none placeholder:text-muted/40"
              :class="kind === 'expense' ? 'text-ink' : 'text-accent'" enterkeyhint="done"
            />
            <span class="text-3xl font-bold text-muted">€</span>
          </div>
          <div class="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2" role="group" aria-label="Importes rápidos">
            <Chip v-for="q in DEFAULTS.quickAmounts" :key="q" class="w-full justify-center" :selected="cents === q" @click="setQuick(q)">{{ q / 100 }} €</Chip>
          </div>
        </div>

        <p v-if="error" class="rounded-xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger" role="alert">{{ error }}</p>

        <!-- Sugerencias -->
        <div v-if="!editId && !amountText && suggestions.length" class="space-y-2">
          <p class="text-xs font-semibold tracking-wide text-muted uppercase">Repetir</p>
          <div class="flex flex-wrap gap-2">
            <Chip v-for="s in suggestions" :key="s.id" @click="applySuggestion(s)">{{ categoryLabel(s) }} · {{ formatCents(s.amountCents) }}</Chip>
          </div>
        </div>

        <!-- Categorías -->
        <div v-if="kind === 'expense'" class="space-y-3">
          <p class="text-xs font-semibold tracking-wide text-muted uppercase">Categoría</p>
          <div class="flex flex-wrap gap-2">
            <Chip v-for="o in options" :key="o.key" :selected="selectedKey === o.key" :icon="iconFor(o.icon)" :color="o.color" @click="pick(o)">{{ o.label }}</Chip>
            <Chip @click="moreOpen = true">Más…</Chip>
          </div>
          <div v-if="subOptions.length" class="space-y-2">
            <p class="text-xs font-semibold text-muted">
              Subcategoría de {{ categoryById.get(categoryId!)?.name }} <span class="font-normal">(opcional)</span>
            </p>
            <div class="flex flex-wrap gap-2">
              <Chip v-for="s in subOptions" :key="s.id" :selected="subcategoryId === s.id" @click="pickSub(s.id)">{{ s.name }}</Chip>
            </div>
          </div>
        </div>

        <!-- Fecha y nota -->
        <div class="space-y-3">
          <p class="text-xs font-semibold tracking-wide text-muted uppercase">Fecha</p>
          <div class="flex flex-wrap items-center gap-2">
            <Chip :selected="isToday" @click="date = todayISO()">Hoy</Chip>
            <Chip :selected="isYesterday" @click="date = addDaysISO(todayISO(), -1)">Ayer</Chip>
            <label class="relative">
              <span class="sr-only">Elegir otra fecha</span>
              <input v-model="date" type="date" class="min-h-11 rounded-full border border-line bg-surface-2 px-4 text-base font-semibold text-ink" />
            </label>
          </div>
          <p v-if="!isToday && !isYesterday" class="text-xs text-muted">{{ dayLabel(date) }}</p>
          <label class="block">
            <span class="sr-only">Descripción (opcional)</span>
            <input v-model="note" maxlength="120" placeholder="Descripción (opcional)" class="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base outline-none focus:border-accent" />
          </label>
        </div>

        <div v-if="editId" class="flex gap-3 pt-2">
          <button type="button" class="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-2 font-semibold" @click="duplicate"><Copy :size="18" aria-hidden="true" />Duplicar</button>
          <button type="button" class="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-danger/10 font-semibold text-danger" @click="remove"><Trash2 :size="18" aria-hidden="true" />Eliminar</button>
        </div>
      </div>

      <!-- Guardar, siempre visible -->
      <div class="pb-safe sticky bottom-0 border-t border-line bg-bg/95 px-5 pt-3 pb-3 backdrop-blur-xl">
        <button type="submit" :disabled="saving" class="press min-h-14 w-full rounded-2xl bg-accent text-lg font-extrabold text-on-accent disabled:opacity-60">
          {{ editId ? 'Guardar cambios' : 'Guardar' }}
        </button>
      </div>
    </form>

    <!-- Todas las categorías -->
    <Sheet v-if="moreOpen" title="Todas las categorías" @close="moreOpen = false">
      <div class="space-y-5">
        <div v-for="c in topCategories" :key="c.id">
          <button type="button" class="press flex min-h-11 items-center gap-2 text-base font-bold" @click="pickCategoryOnly(c.id)">
            <component :is="iconFor(c.icon)" :size="20" :style="{ color: c.color }" aria-hidden="true" />{{ c.name }}
          </button>
          <div v-if="subsOf(c.id).length" class="mt-1 flex flex-wrap gap-2 pl-7">
            <Chip v-for="s in subsOf(c.id)" :key="s.id" @click="pickFromSheet(c.id, s.id)">{{ s.name }}</Chip>
          </div>
        </div>
        <p v-if="!categories.length" class="text-sm text-muted">No hay categorías.</p>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.done { animation: pop 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes pop { from { transform: scale(0.4); opacity: 0; } }
</style>
