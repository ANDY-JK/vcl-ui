/**
 * useDebounce.ts — 防抖/节流四件套（176 行）
 *
 * ## 为什么补（单文件口径 语句 37.2% / 分支 41.7% / 函数 38.9%，48/78 行未覆盖）
 *
 * 这四个 export 被搜索框、resize、列宽重算、滚动监听等**高频路径**共用，此前只有
 * `utils.spec.ts` 扫到一两行。而未覆盖的恰好是它们唯一有价值的部分：
 *
 * ① **防抖的语义就是「只发最后一次」** —— 连点 5 次必须只落 1 次最终值，
 *    漏了 `clearTimeout` 就退化成「每次都发」，而这在功能上**看不出来**（值最终也对），
 *    只表现为请求/重算次数翻倍。
 * ② **`cancel()` 必须能真正取消**，且**无 pending 时不能抛错**（调用方常在 onUnmounted 里无脑调）。
 * ③ **定时器触发后必须置 null**，否则下一次变化会 `clearTimeout` 一个已完成的 id（无害），
 *    但 `cancel()` 之后的状态判断会错。
 * ④ **组件内注册 onUnmounted 清理、组件外不注册**（源码注释写明「非组件调用跳过，避免 Vue warn」）——
 *    这条只有真的卸载一次才验得出。
 * ⑤ **节流的三条分支**（窗口已过 → 立即发；窗口内首次 → 记 pending 排尾沿；窗口内再次 → 只更新 pending）。
 *    尤其是「窗口内再次」：若只记第一次的 pending，用户滚动时会停在旧值上。
 * ⑥ **尾沿取最新值**：pending 期间的值必须覆盖，不能停在窗口首个值（源码注释专门强调）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useDebounce, useDebounceFn, useThrottle, useThrottleFn } from '@/components/_internal/useDebounce'

/** 在组件上下文里调用 composable（用于验证 onUnmounted 清理；只定义一次组件，避免 lint 噪音） */
function inComponent<T>(use: () => T): { w: ReturnType<typeof mount>; api: () => T } {
  let api!: T
  const w = mount({ setup: () => (api = use(), () => h('div')) })
  return { w, api: () => api }
}

