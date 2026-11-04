import { liveQuery } from 'dexie'
import { onScopeDispose, ref, type Ref } from 'vue'

/** Suscribe una consulta de Dexie a una ref de Vue; se actualiza sola al cambiar IndexedDB. */
export function useLive<T>(querier: () => Promise<T>, initial: T): { data: Ref<T>; ready: Ref<boolean> } {
  const data = ref(initial) as Ref<T>
  const ready = ref(false)
  const sub = liveQuery(querier).subscribe({
    next: (v) => {
      data.value = v
      ready.value = true
    },
    error: (e) => console.error('liveQuery', e),
  })
  onScopeDispose(() => sub.unsubscribe())
  return { data, ready }
}
