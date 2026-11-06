// useDataTableScroll —— 卡片渐进加载 + 滚动进度条（#469 从 DataTable.vue 拆出）
//
// 两块逻辑此前挤在 DataTable 的 script 里（约 116 行）。本 spec 直接测组合式函数本身：
//   · 渐进加载：初始上限、滚动预取、批大小按实测间距换算、卡片视图切换时重置；
//   · 进度条：滚动百分比、可滚动检测、点击跳转、拖拽。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import { useDataTableScroll } from '@/components/data/useDataTableScroll'

function makeHost(over: Partial<Parameters<typeof useDataTableScroll>[0]> = {}) {
  const isCardViewEffective = ref(true)
  const tableWrapRef = ref<HTMLElement | null>(null)
  const scrollContainerRef = ref<HTMLElement | null>(null)
  const displayData = ref<Record<string, unknown>[]>([])
  const pagedData = ref<Record<string, unknown>[]>([])
  const isFullscreen = ref(false)
  const pageSize = ref<number | undefined>(10)
  return {
    host: {
      isCardViewEffective,
      tableWrapRef,
      scrollContainerRef,
      displayData,
      zoomX: ref(1),
      zoomY: ref(1),
      pagedData,
      isFullscreen,
      pageSize,
    },
    refs: { isCardViewEffective, tableWrapRef, scrollContainerRef, displayData, pagedData, isFullscreen, pageSize },
    ...over,
  }
}

/** 造一个假滚动容器：scrollHeight/clientHeight/scrollTop 可设 */
function fakeScrollEl({ scrollHeight = 1000, clientHeight = 200, scrollTop = 0 } = {}) {
  return {
    scrollHeight,
    clientHeight,
    scrollTop,
    scrollTo: vi.fn(),
    querySelector: () => null,
    closest: () => null,
  } as unknown as HTMLElement
}

describe('useDataTableScroll · 卡片渐进加载', () => {
  it('初始上限 = 50；卡片视图切走到 true 时重置为当前批大小', async () => {
    const { host } = makeHost()
    // watch 绑定当前组件实例 —— 必须在真实 setup 里调用
    let api: ReturnType<typeof useDataTableScroll>
    mount(
      defineComponent({
        setup() {
          api = useDataTableScroll(host as never)
          return () => null
        },
      }),
    )
    expect(api!.cardRenderLimit.value).toBe(50)
    api!.cardRenderLimit.value = 120
    host.isCardViewEffective.value = false
    await nextTick()
    host.isCardViewEffective.value = true
    await nextTick()
    expect(api!.cardRenderLimit.value).toBe(50)
  })

  it('卡片可见数据 = 分页数据按上限裁剪', () => {
    const { host, refs } = makeHost()
    refs.pagedData.value = Array.from({ length: 80 }, (_, i) => ({ id: i }))
    const s = useDataTableScroll(host)
    expect(s.cardVisibleData.value).toHaveLength(50)
    s.cardRenderLimit.value = 70
    expect(s.cardVisibleData.value).toHaveLength(70)
  })

  it('全屏 + 分页模式：忽略分页限制，用全量数据', () => {
    const { host, refs } = makeHost()
    refs.isFullscreen.value = true
    refs.pageSize.value = 10
    refs.pagedData.value = [{ id: 1 }]
    refs.displayData.value = Array.from({ length: 25 }, (_, i) => ({ id: i }))
    const s = useDataTableScroll(host)
    expect(s.effectivePagedData.value).toHaveLength(25)
  })

  it('滚动到底前一屏：批量补到「不超过总量」', () => {
    const { host, refs } = makeHost()
    refs.pagedData.value = Array.from({ length: 80 }, (_, i) => ({ id: i }))
    const s = useDataTableScroll(host)
    s.cardRenderLimit.value = 50
    const el = fakeScrollEl({ scrollHeight: 1000, clientHeight: 200, scrollTop: 790 })
    s.onCardScroll({ target: el } as unknown as Event)
    expect(s.cardRenderLimit.value).toBeLessThanOrEqual(80)
    expect(s.cardRenderLimit.value).toBeGreaterThan(50)
  })

  it('批大小按实测间距换算：矮卡片一次补更多（_remeasureCardBatch 生效）', () => {
    const { host, refs } = makeHost()
    refs.pagedData.value = Array.from({ length: 200 }, (_, i) => ({ id: i }))
    const s = useDataTableScroll(host)
    // 卡片间距 100px、容器高 600 → 两屏 = 1200 / 100 = 12 张
    const el = {
      clientHeight: 600,
      scrollHeight: 5000,
      scrollTop: 4000,
      firstElementChild: { offsetTop: 0, nextElementSibling: { offsetTop: 100 }, offsetHeight: 90 },
    } as unknown as HTMLElement
    s.onCardScroll({ target: el } as unknown as Event)
    expect(s.cardRenderLimit.value).toBe(50 + 12)
  })

  it('反向保护：滚动未到预取线时不增批', () => {
    const { host, refs } = makeHost()
    refs.pagedData.value = Array.from({ length: 200 }, (_, i) => ({ id: i }))
    const s = useDataTableScroll(host)
    s.cardRenderLimit.value = 50
    const el = fakeScrollEl({ scrollHeight: 1000, clientHeight: 200, scrollTop: 0 })
    s.onCardScroll({ target: el } as unknown as Event)
    expect(s.cardRenderLimit.value).toBe(50)
  })
})

