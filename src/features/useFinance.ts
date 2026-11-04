import { computed } from 'vue'
import { planned, settings, txs } from '@/data/appData'
import { addMonths, monthOf, todayISO } from '@/domain/dates'
import { forecast, forecastAtMonth, goalProgress, nextMonthsCapacity, trackStatus } from '@/engine/goals'


/** Vista calculada de las finanzas, derivada del estado local. Sin efectos secundarios. */
export function useFinance() {
  const today = todayISO()
  const fc = computed(() => forecast(txs.value, settings.value, planned.value, today))
  const track = computed(() => trackStatus(txs.value, settings.value, fc.value))
  const goals = computed(() => ({
    min: goalProgress(settings.value.goals.min, fc.value, settings.value, today),
    main: goalProgress(settings.value.goals.main, fc.value, settings.value, today),
    stretch: goalProgress(settings.value.goals.stretch, fc.value, settings.value, today),
  }))
  const capacity = computed(() => nextMonthsCapacity(fc.value))
  const horizon = computed(() => {
    const cm = monthOf(today)
    return {
      endOfMonth: fc.value.endOfMonth,
      in3: forecastAtMonth(fc.value, addMonths(cm, 3)),
      in6: forecastAtMonth(fc.value, addMonths(cm, 6)),
      target: forecastAtMonth(fc.value, settings.value.targetMonth),
    }
  })
  return { today, fc, track, goals, capacity, horizon }
}
