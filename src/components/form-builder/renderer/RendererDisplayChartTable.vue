<!--
  RendererDisplayChartTable —— 图表+表格上下组合（与表格/图表共用同一套数据源）

  与单图表的差别只在于把同一份 rows **喂两处**：上面按图表归一（完整 option 原样用，
  否则按行推导 categories/series），下面按表格归一（列配置优先/首行推导、行键缺失补内部键）。
  两处的推导逻辑分别与 RendererDisplayChart / RendererDisplayTable 完全同构——
  这里是消费方，不该出现第三种推导写法。
-->
<script setup lang="ts">
import { computed } from 'vue'
import ChartTable from '@/components/chart/ChartTable.vue'
import Empty from '@/components/data/Empty.vue'
import Skeleton from '@/components/data/Skeleton.vue'
import { useDisplayData } from '../display-data-source'
import type { ApiUrlPolicy } from '../api-url-guard'
import type { FormField } from '../types'

const props = defineProps<{
  /** 字段定义（含 displaySource / columns / rowKey） */
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

/** 数据是否已经是 echarts option（与图表渲染器同款判定） */
const isOption = computed(() => {
  const r = raw.value
  return !!r && typeof r === 'object' && !Array.isArray(r) && 'series' in (r as Record<string, unknown>)
})

/** 行 → 图表（与 RendererDisplayChart 同款推导） */
const chartOption = computed(() => {
  if (isOption.value) return raw.value as Record<string, unknown>
  const list = rows.value.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[]
  if (!list.length) return {}
  const keys = Object.keys(list[0])
  const catKey = keys.find((k) => typeof list[0][k] === 'string') ?? keys[0]
  const valueKeys = keys.filter((k) => k !== catKey && list.some((r) => typeof r[k] === 'number'))
  return {
    categories: list.map((r) => String(r[catKey] ?? '')),
    series: valueKeys.map((k) => ({ name: k, data: list.map((r) => r[k]) })),
  }
})

/** 内部行键（与 RendererDisplayTable 同款约定） */
const INTERNAL_KEY = '__vcl_row_key'
const keyField = computed(() => props.field.rowKey ?? INTERNAL_KEY)

/** 列：配置优先，否则按首行推导。DataTable 的列必填 `title`（label 只是别名）。 */
const columns = computed(() => {
  const configured = props.field.columns
  if (configured && configured.length) {
    return configured.map((c) => ({ key: c.key, title: c.label ?? c.key }))
  }
  const first = rows.value[0]
  if (first === null || typeof first !== 'object' || Array.isArray(first)) {
    return rows.value.length ? [{ key: 'value', title: props.field.label || 'value' }] : []
  }
  return Object.keys(first as Record<string, unknown>).map((k) => ({ key: k, title: k }))
})

/** 行：确保有唯一键（缺则按序补内部键，不改动原始数据对象） */
const tableRows = computed(() =>
  rows.value.map((r, i) => {
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      const obj = r as Record<string, unknown>
      if (obj[keyField.value] !== undefined) return obj
      return { ...obj, [INTERNAL_KEY]: i }
    }
    return { [INTERNAL_KEY]: i, value: r }
  }),
)
</script>

<template>
  <div class="fb-display-chart-table">
    <Skeleton v-if="loading" :rows="4" />
    <Empty v-else-if="error" :description="error" />
    <Empty v-else-if="!rows.length" />
    <ChartTable
      v-else
      :option="chartOption"
      :columns="columns"
      :table-data="tableRows"
      :table-title="field.label"
      height="300px"
    />
  </div>
</template>
