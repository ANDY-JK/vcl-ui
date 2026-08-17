<script setup lang="ts">
// ⛔ 保护 — 气泡浮层，禁止：clamp() → px，浮动定位算法，z-index
//    需我确认：trigger 触发方式、placement 位置选项
import { ref, computed, nextTick } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useFloating } from '@/components/_internal/useFloating'
import { useClickOutside } from '@/components/_internal/useClickOutside'
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

const dirMap: Record<string, FlipDirection> = { top: 'up', bottom: 'down', left: 'left', right: 'right' }
const { triggerRef, floatingRef, direction, floatingStyle, updatePosition, prepareOpen } = useFloating({
  offset: isTooltip ? 6 : 8,
  defaultDirection: isTooltip ? dirMap[props.position] : 'down',
  minSize: isTooltip ? 20 : 80,
  matchWidth: false,
})

async function toggle(e: MouseEvent) {
  if (isTooltip || props.trigger !== 'click') return
  if (open.value) { open.value = false; return }
  prepareOpen()
  open.value = true
  await nextTick()
  await new Promise(r => requestAnimationFrame(r))
  updatePosition(e.currentTarget as HTMLElement)
}

async function show() {
  if (!isTooltip && props.trigger === 'click') return
  const token = ++_showToken
  prepareOpen()
  open.value = true
  await nextTick()
  await new Promise(r => requestAnimationFrame(r))
  // 竞态检查：如果已被 hide() 取消，跳过 updatePosition
  if (token !== _showToken) return
  updatePosition(triggerRef.value || undefined)
}

function hide() {
  _showToken++ // 取消所有 pending 的 show()
  if (isTooltip || props.trigger === 'hover' || props.trigger === 'focus') open.value = false
}

function onFocus() {
  if (props.trigger !== 'focus') return
  show()
}

function onBlur() {
  if (props.trigger !== 'focus') return
  hide()
}

function close() { open.value = false }
useClickOutside([triggerRef, floatingRef], close)
</script>

<template>
  <span class="popover-host" :class="{ tooltip: isTooltip }">
    <!-- 触发器 -->
    <span ref="triggerRef" @click="toggle" @mouseenter="show" @mouseleave="hide" @focus="onFocus" @blur="onBlur">
      <slot name="trigger" v-if="!isTooltip">
        <button type="button" class="popover-btn">
          <IconSvg type="circle-alert" size="md" />
        </button>
      </slot>
      <slot v-else />
    </span>

    <!-- 浮层 -->
    <!-- #ifndef MP_WEIXIN -->
    <Teleport to="body">
    <!-- #endif -->
      <Transition :name="isTooltip ? 'tip' : 'pop'">
        <div
          v-show="open"
          ref="floatingRef"
          :class="[isTooltip ? 'tooltip-pop' : 'popover-card', !isTooltip && `flip-${direction}`]"
          :style="floatingStyle"
          @mouseenter="isTooltip ? show() : (props.trigger === 'hover' && show())"
          @mouseleave="hide"
        >
          <!-- tooltip 模式 -->
          <template v-if="isTooltip">{{ text }}</template>
          <!-- popover 模式 -->
          <template v-else>
            <div v-if="title" class="popover-title">{{ title }}</div>
            <div class="popover-body"><slot /></div>
          </template>
        </div>
      </Transition>
    <!-- #ifndef MP_WEIXIN -->
    </Teleport>
    <!-- #endif -->
  </span>
</template>

<style scoped>
.popover-host { position: relative; display: inline-flex; }
.popover-host.tooltip { cursor: default; }
.popover-btn {
  display: flex; padding: var(--space-1); border: none; background: transparent;
  color: var(--color-text-muted); cursor: pointer;
}
</style>

<style>
/* ===== popover 卡片 ===== */
.popover-card {
  min-width: clamp(160px, 26vw, 220px); max-width: clamp(280px, 42vw, 380px);
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); overflow: hidden;
}
.popover-title {
  padding: clamp(7px, 1.2vw, 10px) clamp(10px, 1.8vw, 14px);
  font-size: clamp(11px, 1.8vw, 13px); font-weight: 600;
  border-bottom: 1px solid var(--color-border-light);
}
.popover-body {
  padding: clamp(8px, 1.5vw, 12px) clamp(10px, 1.8vw, 14px);
  font-size: clamp(11px, 1.8vw, 13px); color: var(--color-text-secondary);
}

/* ===== tooltip 气泡 ===== */
.tooltip-pop {
  max-width: clamp(180px, 32vw, 320px);
  padding: clamp(3px, 0.6vw, 6px) clamp(5px, 1vw, 10px);
  background: var(--color-sidebar); color: white;
  font-size: clamp(11px, 1.5vw, 12px); border-radius: var(--radius-sm);
  white-space: normal; word-break: break-word; line-height: 1.4;
  pointer-events: none;
}

/* ===== 过渡 ===== */
/* popover 卡片：弹性缓动 + 微缩放，进场 200ms 退场 150ms */
.pop-enter-active { transition: opacity var(--transition-normal), transform var(--transition-normal); }
.pop-leave-active { transition: opacity var(--transition-fast), transform var(--transition-fast); }
.pop-enter-from { opacity: 0; transform: translateY(-6px) scale(0.97); }
.pop-leave-to   { opacity: 0; transform: translateY(-4px) scale(0.97); }
/* 向上展开时动画方向反转 */
.flip-up.pop-enter-from { transform: translateY(6px) scale(0.97); }
.flip-up.pop-leave-to   { transform: translateY(4px) scale(0.97); }

/* tooltip：纯淡入淡出，轻量快速 */
.tip-enter-active { transition: opacity var(--transition-fast); }
.tip-leave-active { transition: opacity var(--transition-fast); }
.tip-enter-from, .tip-leave-to { opacity: 0; }
</style>
