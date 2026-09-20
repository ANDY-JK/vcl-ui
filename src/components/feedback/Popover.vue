<script setup lang="ts">
// ⛔ 保护 — 气泡浮层，禁止：clamp() → px，浮动定位算法，z-index
//    需我确认：trigger 触发方式、placement 位置选项
import { ref, computed, nextTick, onMounted, onUnmounted, watchEffect, watch } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useFloating } from '@/components/_internal/useFloating'
import { useClickOutside } from '@/components/_internal/useClickOutside'
import { useEscClose } from '@/components/_internal/useEscClose'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { useT } from '@/components/_internal/i18n'

const t = useT()
import type { FlipDirection } from '@/components/_internal/useFloating'

interface Props {
  /** 'popover' 卡片弹层 | 'tooltip' 文字气泡 */
  variant?: 'popover' | 'tooltip'
  title?: string
  /** 'click' | 'hover' | 'focus' — tooltip 模式（有 text）时强制 hover */
  trigger?: 'click' | 'hover' | 'focus'
  /** 纯文字快捷模式 → tooltip 行为 */
  text?: string
  /** tooltip 方向 */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** 浮层 z-index（数字或 CSS 变量字符串）；默认走 --z-dropdown 变量 */
  zIndex?: number | string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'popover',
  trigger: 'click',
  position: 'top',
})

const isTooltip = computed(() => props.variant === 'tooltip' || !!props.text)
const open = ref(false)
// 竞态保护：show() 的 RAF 回调可能晚于 hide() 执行，用 token 取消过期的 show
let _showToken = 0
// hover 关闭延迟：给指针穿过触发器与浮层之间的 offset 间隙留时间，否则浮层先 display:none 就再也命中不了
let _closeTimer: ReturnType<typeof setTimeout> | null = null
const HOVER_CLOSE_DELAY = 120
// 触屏：tap 后浏览器会补发 mouseenter/mouseleave，此窗口内忽略 mouseleave，避免 tap 出来的气泡秒关
let _lastTouchAt = 0
const TOUCH_GRACE = 600

// a11y 关联 id：tooltip 用 aria-describedby，dialog 用 aria-labelledby
const floatingId = useIdSafe('popover')
const titleId = useIdSafe('popover-title')

const dirMap: Record<string, FlipDirection> = { top: 'up', bottom: 'down', left: 'left', right: 'right' }
const { triggerRef, floatingRef, direction, floatingStyle, updatePosition, prepareOpen } = useFloating({
  // getter 形式：isTooltip / position 动态变化时，下一次定位即用新配置
  get offset() {
    return isTooltip.value ? 6 : 8
  },
  get defaultDirection() {
    return isTooltip.value ? dirMap[props.position] : 'down'
  },
  get minSize() {
    return isTooltip.value ? 20 : 80
  },
  get zIndex() {
    return props.zIndex != null ? String(props.zIndex) : undefined
  },
  matchWidth: false,
})

// tooltip 的语义关联必须挂在真正被聚焦的元素上：插槽首个子元素可能只是图标/包裹层（不可聚焦），
// 只给它加 aria-describedby 读屏不会播报。优先找首个可聚焦后代，退化为首个子元素、再退化为宿主。
const FOCUSABLE_SELECTOR = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'
function describedTarget(host: HTMLElement): HTMLElement {
  return host.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? (host.firstElementChild as HTMLElement | null) ?? host
}

watchEffect(() => {
  const host = triggerRef.value
  if (!host) return
  const target = describedTarget(host)
  if (isTooltip.value) target.setAttribute('aria-describedby', floatingId)
  else target.removeAttribute('aria-describedby')
})

async function toggle(e: MouseEvent) {
  if (isTooltip.value || props.trigger !== 'click') return
  // 事件派发结束后 currentTarget 会被置 null，await 前先捕获
  const triggerEl = (e.currentTarget as HTMLElement) || triggerRef.value
  if (open.value) {
    open.value = false
    return
  }
  prepareOpen()
  open.value = true
  await nextTick()
  await new Promise((r) => requestAnimationFrame(r))
  updatePosition(triggerEl || undefined)
}

