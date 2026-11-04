<script setup lang="ts">
import { computed, ref } from 'vue'
import { CalendarClock, Plus } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import Card from '@/components/ui/Card.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Sheet from '@/components/ui/Sheet.vue'
import { categoryById, planned, topCategories } from '@/data/appData'
import { plannedRepo } from '@/data/repositories'
import { dayLabel, todayISO } from '@/domain/dates'
import { formatCents, parseEuros } from '@/domain/money'
import type { PlannedExpense } from '@/domain/types'
import { showToast } from '@/lib/toast'

const router = useRouter()
const adding = ref(false)
const editingId = ref<string | null>(null)
const name = ref('')
const amount = ref('')
const date = ref(todayISO())
const catId = ref('')
const error = ref('')

const sorted = computed(() => [...planned.value].sort((a, b) => a.plannedOn.localeCompare(b.plannedOn)))
const pending = computed(() => sorted.value.filter((p) => p.status === 'pending'))
const closed = computed(() => sorted.value.filter((p) => p.status !== 'pending'))
const pendingTotal = computed(() => pending.value.reduce((a, p) => a + p.estimatedCents, 0))

function open(p?: PlannedExpense) {
  editingId.value = p?.id ?? null
  name.value = p?.name ?? ''
  amount.value = p ? String(p.estimatedCents / 100).replace('.', ',') : ''
  date.value = p?.plannedOn ?? todayISO()
  catId.value = p?.categoryId ?? ''
  error.value = ''
  adding.value = true
}
async function save() {
  const c = parseEuros(amount.value)
  if (!name.value.trim()) { error.value = 'Pon un nombre'; return }
  if (c === null || c <= 0) { error.value = 'Importe no válido'; return }
  if (!date.value) { error.value = 'Elige una fecha'; return }
  const payload = { name: name.value, estimatedCents: c, plannedOn: date.value, categoryId: catId.value || null, subcategoryId: null }
  try {
    if (editingId.value) await plannedRepo.update(editingId.value, { ...payload, name: name.value.trim() })
    else await plannedRepo.add(payload)
    adding.value = false
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar'
  }
}
async function remove(p: PlannedExpense) {
  await plannedRepo.remove(p.id)
  showToast('Gasto planificado eliminado')
}
const statusLabel = { pending: 'Pendiente', done: 'Realizado', cancelled: 'Cancelado' } as const
const field = 'mt-1 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-base outline-none focus:border-accent'
</script>

<template>
  <div class="space-y-4">
    <Card>
      <h2 class="font-bold">Gastos futuros pendientes</h2>
      <p class="num mt-1 text-2xl font-extrabold">{{ formatCents(pendingTotal) }}</p>
      <p class="mt-1 text-sm text-muted">Se descuentan en la previsión en su mes. Al registrar el gasto real se enlazan y no se cuentan dos veces.</p>
    </Card>

    <button type="button" class="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-on-accent" @click="open()"><Plus :size="20" aria-hidden="true" />Planificar un gasto</button>

    <EmptyState v-if="!planned.length" :icon="CalendarClock" title="Nada planificado" text="Añade viajes, ropa, botas o regalos para que cuenten en tus previsiones." />

    <Card v-for="p in pending" :key="p.id">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="truncate font-bold">{{ p.name }}</h3>
          <p class="text-sm text-muted">{{ dayLabel(p.plannedOn) }}<template v-if="p.categoryId"> · {{ categoryById.get(p.categoryId)?.name }}</template></p>
        </div>
        <span class="num font-bold">{{ formatCents(p.estimatedCents) }}</span>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
        <button type="button" class="press min-h-11 rounded-xl bg-accent text-on-accent" @click="router.push({ path: '/anadir', query: { planificado: p.id } })">Registrar</button>
        <button type="button" class="press min-h-11 rounded-xl bg-surface-2" @click="open(p)">Editar</button>
        <button type="button" class="press min-h-11 rounded-xl bg-surface-2 text-muted" @click="plannedRepo.setStatus(p.id, 'cancelled')">Cancelar</button>
      </div>
    </Card>

    <section v-if="closed.length" class="space-y-2">
      <h2 class="text-xs font-semibold tracking-wide text-muted uppercase">Cerrados</h2>
      <div v-for="p in closed" :key="p.id" class="flex min-h-14 items-center gap-3 rounded-2xl border border-line px-4 text-sm">
        <span class="flex-1 truncate" :class="p.status === 'cancelled' ? 'text-muted line-through' : ''">{{ p.name }}</span>
        <span class="num text-muted">{{ formatCents(p.estimatedCents) }}</span>
        <span class="text-xs font-semibold text-muted">{{ statusLabel[p.status] }}</span>
        <button v-if="p.status === 'cancelled'" type="button" class="press min-h-11 px-2 font-semibold text-accent" @click="plannedRepo.setStatus(p.id, 'pending')">Reactivar</button>
        <button type="button" class="press min-h-11 px-2 font-semibold text-danger" @click="remove(p)">Quitar</button>
      </div>
    </section>

    <Sheet v-if="adding" :title="editingId ? 'Editar gasto planificado' : 'Planificar un gasto'" @close="adding = false">
      <form class="space-y-3" novalidate @submit.prevent="save">
        <label class="block"><span class="text-sm text-muted">Nombre</span><input v-model="name" maxlength="60" placeholder="Viaje, botas, regalo…" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Importe estimado (€)</span><input v-model="amount" inputmode="decimal" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Fecha prevista</span><input v-model="date" type="date" :class="field" /></label>
        <label class="block"><span class="text-sm text-muted">Categoría</span>
          <select v-model="catId" :class="field"><option value="">Sin categoría</option><option v-for="c in topCategories" :key="c.id" :value="c.id">{{ c.name }}</option></select></label>
        <p v-if="error" class="text-sm font-semibold text-danger" role="alert">{{ error }}</p>
        <button type="submit" class="press min-h-14 w-full rounded-2xl bg-accent font-bold text-on-accent">Guardar</button>
      </form>
    </Sheet>
  </div>
</template>
