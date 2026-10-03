<script setup lang="ts">
// ⛔ 保护 — 骨架屏，禁止：流光动画时序、行高/头像比例改动
//    需我确认：loading 独立控制粒度、圆角形态扩展
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

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

// 内置档位（sm/md/lg）是组件自己的设计尺寸，走等比缩放——由 CSS 类承载而不是内联 style：
// 内联的 `calc(Npx * var(--vcl-scale))` 在部分测试环境（happy-dom）解析不了会被整条丢弃，
// 断言无从下手；落成类名既可测，也让尺寸与其余样式同处一张表。
// 宿主显式传的长度（数字串 / 任意 CSS 长度）是宿主自己的尺寸，原样走内联 style 透传。
const AVATAR_NAMED = new Set(['sm', 'md', 'lg'])

const avatarNamed = computed(() => {
  const a = props.avatar
  if (a === true) return 'md'
  return typeof a === 'string' && AVATAR_NAMED.has(a) ? a : ''
})

const avatarSize = computed(() => {
  const a = props.avatar
  if (avatarNamed.value) return ''
  if (typeof a === 'number') return `${a}px`
  if (typeof a === 'string') {
    // '48' 这类无单位数字串是模板里 avatar="48" 的常见写法，直接透传会得到非法 CSS 使骨架块塌成 0×0
    if (/^\d+(\.\d+)?$/.test(a)) return `${a}px`
    return a
  }
  return ''
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
  <div
    v-if="loading"
    class="skel"
    :class="{ 'skel-animated': animated }"
    :style="blockStyle"
    role="status"
    :aria-label="t('skeleton.loading')"
  >
    <span
      v-if="avatarNamed || avatarSize"
      class="skel-avatar"
      :class="avatarNamed ? `skel-avatar-${avatarNamed}` : ''"
      :style="avatarSize ? { width: avatarSize, height: avatarSize } : undefined"
    />
    <div class="skel-body">
      <span v-if="title" class="skel-line skel-title" />
      <span v-for="row in rowList" :key="row.key" class="skel-line" :style="{ width: row.width }" />
    </div>
  </div>
  <!-- @slot default: 非骨架态的自定义加载内容（即待展示内容本身） -->
  <slot v-else />
</template>

<style src="./skeleton-scoped.css" scoped></style>
