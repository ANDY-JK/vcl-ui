// ⛔ 保护 — 焦点管理 composable（ModalBox / Drawer 共用），禁止：删除 Tab 循环 / 焦点保存恢复逻辑
//    需我确认：autofocus 优先级策略、多弹窗竞态时的恢复时机
import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * 容器内可聚焦元素选择器：
 * button / a[href] / input / select / textarea / [tabindex] / [contenteditable] / iframe
 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]:not([contenteditable="false"])',
  'iframe',
].join(', ')

/**
 * 模块级激活序号：每次弹窗激活 +1。
 * 用于识别"本次停用前是否有更新的弹窗已激活"——配合 useModalManager 的互斥注册
 * （registerModal 会同步关闭旧弹窗），旧弹窗停用时若已有新弹窗激活，则不得恢复焦点，
 * 否则会把新弹窗的焦点抢走。
 */
let activationSeq = 0

/**
 * 元素是否真的可见：跳过 display:none / visibility:hidden 的元素及其隐藏祖先。
 * 不用 offsetParent / getClientRects 判定——它们依赖布局，且 position:fixed 元素的
 * offsetParent 本来就是 null，会把浮层里的按钮误杀。
 */
function isRendered(el: HTMLElement): boolean {
  if (!el.isConnected) return false
  let cur: HTMLElement | null = el
  while (cur) {
    if (cur.hasAttribute('hidden')) return false
    const style = getComputedStyle(cur)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    cur = cur.parentElement
  }
  return true
}

/** 容器内「可见」的可聚焦元素（保持 DOM 顺序） */
function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isRendered)
}

export interface UseFocusTrapOptions {
  /** 弹窗可见性 ref：内部 watch 自动 activate（true）/ deactivate（false） */
  visible: Ref<boolean>
  /** 返回焦点容器元素；返回 null 时激活/停用均为 no-op（如 confirm 模式委托场景） */
  getContainer?: () => HTMLElement | null
  /**
   * 打开时优先聚焦的目标：
   * - 'container'：聚焦容器本身（容器需可聚焦，如 tabindex="-1"）
   * - 选择器字符串：容器内匹配到的元素（容器自身匹配也可）
   * - 缺省：容器内第一个 focusable，找不到则聚焦容器
   */
  autofocus?: 'container' | string
}

export interface UseFocusTrapReturn {
  /** 激活焦点陷阱：保存当前焦点元素 → 容器内聚焦 → 绑定 Tab 循环 */
  activate: () => void
  /** 停用：解绑 Tab 循环；若期间有更新的弹窗已激活则跳过焦点恢复（避免抢焦点） */
  deactivate: () => void
  /** 当前是否处于激活状态 */
  isActive: () => boolean
}

export function useFocusTrap(options: UseFocusTrapOptions): UseFocusTrapReturn {
  const { visible, getContainer, autofocus } = options

  let active = false
  /** 激活前页面上的焦点元素（通常为打开弹窗的触发按钮），停用时恢复 */
  let lastFocusedEl: HTMLElement | null = null
  /** 本实例激活时的模块级序号，用于检测期间是否有更新的弹窗激活 */
  let myActivationSeq = 0

  /** Tab / Shift+Tab 在容器内循环，不逃逸到弹窗外 */
  function onKeydown(e: KeyboardEvent) {
    if (!active || e.key !== 'Tab') return
    const container = getContainer?.() ?? null
    if (!container) return
    const focusable = focusables(container)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else if (document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function focusInitial(container: HTMLElement) {
    let target: HTMLElement | null = null
    if (autofocus === 'container') {
      target = container
    } else if (typeof autofocus === 'string') {
      target = container.querySelector<HTMLElement>(autofocus)
      if (target && !isRendered(target)) target = null
      if (!target && container.matches(autofocus) && isRendered(container)) target = container
    }
    if (!target) target = focusables(container)[0] ?? null
    if (!target) target = container
    // 容器本身无 tabindex 时 focus() 静默无效，属预期（此时容器内必有其他可聚焦元素）
    target.focus()
  }

  function activate() {
    if (active) return
    active = true
    lastFocusedEl = document.activeElement instanceof HTMLElement ? document.activeElement : null
    myActivationSeq = ++activationSeq
    window.addEventListener('keydown', onKeydown)
    // 等 v-if 渲染完成后容器内聚焦（visible watch 先于渲染执行，此时容器可能还不存在）
    void nextTick(() => {
      if (!active) return
      const container = getContainer?.() ?? null
      if (!container) return
      focusInitial(container)
    })
  }

  function deactivate() {
    if (!active) return
    active = false
    window.removeEventListener('keydown', onKeydown)
    // 竞态：期间有更新的弹窗已激活（如被 registerModal 同步关闭），
    // 此时恢复焦点会抢走新弹窗的焦点 —— 跳过恢复
    if (myActivationSeq !== activationSeq) {
      lastFocusedEl = null
      return
    }
    const el = lastFocusedEl
    lastFocusedEl = null
    // 仅当触发元素仍在文档中才恢复焦点
    if (el && el.isConnected) {
      el.focus()
    }
  }

  // 自动绑定：visible 变化时激活/停用。须在组件 registerModal 的 visible watch 之前创建，
  // 保证"新弹窗先激活、旧弹窗后停用"，配合上面的序号检查消除焦点恢复竞态。
  // immediate：挂载时就已 visible=true（条件渲染 / 初始即打开）的弹层同样要接管焦点
  watch(
    visible,
    v => {
      if (v) activate()
      else deactivate()
    },
    { immediate: true },
  )

  // 组件卸载时兜底停用（恢复焦点仅在无更新弹窗时发生）
  onBeforeUnmount(() => deactivate())

  return { activate, deactivate, isActive: () => active }
}
