/**
 * Popover 触发器的无障碍关联（#321 抽出）
 *
 * ## 为什么单独成文件
 *
 * 1. `Popover.vue` 撞了 290 行止涨线（check:constants），这段逻辑与模板无关，适合下沉；
 * 2. 逻辑本身有两处容易写错的地方，值得单独说明：
 *
 * ### ① 必须挂在"真正被聚焦的元素"上
 *
 * 插槽首个子元素可能只是图标或包裹层（不可聚焦）—— 只给它加 `aria-describedby`，
 * 读屏不会播报。所以优先找首个可聚焦后代，退化为首个子元素，再退化为宿主。
 *
 * ### ② 自定义插槽触发器拿不到模板上的 aria
 *
 * 内置触发器的 `<button>` 上绑了 `:aria-expanded` / `:aria-haspopup`，但用
 * `<template #trigger>` 换成自己的按钮后这些属性**一个都没有** —— 读屏完全不知道
 * "这是可展开的、现在展开没"。所以这里统一用 DOM 属性补，覆盖两种触发器。
 */
import { watchEffect, type Ref } from 'vue'

/** 可聚焦元素选择器（Popover 的焦点移入逻辑也用它） */
export const FOCUSABLE_SELECTOR = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])'

/** 找语义该挂在哪个元素上（见文件头 ①） */
export function describedTarget(host: HTMLElement): HTMLElement {
  return host.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? (host.firstElementChild as HTMLElement | null) ?? host
}

export interface PopoverA11yOptions {
  triggerRef: Ref<HTMLElement | null>
  /** 浮层唯一 id（aria-controls 指向它） */
  floatingId: string
  isTooltip: () => boolean
  isOpen: () => boolean
}

/**
 * 维护触发器上的 aria 关联：
 * - tooltip：`aria-describedby`（并移除展开态相关属性 —— tooltip 不是可展开控件）
 * - 其它：`aria-expanded` + `aria-haspopup="dialog"` + 展开时的 `aria-controls`
 *   （关闭时移除 controls，避免指向已不存在的元素）
 */
export function usePopoverTriggerA11y(opts: PopoverA11yOptions): void {
  watchEffect(() => {
    const host = opts.triggerRef.value
    if (!host) return
    const target = describedTarget(host)
    if (opts.isTooltip()) {
      target.setAttribute('aria-describedby', opts.floatingId)
      target.removeAttribute('aria-expanded')
      target.removeAttribute('aria-controls')
      return
    }
    target.removeAttribute('aria-describedby')
    target.setAttribute('aria-expanded', opts.isOpen() ? 'true' : 'false')
    target.setAttribute('aria-haspopup', 'dialog')
    if (opts.isOpen()) target.setAttribute('aria-controls', opts.floatingId)
    else target.removeAttribute('aria-controls')
  })
}
