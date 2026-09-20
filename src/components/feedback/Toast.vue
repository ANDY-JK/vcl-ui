<script lang="ts">
/**
 * toast id 全局递增 — 模块级而非实例级，避免同页多个 <Toast> 实例 id 从 1
 * 各自计数导致 remove(id) 误删另一实例的同 id toast。
 * 注意：<script setup> 顶层 let 每实例一份，必须放普通 <script> 块才是模块作用域。
 */
let nextId = 1

/** Props 声明在普通 <script> 块：script setup 内 value 声明之后再出现 type 导出会触发 vue-tsc TS1184 */
export interface Props {
  /** 'toast' 全局弹幕 | 'inline' 内联提示条（替代 Alert） */
  variant?: 'toast' | 'inline'
  type?: 'circle-alert' | 'info' | 'success' | 'warning' | 'error'
  title?: string
  message?: string
  closable?: boolean
  showIcon?: boolean
  position?: 'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Teleport 目标（WC/Shadow DOM 宿主指向自身容器），默认 'body' */
  teleportTo?: string | HTMLElement
}
</script>

<script setup lang="ts">
// ⛔ 保护 — Toast 通知系统，禁止：clamp() → px，动画时序；z-index 层级 = var(--z-top, 9999)（最高优先级通知，ImagePreview 内嵌时临时提升至 10001）
//    需我确认：ToastItem 接口增删、position 定位逻辑
//    注意：ToastItem / ToastAPI / TOAST_KEY / useToast 已抽到 toast-context.ts，
//          因为 <script setup> 不能包含 ES module exports
import { ref, computed, provide, onUnmounted } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import { TOAST_KEY, registerGlobalToast, unregisterGlobalToast } from './composables/toast-context'
import type { ToastAPI, ToastItem } from './composables/toast-context'
import { feedbackIconMap, feedbackColorMap } from '../shared/types'

// 模板 v-for 中 t 已被 toast 项占用，翻译函数用别名 tt
const tt = useT()

const props = withDefaults(defineProps<Props>(), {
  variant: 'toast',
  type: 'circle-alert',
  closable: false,
  showIcon: true,
  position: 'top',
  teleportTo: 'body',
})

// inline 模式的本地显隐
const inlineVisible = ref(true)

// toast 队列 — 每实例一份：DataTable / ImagePreview 等各自挂 <Toast> 靠 ref 通知自己那一份；
// provide/inject 只在本实例子树内共享，不跨实例合并队列（合并会导致同页多实例重复渲染）
const toasts = ref<ToastItem[]>([])
// 各 toast 的自动关闭定时器（id → timer）：组件卸载时统一清理，防止卸载后 timer 回调操作已卸载 ref
const _closeTimers = new Map<number, ReturnType<typeof setTimeout>>()

const isToast = computed(() => props.variant === 'toast')
const isInline = computed(() => props.variant === 'inline')

// 图标/颜色映射单一事实源在 shared/types（Result/Toast 共用）；
// Toast 本地键只是兼容 'circle-alert' 这种把图标名当类型传入的历史用法
const iconMap: Record<string, string> = {
  ...feedbackIconMap,
  'circle-alert': 'circle-alert',
}

const colorMap: Record<string, string> = {
  ...feedbackColorMap,
  'circle-alert': 'var(--color-text)',
}

const inlineBgMap: Record<string, string> = {
  'circle-alert': 'var(--color-bg-alt)',
  info: 'var(--color-info-bg)',
  success: 'var(--color-success-bg)',
  warning: 'var(--color-warning-bg)',
  error: 'var(--color-danger-bg)',
}
const inlineBorderMap: Record<string, string> = {
  'circle-alert': 'var(--color-border)',
  info: 'var(--color-info-border)',
  success: 'var(--color-success-border)',
  warning: 'var(--color-warning-border)',
  error: 'var(--color-danger-border)',
}

function removeToast(id: number) {
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx >= 0) toasts.value.splice(idx, 1)
  const timer = _closeTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    _closeTimers.delete(id)
  }
}

