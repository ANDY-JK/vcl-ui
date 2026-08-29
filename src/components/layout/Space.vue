<script setup lang="ts">
// Space — 已合并到 Flex，此文件为语法糖（direction='horizontal'/'vertical' → Flex）
// 推荐直接使用 Flex 组件：<Flex direction="horizontal" gap="8px" />
import { onMounted } from 'vue'
import Flex from './Flex.vue'
import { warnOnce } from '@/components/_internal/warnOnce'

interface Props {
  /** 排列方向，默认 'horizontal' */
  direction?: 'horizontal' | 'vertical'
  /** 间距（CSS 值），默认 'var(--space-2)' */
  gap?: string
  /** 对齐方式，默认 'start' */
  align?: 'start' | 'center' | 'end' | 'stretch'
  /** 是否换行，默认 false */
  wrap?: boolean
}

withDefaults(defineProps<Props>(), {
  direction: 'horizontal',
  gap: 'var(--space-2)',
  align: 'start',
  wrap: false,
})

onMounted(() => {
  if (import.meta.env.DEV) {
    warnOnce('Space', '已废弃，请直接使用 <Flex direction="..." gap="..." /> 代替')
  }
})
</script>

<template>
  <Flex :direction="direction" :gap="gap" :align="align" :wrap="wrap">
    <slot />
  </Flex>
</template>