async function show() {
  if (!isTooltip.value && props.trigger === 'click') return
  const token = ++_showToken
  prepareOpen()
  open.value = true
  await nextTick()
  await new Promise((r) => requestAnimationFrame(r))
  // 竞态检查：如果已被 hide() 取消，跳过 updatePosition
  if (token !== _showToken) return
  updatePosition(triggerRef.value || undefined)
}

function hide() {
  _showToken++ // 取消所有 pending 的 show()
  if (isTooltip.value || props.trigger === 'hover' || props.trigger === 'focus') open.value = false
}

function onFocus() {
  if (props.trigger !== 'focus') return
  show()
}

function onBlur(e: FocusEvent) {
  if (props.trigger !== 'focus') return
  // 焦点在触发器与浮层之间移动（Tab 进浮层内容）不算离开，否则键盘用户永远够不到内容
  const next = e.relatedTarget as Node | null
  if (next && (triggerRef.value?.contains(next) || floatingRef.value?.contains(next))) return
  hide()
}

function cancelClose() {
  if (_closeTimer) {
    clearTimeout(_closeTimer)
    _closeTimer = null
  }
}

function scheduleClose() {
  cancelClose()
  _closeTimer = setTimeout(() => {
    _closeTimer = null
    hide()
  }, HOVER_CLOSE_DELAY)
}

function onEnter() {
  cancelClose()
  show()
}

function onLeave() {
  // 触摸后合成的 mouseleave 不代表指针真的离开了触发器
  if (Date.now() - _lastTouchAt < TOUCH_GRACE) return
  if (props.trigger === 'hover' || isTooltip.value) scheduleClose()
}

function onTouchStart() {
  _lastTouchAt = Date.now()
  // click 路径交给 click 事件，避免 tap 先开后立即被 click 又切掉
  if (props.trigger === 'click') return
  cancelClose()
  show()
}

function close() {
  open.value = false
}
useClickOutside([triggerRef, floatingRef], close)

// 非模态弹层的焦点管理（区别于 ModalBox 的 trap）：
// 打开时把焦点移入浮层（首个可聚焦元素，无则浮层本身，浮层需 tabindex 承接），
// 关闭时归还触发器 — 键盘用户 Enter 打开后能 Tab 进内容，Esc 关闭后回原位。
// 不锁 Tab：popover 语义上允许焦点自由离开（离开经 clickOutside/hover 逻辑关闭）。
let _prevFocus: HTMLElement | null = null
watch(open, async (v) => {
  if (isTooltip.value) return
  // 仅 click 触发（键盘可达路径）移焦；hover 触发移焦会抢走指针用户的焦点
  if (props.trigger !== 'click') return
  if (v) {
    _prevFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const panel = floatingRef.value
    if (!panel) return
    // 首个可聚焦元素，无则浮层本身承接（动态补 tabindex=-1）
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1')
    const target = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panel
    target.focus()
  } else if (_prevFocus?.isConnected) {
    _prevFocus.focus()
    _prevFocus = null
  }
})

// Esc 关闭 — 复用共享弹层栈：多层弹层叠加时只关最上层可见的那一个
const { mount: mountEsc, unmount: unmountEsc } = useEscClose(
  () => open.value,
  () => true,
  close,
)
onMounted(mountEsc)
onUnmounted(() => {
  cancelClose()
  unmountEsc()
})
</script>