/** 组件外创建的 `flush: 'pre'` watcher 走调度队列 → 先让 microtask 排空再推进时钟 */
async function tick() {
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/* ═══════════ ① useDebounce（ref 版） ═══════════ */

describe('useDebounce', () => {
  it('**初始值立刻同步**（不该让首屏空白等 300ms）', () => {
    const src = ref('init')
    const { debouncedRef } = useDebounce(src, 300)
    expect(debouncedRef.value).toBe('init')
  })

  it('**停止变化 delay 后才同步**', async () => {
    const src = ref('a')
    const { debouncedRef } = useDebounce(src, 300)
    src.value = 'b'
    await tick()
    expect(debouncedRef.value, '还没到点').toBe('a')
    await vi.advanceTimersByTimeAsync(299)
    expect(debouncedRef.value).toBe('a')
    await vi.advanceTimersByTimeAsync(1)
    expect(debouncedRef.value, '到点同步').toBe('b')
  })

  it('**连改 5 次只落最后一次**（防抖的核心语义）', async () => {
    const src = ref(0)
    const { debouncedRef } = useDebounce(src, 300)
    for (const v of [1, 2, 3, 4, 5]) {
      src.value = v
      await tick()
      await vi.advanceTimersByTimeAsync(100) // 每次都不够 300
    }
    expect(debouncedRef.value, '中途不落值').toBe(0)
    await vi.advanceTimersByTimeAsync(300)
    expect(debouncedRef.value, '只落最后一个').toBe(5)
  })

  it('**触发后定时器归零，后续变化仍能生效**（不会一次就死）', async () => {
    const src = ref('a')
    const { debouncedRef } = useDebounce(src, 100)
    src.value = 'b'
    await tick()
    await vi.advanceTimersByTimeAsync(100)
    expect(debouncedRef.value).toBe('b')
    src.value = 'c'
    await tick()
    await vi.advanceTimersByTimeAsync(100)
    expect(debouncedRef.value, '第二轮仍生效').toBe('c')
  })

  it('**cancel 能取消待落的值**', async () => {
    const src = ref('a')
    const { debouncedRef, cancel } = useDebounce(src, 100)
    src.value = 'b'
    await tick()
    cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(debouncedRef.value, '取消后不落值').toBe('a')
  })

  it('**无 pending 时 cancel 不抛错**（调用方常在 onUnmounted 里无脑调）', () => {
    const src = ref('a')
    const { cancel } = useDebounce(src, 100)
    expect(() => cancel()).not.toThrow()
    expect(() => cancel()).not.toThrow()
  })


  it('**默认延迟是 300ms**（不传 delay 时的口径）', async () => {
    const src = ref('a')
    const { debouncedRef } = useDebounce(src)
    src.value = 'b'
    await tick()
    await vi.advanceTimersByTimeAsync(299)
    expect(debouncedRef.value, '299 未到点').toBe('a')
    await vi.advanceTimersByTimeAsync(1)
    expect(debouncedRef.value, '300 到点').toBe('b')
  })

  it('**组件内：卸载时取消 pending 并停止监听**', async () => {
    const src = ref('a')
    const { w, api } = inComponent(() => useDebounce(src, 100))
    src.value = 'b'
    await tick()
    w.unmount()
    await vi.advanceTimersByTimeAsync(500)
    expect(api().debouncedRef.value, '卸载后不再落值').toBe('a')

    // watch 也已停止：再改 source 不该产生新定时器（值仍不变）
    src.value = 'c'
    await tick()
    await vi.advanceTimersByTimeAsync(500)
    expect(api().debouncedRef.value).toBe('a')
  })
})

/* ═══════════ ② useDebounceFn（函数版） ═══════════ */

describe('useDebounceFn', () => {
  it('**最后一次调用后 delay 才执行，且带最后一次的参数**', async () => {
    const fn = vi.fn()
    const { run } = useDebounceFn(fn, 200)
    run('a')
    await vi.advanceTimersByTimeAsync(100)
    run('b')
    await vi.advanceTimersByTimeAsync(199)
    expect(fn, '未到点').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn, '只执行一次').toHaveBeenCalledTimes(1)
    expect(fn, '参数是最后一次').toHaveBeenCalledWith('b')
  })

  it('**执行后定时器归零，下一次调用仍生效**', async () => {
    const fn = vi.fn()
    const { run } = useDebounceFn(fn, 100)
    run(1)
    await vi.advanceTimersByTimeAsync(100)
    run(2)
    await vi.advanceTimersByTimeAsync(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(2)
  })

  it('**cancel 阻止执行**', async () => {
    const fn = vi.fn()
    const { run, cancel } = useDebounceFn(fn, 100)
    run(1)
    cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(fn).not.toHaveBeenCalled()
  })

  it('**无 pending 时 cancel 不抛错**', () => {
    const { cancel } = useDebounceFn(vi.fn(), 100)
    expect(() => cancel()).not.toThrow()
  })


  it('**默认延迟是 300ms**', async () => {
    const fn = vi.fn()
    const { run } = useDebounceFn(fn)
    run('x')
    await vi.advanceTimersByTimeAsync(299)
    expect(fn, '299 未执行').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fn, '300 执行').toHaveBeenCalledWith('x')
  })

  it('**组件内卸载时取消**', async () => {
    const fn = vi.fn()
    const { w, api } = inComponent(() => useDebounceFn(fn, 100))
    api().run('x')
    w.unmount()
    await vi.advanceTimersByTimeAsync(500)
    expect(fn, '卸载后不执行').not.toHaveBeenCalled()
  })
})

/* ═══════════ ③ useThrottle（ref 版） ═══════════ */

