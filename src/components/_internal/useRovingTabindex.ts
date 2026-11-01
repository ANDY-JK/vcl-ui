/**
 * useRovingTabindex — 顺序型容器（tabs / menu / tree / listbox）的 roving tabindex（#324）
 *
 * ## 为什么要有这个文件
 *
 * "可聚焦元素随数据增长"这族问题已经出现过四次：日历 42 格（#318）、菜单每项（#322）、
 * 下拉选项（#323）、以及本轮 tabs/步骤条/大纲树（#324）。每次都是**同一个坑、不同的组件**。
 *
 * 规矩只有两条：
 *   1. 容器里**同一时刻只有一个**元素 `tabindex=0`（Tab 进来落在它身上）
 *   2. 方向键在同一容器内移动焦点，并**把停靠点带过去**
 *
 * 这里把这两条做成一个组合式函数，别再每个组件重写一遍（重写必然有人漏一条）。
 */
import { ref, type Ref } from 'vue'

export type RovingOrientation = 'horizontal' | 'vertical' | 'both'

export interface RovingOptions {
  /** 容器内可聚焦元素的 key 列表（顺序即视觉顺序） */
  keys: () => (string | number)[]
  /** 当前选中/激活的 key（决定初始停靠点） */
  activeKey?: () => string | number | null | undefined
  /** 方向键方向：tabs 用 horizontal，菜单/树用 vertical，日历用 both */
  orientation?: RovingOrientation
  /** 到边界是否循环（menubar 常循环，listbox 常不循环） */
  wrap?: boolean
}

export interface RovingApi {
  /** 当前停靠点 key */
  tabKey: Ref<string | number | null>
  /** 某 key 该拿到的 tabindex */
  tabindexFor: (key: string | number) => number
  /** 方向键处理（挂在容器上即可）：返回 true 表示已消费 */
  onKeydown: (e: KeyboardEvent) => boolean
  /** 手动设置停靠点（元素获得焦点时调用） */
  focusKey: (key: string | number) => void
}

export function useRovingTabindex(opts: RovingOptions): RovingApi {
  const orientation = opts.orientation ?? 'horizontal'
  const wrap = opts.wrap ?? true
  // tabKey 只记"键盘移动产生的覆盖"；初始停靠点**由 activeKey 每次推导**。
  // 不在初始化时复制一份 —— 两处来源会让"停靠点不跟选中走"这种 bug 单点变异测不出来（#314 的教训）。
  const tabKey = ref<string | number | null>(null)

  const currentKey = (): string | number | null => {
    const keys = opts.keys()
    if (tabKey.value != null && keys.includes(tabKey.value)) return tabKey.value
    const active = opts.activeKey?.()
    if (active != null && keys.includes(active)) return active
    return keys[0] ?? null
  }

  const tabindexFor = (key: string | number): number => (currentKey() === key ? 0 : -1)

  const focusKey = (key: string | number): void => {
    tabKey.value = key
  }

  const onKeydown = (e: KeyboardEvent): boolean => {
    const keys = opts.keys()
    if (!keys.length) return false
    const idx = keys.indexOf(currentKey() as string | number)
    const prevKeys =
      orientation === 'vertical' ? ['ArrowUp'] : orientation === 'horizontal' ? ['ArrowLeft'] : ['ArrowLeft', 'ArrowUp']
    const nextKeys =
      orientation === 'vertical'
        ? ['ArrowDown']
        : orientation === 'horizontal'
          ? ['ArrowRight']
          : ['ArrowRight', 'ArrowDown']
    let next: number
    if (nextKeys.includes(e.key)) next = idx + 1
    else if (prevKeys.includes(e.key)) next = idx - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = keys.length - 1
    else return false
    if (next < 0) next = wrap ? keys.length - 1 : 0
    if (next > keys.length - 1) next = wrap ? 0 : keys.length - 1
    e.preventDefault?.()
    const key = keys[next]!
    tabKey.value = key
    // 让真实 DOM 焦点跟上（停靠点只是"下一个 Tab 落在哪"，不是焦点本身）
    const container = (e.currentTarget as HTMLElement | null) ?? null
    const el = container?.querySelector<HTMLElement>(`[data-roving-key="${String(key)}"]`)
    el?.focus()
    return true
  }

  return { tabKey, tabindexFor, onKeydown, focusKey }
}
