<script setup lang="ts">
// ⛔ 保护 — 骨架屏，禁止：流光动画时序、行高/头像比例改动
//    需我确认：loading 独立控制粒度、圆角形态扩展
import { computed } from 'vue'

type AvatarSize = boolean | number | string

interface Props {
  /** 加载中显示骨架；false 时渲染默认插槽的真实内容 */
  loading?: boolean
  /** 文本行数（title 之外） */
  rows?: number
  /** 流光动画（prefers-reduced-motion 下自动禁用） */
  animated?: boolean
  /** 头像：false 无 | true 默认 40px | number 像素 | 'sm'|'md'|'lg' 或任意 CSS 尺寸 */
  avatar?: AvatarSize
  /** 首行加宽标题 */
  title?: boolean
  /** 自定义骨架块宽度 */
  width?: string
  /** 自定义骨架块高度 */
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: true,
  rows: 3,
  animated: true,
  avatar: false,
  title: true,
})

const AVATAR_MAP: Record<string, string> = { sm: '32px', md: '40px', lg: '56px' }

const avatarSize = computed(() => {
  const a = props.avatar
  if (typeof a === 'number') return `${a}px`
  if (typeof a === 'string') return AVATAR_MAP[a] ?? a
  return a ? '40px' : ''
})

const blockStyle = computed(() => {
  const style: Record<string, string> = {}
  if (props.width) style.width = props.width
  if (props.height) style.height = props.height
  return style
})

/** 行宽：标题 40%，最后一行 60%，其余 100% */
const rowList = computed(() => {
  const n = Math.max(0, props.rows)
  return Array.from({ length: n }, (_, i) => ({ key: i, width: i === n - 1 ? '60%' : '100%' }))
})
</script>

<template>
  <div v-if="loading" class="skel" :class="{ 'skel-animated': animated }" :style="blockStyle" role="status" aria-label="加载中">
    <span v-if="avatarSize" class="skel-avatar" :style="{ width: avatarSize, height: avatarSize }" />
    <div class="skel-body">
      <span v-if="title" class="skel-line skel-title" />
      <span v-for="row in rowList" :key="row.key" class="skel-line" :style="{ width: row.width }" />
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
/* 灰阶骨架块 — 全 scoped，无 :deep 泄漏 */
.skel {
  display: flex;
  gap: clamp(10px, 1.5vw, 14px);
  width: 100%;
}
.skel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1.5vw, 12px);
  min-width: 0;
}
.skel-line {
  display: block;
  height: clamp(12px, 1.6vw, 14px);
  border-radius: var(--radius-sm);
  background: var(--color-bg-alt);
}
.skel-title {
  width: 40%;
  height: clamp(14px, 1.8vw, 16px);
}
.skel-avatar {
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-bg-alt);
}

/* 流光动画 — linear-gradient 背景位移 */
.skel-animated .skel-line,
.skel-animated .skel-avatar {
  background: linear-gradient(90deg, var(--color-bg-alt) 25%, var(--color-border) 50%, var(--color-bg-alt) 75%);
  background-size: 200% 100%;
  animation: skel-shimmer 1.5s infinite;
}
@keyframes skel-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 无障碍：系统关闭动效时停止流光 */
@media (prefers-reduced-motion: reduce) {
  .skel-animated .skel-line,
  .skel-animated .skel-avatar {
    animation: none;
  }
}
</style>
