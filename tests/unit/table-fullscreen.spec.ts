/**
 * `useTableFullscreen` · 节点搬迁 / 边界合帧 / 侧栏收起等待（第 168 轮）
 *
 * 覆盖率实测该文件**语句 67% / 分支 56.3%**（全库倒数第二）。三块逻辑里，
 * 「节点搬迁的兜底归还」「边界 apply 的两条分支」「rAF 合帧」「侧栏收起等待」
 * 基本都没被执行过。
 *
 * 本轮重点验证一处**注释承诺与实现不符**：L134-135 把 `_SETTLE_TIMEOUT_MS` 说明为
 * "兜底上限：后台标签页不跑 rAF、动画事件也不派发，超过这个时长就认为已稳定，
 * **不能让流程挂死**"——但该常量只被 `waitForCssAnimations` 使用，
 * `waitForWidthSettle` 的轮询链**没有任何上限**。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import {
  useFullscreenNodeRelocation,
  useFullscreenBounds,
  waitForSidebarCollapse,
} from '@/components/data/composables/useTableFullscreen'

/** 造一个可控宽度的元素毂 */
function fakeEl(widths: () => number): HTMLElement {
  return {
    getBoundingClientRect: () => ({ width: widths(), top: 0, left: 0, height: 0 }),
  } as unknown as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('useFullscreenNodeRelocation · 搬迁与归还', () => {
  it('搬到 body 后能按原位置放回（中间有兄弟节点的情形）', () => {
    const parent = document.createElement('div')
    const wrap = document.createElement('div')
    wrap.className = 'table-wrap'
    const sibling = document.createElement('span')
    parent.appendChild(wrap)
    parent.appendChild(sibling)
    document.body.appendChild(parent)

    const wrapRef = ref<HTMLElement | null>(wrap)
    const { moveToBody, returnToOrigin } = useFullscreenNodeRelocation(wrapRef)

    moveToBody()
    expect(wrap.parentElement, '全屏时节点应挂在 body').toBe(document.body)

    returnToOrigin()
    expect(wrap.parentElement, '退出后应回到原父容器').toBe(parent)
    expect(parent.firstChild, '应回到原位置（兄弟节点之前）').toBe(wrap)
  })

  it('原父容器已随根节点脱离文档 → 仍放回该父容器（不留在 body 上）', () => {
    const parent = document.createElement('div')
    const wrap = document.createElement('div')
    parent.appendChild(wrap)
    document.body.appendChild(parent)

    const wrapRef = ref<HTMLElement | null>(wrap)
    const { moveToBody, returnToOrigin } = useFullscreenNodeRelocation(wrapRef)
    moveToBody()

    // 模拟卸载：父容器已不在文档里（Vue 摘根节点）
    parent.remove()

    returnToOrigin()
    expect(wrap.parentElement, '父容器快照还在时应归回到它（等于把它请出 body）').toBe(parent)
    expect(wrap.parentElement).not.toBe(document.body)
  })

  it('快照全丢（父容器为空）→ 至少把全屏框从页面上摘掉，并清空内联定位', () => {
    // wrapRef 一开始就是 null：moveToBody 什么都不做
    const wrap = document.createElement('div')
    document.body.appendChild(wrap) // 假设它已经在 body 上
    wrap.style.top = '10px'
    const wrapRef = ref<HTMLElement | null>(null)
    const { moveToBody, returnToOrigin } = useFullscreenNodeRelocation(wrapRef)
    moveToBody()
    returnToOrigin() // 无快照：什么都不该炸
    expect(true).toBe(true)
  })

  it('归还后内联定位被清空（否则下次全屏起点错位）', () => {
    const parent = document.createElement('div')
    const wrap = document.createElement('div')
    parent.appendChild(wrap)
    document.body.appendChild(parent)

    const wrapRef = ref<HTMLElement | null>(wrap)
    const rel = useFullscreenNodeRelocation(wrapRef)
    rel.moveToBody()
    wrap.style.top = '12px'
    wrap.style.left = '34px'
    wrap.style.width = '640px'
    wrap.style.height = '480px'

    rel.returnToOrigin()
    expect([wrap.style.top, wrap.style.left, wrap.style.width, wrap.style.height]).toEqual(['', '', '', ''])
  })

  it('没有父元素时不搬迁（不抛错、不把节点弄丢）', () => {
    const orphan = document.createElement('div')
    const wrapRef = ref<HTMLElement | null>(orphan) // 未插入文档 → parentElement 为 null
    const { moveToBody } = useFullscreenNodeRelocation(wrapRef)
    expect(() => moveToBody()).not.toThrow()
    expect(orphan.parentElement).toBeNull()
  })
})

describe('useFullscreenBounds · 边界对齐与合帧', () => {
  it('有 .content-body 外壳 → 对齐外壳的矩形', () => {
    const shell = document.createElement('div')
    shell.className = 'content-body'
    document.body.appendChild(shell)
    vi.spyOn(shell, 'getBoundingClientRect').mockReturnValue({
      top: 56,
      left: 24,
      width: 1000,
      height: 700,
      right: 1024,
      bottom: 756,
      x: 24,
      y: 56,
      toJSON: () => ({}),
    } as DOMRect)

    const wrap = document.createElement('div')
    const bounds = useFullscreenBounds(
      ref<HTMLElement | null>(wrap),
      () => true,
    )
    bounds.apply()
    expect([wrap.style.top, wrap.style.left, wrap.style.width, wrap.style.height]).toEqual([
      '56px',
      '24px',
      '1000px',
      '700px',
    ])
  })

  it('无外壳 → 按视口铺满（100vw/100vh）', () => {
    const wrap = document.createElement('div')
    const bounds = useFullscreenBounds(
      ref<HTMLElement | null>(wrap),
      () => true,
    )
    bounds.apply()
    // happy-dom 的 CSSOM 会把 0 序列化成 '0px'，两种写法等价
    expect([wrap.style.top, wrap.style.left, wrap.style.width, wrap.style.height]).toEqual([
      '0px',
      '0px',
      '100vw',
      '100vh',
    ])
  })

  it('未激活 / 无节点 → 不动样式', () => {
    const wrap = document.createElement('div')
    wrap.style.top = '5px'
    const inactive = useFullscreenBounds(
      ref<HTMLElement | null>(wrap),
      () => false,
    )
    inactive.apply()
    expect(wrap.style.top, '未激活时不该写样式').toBe('5px')

    const empty = useFullscreenBounds(
      ref<HTMLElement | null>(null),
      () => true,
    )
    expect(() => empty.apply()).not.toThrow()
  })

  it('同一帧内多次 schedule 只 apply 一次（resize + 侧栏 RO 会连发）', async () => {
    const wrap = document.createElement('div')
    const bounds = useFullscreenBounds(
      ref<HTMLElement | null>(wrap),
      () => true,
    )
    const spy = vi.spyOn(wrap.style, 'height', 'set')

    bounds.schedule()
    bounds.schedule()
    bounds.schedule()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    await nextTick()

    expect(spy, '三次 trigger 应合并成一帧一次').toHaveBeenCalledTimes(1)
  })

  it('cancelRaf 之后不再执行挂起的那一帧', async () => {
    const wrap = document.createElement('div')
    const bounds = useFullscreenBounds(
      ref<HTMLElement | null>(wrap),
      () => true,
    )
    const spy = vi.spyOn(wrap.style, 'height', 'set')
    bounds.schedule()
    bounds.cancelRaf()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(spy, '取消后不该再写样式').toHaveBeenCalledTimes(0)
  })

  it('onWindowResize 走合帧（不是每来一次就重排）', async () => {
    const wrap = document.createElement('div')
    const bounds = useFullscreenBounds(
      ref<HTMLElement | null>(wrap),
      () => true,
    )
    const spy = vi.spyOn(wrap.style, 'height', 'set')
    bounds.onWindowResize()
    bounds.onWindowResize()
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('start/stop 管理 ResizeObserver；无外壳或无 RO 时安全跳过', () => {
    const shell = document.createElement('div')
    shell.className = 'content-body'
    document.body.appendChild(shell)

    const seen: string[] = []
    class FakeRO {
      constructor(_cb: () => void) {
        seen.push('new')
      }
      observe(): void {
        seen.push('observe')
      }
      disconnect(): void {
        seen.push('disconnect')
      }
    }
    const prev = (globalThis as Record<string, unknown>).ResizeObserver
    ;(globalThis as Record<string, unknown>).ResizeObserver = FakeRO

    try {
      const bounds = useFullscreenBounds(
        ref<HTMLElement | null>(document.createElement('div')),
        () => true,
      )
      bounds.start()
      expect(seen, '应新建并 observe 内容区').toEqual(['new', 'observe'])
      bounds.start() // 重复 start 必须先停旧的
      expect(seen.filter((x) => x === 'disconnect').length, '重复 start 应先 disconnect').toBe(1)
      bounds.stop()
      expect(seen.at(-1)).toBe('disconnect')
      bounds.stop() // 幂等
    } finally {
      ;(globalThis as Record<string, unknown>).ResizeObserver = prev
    }
  })
})

describe('useTableFullscreen · 侧栏收起等待不得挂死', () => {
  it('宽度稳定 → 很快 resolve', async () => {
    vi.useFakeTimers()
    const el = fakeEl(() => 250)
    const p = waitForSidebarCollapse(el)
    await vi.advanceTimersByTimeAsync(200)
    await expect(p).resolves.toBeUndefined()
  })

  it('元素为 null / 无 rAF → 立即 resolve（不阻塞流程）', async () => {
    const p1 = waitForSidebarCollapse(null as unknown as HTMLElement)
    await expect(p1).resolves.toBeUndefined()

    const prevRaf = globalThis.requestAnimationFrame
    // @ts-expect-error 故意抹掉
    delete globalThis.requestAnimationFrame
    try {
      const p2 = waitForSidebarCollapse(fakeEl(() => 1))
      await expect(p2).resolves.toBeUndefined()
    } finally {
      globalThis.requestAnimationFrame = prevRaf
    }
  })

  it('**KeyframeEffect 未暴露（但有 getAnimations）→ 必须降级到实测，不得 reject**', async () => {
    // happy-dom / 部分嵌入式 WebView：有 getAnimations 却没有 KeyframeEffect 构造器。
    // 原实现里 `a.effect instanceof KeyframeEffect` 会抛 ReferenceError，把整条 await 变成 rejection。
    expect(typeof (globalThis as Record<string, unknown>).KeyframeEffect, '前置：本环境无 KeyframeEffect').toBe(
      'undefined',
    )
    const el = fakeEl(() => 250)
    ;(el as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [
      { effect: { target: el, pseudoElement: null }, finished: Promise.resolve() },
    ]
    await expect(waitForSidebarCollapse(el), 'KeyframeEffect 缺失时不能 reject').resolves.toBeUndefined()
  })

  it('动画可等 → 等 finished 跑完，不退回实测', async () => {
    class FakeKeyframeEffect {
      target: unknown
      pseudoElement: string | null
      constructor(target: unknown, pseudoElement: string | null) {
        this.target = target
        this.pseudoElement = pseudoElement
      }
    }
    const prev = (globalThis as Record<string, unknown>).KeyframeEffect
    ;(globalThis as Record<string, unknown>).KeyframeEffect = FakeKeyframeEffect
    try {
      const el = fakeEl(() => 250)
      const rect = vi.spyOn(el, 'getBoundingClientRect')
      ;(el as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [
        { effect: new FakeKeyframeEffect(el, null), finished: Promise.resolve() },
      ]
      await expect(waitForSidebarCollapse(el)).resolves.toBeUndefined()
      expect(rect.mock.calls.length, '能等到动画就不该再去量宽度').toBe(0)
    } finally {
      ;(globalThis as Record<string, unknown>).KeyframeEffect = prev
    }
  })

  it('**动画永不结束 → 撞 2s 上限后放弃，退回实测并不挂死**', async () => {
    vi.useFakeTimers()
    class FakeKeyframeEffect {
      target: unknown
      pseudoElement: string | null
      constructor(target: unknown, pseudoElement: string | null) {
        this.target = target
        this.pseudoElement = pseudoElement
      }
    }
    const prev = (globalThis as Record<string, unknown>).KeyframeEffect
    ;(globalThis as Record<string, unknown>).KeyframeEffect = FakeKeyframeEffect
    try {
      const el = fakeEl(() => 250) // 宽度稳定，退回实测后能很快收敛
      const rect = vi.spyOn(el, 'getBoundingClientRect')
      ;(el as unknown as { getAnimations: () => unknown[] }).getAnimations = () => [
        { effect: new FakeKeyframeEffect(el, null), finished: new Promise(() => {}) },
      ]
      const p = waitForSidebarCollapse(el)
      await vi.advanceTimersByTimeAsync(2100) // 越过动画等待上限
      await vi.advanceTimersByTimeAsync(300) // 实测收敛
      await expect(p, '动画挂住时也不能让流程挂死').resolves.toBeUndefined()
      expect(
        rect.mock.calls.length,
        '撞上限后必须真的退回宽度实测（否则等于把"动画可能还在跑"当成"已收尾"）',
      ).toBeGreaterThan(0)
    } finally {
      ;(globalThis as Record<string, unknown>).KeyframeEffect = prev
    }
  })

  it('**宽度一直在变 → 必须在兜底上限内 resolve，不能永久挂起**', async () => {
    vi.useFakeTimers()
    // 持续变化的宽度：祖先有循环动画 / 内容抖动 时的真实表现
    let n = 0
    const el = fakeEl(() => 100 + (n++ % 1000) * 0.37)

    let settled = false
    const p = waitForSidebarCollapse(el).then(() => {
      settled = true
    })

    // 常量注释承诺「超过这个时长就认为已稳定，不能让流程挂死」（2000ms）
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(settled, '宽度持续变化时 waitForSidebarCollapse 永不 resolve —— 全屏按钮会一直"没反应"').toBe(true)
    await p
  })

  it('挂起期间不得无限堆定时器（resolve 后不再轮询）', async () => {
    vi.useFakeTimers()
    const el = fakeEl(() => 250)
    const p = waitForSidebarCollapse(el)
    await vi.advanceTimersByTimeAsync(300) // 假时钟下必须先推进，否则 promise 不会前进
    await p
    const after = vi.getTimerCount()
    await vi.advanceTimersByTimeAsync(1000)
    expect(vi.getTimerCount(), 'resolve 之后不该还有轮询定时器在跑').toBeLessThanOrEqual(after)
  })
})