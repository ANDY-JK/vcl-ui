// @vitest-environment happy-dom
/**
 * `useBodyScrollLock` / `lockBodyScroll` 的引用计数契约
 *
 * ## 为什么必须单独测
 *
 * 这套逻辑此前只经由 `Loading` / `Drawer` / `ModalBox` 间接覆盖，判据是"挂载后
 * body 有 overflow:hidden、卸载后恢复"。**间接覆盖测不到计数语义**：
 *
 * 1. **两层叠加**：Drawer 里再开 ConfirmModal，任意一层先关都不能解锁 —— 若实现退回
 *    布尔值（`bodyLocked = true/false`），关掉内层就把背景放开了，而"挂载/卸载各一次"
 *    的用例**依然全绿**（它们只验一层）。
 * 2. **释放函数重复调用**：组件卸载 + watch 转假两条路径都会调 release，没有 `released`
 *    守卫就会把计数减两次 —— 计数变负之后，下一次加锁永远到不了 0，body 从此锁死。
 * 3. **恢复的是打开前的内联值**：宿主自己设过 `overflow: auto`，解锁后必须写回 `auto`
 *    而不是清成空串，否则宿主的滚动配置被静默改掉。
 *
 * 这三条都只有直接调用 `lockBodyScroll()` 才测得出来。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { lockBodyScroll, useBodyScrollLock } from '@/components/_internal/useBodyScrollLock'

afterEach(() => {
  document.body.removeAttribute('style')
})

describe('lockBodyScroll · 引用计数', () => {
  it('加锁写 hidden；**两层叠加时先放一层不解锁**，最后一层放完才恢复', () => {
    const releaseA = lockBodyScroll()
    expect(document.body.style.overflow, '第一层加锁').toBe('hidden')

    const releaseB = lockBodyScroll()
    expect(document.body.style.overflow, '第二层加锁仍是 hidden').toBe('hidden')

    releaseA()
    expect(document.body.style.overflow, '还有一层没放，不许解锁').toBe('hidden')

    releaseB()
    expect(document.body.style.overflow, '最后一层放完才恢复').toBe('')
  })

  it('**重复调用同一个 release 只生效一次**（卸载 + watch 转假会各调一次）', () => {
    const release = lockBodyScroll()
    const other = lockBodyScroll() // 第二层占位，让"减多了"能被观测到

    release()
    release() // 第二次必须是空操作：没有 released 守卫会再减一次计数，把 other 那层也放了
    expect(document.body.style.overflow, '第二层仍在锁，body 不许可滚').toBe('hidden')

    other()
    expect(document.body.style.overflow).toBe('')
  })

  it('恢复的是**打开前的内联值**，不是清空（宿主自设的 overflow 不能被改掉）', () => {
    document.body.style.overflow = 'auto'
    const release = lockBodyScroll()
    expect(document.body.style.overflow).toBe('hidden')

    release()
    expect(document.body.style.overflow, '宿主原来设的是 auto，就得写回 auto').toBe('auto')
  })
})

describe('useBodyScrollLock · 组件内接线', () => {
  /** 最小宿主：暴露一个 ref 驱动 active() */
  function makeHost(initial: boolean) {
    const on = ref(initial)
    const Host = defineComponent({
      setup() {
        useBodyScrollLock(() => on.value)
        return () => h('div', 'host')
      },
    })
    const w = mount(Host)
    return { w, on }
  }

  it('immediate：挂载时 active 为真 → 立刻加锁', () => {
    const { w } = makeHost(true)
    expect(document.body.style.overflow, 'immediate 不生效的话首帧就没锁').toBe('hidden')
    w.unmount()
  })

  it('**active 转假 → 释放；转真 → 重新加锁**（watch 两个分支都要走）', async () => {
    const { w, on } = makeHost(true)
    expect(document.body.style.overflow).toBe('hidden')

    on.value = false
    await nextTick()
    expect(document.body.style.overflow, '转假必须解锁').toBe('')

    on.value = true
    await nextTick()
    expect(document.body.style.overflow, '再转真必须重新加锁').toBe('hidden')

    w.unmount()
  })

  it('**卸载时若仍持锁 → 释放**（不能把 body 永久锁死）', async () => {
    const { w } = makeHost(true)
    expect(document.body.style.overflow).toBe('hidden')

    w.unmount()
    await nextTick()
    expect(document.body.style.overflow, 'onUnmounted 兜底释放').toBe('')
  })

  it('已释放后再卸载：不重复减计数（否则下一次加锁永远到不了 0）', async () => {
    const { w, on } = makeHost(true)
    on.value = false
    await nextTick()
    expect(document.body.style.overflow).toBe('')

    w.unmount()
    await nextTick()

    // 计数若被减到负数，这里就解不开
    const release = lockBodyScroll()
    expect(document.body.style.overflow, '计数被多减一次会让锁永久失效').toBe('hidden')
    release()
    expect(document.body.style.overflow).toBe('')
  })
})
