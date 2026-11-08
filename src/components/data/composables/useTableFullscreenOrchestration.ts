/**
 * useTableFullscreenOrchestration — DataTable 全屏**编排层**（从 DataTable.vue 下沉，#452）
 *
 * 与 useTableFullscreen.ts（机械层）的分工：
 *   · 机械层：节点搬迁/归还、边界监听、侧栏收起等待 —— 与业务弹窗状态无关的自包含逻辑；
 *   · 编排层（本文件）：进入/取消/退出的**状态机**（_fsSeq/_fsPendingRun 双计数）、
 *     侧栏收起的「谁收的谁还」簿记、watch(_isFullscreen) 的全局监听挂/卸与归还次序。
 *
 * Escape 优先级链与 body-click 的弹窗守卫仍留在 DataTable：它们读六个业务弹窗状态，
 * 是业务编排。本文件只接「该不该退出」的裁决回调（shouldStay）。
 */
import { ref, watch, onDeactivated, nextTick, getCurrentInstance, type Ref } from 'vue'
import { useFullscreenNodeRelocation, useFullscreenBounds, waitForSidebarCollapse } from './useTableFullscreen'

export interface FullscreenOrchestrationOptions {
  /** .table-wrap 根节点 ref（搬迁/边界都锚它） */
  wrapRef: Ref<HTMLElement | null>
  /** 虚拟滚动容器 ref（watch 尾部重测窗口高度） */
  scrollContainerRef: Ref<HTMLElement | null>
  /** 侧栏收起/还原（宿主事件或 inject 降级，DataTable 决定） */
  toggleCollapse: () => void
  /** 全屏态变化（宿主事件） */
  onFullscreenChange: (v: boolean) => void
  /** 全屏切换后容器高度重测与自适应列宽（宿主内部状态） */
  afterToggle: () => void | Promise<void>
  /** 「此时不该退出全屏」的裁决（Escape 链与 body-click 守卫，宿主业务弹窗状态） */
  shouldStay: () => boolean
  /** Escape 的业务收口（按优先级关子弹层；返回 true 表示已消费） */
  onEscape: () => boolean
  /** body 点击的业务收口（关筛选/菜单等；返回 true 表示已消费） */
  onBodyClickHandled: () => boolean
  /** 全局键盘处理（进入全屏时重排到业务链之后） */
  rebindTableKeydown: (mode: 'suspend' | 'resume') => void
  /** 应用自适应列宽（watch 尾部） */
  applyAutoFit: () => void
  /** 卸载期清理钩子注册表（_cleanups） */
  cleanups: (() => void)[]
}

export function useTableFullscreenOrchestration(o: FullscreenOrchestrationOptions) {
  const _isFullscreen = ref(false)
  const _lockedMaxH = ref('')
  const _sidebarToggledByUs = ref(false)
  let _fsSeq = 0
  let _fsPendingRun = 0

  const { moveToBody, returnToOrigin } = useFullscreenNodeRelocation(o.wrapRef)
  const _fsBounds = useFullscreenBounds(o.wrapRef, () => _isFullscreen.value)

  /** 放弃进行中的进入全屏，并把被本组件收起的侧栏还原（三条中断路径共用） */
  function cancelFullscreenEnter(): void {
    _fsPendingRun = 0
    if (_sidebarToggledByUs.value) {
      o.toggleCollapse()
      _sidebarToggledByUs.value = false
    }
  }

  function toggleFullscreen(): void {
    if (_isFullscreen.value) {
      _isFullscreen.value = false
      return
    }
    if (_fsPendingRun) {
      cancelFullscreenEnter()
      return
    }
    const sidebar = document.querySelector<HTMLElement>('.sidebar')
    const needCollapse = !!sidebar && !sidebar.classList.contains('collapsed')
    if (needCollapse) {
      o.toggleCollapse()
      _sidebarToggledByUs.value = true
    }
    const run = ++_fsSeq
    _fsPendingRun = run
    void _enterAfterSettle(needCollapse ? sidebar : null, needCollapse, run)
  }

  async function _enterAfterSettle(sidebar: HTMLElement | null, needCollapse: boolean, run: number) {
    if (needCollapse && sidebar) await waitForSidebarCollapse(sidebar)
    if (_fsPendingRun !== run) return
    _fsPendingRun = 0
    _isFullscreen.value = true
  }

  function onFullscreenKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !_isFullscreen.value) return
    e.preventDefault?.()
    if (o.onEscape()) return
    _isFullscreen.value = false
  }

  function onFullscreenBodyClick(e: MouseEvent): void {
    if (!o.wrapRef.value) return
    const target = e.target as HTMLElement
    if (o.wrapRef.value.contains(target)) return
    if (
      target.closest(
        '.dt-filter-dropdown,.dt-context-menu,.dt-cell-tooltip,.opt-drop-panel,.note-editor,.note-tooltip,.modal-overlay',
      )
    )
      return
    if (o.onBodyClickHandled()) return
    _isFullscreen.value = false
  }

  // 同其他 composable：单测会直接调用（没有活动组件实例 / 不在 KeepAlive 里），
  // onDeactivated 在那种上下文里无效且会刷 warn。有实例才注册。
  if (getCurrentInstance()) {
    onDeactivated(() => {
      // KeepAlive 失活不能把全屏态带进缓存（表格挂在 body 上，类与监听仍生效）
      if (_isFullscreen.value) _isFullscreen.value = false
    })
  }

  watch(_isFullscreen, async (v) => {
    _lockedMaxH.value = ''
    if (v) {
      document.addEventListener('keydown', onFullscreenKeydown, true)
      o.rebindTableKeydown('suspend')
      document.addEventListener('click', onFullscreenBodyClick, true)
      window.addEventListener('resize', _fsBounds.onWindowResize)
      document.body.classList.add('dt-fullscreen-active')
      moveToBody()
      await nextTick()
      _fsBounds.apply()
      _fsBounds.start()
    } else {
      _fsPendingRun = 0
      _fsBounds.stop()
      document.removeEventListener('keydown', onFullscreenKeydown, true)
      document.removeEventListener('click', onFullscreenBodyClick, true)
      window.removeEventListener('resize', _fsBounds.onWindowResize)
      document.body.classList.remove('dt-fullscreen-active')
      // 先归还节点再还原侧栏：反过来会把"定宽定高静态块"顶开宿主页面
      returnToOrigin()
      if (_sidebarToggledByUs.value) {
        o.toggleCollapse()
        _sidebarToggledByUs.value = false
      }
    }
    await nextTick()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    o.applyAutoFit()
    if (o.scrollContainerRef.value) {
      // 容器高度重测由宿主完成（虚拟滚动状态在那边）
      o.afterToggle()
    }
    o.onFullscreenChange(v)
  })

  /** 卸载清理（DataTable 的 onBeforeUnmount 调用） */
  function teardown(): void {
    cancelFullscreenEnter()
    if (_isFullscreen.value) {
      document.body.classList.remove('dt-fullscreen-active')
      document.removeEventListener('keydown', onFullscreenKeydown, true)
      document.removeEventListener('click', onFullscreenBodyClick, true)
      window.removeEventListener('resize', _fsBounds.onWindowResize)
      _fsBounds.stop()
      _fsBounds.cancelRaf()
      returnToOrigin()
    }
  }

  return {
    isFullscreen: _isFullscreen,
    lockedMaxH: _lockedMaxH,
    toggleFullscreen,
    cancelFullscreenEnter,
    teardown,
    onFullscreenKeydown,
  }
}
