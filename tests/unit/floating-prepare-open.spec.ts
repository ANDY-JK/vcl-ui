/* eslint-disable vue/one-component-per-file -- 测试夹具：宿主组件只为挂载 useFloating（本仓既有约定） */
/**
 * useFloating · 打开前预定位不许假设面板高 200px（TD-92，#390）
 *
 * ## 缺陷
 *
 * `prepareOpen()` 在**面板还没渲染出来**时预排位置（避免从左上角闪现），
 * 代价是面板高度只能用估计值 —— 原来写死 `r.top - 200 - offset`。
 * 而常见的下拉/面板是 300~420px：**测量完成前那一帧会盖住触发器**，
 * 随后被 `updatePosition` 纠正，用户看到的是"打开瞬间跳一下"。
 *
 * ## 口径
 *
 * 1. **首次打开**（没量过）→ 退到 `PREPARE_FALLBACK_H = 200`（保守下界，不比原来差）；
 * 2. **第二次起** → 用上次 `updatePosition` 量到的真实高度预排；
 * 3. **钳制用可视区上沿** `band.top + 8`，而不是写死的 `8` ——
 *    键盘顶起可视区（`visualViewport.offsetTop > 0`）时面板不该被排到可视区外（#308 同类）。
 *
 * ## 为什么必须真挂组件
 *
 * 这条路径是"挂载级 + 时序级"的（先 prepareOpen、再 updatePosition），
 * 纯函数测不到；happy-dom 无布局，所以 rect 与 offsetHeight 都手动打桩。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { useFloating } from '@/components/_internal/useFloating'

const mounted: VueWrapper[] = []
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.unstubAllGlobals()
  delete (window as unknown as { visualViewport?: unknown }).visualViewport
})

interface Api {
  triggerRef: ReturnType<typeof useFloating>['triggerRef']
  floatingRef: ReturnType<typeof useFloating>['floatingRef']
  direction: ReturnType<typeof useFloating>['direction']
  floatingStyle: ReturnType<typeof useFloating>['floatingStyle']
  updatePosition: ReturnType<typeof useFloating>['updatePosition']
  prepareOpen: ReturnType<typeof useFloating>['prepareOpen']
}

/** 造一个最小宿主：触发器 top=400、offset=10，面板高度可控（0 = 还没量过） */
async function makeHost(opts: { floatH?: number } = {}) {
  let api!: Api
  const Host = defineComponent({
    setup() {
      api = useFloating({ offset: 10, active: () => true })
      return () => h('div', [h('button', { ref: api.triggerRef }, 'T'), h('div', { ref: api.floatingRef }, 'F')])
    },
  })
  const w = mount(Host, { attachTo: document.body })
  mounted.push(w)
  await nextTick()

  const trigger = api.triggerRef.value!
  trigger.getBoundingClientRect = () =>
    ({ top: 400, bottom: 440, left: 20, right: 220, width: 200, height: 40 }) as DOMRect
  const floating = api.floatingRef.value!
  Object.defineProperty(floating, 'offsetWidth', { value: 200, configurable: true })
  Object.defineProperty(floating, 'offsetHeight', { value: opts.floatH ?? 0, configurable: true })
  return { api, w }
}

/** 键盘顶起可视区：可视区只剩 120~500 这一段 */
function stubVisualViewport(offsetTop: number, height: number) {
  Object.defineProperty(window, 'visualViewport', {
    value: { offsetTop, offsetLeft: 0, height, width: 390, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    configurable: true,
    writable: true,
  })
}

const top = (api: Api) => parseFloat(api.floatingStyle.value.top)

describe('useFloating · prepareOpen 的预定位高度（TD-92）', () => {
  it('**首次打开（没量过高度）→ 用 200 兜底**，且下半屏放不下时翻到上方', async () => {
    vi.stubGlobal('innerHeight', 500) // 下方只剩 500-440-10=50
    const { api } = await makeHost({ floatH: 0 })
    api.prepareOpen()
    expect(api.direction.value, '下方只剩 50px，必须翻上去').toBe('up')
    expect(top(api), '没量过高度时按 200 估：400-200-10').toBe(190)
  })

  it('**第二次打开用真实高度**（340 ≠ 200，不能再假设）', async () => {
    vi.stubGlobal('innerHeight', 500)
    const { api } = await makeHost({ floatH: 340 })
    api.updatePosition() // 量到真实高度
    api.prepareOpen()
    expect(api.direction.value).toBe('up')
    expect(top(api), '真实高度 340：400-340-10；用回 200 会得到 190').toBe(50)
  })

  it('**可视区被顶起时，预定位不得压到可视区上沿之下**', async () => {
    stubVisualViewport(120, 380) // 可视区 120~500
    const { api } = await makeHost({ floatH: 340 })
    api.updatePosition()
    api.prepareOpen()
    expect(api.direction.value).toBe('up')
    // 400-340-10=50 会跑到可视区上沿（120）之外 → 必须钳到 120+8
    expect(top(api), '钳制要用可视区上沿 + 8，不是写死的 8').toBe(128)
  })
})
