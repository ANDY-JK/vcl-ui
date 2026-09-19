// useTableWindowScroll 判定逻辑单测：两种滚动源 + 测不出源时的保守兜底。
// 元素尺寸用桩量测给出（happy-dom 无布局，真实 rect 由 workspace/probe 的真浏览器取证覆盖）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useTableWindowScroll } from '@/components/data/composables/useTableWindowScroll'

/** 造一个只实现被测代码用到的那几个成员的假元素 */
function fakeEl(opt: {
  scrollHeight: number
  clientHeight: number
  scrollTop?: number
  tbodyTop?: number
  theadH?: number
}) {
  const tbody = { getBoundingClientRect: () => ({ top: opt.tbodyTop ?? 0 }) } as unknown as HTMLElement
  const thead = { getBoundingClientRect: () => ({ height: opt.theadH ?? 0 }) } as unknown as HTMLElement
  const el = {
    scrollHeight: opt.scrollHeight,
    clientHeight: opt.clientHeight,
    scrollTop: opt.scrollTop ?? 0,
    parentElement: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: (s: string) => (s === 'tbody' ? tbody : s === 'thead' ? thead : null),
  }
  return el as unknown as HTMLElement
}

function setup(el: HTMLElement, active = ref(false)) {
  const scrollTop = ref(-1)
  const containerHeight = ref(-1)
  const ready = ref(false)
  const api = useTableWindowScroll({
    active: () => active.value,
    container: () => el,
    sourceLength: () => 5000,
    scrollTop,
    containerHeight,
    ready,
  })
  return { active, scrollTop, containerHeight, ready, api }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTableWindowScroll', () => {
  it('A 类：.table-scroll 自身可滚时读它自己的 scrollTop/clientHeight', async () => {
    const el = fakeEl({ scrollHeight: 200000, clientHeight: 600, scrollTop: 4000 })
    const s = setup(el)
    s.active.value = true
    await nextTick()
    expect(s.scrollTop.value).toBe(4000)
    expect(s.containerHeight.value).toBe(600)
    expect(s.ready.value, '找到可滚源应放行虚拟化').toBe(true)
    // 监听挂在容器自身，而不是 window
    expect((el as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener).toHaveBeenCalled()
  })

  it('B 类：容器不自己滚时，用两个 rect 反推等效 scrollTop', async () => {
    // 不受高度约束的盒子：clientHeight 与 scrollHeight 相等 → 自身不可滚，滚动发生在外层
    const el = fakeEl({ scrollHeight: 200000, clientHeight: 200000, tbodyTop: -1000, theadH: 40 })
    const s = setup(el)
    s.active.value = true
    await nextTick()
    // 可视起点 = 0(视口顶) + 40(sticky 表头)，tbody 顶边在 -1000 → 等效 scrollTop = 1040
    expect(s.scrollTop.value).toBe(40 + 1000)
    expect(s.containerHeight.value).toBe(window.innerHeight - 40)
    expect(s.ready.value).toBe(true)
  })

  it('表格还没滚到时等效 scrollTop 钳到 0，不出现负索引', async () => {
    const el = fakeEl({ scrollHeight: 200000, clientHeight: 0, tbodyTop: 300, theadH: 40 })
    const s = setup(el)
    s.active.value = true
    await nextTick()
    expect(s.scrollTop.value).toBe(0)
  })

  it('找不到任何可滚源：ready 保持 false，调用方据此退回全量渲染', async () => {
    // 无布局环境的形态：scrollHeight 与 clientHeight 同为 0
    const el = fakeEl({ scrollHeight: 0, clientHeight: 0 })
    const s = setup(el)
    s.active.value = true
    await nextTick()
    expect(s.ready.value).toBe(false)
  })

  it('active 转假后解绑，不残留监听器', async () => {
    const el = fakeEl({ scrollHeight: 200000, clientHeight: 600, scrollTop: 100 })
    const s = setup(el)
    s.active.value = true
    await nextTick()
    const remove = (el as unknown as { removeEventListener: ReturnType<typeof vi.fn> }).removeEventListener
    s.active.value = false
    await nextTick()
    expect(remove).toHaveBeenCalled()
    expect(s.ready.value, '关闭后 ready 复位').toBe(false)
  })
})
