<script setup lang="ts">
import { use } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'
import { themeTick } from './theme'

use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

defineProps<{ option: EChartsOption; height?: number; label: string }>()
</script>

<template>
  <VChart :key="themeTick" :option="option" autoresize role="img" :aria-label="label" :style="{ height: (height ?? 220) + 'px', width: '100%' }" />
</template>
