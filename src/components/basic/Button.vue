<script setup lang="ts">
// ⛔ 保护 — 按钮，禁止：clamp() 尺寸 → px，variant/size 枚举修改
//    需我确认：新增 variant、loading 状态行为
import { ref, watch, onErrorCaptured } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()
const _e = ref<Error | null>(null)
onErrorCaptured((e: Error) => {
  console.error('[Button] 异常:', e.message)
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
  <span v-if="_e" style="color: var(--color-danger); font-size: 12px">⚠ {{ t('basic.buttonError') }}</span>
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

<style scoped>
.base-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1.5px solid transparent;
  border-radius: var(--radius-md);
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.base-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 尺寸 — 弹性高度，移动端不小于 44px 触控标准 */
.btn-sm {
  height: clamp(30px, 5vw, 32px);
  padding: 0 clamp(var(--space-2), 1.5vw, 12px);
  font-size: clamp(11px, 1.5vw, 15px);
  border-radius: var(--radius-sm);
}
.btn-md {
  height: var(--ctrl-height, clamp(38px, 6vw, 42px));
  padding: 0 var(--ctrl-padding-x, clamp(12px, 2vw, 16px));
  font-size: var(--ctrl-font-size, clamp(12px, 1.8vw, 15px));
  border-radius: var(--ctrl-radius, var(--radius-md));
}
.btn-lg {
  height: calc(var(--ctrl-height, clamp(38px, 6vw, 42px)) + 6px);
  padding: 0 calc(var(--ctrl-padding-x, clamp(14px, 2.5vw, 20px)) + 4px);
  font-size: calc(var(--ctrl-font-size, clamp(13px, 2vw, 15px)) + 1px);
}

/* 变体 */
.btn-primary {
  /* 同 btn-danger 口径：实心底用 -solid 令牌而非基色。
     主色基色压白字实测 4.28，低于 AA 4.5；solid 档 5.84 达标。 */
  background: var(--color-primary-solid);
  color: white;
  border-color: var(--color-primary-solid);
}
.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-solid-hover);
  border-color: var(--color-primary-solid-hover);
}

.btn-secondary {
  background: var(--color-bg-alt);
  color: var(--color-text);
  border-color: var(--color-border);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--color-border);
}

.btn-outline {
  /* 描边按钮的文字/边框用 solid 档：主色基色在白底上实测对比度 4.28（低于 AA 4.5）；
     solid 档 5.84 达标且仍在同一主色相，视觉无感差 */
  background: transparent;
  color: var(--color-primary-solid);
  border-color: var(--color-primary-solid);
}
.btn-outline:hover:not(:disabled) {
  background: var(--color-primary-light);
}

.btn-danger {
  /* 用 --color-danger-solid（实心底色专用）而非 --color-danger：
     后者在暗色下会被提亮为 #f87171，压白字实测对比度仅 2.77（不达标） */
  background: var(--color-danger-solid, var(--color-danger));
  color: white;
  border-color: var(--color-danger-solid, var(--color-danger));
}
.btn-danger:hover:not(:disabled) {
  background: var(--color-danger-solid-hover, var(--color-danger-hover));
  border-color: var(--color-danger-solid-hover, var(--color-danger-hover));
}

.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border-color: transparent;
}
.btn-ghost:hover:not(:disabled) {
  background: var(--color-bg-alt);
  color: var(--color-text);
}

/* 通栏 */
.block {
  width: 100%;
}

/* 加载旋转 */
.btn-spinner {
  display: flex;
  animation: spin 1s linear infinite;
}

/* 箭头 */
.btn-arrow {
  flex-shrink: 0;
  opacity: 0.6;
}
</style>
