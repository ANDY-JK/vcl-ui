<script setup lang="ts">
// SegmentedControlDemo — 分段控制器演示
// 重点展示「密排」用法：一排摊平，不换行、不开下拉
import { ref } from 'vue'
import SegmentedControl from '@/components/form/SegmentedControl.vue'

const granularity = ref<string>('day')
const viewMode = ref<string>('table')
const sizeSm = ref<string>('week')

const grainOptions = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月' },
  { value: 'quarter', label: '季' },
  { value: 'year', label: '年' },
]

const viewOptions = [
  { value: 'table', label: '表格', icon: 'table' },
  { value: 'chart', label: '图表', icon: 'chart-line' },
  { value: 'json', label: 'JSON', icon: 'braces' },
]

const sizeOptions = [
  { value: 'day', label: '日' },
  { value: 'week', label: '周' },
  { value: 'month', label: '月', disabled: true },
]
</script>

<template>
  <div class="demo-container">
    <h1>SegmentedControl 分段控制器</h1>
    <p class="desc">值语义的单选控件（<code>radiogroup</code>）。与 Tabs 的分工：Tabs 切视图，本组件切值。</p>

    <section class="demo-section">
      <h2>基础：一排摊平，不换行</h2>
      <SegmentedControl v-model="granularity" :options="grainOptions" aria-label="时间粒度" />
      <p class="result">当前值：{{ granularity }}</p>
    </section>

    <section class="demo-section">
      <h2>带图标 + 等分撑满（工具条内嵌）</h2>
      <SegmentedControl v-model="viewMode" :options="viewOptions" aria-label="视图模式" block />
      <p class="result">当前值：{{ viewMode }}</p>
    </section>

    <section class="demo-section">
      <h2>sm 尺寸 + 单项禁用</h2>
      <SegmentedControl v-model="sizeSm" :options="sizeOptions" aria-label="粒度" size="sm" />
      <p class="result">当前值：{{ sizeSm }}（「月」为禁用项，方向键会跳过）</p>
    </section>

    <section class="demo-section">
      <h2>整组禁用</h2>
      <SegmentedControl v-model="granularity" :options="grainOptions" aria-label="时间粒度" disabled />
    </section>
  </div>
</template>
