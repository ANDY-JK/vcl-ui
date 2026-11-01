import { computed, ref, type Ref } from 'vue'

/**
 * Menu 的键盘漫游与 roving tabindex（#322 抽出）
 *
 * ## 为什么单独成文件
 *
 * 1. `Menu.vue` 距 nav 域 280 行止涨线只剩 13 行，键位逻辑放进去必然超线；
 * 2. 这套逻辑与模板无关，且**两个坑值得写下来**：
 *
 * ### 坑 ①：`role="menu"` 里只能有一个 Tab 停靠点
 *
 * APG 要求 menuitem 用 **roving tabindex**：整个菜单只有一项 `tabindex=0`，
 * 其余 `-1`，方向键在项间移动。此前每项都是 `tabindex=0` ——
 * 30 项的菜单就是 30 次 Tab。
 *
 * ### 坑 ②：方向键要能在菜单边界停住，也要能跳到首尾
 *
 * 到末项再按 ↓ 不该滚到页面别处（当前实现是"没反应"，这是对的），
 * 但 Home/End 必须能一步跳到首/末项，否则长菜单只能一格一格按。
 */

/** 菜单里可作为停靠点/导航目标的项（跳过 aria-disabled） */
function menuItems(el: HTMLElement): HTMLElement[] {
  const menuEl = el.closest('[role="menu"]')
  if (!menuEl) return []
  return Array.from(menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])'))
}

/** 方向键：在同级 menuitem 间移动（到边界即停，不循环 —— 避免用户以为按错了） */
export function focusSibling(el: HTMLElement, delta: 1 | -1): void {
  const items = menuItems(el)
  const next = items[items.indexOf(el) + delta]
  next?.focus()
}

/** Home / End：跳到同级首/末项 */
export function focusEdge(el: HTMLElement, edge: 'first' | 'last'): void {
  const items = menuItems(el)
  const target = edge === 'first' ? items[0] : items[items.length - 1]
  target?.focus()
}

/** roving tabindex：整个菜单只留一个 Tab 停靠点（见文件头 ①） */
export interface MenuRoving {
  tabKey: Ref<string | number | null>
  /** 计算某一项该不该进 Tab 序列 */
  menuTabindex: (item: { key: string | number; disabled?: boolean }) => number
}

/**
 * @param items 菜单项（顶层列表）
 * @param level 当前层级；**只有顶层**默认给出停靠点 —— 子菜单由父项方向键进入，
 *              这与 APG「子菜单不占 Tab 序列」一致
 */
export function useMenuRoving(
  items: () => { key: string | number; disabled?: boolean }[],
  level: () => number,
): MenuRoving {
  const tabKey = ref<string | number | null>(null)
  const firstEnabledKey = computed<string | number | null>(() => items().find((i) => !i.disabled)?.key ?? null)
  const menuTabindex = (item: { key: string | number; disabled?: boolean }): number => {
    if (item.disabled) return -1
    const stop = tabKey.value ?? (level() === 0 ? firstEnabledKey.value : null)
    return stop === item.key ? 0 : -1
  }
  return { tabKey, menuTabindex }
}
