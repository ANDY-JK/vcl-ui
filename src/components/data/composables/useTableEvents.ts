// ==================== 全局事件注册 / 清理 / 多行锚点 ====================
import { computed, onMounted, onUnmounted, type Ref, type ComputedRef } from 'vue'

export interface TableEventHooks {
  onZoomKeydown: (e: KeyboardEvent) => boolean
  onGlobalKeydown: (e: KeyboardEvent, activeFilterKey: { value: string | null }, contextMenu: { value: { visible: boolean } }, closeFilter: () => void) => void
  onCellKeydown: (e: KeyboardEvent) => void
  onDocumentClick: (e: MouseEvent, closeFilter: () => void) => void
  onScrollClose: (e: Event, activeFilterKey: { value: string | null }, closeFilter: () => void) => void
  onWindowResizeCard: () => void
  closeFilter: () => void
  activeFilterKey: Ref<string | null>
  contextMenu: Ref<{ visible: boolean }>
  _colSettingsShow: Ref<boolean>
  closeOptDrop: () => void
  isLayerFresh: (ms?: number) => boolean
  _closeCallbacks: Set<() => void>
}

export function useTableEvents(hooks: TableEventHooks) {
  const _onClick = (e: Event) => {
    hooks.onDocumentClick(e as MouseEvent, hooks.closeFilter)
    const t = e.target as HTMLElement
    if (!t.closest('.dt-col-settings') && !t.closest('.col-settings-btn')) hooks._colSettingsShow.value = false
    if (!t.closest('.cell-has-options') && !t.closest('.opt-drop-panel')) hooks.closeOptDrop()
  }

  const _onKeydown = (e: Event) => {
    const ke = e as KeyboardEvent
    if (ke.key === 'Escape' && hooks._colSettingsShow.value) { hooks._colSettingsShow.value = false; return }
    if (hooks.onZoomKeydown(ke)) return
    hooks.onGlobalKeydown(ke, hooks.activeFilterKey, hooks.contextMenu, hooks.closeFilter)
  }

  const _onCellKeydownCapture = (e: Event) => {
    hooks.onCellKeydown(e as KeyboardEvent)
  }

  const _onScroll = (e: Event) => {
    if (hooks.isLayerFresh()) return
    hooks.onScrollClose(e, hooks.activeFilterKey, hooks.closeFilter)
    const t = e.target as HTMLElement | null
    if (hooks._colSettingsShow.value && !(t instanceof HTMLElement && t.closest('.dt-col-settings'))) {
      hooks._colSettingsShow.value = false
    }
    if (!(t instanceof HTMLElement && t.closest('.opt-drop-panel'))) hooks.closeOptDrop()
  }

  onMounted(() => {
    document.addEventListener('click', _onClick, true)
    document.addEventListener('keydown', _onKeydown, true)
    document.addEventListener('keydown', _onCellKeydownCapture, true)
    document.addEventListener('scroll', _onScroll, true)
    window.addEventListener('resize', hooks.onWindowResizeCard)
    hooks._closeCallbacks.add(hooks.closeFilter)
  })

  onUnmounted(() => {
    document.removeEventListener('click', _onClick, true)
    document.removeEventListener('keydown', _onKeydown, true)
    document.removeEventListener('keydown', _onCellKeydownCapture, true)
    document.removeEventListener('scroll', _onScroll, true)
    window.removeEventListener('resize', hooks.onWindowResizeCard)
    hooks._closeCallbacks.delete(hooks.closeFilter)
  })
}

// ==================== 多行锚点（点击行高亮 → 进度条标记 → 点击跳回） ====================
export function usePinnedRowAnchors(
  pagedData: ComputedRef<Record<string, any>[]>,
  rowMetaMap: ComputedRef<Map<Record<string, any>, any>>,
  _clickedRowKeys: Ref<Set<string>>,
  scrollContainerRef: Ref<HTMLElement | null>,
  _effectiveRowHeight: ComputedRef<number>,
) {
  const _pinnedRowPcts = computed(() => {
    const keys = _clickedRowKeys.value
    if (keys.size === 0) return [] as { key: string; pct: number }[]
    const data = pagedData.value
    const total = data.length
    if (total === 0) return []
    const result: { key: string; pct: number }[] = []
    for (let i = 0; i < total; i++) {
      const rk = rowMetaMap.value.get(data[i])?.key ?? ''
      if (keys.has(rk)) result.push({ key: rk, pct: Math.round(((i + 0.5) / total) * 100) })
    }
    return result
  })

  function scrollToPinnedRow(key: string) {
    if (!key) return
    const container = scrollContainerRef.value
    if (!container) return
    const data = pagedData.value
    const rowH = _effectiveRowHeight.value
    for (let i = 0; i < data.length; i++) {
      if ((rowMetaMap.value.get(data[i])?.key ?? '') === key) {
        const targetTop = i * rowH - container.clientHeight / 2 + rowH / 2
        container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
        return
      }
    }
  }

  return { _pinnedRowPcts, scrollToPinnedRow }
}
