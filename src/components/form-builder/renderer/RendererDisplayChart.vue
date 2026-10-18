<!--
  RendererDisplayChart —— 图表展示元素

  与明细表共用同一套数据源（静态 / 绑定字段 / 接口），差别只在**数据形态的归一**：
  · 若数据本身就是 echarts 的 option 形态（含 series）→ 原样交给 Chart，用户拿到完全控制权
  · 否则按行数据推导：第一个非数值列做类目轴，数值列各成一条 series

  刻意不做的事：不猜用户的图表类型（折线/柱状/饼图由 option 决定）。猜错比不猜更糟——
  用户会以为"这破组件画不出我要的图"，而真相是它替用户做了个错的决定。
-->
<script setup lang="ts">
import { computed } from 'vue'
import Chart from '@/components/chart/Chart.vue'
import Empty from '@/components/data/Empty.vue'
import Skeleton from '@/components/data/Skeleton.vue'
import { useDisplayData } from '../display-data-source'
import type { ApiUrlPolicy } from '../api-url-guard'
import type { FormField } from '../types'

const props = defineProps<{
  /** 字段定义（含 displaySource） */
  field: FormField
  /** 整个表单的数据（`field` 模式取值用） */
  formData?: Record<string, unknown>
  /** 外发 URL 策略（api 模式用；不传 = 只允许同源） */
  apiUrlPolicy?: ApiUrlPolicy
}>()

const { rows, raw, loading, error } = useDisplayData({
  source: () => props.field.displaySource,
  formData: () => props.formData ?? {},
  apiUrlPolicy: () => props.apiUrlPolicy ?? {},
})

/** 数据是否已经是 echarts option（用户自己写全了配置） */
const isOption = computed(() => {
  const r = raw.value
  return !!r && typeof r === 'object' && !Array.isArray(r) && 'series' in (r as Record<string, unknown>)
})

/** 由行数据推导出的 option（仅在数据不是完整 option 时使用） */
const derivedOption = computed(() => {
  const list = rows.value.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[]
  if (!list.length) return {}
  const keys = Object.keys(list[0])
  // 类目轴取第一个非数值列；数值列各成一条 series
  const catKey = keys.find((k) => typeof list[0][k] === 'string') ?? keys[0]
  const valueKeys = keys.filter((k) => k !== catKey && list.some((r) => typeof r[k] === 'number'))
  return {
    categories: list.map((r) => String(r[catKey] ?? '')),
    series: valueKeys.map((k) => ({ name: k, data: list.map((r) => r[k]) })),
  }
})

const chartOption = computed(() => (isOption.value ? (raw.value as Record<string, unknown>) : derivedOption.value))
</script>

<template>
  <div class="fb-display-chart">
    <Skeleton v-if="loading" :rows="4" />
    <Empty v-else-if="error" :description="error" />
    <Empty v-else-if="!rows.length" />
    <Chart v-else :option="chartOption" height="320px" />
  </div>
</template>
