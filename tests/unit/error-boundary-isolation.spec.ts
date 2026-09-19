// 修复锁定：错误边界跨页残留 + retry 原地复发升级
// 背景 1：AppLayout 包住整个 RouterView 的 ErrorBoundary 未传 watchKey，某页抛错后 hasError 永久为 true，
//         fallback 顶掉整个 RouterView，切换任何导航项都仍是同一张「页面加载异常」，只能整页刷新。
// 背景 2：retry 只做子组件重挂，错误源自模块/依赖层时必然原地再炸，按钮看着像失效。
// 背景 3（红队复审后补）：升级标记若只靠 watchKey 清除，同页一次无关错误会让之后每次首错都直接整页重载 →
//         长表单未保存数据被丢；故重挂后静默 3s 未再抛错即解除标记。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h, defineComponent, ref } from 'vue'
import { createRouter, createMemoryHistory, useRoute } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue'

const Boom = defineComponent({
  name: 'Boom',
  setup() {
    throw new Error('boom')
  },
  render: () => h('div'),
})
const Fine = defineComponent({
  name: 'Fine',
  render: () => h('div', { class: 'fine-page' }, '正常页面'),
})
/** 只在 ?ok=1 时正常渲染：用于验证同 path 换 query 也能复位边界 */
const QueryGated = defineComponent({
  name: 'QueryGated',
  setup() {
    const route = useRoute()
    if (route.query.ok !== '1') throw new Error('缺 ok=1')
    return () => h('div', { class: 'fine-page' }, 'query 通过')
  },
})

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/bad', component: Boom },
      { path: '/good', component: Fine },
      { path: '/q', component: QueryGated },
    ],
  })
}

/** 由开关决定是否抛错的子组件，用于验证复位后能重新渲染 */
function makeToggleChild(switchRef: { value: boolean }) {
  return defineComponent({
    name: 'ToggleChild',
    setup() {
      return () => {
        if (switchRef.value) throw new Error('boom')
        return h('div', { class: 'child-ok' }, '子组件')
      }
    },
  })
}

/** 用例体内注册的还原动作统一在此兜底执行，避免断言先失败把桩泄漏给后续用例 */
const pendingRestore: Array<() => void> = []

/** 替换 window.location 以捕获整页重载 */
function stubReload() {
  const original = window.location
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { reload } })
  pendingRestore.push(() =>
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: original }),
  )
  return reload
}

let errSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  pendingRestore.splice(0).forEach((fn) => fn())
  errSpy.mockRestore()
  vi.useRealTimers()
})

