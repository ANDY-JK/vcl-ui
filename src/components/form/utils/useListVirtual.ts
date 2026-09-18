/**
 * useListVirtual — 定高列表的窗口渲染（下拉/列表共用）
 *
 * 为什么需要它：Select 的下拉面板直接把 filteredOptions 全量 v-for 出来，1 万个选项
 * 就是 1 万个 <button>（.panel-list 只有 200px 可视高，其余 98% 是看不见的节点）。
 *
 * 前提与退让：
 * - 只在**行高一致**时启用。带 desc 或自定义 #option 插槽的行更高，等系数学会让
 *   scrollTop → 行号 的换算越滚越偏，所以那种列表由调用方直接不启用（宁可全渲染）。
 * - 只在行数超过 minCount 时启用。几十行的下拉渲染开销远小于窗口计算本身。
 * - 上下各留 OVERSCAN 行，快速滚动时不露白。
 */
import { computed, ref, type ComputedRef } from 'vue'

const OVERSCAN = 8

export interface ListVirtualOptions {
  /** 滚动容器（.panel-list） */
  container: () => HTMLElement | null
  /** 当前要渲染的条目总数（已过滤后的长度） */
  itemCount: () => number
  /** 单行高度，px */
  rowHeight: () => number
  /** 行数低于此值不启用窗口 */
  minCount?: () => number
}

export interface ListVirtualApi {
  enabled: ComputedRef<boolean>
  start: ComputedRef<number>
  end: ComputedRef<number>
  topPad: ComputedRef<number>
  bottomPad: ComputedRef<number>
  /** 绑到容器的 @scroll */
  onScroll: (e: Event) => void
  /** 列表内容变化（如搜索过滤）后回到顶部，避免停留在越界的旧偏移上 */
  reset: () => void
  /** 把某一条目滚进可视区（键盘上下键跨窗口时用） */
  scrollToIndex: (index: number) => void
}

export function useListVirtual(o: ListVirtualOptions): ListVirtualApi {
  const scrollTop = ref(0)
  const viewH = ref(0)

  const enabled = computed(() => {
    const min = o.minCount?.() ?? 200
    return o.itemCount() > min && o.rowHeight() > 0
  })

  const start = computed(() => {
    if (!enabled.value) return 0
    return Math.max(0, Math.floor(scrollTop.value / o.rowHeight()) - OVERSCAN)
  })

  const end = computed(() => {
    if (!enabled.value) return o.itemCount()
    const visible = Math.ceil((viewH.value || 200) / o.rowHeight())
    return Math.min(o.itemCount(), Math.ceil(scrollTop.value / o.rowHeight()) + visible + OVERSCAN)
  })

  const topPad = computed(() => (enabled.value ? start.value * o.rowHeight() : 0))
  const bottomPad = computed(() =>
    enabled.value ? Math.max(0, (o.itemCount() - end.value) * o.rowHeight()) : 0,
  )

  let raf = 0
  function onScroll(e: Event) {
    const el = e.target as HTMLElement
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      scrollTop.value = el.scrollTop
      viewH.value = el.clientHeight
    })
  }

  function reset() {
    scrollTop.value = 0
    const el = o.container()
    if (el) el.scrollTop = 0
  }

  function scrollToIndex(index: number) {
    const el = o.container()
    if (!el || !enabled.value) return
    const rh = o.rowHeight()
    const itemTop = index * rh
    const itemBottom = itemTop + rh
    const viewTop = el.scrollTop
    const viewBottom = viewTop + el.clientHeight
    if (itemTop < viewTop) el.scrollTop = Math.max(0, itemTop - rh)
    else if (itemBottom > viewBottom) el.scrollTop = itemBottom - el.clientHeight + rh
    // el.scrollTop 的赋值会触发 @scroll → 下一帧窗口自动跟上
  }

  return { enabled, start, end, topPad, bottomPad, onScroll, reset, scrollToIndex }
}
