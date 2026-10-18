<!--
  RendererDisplayTable —— 明细表展示元素（业务方：三种数据源都要）

  它是 `useDisplayData` 的第一个消费方：三种数据源（静态 / 绑定字段 / 接口）在这一层完全同构，
  组件本身不关心数据从哪来——这正是把数据源抽成独立模块的意义。

  列与行键的处理：
  · 列：优先用字段配置的 `columns`（用户能改表头文案）；没配就按数据首行的键推导
  · 行键：DataTable 默认用 `seq` 定位行；数据里没有时**补一个内部键**，
    否则选中/编辑/持久化这类按行定位的能力会静默失效
-->
<script setup lang="ts">
import { computed } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import Empty from '@/components/data/Empty.vue'
import Skeleton from '@/components/data/Skeleton.vue'
import { useDisplayData } from '../display-data-source'
import type { ApiUrlPolicy } from '../api-url-guard'
import type { FormField } from '../types'

const props = defineProps<{
  /** 字段定义（含 dataSource / columns / rowKey） */
  field: FormField
  /** 整个表单的数据（`field` 模式从这里取被绑定字段的值） */
  formData?: Record<string, unknown>
  /** 外发 URL 策略（api 模式用；不传 = 只允许同源） */
  apiUrlPolicy?: ApiUrlPolicy
}>()

const { rows, loading, error } = useDisplayData({
  source: () => props.field.displaySource,
  formData: () => props.formData ?? {},
  apiUrlPolicy: () => props.apiUrlPolicy ?? {},
})

/** 内部行键字段名：数据自带的 rowKey 优先，否则补一个不动原数据的内部键 */
const INTERNAL_KEY = '__vcl_row_key'
const keyField = computed(() => props.field.rowKey ?? INTERNAL_KEY)

/** 列：配置优先；否则按首行推导。DataTable 的列必填 `title`（label 只是别名）。 */
const columns = computed(() => {
  const configured = props.field.columns
  if (configured && configured.length) {
    return configured.map((c) => ({ key: c.key, title: c.label ?? c.key }))
  }
  const first = rows.value[0]
  // 原始值行（['甲','乙'] 这类）：行会被包成 { value }，列也必须跟着给一列，
  // 否则表格"有行无列"——显示成空壳，比直接不渲染更让人困惑。
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
    // 原始值行（如字符串数组）：包成单列表格，好过整片空白
    return { [INTERNAL_KEY]: i, value: r }
  }),
)
</script>

<template>
  <div class="fb-display-table">
    <!-- 加载中：骨架而非空白，让用户知道在做事 -->
    <Skeleton v-if="loading" :rows="3" />
    <!-- 失败：明确说出原因（展示区空白最容易被当成"没数据"） -->
    <Empty v-else-if="error" :description="error" />
    <!-- 无数据 -->
    <Empty v-else-if="!tableRows.length" />
    <DataTable v-else :columns="columns" :data="tableRows" :row-key="keyField" />
  </div>
</template>