/** 未显式传 duration 时的默认停留：报错要给人读完并处理的时间，其余类型读完即走 */
const _DEFAULT_ERROR_DURATION_MS = 5000
const _DEFAULT_DURATION_MS = 3000

// 全局方法
function show(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
  duration?: number,
  options?: {
    undoText?: string
    onUndo?: () => void
    actionText?: string
    onAction?: () => void
    closable?: boolean
  },
) {
  const id = nextId++
  const dur = duration ?? (type === 'error' ? _DEFAULT_ERROR_DURATION_MS : _DEFAULT_DURATION_MS)
  const toast: ToastItem = {
    id,
    type,
    message,
    duration: dur,
    closable: options?.closable ?? true,
    // 向后兼容 undoText/onUndo
    undoText: options?.undoText,
    onUndo: options?.onUndo,
    // 新 action 接口（优先级高于 undo）
    actionText: options?.actionText ?? options?.undoText,
    onAction: options?.onAction ?? options?.onUndo,
  }
  toasts.value.unshift(toast)
  // 队列上限：常驻 toast 被调用方遗漏 remove 时防止长会话无限累积（丢弃最旧的一条）
  const MAX_TOASTS = 50
  if (toasts.value.length > MAX_TOASTS) {
    const oldest = toasts.value.pop()!
    const t = _closeTimers.get(oldest.id)
    if (t) {
      clearTimeout(t)
      _closeTimers.delete(oldest.id)
    }
  }

  if (dur > 0) {
    const timer = setTimeout(() => removeToast(id), dur)
    _closeTimers.set(id, timer)
  }
  return id
}

function clearAll() {
  toasts.value.splice(0)
  _closeTimers.forEach((t) => clearTimeout(t))
  _closeTimers.clear()
}

// 本实例 API —— provide 与全局入口共用同一个对象，卸载时才能按身份精确摘除
const toastApi: ToastAPI = { toasts, show, remove: removeToast, clearAll }

// 通过 provide/inject 共享本实例 API，子组件可 inject 后直接调用（仅限本实例子树）
provide(TOAST_KEY, toastApi)

// @deprecated window.__toast 已废弃，推荐使用 useToast() 或组件 ref
// 保留兼容旧代码，后续版本将移除
// 多实例安全：全局入口指向最后一个仍存活的实例；本实例卸载时按身份出栈并回退到上一存活实例，
// 不会像旧实现那样把入口留在已卸载实例的死队列上（通知静默丢失）
if (typeof window !== 'undefined') {
  registerGlobalToast(toastApi)
}

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    unregisterGlobalToast(toastApi)
  }
  // 清理未触发的自动关闭定时器，防止卸载后回调操作已卸载组件状态
  _closeTimers.forEach((t) => clearTimeout(t))
  _closeTimers.clear()
})

/** 组件实例方法（通过 ref 或 window.__toast 调用） */
defineExpose({
  /** 显示 toast。duration<=0 表示常驻，需手动 remove。返回 id 用于 remove */
  show,
  /** 按 id 移除指定 toast */
  remove: removeToast,
})
</script>

<template>
  <!-- inline 模式：内联提示条（替代 Alert） -->
  <div
    v-if="isInline && inlineVisible"
    class="toast-inline"
    :style="{ background: inlineBgMap[type], borderColor: inlineBorderMap[type] }"
  >
    <IconSvg v-if="showIcon" :type="iconMap[type]" size="md" :color="colorMap[type]" class="toast-inline-icon" />
    <div class="toast-inline-body">
      <div v-if="title" class="toast-inline-title">
        {{ title }}
      </div>
      <div class="toast-inline-msg">
        {{ message }}
      </div>
    </div>
    <button v-if="closable" type="button" class="toast-inline-close" :aria-label="tt('common.close')" @click="inlineVisible = false">
      <IconSvg type="x" size="sm" />
    </button>
  </div>

  <!-- toast 模式：全局弹幕 — H5 Teleport 到 body（可用 teleportTo 指向 Shadow DOM 宿主容器），小程序直接渲染(已在根节点) -->
  <Teleport v-if="isToast" :to="teleportTo">
    <div v-if="isToast" class="toast-container" :class="[`toast-${position}`]">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast-item"
          :style="{ background: colorMap[t.type] }"
          :role="t.type === 'error' ? 'alert' : 'status'"
        >
          <IconSvg :type="iconMap[t.type]" size="md" color="white" class="toast-icon" />
          <span class="toast-msg">{{ t.message }}</span>
          <button
            v-if="t.actionText || t.undoText"
            class="toast-undo"
            :aria-label="t.actionText || t.undoText"
            @click="
              ;(t.onAction || t.onUndo)?.()
              removeToast(t.id)
            "
          >
            {{ t.actionText || t.undoText }}
          </button>
          <button
            v-if="t.closable"
            class="toast-close"
            :aria-label="tt('toast.closeNotification')"
            @click="removeToast(t.id)"
          >
            <IconSvg type="x" size="sm" color="white" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style>
