// useListVirtual 窗口计算单测：切片边界、占位高度自洽、阈值、越界回收。
// 端到端（真滚动 + 点谁就是谁）由浏览器取证覆盖；这里锁纯计算部分，防等系数学回退。
// 注：onScroll 内部用 rAF 合帧，断言前必须等过真实一帧（await Promise.resolve() 刷不动）。
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useListVirtual } from '@/components/form/utils/useListVirtual'

const ROW = 20
const VIEW = 200
/** 等过 rAF 合帧 */
const frame = () => new Promise((r) => setTimeout(r, 30))

function setup(count: number, min = 200) {
  const el = { scrollTop: 0, clientHeight: VIEW }
  const api = useListVirtual({
    container: () => el as unknown as HTMLElement,
    itemCount: () => count,
    rowHeight: () => ROW,
    minCount: () => min,
  })
  return { api, el }
}

const scroll = (api: ReturnType<typeof setup>['api'], top: number) => {
  api.onScroll({ target: { scrollTop: top, clientHeight: VIEW } } as unknown as Event)
  return frame()
}

describe('useListVirtual', () => {
  it('行数未超过阈值 → 不启用，全量渲染且无占位', async () => {
    const { api } = setup(50)
    await scroll(api, 0)
    expect(api.enabled.value).toBe(false)
    expect(api.start.value).toBe(0)
    expect(api.end.value).toBe(50)
    expect(api.topPad.value).toBe(0)
    expect(api.bottomPad.value).toBe(0)
  })

  it('行高测不出来（0）时不启用 —— 宁可全渲染也不能错行', () => {
    const api = useListVirtual({ container: () => null, itemCount: () => 10000, rowHeight: () => 0 })
    expect(api.enabled.value).toBe(false)
  })

  it('顶部：窗口只覆盖可视区 + overscan，上下占位补满全量高', async () => {
    const { api } = setup(10000)
    await scroll(api, 0)
    expect(api.enabled.value).toBe(true)
    expect(api.start.value).toBe(0)
    expect(api.end.value).toBeLessThanOrEqual(30)
    const renderedH = (api.end.value - api.start.value) * ROW
    expect(api.topPad.value + renderedH + api.bottomPad.value, '滚动条长度必须真实').toBe(10000 * ROW)
  })

  it('滚到中段：start 随 scrollTop 推进，占位仍补满总高', async () => {
    const { api } = setup(10000)
    await scroll(api, 0)
    await scroll(api, 4000)
    expect(api.start.value, '窗口未推进').toBeGreaterThan(0)
    expect(api.start.value).toBeLessThanOrEqual(Math.floor(4000 / ROW))
    const renderedH = (api.end.value - api.start.value) * ROW
    expect(api.topPad.value + renderedH + api.bottomPad.value).toBe(10000 * ROW)
  })

  it('滚到底：末项必须落进窗口（否则用户看不到最后一行）', async () => {
    const { api } = setup(10000)
    await scroll(api, 10000 * ROW - VIEW)
    expect(api.end.value).toBe(10000)
    expect(api.bottomPad.value).toBe(0)
  })

  it('scrollTop 越界（列表被过滤变短）时窗口回收到有效区间，且绝不被压空', async () => {
    const n = ref(10000)
    const api = useListVirtual({ container: () => null, itemCount: () => n.value, rowHeight: () => ROW })
    await scroll(api, 190000)
    n.value = 100
    expect(api.start.value).toBeLessThan(100)
    expect(api.end.value).toBeLessThanOrEqual(100)
    // 关键不变式：窗口至少渲染一屏，否则用户看到的是"莫名其妙空掉"的下拉
    expect(api.end.value - api.start.value, `窗口空了：start=${api.start.value} end=${api.end.value}`).toBeGreaterThan(0)
    expect(api.bottomPad.value).toBeGreaterThanOrEqual(0)
    // 占位 + 渲染行仍等于全量高
    const renderedH = (api.end.value - api.start.value) * ROW
    expect(api.topPad.value + renderedH + api.bottomPad.value).toBe(100 * ROW)
  })

  it('scrollToIndex 把目标滚进可视区；未启用窗口时不擅自动容器', async () => {
    const big = setup(10000)
    await scroll(big.api, 0)
    big.api.scrollToIndex(5000)
    expect(big.el.scrollTop, '应把第 5000 行滚进可视区').toBeGreaterThan(0)

    const small = setup(30)
    await scroll(small.api, 0)
    small.api.scrollToIndex(25)
    expect(small.el.scrollTop, '未启用时不该动容器').toBe(0)
  })
})
