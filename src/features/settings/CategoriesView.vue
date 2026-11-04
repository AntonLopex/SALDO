<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown, ArrowUp, ChevronLeft, Pencil, Plus, Star } from 'lucide-vue-next'
import Sheet from '@/components/ui/Sheet.vue'
import { categories, dataReady, favorites, subsOf, topCategories } from '@/data/appData'
import { categoryRepo } from '@/data/repositories'
import type { Category } from '@/domain/types'
import { CATEGORY_COLORS, ICONS, iconFor } from '@/lib/icons'
import { showToast } from '@/lib/toast'

// Editor: id=null → crear (con parentId); id definido → editar
const editing = ref<{ id: string | null; parentId: string | null } | null>(null)
const name = ref('')
const icon = ref('tag')
const color = ref(CATEGORY_COLORS[0]!)
const error = ref('')
const confirmDelete = ref(false)

function openNew(parentId: string | null) {
  const parent = parentId ? categories.value.find((c) => c.id === parentId) : undefined
  editing.value = { id: null, parentId }
  name.value = ''
  icon.value = parent?.icon ?? 'tag'
  color.value = parent?.color ?? CATEGORY_COLORS[0]!
  error.value = ''
  confirmDelete.value = false
}
function openEdit(c: Category) {
  editing.value = { id: c.id, parentId: c.parentId }
  name.value = c.name
  icon.value = c.icon
  color.value = c.color
  error.value = ''
  confirmDelete.value = false
}
async function save() {
  if (!editing.value) return
  try {
    if (editing.value.id) await categoryRepo.update(editing.value.id, { name: name.value, icon: icon.value, color: color.value })
    else await categoryRepo.create({ parentId: editing.value.parentId, name: name.value, icon: icon.value, color: color.value })
    editing.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo guardar'
  }
}
async function remove() {
  if (!editing.value?.id) return
  if (!confirmDelete.value) { confirmDelete.value = true; return }
  await categoryRepo.archive(editing.value.id)
  editing.value = null
  showToast('Categoría eliminada. Tu historial se conserva.')
}
const move = (i: number, d: -1 | 1) => {
  const a = favorites.value[i]
  const b = favorites.value[i + d]
  if (a && b) void categoryRepo.swapFavOrder(a, b)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-1">
      <RouterLink to="/ajustes" class="press grid size-11 place-items-center rounded-full bg-surface-2" aria-label="Volver a ajustes"><ChevronLeft :size="20" aria-hidden="true" /></RouterLink>
      <h1 class="text-2xl font-extrabold">Categorías</h1>
    </div>

    <div v-if="!dataReady" class="skeleton h-64 rounded-3xl" />
    <template v-else>
      <section class="rounded-card border border-line bg-surface p-5 shadow-card">
        <h2 class="font-bold">Favoritas</h2>
        <p class="text-sm text-muted">Aparecen primero al registrar un gasto.</p>
        <ul class="mt-2 divide-y divide-line">
          <li v-for="(f, i) in favorites" :key="f.id" class="flex min-h-14 items-center gap-3">
            <component :is="iconFor(f.icon)" :size="20" :style="{ color: f.color }" aria-hidden="true" />
            <span class="flex-1 font-semibold">{{ f.name }}</span>
            <button type="button" class="press grid size-11 place-items-center text-muted disabled:opacity-30" :disabled="i === 0" :aria-label="`Subir ${f.name}`" @click="move(i, -1)"><ArrowUp :size="18" aria-hidden="true" /></button>
            <button type="button" class="press grid size-11 place-items-center text-muted disabled:opacity-30" :disabled="i === favorites.length - 1" :aria-label="`Bajar ${f.name}`" @click="move(i, 1)"><ArrowDown :size="18" aria-hidden="true" /></button>
          </li>
          <li v-if="!favorites.length" class="py-3 text-sm text-muted">Marca categorías con la estrella para verlas aquí.</li>
        </ul>
      </section>

      <section v-for="c in topCategories" :key="c.id" class="rounded-card border border-line bg-surface p-5 shadow-card">
        <div class="flex items-center gap-2">
          <component :is="iconFor(c.icon)" :size="22" :style="{ color: c.color }" aria-hidden="true" />
          <h2 class="flex-1 font-bold">{{ c.name }}</h2>
          <button type="button" class="press grid size-11 place-items-center" :aria-pressed="c.isFavorite" :aria-label="`Favorita: ${c.name}`" @click="categoryRepo.setFavorite(c.id, !c.isFavorite)">
            <Star :size="20" :class="c.isFavorite ? 'fill-warning text-warning' : 'text-muted'" aria-hidden="true" />
          </button>
          <button type="button" class="press grid size-11 place-items-center text-muted" :aria-label="`Editar ${c.name}`" @click="openEdit(c)"><Pencil :size="18" aria-hidden="true" /></button>
        </div>
        <ul class="divide-y divide-line">
          <li v-for="s in subsOf(c.id)" :key="s.id" class="flex min-h-12 items-center gap-2 pl-8">
            <span class="flex-1 text-sm font-semibold">{{ s.name }}</span>
            <button type="button" class="press grid size-11 place-items-center" :aria-pressed="s.isFavorite" :aria-label="`Favorita: ${s.name}`" @click="categoryRepo.setFavorite(s.id, !s.isFavorite)">
              <Star :size="18" :class="s.isFavorite ? 'fill-warning text-warning' : 'text-muted'" aria-hidden="true" />
            </button>
            <button type="button" class="press grid size-11 place-items-center text-muted" :aria-label="`Editar ${s.name}`" @click="openEdit(s)"><Pencil :size="16" aria-hidden="true" /></button>
          </li>
        </ul>
        <button type="button" class="press mt-1 flex min-h-11 items-center gap-1 pl-8 text-sm font-semibold text-accent" @click="openNew(c.id)"><Plus :size="16" aria-hidden="true" />Subcategoría</button>
      </section>

      <button type="button" class="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-bold text-on-accent" @click="openNew(null)"><Plus :size="20" aria-hidden="true" />Nueva categoría</button>
    </template>

    <Sheet v-if="editing" :title="editing.id ? 'Editar' : editing.parentId ? 'Nueva subcategoría' : 'Nueva categoría'" @close="editing = null">
      <form class="space-y-4" novalidate @submit.prevent="save">
        <label class="block"><span class="text-sm font-semibold text-muted">Nombre</span>
          <input v-model="name" maxlength="40" class="mt-1 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 outline-none focus:border-accent" /></label>
        <fieldset><legend class="text-sm font-semibold text-muted">Icono</legend>
          <div class="mt-1 grid grid-cols-6 gap-2">
            <button v-for="(comp, key) in ICONS" :key="key" type="button" class="press grid size-11 place-items-center rounded-xl" :class="icon === key ? 'bg-accent text-on-accent' : 'bg-surface-2'" :aria-label="String(key)" :aria-pressed="icon === key" @click="icon = String(key)">
              <component :is="comp" :size="20" aria-hidden="true" />
            </button>
          </div>
        </fieldset>
        <fieldset><legend class="text-sm font-semibold text-muted">Color</legend>
          <div class="mt-1 flex flex-wrap gap-3">
            <button v-for="col in CATEGORY_COLORS" :key="col" type="button" class="press size-11 rounded-full ring-offset-2 ring-offset-surface" :class="color === col ? 'ring-2 ring-ink' : ''" :style="{ background: col }" :aria-label="`Color ${col}`" :aria-pressed="color === col" @click="color = col" />
          </div>
        </fieldset>
        <p v-if="error" class="text-sm font-semibold text-danger" role="alert">{{ error }}</p>
        <button type="submit" class="press min-h-14 w-full rounded-2xl bg-accent font-bold text-on-accent">Guardar</button>
        <button v-if="editing.id" type="button" class="press min-h-12 w-full rounded-2xl font-semibold text-danger" @click="remove">
          {{ confirmDelete ? 'Confirmar: eliminar (el historial se conserva)' : 'Eliminar' }}
        </button>
      </form>
    </Sheet>
  </div>
</template>
