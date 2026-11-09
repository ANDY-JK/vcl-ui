import { onBeforeUnmount, type Ref } from 'vue'

/**
 * Menu 的悬停开合定时器（TD-101 收口 —— 与 menu-keyboard.ts 同法下沉）
 *
 * ## 为什么单独成文件
 *
 * `Menu.vue` 距 nav 域 280 行止涨线只剩 9 行（271/280），四版脚本化拆分把 SFC 切坏
 * （TS1005/1109/1434）—— 根因是 hover 块与 expand/click/键盘块**互相咬合**：
 * `clearTimers` 被 click 分支引用、`hoverKey` 同时驱动 hover 模式与键盘收起。
 * 本文件只收**纯定时器逻辑**：进/出延时、互斥清理、卸载兜底 ——
 * 与模板零耦合、与 expand/click 逻辑只通过 `hoverKey` 引用交接（返回值解构续用）。
 *
 * ## 语义（与抽离前逐字节等价）
 *
 * - `scheduleEnter(key)`：150ms 后 `hoverKey = key`；任何新调度先清掉旧定时器（互斥）。
 * - `scheduleLeave()`：150ms 后 `hoverKey = null`；与 enter 互斥。
 * - `cancelLeave()`：只取消"收起"，进入照常 —— 子菜单内部 hover 不闪收。
 * - `clearTimers()`：click 分支收笔（触屏点按会派发模拟 mouseenter，不清则
 *   第二次点按关闭后 150ms 又被定时器重新打开）。
 * - 卸载时清 pending 定时器，避免回调写已卸载组件的 ref。
 */

/** 悬停切换子菜单的进/出延时：同一手感，两向共用一个值 */
const HOVER_SWITCH_MS = 150

export function useMenuHover(hoverKey: Ref<string | number | null>) {
  let enterTimer: ReturnType<typeof setTimeout> | null = null
  let leaveTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers(): void {
    if (enterTimer) {
      clearTimeout(enterTimer)
      enterTimer = null
    }
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = null
    }
  }
  // 卸载时清理 pending 定时器，避免回调写已卸载组件的 ref
  onBeforeUnmount(clearTimers)

  function scheduleEnter(key: string | number): void {
    clearTimers()
    enterTimer = setTimeout(() => {
      hoverKey.value = key
    }, HOVER_SWITCH_MS)
  }
  function scheduleLeave(): void {
    clearTimers()
    leaveTimer = setTimeout(() => {
      // 收起悬停态（#476：抽离时这行被误写成 no-op，导致子菜单移开后一直挂着）
      hoverKey.value = null
      leaveTimer = null
    }, HOVER_SWITCH_MS)
  }
  function cancelLeave(): void {
    if (leaveTimer) {
      clearTimeout(leaveTimer)
      leaveTimer = null
    }
  }

  return { clearTimers, scheduleEnter, scheduleLeave, cancelLeave }
}

/** 便于既有用例/宿主对齐延时：导出常量而非魔法数 */
export const MENU_HOVER_SWITCH_MS = HOVER_SWITCH_MS
