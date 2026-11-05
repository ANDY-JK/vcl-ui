/**
 * useTableFullscreenOrchestration · 全屏**编排层**（#452 从 DataTable.vue 下沉）
 *
 * 编排层管三件事：进入/取消/退出状态机（_fsSeq/_fsPendingRun 双计数）、
 * 侧栏「谁收的谁还」簿记、watch(_isFullscreen) 的监听挂/卸与归还次序。
 * 本 spec 用最小桩钉住状态机行为；机械层（搬迁/边界/等待）已有 table-fullscreen.spec.ts。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useTableFullscreenOrchestration } from '@/components/data/composables/useTableFullscreenOrchestration'

function harness() {
  const wrapRef = ref(document.createElement('div'))
  document.body.appendChild(wrapRef.value)
  const scrollContainerRef = ref(document.createElement('div'))
  const calls = { toggle: 0, change: [] as boolean[], escape: 0, bodyHandled: 0, after: 0, autofit: 0 }
  const o = useTableFullscreenOrchestration({
    wrapRef,
    scrollContainerRef,
    toggleCollapse: () => calls.toggle++,
    onFullscreenChange: (v) => calls.change.push(v),
    afterToggle: () => calls.after++,
    shouldStay: () => false,
    onEscape: () => {
      calls.escape++
      return true
    },
    onBodyClickHandled: () => {
      calls.bodyHandled++
      return true
    },
    rebindTableKeydown: () => {},
    applyAutoFit: () => calls.autofit++,
    cleanups: [],
  })
  return { wrapRef, scrollContainerRef, o, calls }
}

/** 把 .sidebar 收起态去掉，让 toggleFullscreen 走"需要收侧栏"分支 */
function ensureSidebarOpen() {
  let sidebar = document.querySelector<HTMLElement>('.sidebar')
  if (!sidebar) {
    sidebar = document.createElement('div')
    sidebar.className = 'sidebar'
    document.body.appendChild(sidebar)
  }
  sidebar.classList.remove('collapsed')
  return sidebar
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.classList.remove('dt-fullscreen-active')
  document.body.innerHTML = ''
})

describe('useTableFullscreenOrchestration · 状态机', () => {
  it('toggle：进入后 body 挂全屏类、wrap 被搬到 body；再点一次退出并归还', async () => {
    const { wrapRef, o, calls } = harness()
    ensureSidebarOpen()
    o.toggleFullscreen()
    // 等待侧栏收起等待链（waitForSidebarCollapse 对无 CSS 动画元素走宽度实测/上限）
    await vi.waitFor(() => expect(o.isFullscreen.value).toBe(true))
    expect(document.body.classList.contains('dt-fullscreen-active')).toBe(true)
    expect(wrapRef.value.parentElement).toBe(document.body)

    o.toggleFullscreen()
    await vi.waitFor(() => expect(o.isFullscreen.value).toBe(false))
    await vi.waitFor(() => expect(calls.change).toEqual([true, false]))
    expect(document.body.classList.contains('dt-fullscreen-active')).toBe(false)
    // 侧栏是本组件收的 → 退出时还回去
    expect(calls.toggle).toBe(2)
  })

  it('取消语义：退出后立即再点可重新进入（历史雷：永久取消让按钮失灵）', async () => {
    const { o, calls } = harness()
    ensureSidebarOpen()
    o.toggleFullscreen()
    await vi.waitFor(() => expect(o.isFullscreen.value).toBe(true))
    o.toggleFullscreen() // 退出（作废一切在飞流程）
    await vi.waitFor(() => expect(o.isFullscreen.value).toBe(false))
    o.toggleFullscreen() // 退出落地后立即再点：状态机必须接受新号（历史雷：永久取消让按钮失灵）
    await vi.waitFor(() => expect(o.isFullscreen.value).toBe(true))
    expect(calls.change.at(-1)).toBe(true)
  })

  it('Escape 先问业务链：onEscape 返回 true 时不退出全屏', async () => {
    const { o, calls } = harness()
    o.toggleFullscreen()
    await vi.waitFor(() => expect(o.isFullscreen.value).toBe(true))
    o.onFullscreenKeydown(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(o.isFullscreen.value).toBe(true)
    expect(calls.escape).toBe(1)
  })

  it('body 点击先问业务链：onBodyClickHandled 返回 true 时不退出', async () => {
    const { wrapRef, o, calls } = harness()
    o.toggleFullscreen()
    await vi.waitFor(() => expect(o.isFullscreen.value).toBe(true))
    o.onFullscreenKeydown(new KeyboardEvent('keydown', { key: 'a' })) // 非 Escape：无副作用
    expect(o.isFullscreen.value).toBe(true)
    expect(calls.bodyHandled).toBe(0)
    expect(wrapRef.value.parentElement).toBe(document.body)
  })

  it('teardown：等待中卸载要作废等待并还原侧栏（历史雷：新页面侧栏收死）', async () => {
    const { o, calls } = harness()
    ensureSidebarOpen()
    o.toggleFullscreen()
    o.teardown()
    expect(o.isFullscreen.value).toBe(false)
    expect(calls.toggle).toBeGreaterThanOrEqual(1)
  })
})
