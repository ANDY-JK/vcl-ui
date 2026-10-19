<!--
  RendererDisplayResult —— 结果态展示元素（纯静态，无需数据源）

  与 empty/skeleton 同属"告知型"元素：不承载数据、不进提交数据，只把一段结论摆在页面上
  （提交成功、审核未通过、404 说明…）。

  为什么 status 单独一个属性而不是复用 tone：两者的取值域不同（Result 有 success/error/
  info/warning/404/empty，tone 是 default/primary/success/warning/danger），硬映射会让
  "404" 和 "empty" 这类无对应色的状态被悄悄压成 default，用户看到的是错误颜色的提示。
-->
<script setup lang="ts">
import Result from '@/components/feedback/Result.vue'
import type { FormField } from '../types'

const props = defineProps<{
  /** 字段定义（status / text / hint） */
  field: FormField
}>()

/** 兜底 success：未配 status 时给一个"正常"的结果态，而不是空白 */
const status = (): 'success' | 'error' | 'info' | 'warning' | '404' | 'empty' =>
  (props.field as { resultStatus?: 'success' | 'error' | 'info' | 'warning' | '404' | 'empty' }).resultStatus ??
  'success'
</script>

<template>
  <div class="fb-display-result">
    <Result :status="status()" :title="field.label" :description="field.hint || ''" />
  </div>
</template>