<template>
  <span class="popover-host" :class="{ tooltip: isTooltip }">
    <!-- 触发器（focus/blur 不冒泡，改用 focusin/focusout 才能收到插槽内子元素的焦点） -->
    <span
      ref="triggerRef"
      @click="toggle"
      @mouseenter="onEnter"
      @mouseleave="onLeave"
      @touchstart.passive="onTouchStart"
      @focusin="onFocus"
      @focusout="onBlur"
    >
      <slot v-if="!isTooltip" name="trigger">
        <!-- 默认触发器是纯图标按钮，必须自带 aria-label（axe button-name）；
             调用方传 trigger slot 时自行负责可访问名 -->
        <button
          type="button"
          class="popover-btn"
          :aria-label="t('feedback.popoverTrigger')"
          :aria-expanded="open"
          :aria-haspopup="isTooltip ? undefined : 'dialog'"
        >
          <IconSvg type="circle-alert" size="md" />
        </button>
      </slot>
      <slot v-else />
    </span>

    <!-- 浮层 -->
    <Teleport to="body">
      <Transition :name="isTooltip ? 'tip' : 'pop'">
        <div
          v-show="open"
          :id="floatingId"
          ref="floatingRef"
          :class="[isTooltip ? 'tooltip-pop' : 'popover-card', !isTooltip && `flip-${direction}`]"
          :style="floatingStyle"
          :role="isTooltip ? 'tooltip' : 'dialog'"
          :aria-labelledby="!isTooltip && title ? titleId : undefined"
          @mouseenter="onEnter"
          @mouseleave="onLeave"
          @focusout="onBlur"
        >
          <!-- tooltip 模式 -->
          <template v-if="isTooltip">{{ text }}</template>
          <!-- popover 模式 -->
          <template v-else>
            <div v-if="title" :id="titleId" class="popover-title">{{ title }}</div>
            <div class="popover-body"><slot /></div>
          </template>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style scoped>
.popover-host {
  position: relative;
  display: inline-flex;
}
.popover-host.tooltip {
  cursor: default;
}
.popover-btn {
  display: flex;
  padding: var(--space-1);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}
</style>

<style>
/* ===== popover 卡片 ===== */
.popover-card {
  min-width: clamp(160px, 26vw, 220px);
  max-width: clamp(280px, 42vw, 380px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.popover-title {
  padding: clamp(7px, 1.2vw, var(--space-2)) clamp(var(--space-2), 1.8vw, 14px);
  font-size: clamp(11px, 1.8vw, 15px);
  font-weight: 600;
  border-bottom: 1px solid var(--color-border-light);
}
.popover-body {
  padding: clamp(var(--space-2), 1.5vw, 12px) clamp(10px, 1.8vw, 14px);
  font-size: clamp(11px, 1.8vw, 15px);
  color: var(--color-text-secondary);
}

/* ===== tooltip 气泡 ===== */
.tooltip-pop {
  max-width: clamp(180px, 32vw, 320px);
  padding: clamp(3px, 0.6vw, var(--space-1)) clamp(5px, 1vw, 10px);
  background: var(--color-sidebar);
  color: white;
  font-size: clamp(11px, 1.5vw, 15px);
  border-radius: var(--radius-sm);
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
  pointer-events: none;
}

/* ===== 过渡 ===== */
/* popover 卡片：弹性缓动 + 微缩放，进场 200ms 退场 150ms */
.pop-enter-active {
  transition:
    opacity var(--transition-normal),
    transform var(--transition-normal);
}
.pop-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
}
.pop-enter-from {
  opacity: 0;
  transform: translateY(calc(-1 * var(--space-2))) scale(0.97);
}
.pop-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--space-1))) scale(0.97);
}
/* 向上展开时动画方向反转 */
.flip-up.pop-enter-from {
  transform: translateY(var(--space-2)) scale(0.97);
}
.flip-up.pop-leave-to {
  transform: translateY(var(--space-1)) scale(0.97);
}

/* tooltip：纯淡入淡出，轻量快速 */
.tip-enter-active {
  transition: opacity var(--transition-fast);
}
.tip-leave-active {
  transition: opacity var(--transition-fast);
}
.tip-enter-from,
.tip-leave-to {
  opacity: 0;
}
</style>
