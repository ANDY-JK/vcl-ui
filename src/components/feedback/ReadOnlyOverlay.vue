<script setup lang="ts">
// ⛔ 保护 — 只读遮罩，禁止：遮罩透明度；z-index 层级 = var(--vcl-z-readonly, 2500)（压 modal/overlay/dropdown）
//    需我确认：visible 触发逻辑、slot 内容区
import { ref, watch, onUnmounted, nextTick } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  /** 显隐 */
  visible: boolean
  /** 只读原因（空串用内置 i18n 文案） */
  reason?: string
}

const props = withDefaults(defineProps<Props>(), {
  reason: '',
})

const overlayRef = ref<HTMLElement | null>(null)
/** 显示前记录焦点来源，关闭时归还（遮罩消失后焦点落 body，键盘用户丢失位置） */
let prevFocus: HTMLElement | null = null

/**
 * 只读遮罩必须真的挡住键盘，而不只是挡鼠标：
 * - 显示时把焦点收进遮罩，焦点一旦落到背景元素立即弹回（aria-modal 语义落地）；
 * - 捕获阶段拦下 Tab（防焦点逃逸）与背景控件上的 Enter/Space（防回车绕过只读提交）；
 * - 不拦方向键 / PageDown 等滚动键，也不锁 body overflow —— 遮罩后的内容仍可滚动查看。
 */
function onKeydownCapture(e: KeyboardEvent) {
  if (!props.visible) return
  if (e.key === 'Tab') {
    e.preventDefault()
    overlayRef.value?.focus()
    return
  }
  // 焦点锁在遮罩上时 Enter/Space 命中不到任何背景控件，放行以保留 Space 滚动；
  // 只有焦点意外逃到背景元素上才拦截，堵死键盘绕过只读
  if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && e.target !== overlayRef.value) {
    e.preventDefault()
  }
}

function onFocusIn(e: FocusEvent) {
  if (!props.visible) return
  if (e.target === overlayRef.value) return
  overlayRef.value?.focus()
}

let attached = false
function attach() {
  if (attached || typeof document === 'undefined') return
  document.addEventListener('keydown', onKeydownCapture, true)
  document.addEventListener('focusin', onFocusIn, true)
  attached = true
}
function detach() {
  if (!attached) return
  document.removeEventListener('keydown', onKeydownCapture, true)
  document.removeEventListener('focusin', onFocusIn, true)
  attached = false
}

watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      detach()
      // 归还焦点：遮罩消失后键盘用户回到触发前的位置
      if (prevFocus?.isConnected) prevFocus.focus()
      prevFocus = null
      return
    }
    // typeof document 守卫（#506）：本回调带 immediate: true，会在 **setup 阶段同步执行**，
    // SSR 下同样会跑。`attach()` 自己挡了，但上面这行 `document.activeElement` 以前没挡 ——
    // 又因为回调是 async 函数，ReferenceError 变成 **unhandled rejection** 而不是同步崩溃：
    // 渲染照常出 HTML、用例全绿、进程退出码却是 1 —— 三层信号自相矛盾，极难定位。
    // 宿主在服务端渲染一个 visible 本来就为 true 的遮罩（权限在服务端判定）时必中。
    prevFocus =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : null
    attach()
    await nextTick()
    overlayRef.value?.focus()
  },
  { immediate: true },
)

onUnmounted(detach)
</script>

<template>
  <Transition name="fade">
    <div
      v-if="visible"
      ref="overlayRef"
      class="readonly-overlay"
      role="alertdialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="reason || t('readonly.defaultReason')"
    >
      <div class="readonly-content">
        <IconSvg type="lock" size="lg" color="white" />
        <p>{{ reason || t('readonly.defaultReason') }}</p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.readonly-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--vcl-z-readonly, 2500);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  /* 持焦容器是整屏遮罩，画出焦点环既无意义又难看 */
  outline: none;
}

.readonly-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(12px * var(--vcl-scale));
  color: white;
  font-size: calc(36px * var(--vcl-scale));
  text-align: center;
  padding: calc(20px * var(--vcl-scale));
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--vcl-transition-slow);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