describe('useThrottle', () => {
  it('**初始值立刻同步**', () => {
    const src = ref('init')
    const { throttledRef } = useThrottle(src, 100)
    expect(throttledRef.value).toBe('init')
  })

  it('**窗口已过：立即同步**（首次变化 lastTime=0 → 必然立即）', async () => {
    const src = ref(0)
    const { throttledRef } = useThrottle(src, 100)
    src.value = 1
    await tick()
    expect(throttledRef.value, '立即生效').toBe(1)
  })

  it('**窗口内首次：记 pending，窗口结束时落值**', async () => {
    const src = ref(0)
    const { throttledRef } = useThrottle(src, 100)
    src.value = 1 // 立即
    await tick()
    src.value = 2 // 窗口内 → pending
    await tick()
    expect(throttledRef.value, '窗口内不立即落').toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(throttledRef.value, '窗口结束落 pending').toBe(2)
  })

  it('**窗口内再次变化：pending 要更新成最新值**（否则滚动会停在旧值）', async () => {
    const src = ref(0)
    const { throttledRef } = useThrottle(src, 100)
    src.value = 1
    await tick()
    src.value = 2
    await tick()
    src.value = 3 // 第三次：timer 已存在 → 走 else 更新 pending
    await tick()
    expect(throttledRef.value, '仍在窗口内').toBe(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(throttledRef.value, '落的是最新值 3 而不是 2').toBe(3)
  })

  it('**timer 还在但系统时间已越过窗口：立即落值并清掉 timer**', async () => {
    const src = ref(0)
    const { throttledRef } = useThrottle(src, 100)
    src.value = 1
    await tick()
    src.value = 2 // 排了一个 remaining≈100 的尾沿 timer
    await tick()
    // 只推进系统时间、不推进定时器队列 → remaining <= 0 但 timer 仍在
    vi.setSystemTime(Date.now() + 500)
    src.value = 3
    await tick()
    expect(throttledRef.value, '越过窗口立即落').toBe(3)
    await vi.advanceTimersByTimeAsync(200)
    expect(throttledRef.value, '旧 timer 已被清掉，不会回退').toBe(3)
  })


  it('**窗口恰好走完（remaining === 0）即刻落值**（边界写成 < 0 会晚一个 tick）', async () => {
    const src = ref(0)
    const { throttledRef } = useThrottle(src, 100)
    const t0 = Date.now()
    src.value = 1
    await tick()
    expect(throttledRef.value).toBe(1)
    // 只推进系统时间到窗口边界，不推进定时器队列 → remaining 恰好为 0
    vi.setSystemTime(t0 + 100)
    src.value = 2
    await tick()
    expect(throttledRef.value, '边界值也必须立即落').toBe(2)
  })

  it('**cancel 清掉尾沿 timer**', async () => {
    const src = ref(0)
    const { throttledRef, cancel } = useThrottle(src, 100)
    src.value = 1
    await tick()
    src.value = 2 // 尾沿 pending
    await tick()
    cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(throttledRef.value, '取消后停在 1').toBe(1)
  })

  it('**无 pending 时 cancel 不抛错**', () => {
    const src = ref(0)
    const { cancel } = useThrottle(src, 100)
    expect(() => cancel()).not.toThrow()
  })

  it('**组件内卸载时取消并停止监听**', async () => {
    const src = ref(0)
    const { w, api } = inComponent(() => useThrottle(src, 100))
    src.value = 1
    await tick()
    src.value = 2
    await tick()
    w.unmount()
    await vi.advanceTimersByTimeAsync(500)
    expect(api().throttledRef.value, '卸载后尾沿不落').toBe(1)
  })
})

/* ═══════════ ④ useThrottleFn（函数版） ═══════════ */

describe('useThrottleFn', () => {
  it('**窗口已过：立即执行**', async () => {
    const fn = vi.fn()
    const { run } = useThrottleFn(fn, 100)
    run('a')
    expect(fn, '同步执行').toHaveBeenCalledWith('a')
  })

  it('**窗口内首次：排尾沿；窗口内再次：尾沿参数更新为最新**', async () => {
    const fn = vi.fn()
    const { run } = useThrottleFn(fn, 100)
    run('a') // 立即
    expect(fn).toHaveBeenCalledTimes(1)
    run('b') // 窗口内首次 → pending
    run('c') // 窗口内再次 → 更新 pending
    expect(fn, '窗口内不执行').toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(100)
    expect(fn, '尾沿执行一次').toHaveBeenCalledTimes(2)
    expect(fn, '参数是最新那次').toHaveBeenLastCalledWith('c')
  })

  it('**timer 在但时间已越过窗口：立即执行并清 timer**', async () => {
    const fn = vi.fn()
    const { run } = useThrottleFn(fn, 100)
    run('a')
    run('b') // 排尾沿
    vi.setSystemTime(Date.now() + 500)
    run('c') // remaining <= 0 且 timer 存在 → 立即 + 清 timer
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('c')
    await vi.advanceTimersByTimeAsync(200)
    expect(fn, '旧尾沿被清掉').toHaveBeenCalledTimes(2)
  })


  it('**窗口恰好走完（remaining === 0）即刻执行**', async () => {
    const fn = vi.fn()
    const { run } = useThrottleFn(fn, 100)
    const t0 = Date.now()
    run('a') // 立即，lastTime = t0
    expect(fn).toHaveBeenCalledTimes(1)
    vi.setSystemTime(t0 + 100)
    run('b') // remaining === 0 → 立即
    expect(fn, '边界值必须立即执行').toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith('b')
  })

  it('**cancel 阻止尾沿执行**', async () => {
    const fn = vi.fn()
    const { run, cancel } = useThrottleFn(fn, 100)
    run('a')
    run('b')
    cancel()
    await vi.advanceTimersByTimeAsync(500)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('**无 pending 时 cancel 不抛错**', () => {
    const { cancel } = useThrottleFn(vi.fn(), 100)
    expect(() => cancel()).not.toThrow()
  })

  it('**组件内卸载时取消**', async () => {
    const fn = vi.fn()
    const { w, api } = inComponent(() => useThrottleFn(fn, 100))
    api().run('a')
    api().run('b')
    w.unmount()
    await vi.advanceTimersByTimeAsync(500)
    expect(fn, '卸载后尾沿不执行').toHaveBeenCalledTimes(1)
  })
})