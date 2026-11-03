<script setup lang="ts">
// ⛔ 保护 — 气泡浮层，禁止：clamp() → px，浮动定位算法，z-index
//    需我确认：trigger 触发方式、placement 位置选项
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { FOCUSABLE_SELECTOR, usePopoverTriggerA11y } from './popover-a11y'
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
  /** 浮层标题（popover 模式非空时展示标题行） */
  title?: string
  /** 'click' | 'hover' | 'focus' — tooltip 模式（有 text）时强制 hover */
  trigger?: 'click' | 'hover' | 'focus'
  /** 纯文字快捷模式 → tooltip 行为 */
  text?: string
  /** tooltip 方向 */
  position?: 'top' | 'bottom' | 'left' | 'right'
  /** 浮层 z-index（数字或 CSS 变量字符串）；默认走 --vcl-z-dropdown 变量 */
  zIndex?: number | string
  /** 指向三角（箭头）：浮层贴触发器一侧渲染 45° 菱形三角并自动对准触发器中心。
   *  默认 false——2026-10-02 定案气泡无箭头；此开关为需要强指向场景的可选项。 */
  arrow?: boolean
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
    // 2026-10-02：气泡(popover 变体)原先写死 'down' 而忽略 position，导致 position=right/left 时不做垂直居中；
    // 改为两变体都尊重 position（default 值 top→up，与 prop 默认自洽；left/right 走 useFloating 的垂直居中）。
    return dirMap[props.position]
  },
  get minSize() {
    return isTooltip.value ? 20 : 80
  },
  get zIndex() {
    return props.zIndex != null ? String(props.zIndex) : undefined
  },
  matchWidth: false,
  // 面板用 v-show 常驻 DOM → "开没开"只有宿主知道（TD-95，#387）：
  // 关闭期间不必挂全局监听（一次滚动命中几十个实例的空回调）。
  active: () => open.value,
})

// 触发器 aria 关联下沉到 popover-a11y.ts（#321）：tooltip 用 describedby，
// 其余补 aria-expanded/haspopup/controls —— 自定义插槽触发器也能拿到（详见该文件头）。
usePopoverTriggerA11y({
  triggerRef,
  floatingId,
  isTooltip: () => isTooltip.value,
  isOpen: () => open.value,
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
      <!-- @slot trigger: 触发器元素（popover 模式必填）；不传则回退自带可访问名的纯图标按钮 -->
      <slot v-if="!isTooltip" name="trigger">
        <!-- 默认触发器是纯图标按钮，必须自带 aria-label（axe button-name）；
             调用方传 trigger slot 时自行负责可访问名 -->
        <button
          type="button"
          class="popover-btn"
          :aria-label="t('popover.trigger')"
          :aria-expanded="open"
          :aria-haspopup="isTooltip ? undefined : 'dialog'"
        >
          <IconSvg type="circle-alert" size="md" />
        </button>
      </slot>
      <!-- @slot default: tooltip 模式下的触发器内容 -->
      <slot v-else />
    </span>

    <!-- 浮层 -->
    <Teleport to="body">
      <Transition :name="isTooltip ? 'tip' : 'pop'">
        <div
          v-show="open"
          :id="floatingId"
          ref="floatingRef"
          :class="['pop-floating', `flip-${direction}`]"
          :style="floatingStyle"
          :role="isTooltip ? 'tooltip' : 'dialog'"
          :aria-labelledby="!isTooltip && title ? titleId : undefined"
          @mouseenter="onEnter"
          @mouseleave="onLeave"
          @focusout="onBlur"
        >
          <!-- 外壳只管定位与箭头（overflow 可见，箭头露边不被裁）；皮肤类在内层自裁圆角 -->
          <span v-if="arrow" class="pop-arrow" aria-hidden="true"></span>
          <div :class="isTooltip ? 'tooltip-pop pop-skin' : 'popover-card pop-skin'">
            <!-- tooltip 模式 -->
            <template v-if="isTooltip">{{ text }}</template>
            <!-- popover 模式 -->
            <template v-else>
              <div v-if="title" :id="titleId" class="popover-title">{{ title }}</div>
              <!-- @slot default: tooltip 模式为触发器内容；popover 模式为浮层主体内容 -->
              <div class="popover-body"><slot /></div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </span>
</template>

<style src="./popover-scoped.css" scoped></style>

<style src="./popover.css"></style>
