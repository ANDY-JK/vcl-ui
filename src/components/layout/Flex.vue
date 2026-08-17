<script setup lang="ts">
// Flex — 弹性布局容器（已合并原 Space 组件功能：direction='horizontal'/'vertical' 自动映射）
import { computed } from 'vue'
import type { CSSProperties } from 'vue'

interface Props {
  /** 排列方向：'row'/'column'（Flex 原生）或 'horizontal'/'vertical'（Space 兼容） */
  direction?: 'row' | 'column' | 'horizontal' | 'vertical'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
  gap?: string
  wrap?: boolean
  flex?: string
  inline?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  direction: 'row',
  justify: 'start',
  align: 'stretch',
  gap: 'var(--space-2)',
  wrap: false,
  flex: '1',
  inline: false,
})

const justifyMap: Record<string, string> = {
  start: 'flex-start', end: 'flex-end', center: 'center',
  between: 'space-between', around: 'space-around', evenly: 'space-evenly',
}

const alignMap: Record<string, string> = {
  start: 'flex-start', end: 'flex-end', center: 'center',
  stretch: 'stretch', baseline: 'baseline',
}

const flexStyle = computed<CSSProperties>(() => ({
  display: props.inline ? 'inline-flex' : 'flex',
  // Space 兼容：horizontal → row, vertical → column
  flexDirection: props.direction === 'vertical' ? 'column' : (props.direction === 'horizontal' ? 'row' : props.direction),
  justifyContent: justifyMap[props.justify] || props.justify,
  alignItems: alignMap[props.align] || props.align,
  gap: props.gap,
  flexWrap: props.wrap ? 'wrap' : 'nowrap',
  flex: props.flex,
  minWidth: 0,
  minHeight: 0,
}))
</script>

<template>
  <div class="flex" :style="flexStyle">
    <slot />
  </div>
</template>

<style scoped>
.flex { box-sizing: border-box; width: 100%; }
</style>
