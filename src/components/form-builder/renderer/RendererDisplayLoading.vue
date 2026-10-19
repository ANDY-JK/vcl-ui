<!--
  RendererDisplayLoading —— 加载态展示元素（纯静态，无需数据源）

  与 skeleton 的区别：skeleton 是"占位骨架"（预示内容将要出现的位置），Loading 是
  "正在处理"的明确指示。两者都属告知型元素，不进提交数据。

  刻意**不透传 fullscreen / overlay**：这两个开关是给"整页/整块操作"用的（会锁 body 滚动、
  盖住页面）。表单里的一个展示元素把自己铺成全屏遮罩，等于用户填到一半被自己的设计挡住——
  这是渲染器该替用户守住的边界，不是暴露成配置项。
-->
<script setup lang="ts">
import Loading from '@/components/feedback/Loading.vue'
import type { FormField } from '../types'

const props = defineProps<{
  /** 字段定义（可选 variant/size 覆盖） */
  field: FormField
}>()

const variant = (): 'spinner' | 'skeleton' =>
  (props.field as { loadingVariant?: 'spinner' | 'skeleton' }).loadingVariant ?? 'spinner'
const size = (): 'sm' | 'md' | 'lg' => (props.field as { size?: 'sm' | 'md' | 'lg' }).size ?? 'md'
</script>

<template>
  <div class="fb-display-loading">
    <!-- 明确关掉全屏与遮罩：展示元素只占自己那一格 -->
    <Loading :variant="variant()" :size="size()" :fullscreen="false" :overlay="false" />
  </div>
</template>
