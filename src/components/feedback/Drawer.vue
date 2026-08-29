<script setup lang="ts">
// ⛔ 保护 — 抽屉组件，禁止：clamp() → px，动画时序，z-index，宽度断点
//    需我确认：placement 定位逻辑、header/footer slot 结构
import { ref, watch, onMounted, onUnmounted, nextTick, computed, toRef } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { registerModal } from '@/components/_internal/useModalManager'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  visible: boolean
  title?: string
  placement?: 'left' | 'right' | 'top' | 'bottom'
  width?: string
  height?: string
  closable?: boolean
  maskClosable?: boolean
  zIndex?: number
  destroyOnClose?: boolean
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
  placement: 'right',
  width: 'min(380px, 88vw)',
  height: 'min(300px, 60vh)',
  closable: true,
  maskClosable: true,
  zIndex: 1000,
  destroyOnClose: true,
  internal: false,
})

const emit = defineEmits<{
  'update:visible': [v: boolean]
  close: []
  afterOpen: []
  afterClose: []
}>()

const drawerPanel = ref<HTMLElement | null>(null)
const hasOpened = ref(false)
const normalizedWidth = computed(() => (typeof props.width === 'number' ? props.width + 'px' : props.width))
const normalizedHeight = computed(() => (typeof props.height === 'number' ? props.height + 'px' : props.height))
const isVertical = computed(() => props.placement === 'left' || props.placement === 'right')

// --- 焦点管理：打开聚焦面板 / Tab 循环 trap / 关闭恢复焦点 ---
// 行为与重构前一致：打开后聚焦面板本身（autofocus: 'container'），Tab/Shift+Tab 在面板内循环，
// 关闭时恢复焦点到打开按钮；被 registerModal 同步关闭时（已有更新的弹窗激活）不恢复焦点，避免抢焦点。
// 须在下方 registerModal 的 visible watch 之前创建，保证新弹窗先激活、旧弹窗后停用。
useFocusTrap({
  visible: toRef(props, 'visible'),
  getContainer: () => drawerPanel.value,
  autofocus: 'container',
})

function close() {
  emit('update:visible', false)
  emit('close')
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      hasOpened.value = true
      await nextTick()
      emit('afterOpen')
    } else {
      emit('afterClose')
    }
  },
)

// --- 弹窗竞态管理：同 scope 只允许一个弹窗（internal 跳过）---
let _unregDrawer: (() => void) | null = null
watch(
  () => props.visible,
  (v) => {
    if (props.internal) return
    if (v) {
      _unregDrawer = registerModal(close, props.mutexScope)
    } else {
      if (_unregDrawer) {
        _unregDrawer()
        _unregDrawer = null
      }
    }
  },
)
onUnmounted(() => {
  if (_unregDrawer) {
    _unregDrawer()
    _unregDrawer = null
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
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="destroyOnClose ? visible : hasOpened"
        class="drawer-overlay"
        :class="{ hidden: !visible }"
        :style="{ zIndex }"
        @click.self="maskClosable && close()"
      >
        <div
          ref="drawerPanel"
          tabindex="-1"
          class="drawer-panel"
          :class="[`drawer-${placement}`]"
          :style="isVertical ? { width: normalizedWidth } : { height: normalizedHeight }"
          role="dialog"
          aria-modal="true"
          :aria-label="title || t('drawer.panel')"
          @click.stop
        >
          <div class="drawer-header">
            <slot name="header">
              <h4 class="drawer-title">
                {{ title }}
              </h4>
            </slot>
            <button v-if="closable" class="drawer-close" :aria-label="t('drawer.close')" @click="close">
              <IconSvg type="x" size="md" />
            </button>
          </div>
          <div class="drawer-body">
            <slot />
          </div>
          <div v-if="$slots.footer" class="drawer-footer">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1000);
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}
.drawer-overlay.hidden {
  opacity: 0;
  pointer-events: none;
}

.drawer-panel {
  position: absolute;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}
.drawer-right {
  top: 0;
  bottom: 0;
  right: 0;
}
.drawer-left {
  top: 0;
  bottom: 0;
  left: 0;
}
.drawer-top {
  left: 0;
  right: 0;
  top: 0;
  max-height: 90vh;
}
.drawer-bottom {
  left: 0;
  right: 0;
  bottom: 0;
  max-height: 90vh;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(var(--space-2), 2vw, 16px) clamp(12px, 2.5vw, 20px);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.drawer-title {
  font-size: clamp(14px, 2.2vw, 36px);
  font-weight: 600;
}

.drawer-close {
  display: flex;
  padding: var(--space-1);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.drawer-close:hover {
  background: var(--color-bg-alt);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: clamp(var(--space-3), 2.5vw, 20px);
}

.drawer-footer {
  flex-shrink: 0;
  padding: clamp(var(--space-2), 2vw, 16px) clamp(12px, 2.5vw, 20px);
  border-top: 1px solid var(--color-border-light);
}

/* 动画 */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--transition-normal);
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform var(--transition-normal);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-right,
.drawer-leave-to .drawer-right {
  transform: translateX(100%);
}
.drawer-enter-from .drawer-left,
.drawer-leave-to .drawer-left {
  transform: translateX(-100%);
}
.drawer-enter-from .drawer-top,
.drawer-leave-to .drawer-top {
  transform: translateY(-100%);
}
.drawer-enter-from .drawer-bottom,
.drawer-leave-to .drawer-bottom {
  transform: translateY(100%);
}
</style>