.toast-container {
  position: fixed;
  top: clamp(10px, 2vw, 16px);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-top, 9999);
  display: flex;
  flex-direction: column;
  gap: clamp(var(--space-1), 1vw, 8px);
  pointer-events: none;
  width: calc(100% - clamp(16px, 4vw, 32px));
  max-width: clamp(320px, 64vw, 480px);
}
/* position 变体 — 覆盖居中默认值 */
.toast-top-right {
  left: auto;
  right: clamp(10px, 2vw, 16px);
  transform: none;
}
.toast-top-left {
  left: clamp(10px, 2vw, 16px);
  transform: none;
}
.toast-bottom-right {
  top: auto;
  left: auto;
  right: clamp(10px, 2vw, 16px);
  bottom: clamp(10px, 2vw, 16px);
  transform: none;
}
.toast-bottom-left {
  top: auto;
  right: auto;
  bottom: clamp(10px, 2vw, 16px);
  left: clamp(10px, 2vw, 16px);
  transform: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: clamp(var(--space-1), 1vw, 8px);
  padding: clamp(9px, 1.5vw, 12px) clamp(var(--space-2), 1.8vw, 14px);
  border-radius: var(--radius-md);
  color: white;
  font-size: clamp(13px, 1.8vw, 15px);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
  line-height: 1.4;
}

.toast-icon {
  flex-shrink: 0;
}

.toast-msg {
  flex: 1;
  font-size: clamp(13px, 1.8vw, 15px);
}

.toast-undo {
  flex-shrink: 0;
  padding: clamp(var(--space-0), 0.4vw, 3px) clamp(7px, 1.2vw, 10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: var(--radius-sm);
  background: transparent;
  color: white;
  font-size: clamp(11px, 1.5vw, 15px);
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
}
.toast-undo:hover {
  background: rgba(255, 255, 255, 0.15);
}

.toast-close {
  display: flex;
  flex-shrink: 0;
  padding: var(--space-1);
  border: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 50%;
  color: white;
  cursor: pointer;
}
.toast-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 过渡动画 */
.toast-enter-active {
  transition: all var(--transition-normal);
}
.toast-leave-active {
  transition: all var(--transition-fast);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-16px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
</style>

<style scoped>
.toast-inline {
  display: flex;
  align-items: flex-start;
  gap: clamp(var(--space-2), 1.5vw, 12px);
  padding: clamp(var(--space-2), 1.5vw, 12px) clamp(10px, 2vw, 16px);
  border-radius: var(--radius-md);
  border: 1px solid;
  font-size: clamp(12px, 1.8vw, 15px);
}
.toast-inline-icon {
  flex-shrink: 0;
  margin-top: 1px;
}
.toast-inline-body {
  flex: 1;
}
.toast-inline-title {
  font-weight: 600;
  margin-bottom: var(--space-1);
  color: var(--color-text);
}
.toast-inline-msg {
  color: var(--color-text-secondary);
}
.toast-inline-close {
  display: flex;
  padding: var(--space-1);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.toast-inline-close:hover {
  background: rgba(0, 0, 0, 0.06);
}
</style>