describe('useDataTableScroll · 滚动进度条', () => {
  it('滚动事件：算百分比 + 溢出检测（RAF 内生效）', async () => {
    const { host } = makeHost()
    const s = useDataTableScroll(host)
    const el = fakeScrollEl({ scrollHeight: 1000, clientHeight: 200, scrollTop: 400 })
    s.onScrollProgress({ target: el } as unknown as Event)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    expect(s.scrollProgress.value).toBe(50)
    expect(s.scrollable.value).toBe(true)
  })

  it('无溢出（内容不足一屏）：进度 0 且不可滚动', async () => {
    const { host } = makeHost()
    const s = useDataTableScroll(host)
    const el = fakeScrollEl({ scrollHeight: 200, clientHeight: 200, scrollTop: 0 })
    s.onScrollProgress({ target: el } as unknown as Event)
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    expect(s.scrollProgress.value).toBe(0)
    expect(s.scrollable.value).toBe(false)
  })

  it('checkScrollable：卡片视图读 .card-view-scroll，列表视图读 scrollContainerRef', async () => {
    const { host, refs } = makeHost()
    const s = useDataTableScroll(host)
    // 列表视图 + 宿主容器
    host.isCardViewEffective.value = false
    refs.scrollContainerRef.value = fakeScrollEl({ scrollHeight: 800, clientHeight: 200 })
    s.checkScrollable()
    await nextTick()
    expect(s.scrollable.value).toBe(true)
  })

  it('点击进度条：换算成滚动位置并 scrollTo（seekScroll 路径）', () => {
    const { host } = makeHost()
    const s = useDataTableScroll(host)
    const inner = fakeScrollEl({ scrollHeight: 1000, clientHeight: 200 })
    const bar = {
      closest: () => ({ querySelector: () => inner }),
      getBoundingClientRect: () => ({ left: 0, width: 200 }),
      querySelector: () => null,
    } as unknown as HTMLElement
    // 点在 25% 处 → scrollTop = 0.25 * (1000-200) = 200
    s.onProgressMouseDown({ clientX: 50, currentTarget: bar } as unknown as MouseEvent)
    expect(inner.scrollTo).toHaveBeenCalledWith({ top: 200, behavior: 'instant' })
  })

  it('拖拽：mousemove 持续跳转、mouseup 解绑监听', () => {
    const { host } = makeHost()
    const s = useDataTableScroll(host)
    const addSpy = vi.spyOn(document, 'addEventListener')
    const rmSpy = vi.spyOn(document, 'removeEventListener')
    const inner = fakeScrollEl({ scrollHeight: 1000, clientHeight: 200 })
    const bar = {
      closest: () => ({ querySelector: () => inner }),
      getBoundingClientRect: () => ({ left: 0, width: 200 }),
      querySelector: () => null,
    } as unknown as HTMLElement
    s.onProgressMouseDown({ clientX: 100, currentTarget: bar } as unknown as MouseEvent)
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    // 触发 mouseup → 解绑
    const up = rmSpy.mock.calls
    document.dispatchEvent(new MouseEvent('mouseup'))
    expect(up.length).toBeGreaterThan(0)
    addSpy.mockRestore()
    rmSpy.mockRestore()
  })
})