describe('ErrorBoundary · 复位', () => {
  it('watchKey 变化 → 错误态清空、插槽内容重新渲染', async () => {
    const willThrow = ref(true)
    const Child = makeToggleChild(willThrow)
    const w = mount(ErrorBoundary, { props: { watchKey: 'a' }, slots: { default: () => h(Child) } })
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    willThrow.value = false
    await w.setProps({ watchKey: 'b' })
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(false)
    expect(w.find('.child-ok').exists()).toBe(true)
  })

  it('未出错时换 watchKey 不重挂插槽（保住筛选/滚动/已加载数据）；出过错才重建', async () => {
    const mounted = ref(0)
    const willThrow = ref(false)
    const Child = defineComponent({
      name: 'StatefulChild',
      setup() {
        mounted.value++
        return () => {
          if (willThrow.value) throw new Error('boom')
          return h('div', { class: 'child-ok' }, '有状态内容')
        }
      },
    })
    const w = mount(ErrorBoundary, { props: { watchKey: '/a' }, slots: { default: () => h(Child) } })
    await nextTick()
    expect(mounted.value).toBe(1)

    // 同页只换 query：没有错误 → 不得重建实例
    await w.setProps({ watchKey: '/a?page=2' })
    await nextTick()
    await nextTick()
    expect(mounted.value).toBe(1)
    expect(w.find('.child-ok').exists()).toBe(true)

    // 崩一次之后再换 key：必须重建，把错误态带出去
    willThrow.value = true
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    await w.setProps({ watchKey: '/b' })
    await nextTick()
    await nextTick()
    expect(mounted.value).toBeGreaterThan(1)
    // 内容仍是坏的 → 重建后再次被兜住，说明错误态确实跟着新实例走
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    willThrow.value = false
    await w.setProps({ watchKey: '/c' })
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(false)
    expect(w.find('.child-ok').exists()).toBe(true)
  })

  it('不传 watchKey 时错误态不自动复位（回归对照）', async () => {
    const Child = makeToggleChild(ref(true))
    const w = mount(ErrorBoundary, { slots: { default: () => h(Child) } })
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    await w.vm.$forceUpdate()
    await nextTick()
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)
  })

  it('「重新加载」复位并重新挂载插槽；子组件恢复后不触发整页重载', async () => {
    const reload = stubReload()
    const willThrow = ref(true)
    const Child = makeToggleChild(willThrow)
    const w = mount(ErrorBoundary, { slots: { default: () => h(Child) } })
    await nextTick()
    expect(w.find('.eb-btn').exists()).toBe(true)

    willThrow.value = false
    await w.find('.eb-btn').trigger('click')
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(false)
    expect(w.find('.child-ok').exists()).toBe(true)
    expect(reload).not.toHaveBeenCalled()
  })

  it('重挂后原地复发 → 下一次点击转整页重载', async () => {
    const reload = stubReload()
    const Child = makeToggleChild(ref(true))
    const w = mount(ErrorBoundary, { slots: { default: () => h(Child) } })
    await nextTick()

    await w.find('.eb-btn').trigger('click')
    await nextTick()
    await nextTick()
    expect(reload).not.toHaveBeenCalled()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    await w.find('.eb-btn').trigger('click')
    await nextTick()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('watchKey 切页清掉复发标记：新页仍先给一次重挂机会', async () => {
    const reload = stubReload()
    const Child = makeToggleChild(ref(true))
    const w = mount(ErrorBoundary, { props: { watchKey: 'a' }, slots: { default: () => h(Child) } })
    await nextTick()
    await w.find('.eb-btn').trigger('click')
    await nextTick()
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    await w.setProps({ watchKey: 'b' })
    await nextTick()
    await w.find('.eb-btn').trigger('click')
    await nextTick()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('ErrorBoundary · 升级标记的时效（红队 A-1）', () => {
  it('重挂成功后静默期满即解除标记：之后首错只重挂，不会直接整页重载', async () => {
    vi.useFakeTimers()
    const reload = stubReload()
    const willThrow = ref(true)
    const Child = makeToggleChild(willThrow)
    const w = mount(ErrorBoundary, { slots: { default: () => h(Child) } })
    await nextTick()

    // 第一轮：重挂 → 原地复发 → 标记置位
    await w.find('.eb-btn').trigger('click')
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)
    await w.find('.eb-btn').trigger('click')
    expect(reload).toHaveBeenCalledTimes(1)

    // 子组件修好了；静默期过后标记应随计时器解除
    reload.mockClear()
    willThrow.value = false
    await w.find('.error-boundary-fallback').find('.eb-btn').trigger('click')
    await nextTick()
    expect(w.find('.child-ok').exists()).toBe(true)
    vi.advanceTimersByTime(3100)

    // 之后再来一次全新错误：第一次点击必须仍是重挂，而不是直接重载丢数据
    willThrow.value = true
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)
    await w.find('.error-boundary-fallback').find('.eb-btn').trigger('click')
    await nextTick()
    expect(reload).not.toHaveBeenCalled()
  })

  it('重挂后超过窗口期才抛错（异步数据常态）：按新错误处理，先给重挂机会', async () => {
    vi.useFakeTimers()
    const reload = stubReload()
    const willThrow = ref(true)
    const Child = makeToggleChild(willThrow)
    const w = mount(ErrorBoundary, { slots: { default: () => h(Child) } })
    await nextTick()

    // 重挂成功并走完静默期 → 升级标记解除
    willThrow.value = false
    await w.find('.eb-btn').trigger('click')
    await nextTick()
    expect(w.find('.child-ok').exists()).toBe(true)
    vi.advanceTimersByTime(3100)

    // 3s 之后才回来的异步错误：第一次点击必须仍是重挂
    willThrow.value = true
    await nextTick()
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)
    await w.find('.error-boundary-fallback').find('.eb-btn').trigger('click')
    await nextTick()
    expect(reload).not.toHaveBeenCalled()

    // 确认原地复发后，第二次点击才升级整页重载
    await w.find('.error-boundary-fallback').find('.eb-btn').trigger('click')
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('卸载时清掉静默计时器（不留悬挂定时器）', async () => {
    vi.useFakeTimers()
    const willThrow = ref(true)
    const Child = makeToggleChild(willThrow)
    const w = mount(ErrorBoundary, { slots: { default: () => h(Child) } })
    await nextTick()

    willThrow.value = false
    await w.find('.eb-btn').trigger('click')
    await nextTick()
    expect(w.find('.child-ok').exists()).toBe(true)

    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    w.unmount()
    expect(clearSpy).toHaveBeenCalled()
    clearSpy.mockRestore()
  })
})

describe('AppLayout · 页面级错误隔离', () => {
  async function mountLayout(path: string) {
    const router = makeRouter()
    router.push(path)
    await router.isReady()
    const w = mount(AppLayout, {
      global: { plugins: [router], stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    return { w, router }
  }

  it('崩溃页显示降级 UI', async () => {
    const { w } = await mountLayout('/bad')
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)
    w.unmount()
  })

  it('切到正常导航项后降级 UI 消失、新页渲染（无需整页刷新）', async () => {
    const { w, router } = await mountLayout('/bad')
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    await router.push('/good')
    await nextTick()
    await nextTick()

    expect(w.find('.error-boundary-fallback').exists()).toBe(false)
    expect(w.find('.fine-page').exists()).toBe(true)
    w.unmount()
  })

  it('同一路由只换 query 也复位（红队 B：path 不含 query 会漏）', async () => {
    const { w, router } = await mountLayout('/q')
    expect(w.find('.error-boundary-fallback').exists()).toBe(true)

    await router.push('/q?ok=1')
    await nextTick()
    await nextTick()

    expect(w.find('.error-boundary-fallback').exists()).toBe(false)
    expect(w.find('.fine-page').exists()).toBe(true)
    w.unmount()
  })

  it('正常页不插入额外 DOM 层级（边界不改动布局骨架）', async () => {
    const { w } = await mountLayout('/good')
    expect(w.find('.content-body').element.firstElementChild?.className).toBe('fine-page')
    w.unmount()
  })
})
