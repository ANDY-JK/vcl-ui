<script setup lang="ts">
import { reportError } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 按钮，禁止：clamp() 尺寸 → px，variant/size 枚举修改
//    需我确认：新增 variant、loading 状态行为
import { ref, watch, onErrorCaptured } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()
const _e = ref<Error | null>(null)
onErrorCaptured((e: Error) => {
  reportError('[Button] 异常:', e.message)
  _e.value = e
  return false
})

interface Props {
  /** 按钮文字（与 default 插槽二选一，插槽优先） */
  text?: string
  /** 语义形态：primary 实心主色 | secondary 实心次色 | outline 描边 | danger 危险 | ghost 幽灵 */
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
  /** 尺寸档位（默认 'md'） */
  size?: 'sm' | 'md' | 'lg'
  /** 前置图标（IconSvg 图标名） */
  icon?: string
  /** 禁用 */
  disabled?: boolean
  /** 加载态（转圈 + 禁点，不改变宽度） */
  loading?: boolean
  /** 块级（撑满整行） */
  block?: boolean
  /** 文字后显示箭头（「下一步」类场景） */
  showArrow?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  block: false,
  showArrow: false,
})

// 入参变化 = 插槽内容已变：清错误态让按钮重渲染一次，否则 ⚠ 降级提示会永久卡死（子组件仍坏会再次捕获，不成环）
watch(
  () => ({ ...props }),
  () => (_e.value = null),
)

const emit = defineEmits<{
  /** 点击（loading/disabled 期间不触发） */
  click: [e: MouseEvent]
}>()
</script>

<template>
  <span v-if="_e" style="color: var(--vcl-color-danger-on-surface); font-size: var(--vcl-fs-12)"
    >⚠ {{ t('basic.buttonError') }}</span
  >
  <button
    v-else
    type="button"
    class="base-btn"
    :class="[`btn-${variant}`, `btn-${size}`, { block, loading }]"
    :disabled="disabled || loading"
    :aria-label="!text && !('default' in $slots) && icon ? icon : undefined"
    :aria-busy="loading"
    @click="emit('click', $event)"
  >
    <span v-if="loading" class="btn-spinner">
      <IconSvg type="loader" :size="size" color="currentColor" />
    </span>
    <IconSvg v-else-if="icon" :type="icon" :size="size" color="currentColor" />
    <span v-if="text" class="btn-text">{{ text }}</span>
    <!-- @slot default: 按钮内容（文字 + 图标组合亦可） -->
    <slot />
    <svg
      v-if="showArrow"
      class="btn-arrow"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </button>
</template>

<style src="./button-scoped.css" scoped></style>
