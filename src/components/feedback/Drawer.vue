<script setup lang="ts">
// ⛔ 保护 — 抽屉组件，禁止：clamp() → px，动画时序，z-index，宽度断点
//    需我确认：placement 定位逻辑、header/footer slot 结构
import { ref, watch, onMounted, onUnmounted, nextTick, computed, toRef } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { registerModal } from '@/components/_internal/useModalManager'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useBodyScrollLock } from '@/components/_internal/useBodyScrollLock'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  /** 显隐（v-model:visible） */
  visible: boolean
  /** 抽屉标题（标题栏；空串不渲染标题行） */
  title?: string
  /** 滑出方位（默认右侧） */
  placement?: 'left' | 'right' | 'top' | 'bottom'
  /** 抽屉宽度（默认 'min(380px, 88vw)'） */
  width?: string
  /** 抽屉高度（上下方位时生效，默认 'min(300px, 60vh)'） */
  height?: string
  /** 显示右上角关闭按钮（默认开） */
  closable?: boolean
  /** 点遮罩关闭（默认开） */
  maskClosable?: boolean
  /** 遮罩 z-index 覆盖 */
  zIndex?: number
  /** 关闭即销毁内容（默认开；关掉可保留表单等内部状态） */
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
  destroyOnClose: true,
  internal: false,
})

const emit = defineEmits<{
  /** v-model:visible——显隐 */
  'update:visible': [v: boolean]
  /** 请求关闭（关闭按钮/遮罩/Esc） */
  close: []
  /** 打开动画完成后（内容需要测量尺寸的场景接这个） */
  'after-open': []
  /** 关闭动画完成后 */
  'after-close': []
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

// 打开期间锁 body 滚动（引用计数：与其它弹层叠加时，全部关闭才恢复）
useBodyScrollLock(() => props.visible)

function close() {
  emit('update:visible', false)
  emit('close')
}

// 遮罩误关判定：只有 mousedown 和 mouseup 都落在遮罩上才关闭。
// 面板内按下选中文字、拖到遮罩松开时浏览器补发的 click 目标是最外层 overlay，
// 旧的 click.self 会命中并误关（与 ModalBox 同一套判定，避免两份实现漂移）。
let _maskPressed = false
function onMaskMousedown() {
  _maskPressed = true
}
function onMaskMouseup() {
  if (_maskPressed && props.maskClosable) close()
  _maskPressed = false
}
function onMaskMouseleave() {
  _maskPressed = false
}
// 面板内重新按下时复位：面板 mousedown 被 .stop 拦下，不复位则上一次落在遮罩的按下会残留
function onPanelMousedown() {
  _maskPressed = false
}

// immediate：挂载时就已 visible=true 时也要置 hasOpened（destroyOnClose=false 的
// 面板靠 hasOpened 渲染，不补这一步会整块不渲染）；但初次挂载即 false 不补发 afterClose
watch(
  () => props.visible,
  async (v, oldV) => {
    if (v) {
      hasOpened.value = true
      await nextTick()
      emit('after-open')
    } else if (oldV !== undefined) {
      emit('after-close')
    }
  },
  { immediate: true },
)

// --- 弹窗竞态管理：同 scope 只允许一个弹窗（internal 跳过）---
let _unregDrawer: (() => void) | null = null
// immediate：挂载时就已 visible=true 的抽屉也要注册，否则同域互斥对它失效
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
  { immediate: true },
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
        :style="zIndex != null ? { zIndex } : undefined"
        :inert="!visible || undefined"
        @mousedown="onMaskMousedown"
        @mouseup="onMaskMouseup"
        @mouseleave="onMaskMouseleave"
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
          @mousedown.stop="onPanelMousedown"
          @mouseup.stop
          @click.stop
        >
          <div class="drawer-header">
            <!-- @slot header: 抽屉头部区域；不传则回退 title 属性标题 -->
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
            <!-- @slot default: 抽屉主体内容 -->
            <slot />
          </div>
          <div v-if="$slots.footer" class="drawer-footer">
            <!-- @slot footer: 抽屉底部区域（仅传入时渲染，如按钮条） -->
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
  z-index: var(--vcl-z-modal, 1000);
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
  background: var(--vcl-color-surface);
  box-shadow: var(--vcl-shadow-lg);
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
  padding: calc(16px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border);
  flex-shrink: 0;
}
.drawer-title {
  font-size: calc(36px * var(--vcl-scale));
  font-weight: 600;
}

.drawer-close {
  display: flex;
  padding: var(--vcl-space-1);
  border: none;
  background: transparent;
  color: var(--vcl-color-text-muted);
  cursor: pointer;
  border-radius: var(--vcl-radius-sm);
}
.drawer-close:hover {
  background: var(--vcl-color-bg-alt);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(20px * var(--vcl-scale));
}

.drawer-footer {
  flex-shrink: 0;
  padding: calc(16px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  border-top: 1px solid var(--vcl-color-border-light);
}

/* 动画 */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--vcl-transition-normal);
}
.drawer-enter-active .drawer-panel,
.drawer-leave-active .drawer-panel {
  transition: transform var(--vcl-transition-normal);
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
