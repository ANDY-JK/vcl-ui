// ==================== 全屏切换（DOM 迁移 + 侧边栏联动 + resize 跟踪） ====================
import { ref, watch, nextTick, inject, onUnmounted, type Ref } from 'vue'

export interface FullscreenHooks {
  /** 全屏时收起宿主侧边栏的回调（不传则尝试 inject('toggleCollapse') 降级） */
  onToggleSidebar?: () => void
}

export function useTableFullscreen(
  tableWrapRef: Ref<HTMLElement | null>,
  hooks: FullscreenHooks,
  emit: (e: 'fullscreenChange', v: boolean) => void,
  /** 全屏后执行的回调（如 applyAutoFit） */
  onFullscreenSettled?: () => void,
) {
  const _isFullscreen = ref(false)
  const _lockedMaxH = ref('')
  const _fullscreenParent = ref<HTMLElement | null>(null)
  const _fullscreenNext = ref<ChildNode | null>(null)
  const _toggleCollapse = hooks.onToggleSidebar ?? inject<() => void>('toggleCollapse', () => {})
  const _sidebarToggledByUs = ref(false)
  let _fsTimer: ReturnType<typeof setTimeout> | null = null
  let _fsResizeRaf = 0
  let _fsPending = false

  function toggleFullscreen() {
    if (_isFullscreen.value) {
      _isFullscreen.value = false
    } else if (_fsPending) {
      // 正在等待进入全屏 → 取消，还原导航
      if (_fsTimer) { clearTimeout(_fsTimer); _fsTimer = null }
      _fsPending = false
      if (_sidebarToggledByUs.value) {
        _toggleCollapse()
        _sidebarToggledByUs.value = false
      }
    } else {
      const sidebar = document.querySelector('.sidebar')
      const needCollapse = sidebar && !sidebar.classList.contains('collapsed')
      if (needCollapse) {
        _toggleCollapse()
        _sidebarToggledByUs.value = true
      }
      _fsPending = true
      _fsTimer = setTimeout(() => {
        _fsTimer = null
        _fsPending = false
        _isFullscreen.value = true
      }, needCollapse ? 250 : 0)
    }
  }

  function onFullscreenKeydown(e: KeyboardEvent, closeCallbacks: Array<() => boolean>) {
    if (e.key === 'Escape' && _isFullscreen.value) {
      // 优先关闭子组件：筛选 → 详情弹窗 → 截图弹窗 → 右键菜单 → 批量编辑 → 笔记编辑 → 退出全屏
      for (const cb of closeCallbacks) {
        if (cb()) return // 子组件处理了，不退出全屏
      }
      _isFullscreen.value = false
    }
  }

  // 全屏时点击外部区域关闭（排除 Teleport 到 body 的筛选/菜单/提示等子元素）
  function onFullscreenBodyClick(e: MouseEvent, closeCallbacks: Array<() => boolean>) {
    if (!tableWrapRef.value) return
    const target = e.target as HTMLElement
    if (tableWrapRef.value.contains(target)) return
    // Teleport 到 body 的元素不触发退出
    if (target.closest('.dt-filter-dropdown,.dt-context-menu,.dt-cell-tooltip,.opt-drop-panel,.note-editor,.note-tooltip,.modal-overlay')) return
    // 有子组件打开时，让它们处理，不退出全屏
    for (const cb of closeCallbacks) {
      if (cb()) return
    }
    _isFullscreen.value = false
  }

  // 全屏时窗口 resize 更新边界（rAF 节流）
  function onFullscreenResize() {
    if (_fsResizeRaf) return
    _fsResizeRaf = requestAnimationFrame(() => {
      _fsResizeRaf = 0
      if (!_isFullscreen.value || !tableWrapRef.value) return
      const cb = document.querySelector('.content-body')
      if (cb) {
        const r = cb.getBoundingClientRect()
        tableWrapRef.value.style.top = r.top + 'px'
        tableWrapRef.value.style.left = r.left + 'px'
        tableWrapRef.value.style.width = r.width + 'px'
        tableWrapRef.value.style.height = r.height + 'px'
      }
    })
  }

  watch(_isFullscreen, async (v) => {
    _lockedMaxH.value = '' // 全屏模式由内部 flex 布局接管，释放 JS 锁高
    if (v) {
      // 移到 body 下，脱离弹窗/父容器的 overflow/display 限制
      if (tableWrapRef.value && tableWrapRef.value.parentElement) {
        _fullscreenParent.value = tableWrapRef.value.parentElement
        _fullscreenNext.value = tableWrapRef.value.nextSibling
        document.body.appendChild(tableWrapRef.value)
      }
      // 动态计算内容区边界，不受滚动影响；无 .content-body 时回退为视口
      await nextTick()
      const cb = document.querySelector('.content-body')
      if (tableWrapRef.value) {
        if (cb) {
          const r = cb.getBoundingClientRect()
          tableWrapRef.value.style.top = r.top + 'px'
          tableWrapRef.value.style.left = r.left + 'px'
          tableWrapRef.value.style.width = r.width + 'px'
          tableWrapRef.value.style.height = r.height + 'px'
        } else {
          tableWrapRef.value.style.top = '0'
          tableWrapRef.value.style.left = '0'
          tableWrapRef.value.style.width = '100vw'
          tableWrapRef.value.style.height = '100vh'
        }
      }
    } else {
      // 清理 pending 状态
      if (_fsTimer) { clearTimeout(_fsTimer); _fsTimer = null }
      _fsPending = false
      // 还原导航栏
      if (_sidebarToggledByUs.value) {
        _toggleCollapse()
        _sidebarToggledByUs.value = false
        await new Promise(r => setTimeout(r, 250))
      }
      // 还原到原始父容器
      if (tableWrapRef.value && _fullscreenParent.value) {
        _fullscreenParent.value.insertBefore(tableWrapRef.value, _fullscreenNext.value)
        _fullscreenParent.value = null
        _fullscreenNext.value = null
      }
      if (tableWrapRef.value) {
        tableWrapRef.value.style.top = ''
        tableWrapRef.value.style.left = ''
        tableWrapRef.value.style.width = ''
        tableWrapRef.value.style.height = ''
      }
    }
    await nextTick()
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    onFullscreenSettled?.()
    emit('fullscreenChange', v)
  })

  onUnmounted(() => {
    if (_fsTimer) { clearTimeout(_fsTimer); _fsTimer = null }
    if (_fsResizeRaf) { cancelAnimationFrame(_fsResizeRaf); _fsResizeRaf = 0 }
    _fsPending = false
    // 全屏清理：防止组件销毁后残留 DOM/事件/样式
    if (_isFullscreen.value) {
      document.body.classList.remove('dt-fullscreen-active')
      // 还原侧边栏
      if (_sidebarToggledByUs.value) {
        _toggleCollapse()
        _sidebarToggledByUs.value = false
      }
      // 清理 inline 样式
      if (tableWrapRef.value) {
        tableWrapRef.value.style.top = ''
        tableWrapRef.value.style.left = ''
        tableWrapRef.value.style.width = ''
        tableWrapRef.value.style.height = ''
      }
    }
  })

  return {
    _isFullscreen,
    _lockedMaxH,
    _sidebarToggledByUs,
    toggleFullscreen,
    onFullscreenKeydown,
    onFullscreenBodyClick,
    onFullscreenResize,
  }
}
