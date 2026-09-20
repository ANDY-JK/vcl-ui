<script setup lang="ts">
// ⛔ 保护 — 模态框基础外壳，禁止：clamp() → px，动画时序修改，z-index 层级
//
// 为什么把它从 layout/ModalBox.vue 抽出来（2026-09-11）：
//   ModalBox 的 confirm 模式向后兼容地委托给了 feedback/ConfirmModal，
//   而 ConfirmModal 又需要弹窗外壳 —— 于是形成 ModalBox ↔ ConfirmModal 的
//   双向依赖（全仓唯一的源码级跨域环）。把「外壳」下沉到 _internal/ 后：
//     ModalBox      → ModalShell + ConfirmModal（兼容垫片仍在）
//     ConfirmModal  → ModalShell
//   依赖方向变成单向，环自然消失。DOM 结构、类名、CSS 与抽离前逐字一致，
//   因此 ModalBox 对外行为与视觉均无变化。
//
// 注意：focus trap 必须在下面 registerModal 的 visible watch 之前创建 ——
//   新弹窗先激活（序号 +1），旧弹窗被 registerModal 同步关闭时停用，
//   检测到序号落后则不恢复焦点（避免抢新弹窗焦点）。
import { ref, watch, onMounted, onUnmounted, toRef } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { registerModal } from '@/components/_internal/useModalManager'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useBodyScrollLock } from '@/components/_internal/useBodyScrollLock'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  visible: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  closable?: boolean
  maskClosable?: boolean
  zIndex?: number | string
  /** 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） */
  internal?: boolean
  /**
   * 弹窗互斥域。同一 scope 的弹窗"新开即关旧"，不同 scope 互不影响。
   * 默认不传 → 全页面全局互斥（历史行为）。需要与其它弹窗共存（如 Drawer 内开确认框）时传独立 scope。
   */
  mutexScope?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  size: 'md',
  closable: true,
  maskClosable: true,
  internal: false,
})

const emit = defineEmits<{
  'update:visible': [v: boolean]
  close: []
}>()

// --- 焦点管理：打开时容器内 autofocus（首选 footer 确认/确定按钮，缺省第一个 focusable）→
//   Tab/Shift+Tab 容器内循环 → 关闭恢复焦点到打开按钮 ---
// 选择器并列两种 footer 形态：ModalBox 的 .modal-footer 插槽、ConfirmContent 直接渲染在
// body 内的 .confirm-footer（ConfirmModal 用它，无 .modal-footer 包裹）——只写前者会让
// 确认框初始焦点落到 header 关闭按钮上，键盘用户要多按一次 Tab 才到确认。
const shellRef = ref<HTMLElement | null>(null)
useFocusTrap({
  visible: toRef(props, 'visible'),
  getContainer: () => shellRef.value,
  autofocus: '.modal-footer button:last-of-type, .confirm-footer button:last-of-type',
})

// 打开期间锁 body 滚动（引用计数：与其它弹层叠加时，全部关闭才恢复）
useBodyScrollLock(() => props.visible)

// --- 弹窗竞态管理：同 scope 只允许一个弹窗 ---
let _unregModal: (() => void) | null = null
// immediate：挂载时就已 visible=true 的弹窗也要注册，否则同域互斥对它失效
watch(
  () => props.visible,
  (v) => {
    if (props.internal) return
    if (v) {
      _unregModal = registerModal(close, props.mutexScope)
    } else {
      if (_unregModal) {
        _unregModal()
        _unregModal = null
      }
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  if (_unregModal) {
    _unregModal()
    _unregModal = null
  }
})

// ESC 关闭 — 使用共享 useEscClose composable
const { mount: mountEsc, unmount: unmountEsc } = useEscClose(
  () => props.visible,
  () => props.closable,
  close,
)
onMounted(mountEsc)
onUnmounted(unmountEsc)

function close() {
  emit('update:visible', false)
  emit('close')
}

// 修复"弹窗内按下→移出→松开导致误关闭"：
// 只有 mousedown 和 mouseup 都在 overlay 上时才关闭
let _maskPressed = false
function onMaskMousedown() {
  _maskPressed = true
}
function onMaskMouseup() {
  if (_maskPressed && props.maskClosable) {
    close()
  }
  _maskPressed = false
}
function onMaskMouseleave() {
  // 鼠标移出 overlay 时取消按下状态，防止在内部按下后移出再移回触发关闭
  _maskPressed = false
}
// 弹窗内重新按下时复位：面板 mousedown 被 .stop 拦下，不复位则上一次落在遮罩的按下会残留
function onPanelMousedown() {
  _maskPressed = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="modal-overlay"
        :style="zIndex != null ? { zIndex } : undefined"
        @mousedown="onMaskMousedown"
        @mouseup="onMaskMouseup"
        @mouseleave="onMaskMouseleave"
      >
        <div
          ref="shellRef"
          class="modal-box"
          :class="[`modal-${size}`]"
          role="dialog"
          aria-modal="true"
          :aria-label="title || t('common.dialog')"
          @mousedown.stop="onPanelMousedown"
          @mouseup.stop
        >
          <!-- 头部 -->
          <div class="modal-header">
            <h3 class="modal-title">
              {{ title }}
            </h3>
            <button v-if="closable" class="modal-close" :aria-label="t('common.close')" @click="close">
              <IconSvg type="x" size="md" />
            </button>
          </div>

          <!-- 内容区 -->
          <div class="modal-body">
            <slot />
          </div>

          <!-- 底部：只有调用方提供了 footer 插槽才渲染（避免空边框） -->
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1000);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}
@supports (backdrop-filter: blur(4px)) {
  .modal-overlay {
    backdrop-filter: blur(4px);
  }
}

.modal-box {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: clamp(320px, 92vw, 520px);
  max-height: 85vh;
  max-height: 85dvh;
}
.modal-sm {
  width: clamp(280px, 38vw, 420px);
}
.modal-md {
  width: clamp(380px, 52vw, 580px);
}
.modal-lg {
  width: clamp(480px, 66vw, 760px);
}
.modal-xl {
  width: clamp(580px, 82vw, 980px);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(var(--space-1), 1.2vw, 10px) clamp(8px, 1.5vw, 12px);
  border-bottom: 1px solid var(--color-border-light);
}

.modal-title {
  font-size: clamp(14px, 2.2vw, 36px);
  font-weight: 600;
}

.modal-close {
  display: flex;
  padding: var(--space-1);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.modal-close:hover {
  background: var(--color-bg-alt);
}

.modal-body {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: clamp(var(--space-1), 1.2vw, 10px);
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: clamp(var(--space-1), 1vw, 8px);
  padding: clamp(var(--space-2), 2vw, 16px) clamp(12px, 2.5vw, 20px);
  border-top: 1px solid var(--color-border-light);
}

/* 过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal);
}
.modal-enter-active .modal-box,
.modal-leave-active .modal-box {
  transition: transform var(--transition-normal);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-box {
  transform: scale(0.95) translateY(10px);
}
.modal-leave-to .modal-box {
  transform: scale(0.95) translateY(10px);
}
</style>
