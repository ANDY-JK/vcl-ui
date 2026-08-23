<script setup lang="ts">
// ⛔ 保护 — 按钮，禁止：clamp() 尺寸 → px，variant/size 枚举修改
//    需我确认：新增 variant、loading 状态行为
import { ref, onErrorCaptured } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
const _e = ref<Error | null>(null)
onErrorCaptured((e: Error) => {
  console.error('[Button] 异常:', e.message)
  _e.value = e
  return false
})

interface Props {
  text?: string
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  disabled?: boolean
  loading?: boolean
  block?: boolean
  showArrow?: boolean
}

withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  block: false,
  showArrow: false,
})

const emit = defineEmits<{ click: [e: MouseEvent] }>()
</script>

<template>
  <span v-if="_e" style="color: var(--color-danger); font-size: 12px">⚠ 按钮异常</span>
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
  height: var(--ctrl-height, clamp(36px, 5.5vw, 40px));
  padding: 0 var(--ctrl-padding-x, clamp(12px, 2vw, 16px));
  font-size: var(--ctrl-font-size, clamp(12px, 1.8vw, 15px), 1.8vw, clamp(14px, 1.8vw, 15px)));
  border-radius: var(--ctrl-radius, var(--radius-md));
}
.btn-lg {
  height: calc(var(--ctrl-height, clamp(42px, 6.5vw, 48px)) + 6px);
  padding: 0 calc(var(--ctrl-padding-x, clamp(14px, 2.5vw, 20px)) + 4px);
  font-size: calc(var(--ctrl-font-size, clamp(13px, 2vw, 15px)) + 1px);
}

/* 变体 */
.btn-primary {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}
.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
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
  background: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.btn-outline:hover:not(:disabled) {
  background: var(--color-primary-light);
}

.btn-danger {
  background: var(--color-danger);
  color: white;
  border-color: var(--color-danger);
}
.btn-danger:hover:not(:disabled) {
  background: var(--color-danger-hover);
  border-color: var(--color-danger-hover);
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
