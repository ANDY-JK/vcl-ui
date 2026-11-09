// ==================== 单元格浮层菜单：图片灯箱 / 选项下拉面板 / 单元格右键菜单 / 键盘导航 ====================
// 从 DataTable.vue 主文件下沉（M3 第十刀）。三个浮层共有的特征：fixed 定位 + 视口裁剪
// （clampFloatingPosition / computeFloatingPosition）+ 打开时 markLayerOpen 压层 + 键盘可达。
// 状态与开合逻辑归本模块；触发接线（onCellClick / onCellDblClick 等）留在主文件。
import { ref, watch, nextTick, type ComputedRef, type Ref } from 'vue'
import type { Column, ColumnOption, RowMeta } from './types'
import type { TableRow } from '@/components/_internal/api-any'
import type { WriteEntry } from './cell-types'
import { isColumnReadonly } from './cell-types'
import { clampFloatingPosition, markLayerOpen } from './utils'
import { computeFloatingPosition } from '@/components/_internal/useFloating'

/** 单元格图片单击开灯箱的等待：留出双击判定的窗口 */
const _LIGHTBOX_CLICK_DELAY_MS = 280

/** 右键菜单结构（与 useTableExtras 的 contextMenu 同构——表头/行/单元格右键共用一个状态） */
interface MenuState {
  visible: boolean
  x: number
  y: number
  above: boolean
  columnKey: string | null
  rowKey: string | null
  row: TableRow | null
  rowIndex: number
}

export function useTableCellMenus(
  props: {
    /** 整表编辑开关（选项面板可开性 + 右键粘贴守卫共用） */
    editable?: boolean
    /** 单元格右键菜单开关：false 时右键冒泡到行右键/浏览器默认 */
    cellContextMenu?: boolean
  },
  deps: {
    rowMetaMap: Ref<Map<TableRow, RowMeta>>
    /** 单元格即时显示值（本地覆盖优先） */
    cellVal: (row: TableRow, colKey: string, metaVal: string) => string
    selectCell: (rowKey: string, colKey: string, value: string, ctrlKey: boolean) => void
    effectivePagedData: ComputedRef<TableRow[]>
    tableWrapRef: Ref<HTMLElement | null>
    /** 表头/行/单元格右键共用状态（useTableExtras 产出） */
    contextMenu: Ref<MenuState>
    closeContextMenu: () => void
    /** 写入漏斗（选项面板落库必须走它，绕过会丢撤销记录） */
    applyChanges: (entries: WriteEntry[]) => void
    markEditActive: () => void
    copySelectedCell: () => Promise<void> | void
    pasteText: (text: string) => void
    pasteToSelection: () => void
    clearSelection: (e?: KeyboardEvent) => void
    /** 主选格（右键粘贴守卫：无选中格时禁用粘贴） */
    selectedCell: Ref<{ rowKey: string; colKey: string } | null>
  },
) {
  const {
    rowMetaMap,
    cellVal,
    selectCell,
    effectivePagedData,
    tableWrapRef,
    contextMenu,
    closeContextMenu,
    applyChanges,
    markEditActive,
    copySelectedCell,
    pasteText,
    pasteToSelection,
    clearSelection,
    selectedCell,
  } = deps

  // ==================== 图片预览灯箱（单击打开，支持缩放拖拽） ====================
  let _lightboxTimer: ReturnType<typeof setTimeout> | null = null
  const _lightboxSrc = ref('')
  function onImageClick(_e: MouseEvent, src: string) {
    if (_lightboxTimer) {
      clearTimeout(_lightboxTimer)
      _lightboxTimer = null
      return
    }
    _lightboxTimer = setTimeout(() => {
      _lightboxSrc.value = src
      _lightboxTimer = null
    }, _LIGHTBOX_CLICK_DELAY_MS)
  }
  function closeLightbox() {
    _lightboxSrc.value = ''
  }

  // ==================== 选项列自定义下拉面板 ====================
  // options 支持 string | object 两种形式，运行时 typeof 判分
  const _optDrop = ref<{
    rowKey: string
    colKey: string
    options: (string | ColumnOption)[]
    currentVal: string
    top: number
    left: number
    width: number
    above: boolean
  } | null>(null)
  /** options 列是否**可下拉**：整表 editable 且该列未被 editable:false 禁用。
   *  该判定是唯一事实来源 —— 同时决定箭头指示器是否渲染、`cell-has-options`（cursor:pointer）
   *  是否挂上、以及点击/双击能否打开面板。
   *  ⚠️ 不可编辑的 options 列**不应显示任何「可下拉」暗示**（箭头/手型光标），否则看似能点却点不开。
   *  声明为类型谓词（col is Column & { options: ... }），使调用方在守卫后可直接使用 col.options。 */
  function isOptionDroppable(col: Column): col is Column & { options: NonNullable<Column['options']> } {
    // 下拉面板可开 = 有选项 + 表格可编辑 + 列非只读（判据走单一谓词，TD-77 / #274）
    return !!col.options && !!props.editable && !isColumnReadonly(col)
  }

  // 面板打开时的触发单元格 rect 快照，用于渲染后精确重定位
  let _optDropTriggerRect: DOMRect | null = null
  const optDropRef = ref<HTMLElement | null>(null)
  const _optFocusIndex = ref(0)
  watch(_optDrop, (v) => {
    if (!v) return
    _optFocusIndex.value = 0
    nextTick(() => {
      optDropRef.value?.focus()
      // 渲染后用实际高度重新计算位置，修复预估高度不精确导致的向上弹出重叠问题
      // 直接操作 DOM 避免修改 _optDrop.value 触发 watch 循环
      if (optDropRef.value && _optDropTriggerRect) {
        const panelEl = optDropRef.value
        const panelH = panelEl.offsetHeight
        const triggerRect = _optDropTriggerRect
        const vh = window.innerHeight
        const offset = 4
        const spaceDown = vh - triggerRect.bottom - offset
        const spaceUp = triggerRect.top - offset
        let newTop: number
        if (spaceDown >= panelH) {
          newTop = triggerRect.bottom + offset
        } else if (spaceUp >= panelH) {
          newTop = triggerRect.top - panelH - offset
        } else {
          // 上下都不够：选空间大的方向
          newTop = spaceDown >= spaceUp ? triggerRect.bottom + offset : Math.max(8, triggerRect.top - panelH - offset)
        }
        // 边界裁剪：不超出视口
        if (newTop < 8) newTop = 8
        if (newTop + panelH > vh - 8) newTop = Math.max(8, vh - panelH - 8)
        panelEl.style.top = newTop + 'px'
      }
    })
  })

  function openOptDrop(row: TableRow, col: Column, event: MouseEvent) {
    // 防御：非编辑模式或列级禁用不允许打开选项面板
    if (!isOptionDroppable(col)) return
    // 标记活动表格：卡片视图的字段点击不经 selectCell，不标记会导致 Ctrl+Z 静默失效
    markEditActive()
    markLayerOpen()
    const rk = rowMetaMap.value.get(row)?.key ?? ''
    // 点同一格则关闭
    if (_optDrop.value?.rowKey === rk && _optDrop.value?.colKey === col.key) {
      _optDrop.value = null
      return
    }
    const td = event.currentTarget as HTMLElement
    const rect = td.getBoundingClientRect()
    _optDropTriggerRect = rect
    // 预估下拉面板高度：每项 32px + 内边距
    const estMenuH = Math.min(320, Math.max(120, col.options!.length * 32 + 12))
    const result = computeFloatingPosition({
      rect,
      floatingW: Math.max(rect.width, 100),
      floatingH: estMenuH,
      offset: 4,
      defaultDirection: 'down',
    })
    _optDrop.value = {
      rowKey: rk,
      colKey: col.key,
      options: col.options,
      currentVal: cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''),
      top: result.top,
      left: result.left,
      width: Math.max(rect.width, 100),
      above: result.above,
    }
  }
  function closeOptDrop() {
    _optDrop.value = null
  }
  function pickOption(val: string) {
    if (!_optDrop.value) return
    if (!props.editable) return
    const { rowKey, colKey, currentVal } = _optDrop.value
    _optDrop.value = null
    if (val !== currentVal) {
      // 收敛到写入漏斗（此前自建 override 会绕过撤销栈与统一 emit）
      applyChanges([{ rowKey, colKey, value: val }])
    }
  }

  function onOptDropKeydown(e: KeyboardEvent) {
    if (!_optDrop.value) return
    const len = _optDrop.value.options.length
    if (len === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault?.()
      _optFocusIndex.value = (_optFocusIndex.value + (e.key === 'ArrowDown' ? 1 : -1) + len) % len
    } else if (e.key === 'Enter') {
      e.preventDefault?.()
      const opt = _optDrop.value.options[_optFocusIndex.value]
      if (opt) pickOption(typeof opt === 'string' ? opt : opt.value)
    } else if (e.key === 'Escape') {
      // 关右键菜单即消费 Esc（#280）
      e.preventDefault?.()
      closeOptDrop()
    }
  }

  // ==================== 单元格右键菜单 ====================
  /** 单元格右键守卫：cellContextMenu=false 时不拦截，冒泡到行右键/浏览器默认 */
  function onCellContextMenuGuard(row: TableRow, col: Column, e: MouseEvent) {
    if (!props.cellContextMenu) return
    e.preventDefault?.()
    e.stopPropagation()
    onCellContextMenu(row, col, e)
  }

  function onCellContextMenu(row: TableRow, col: Column, event: MouseEvent) {
    // 右键格设为当前选中（清空旧选区），菜单操作基于该格
    markLayerOpen()
    const rk = rowMetaMap.value.get(row)?.key ?? ''
    selectCell(rk, col.key, cellVal(row, col.key, rowMetaMap.value.get(row)?.texts[col.key] ?? ''), false)
    closeContextMenu()
    const idx = effectivePagedData.value.findIndex((r) => rowMetaMap.value.get(r)?.key === rk)
    contextMenu.value = {
      visible: true,
      x: event.clientX,
      y: event.clientY,
      above: false,
      columnKey: col.key,
      rowKey: rk,
      row,
      rowIndex: idx,
    }
    // 菜单边界（3 项 + 分隔线）
    const pos = clampFloatingPosition(event.clientX, event.clientY, 140, 150, tableWrapRef.value)
    contextMenu.value.x = pos.left
    contextMenu.value.y = pos.above ? event.clientY : pos.top
    contextMenu.value.above = pos.above
  }

  async function onContextCopyCell() {
    closeContextMenu()
    await copySelectedCell()
  }

  async function onContextPasteCell() {
    closeContextMenu()
    if (!props.editable || !selectedCell.value) return
    let external: string
    try {
      external = await navigator.clipboard.readText()
    } catch {
      external = ''
    }
    if (external) pasteText(external)
    else pasteToSelection()
  }

  function onContextClearCell() {
    closeContextMenu()
    clearSelection()
  }

  // ==================== 右键菜单键盘导航 ====================
  const contextMenuRef = ref<HTMLElement | null>(null)
  const _menuFocusIndex = ref(0)
  watch(
    () => contextMenu.value.visible,
    (v) => {
      if (!v) return
      _menuFocusIndex.value = 0
      nextTick(() => {
        contextMenuRef.value?.focus()
        updateMenuFocus()
      })
    },
  )
  function updateMenuFocus() {
    const menu = contextMenuRef.value
    if (!menu) return
    menu.querySelectorAll<HTMLElement>('.dt-context-item').forEach((el, i) => {
      el.classList.toggle('menu-focused', i === _menuFocusIndex.value)
      el.tabIndex = i === _menuFocusIndex.value ? 0 : -1
    })
  }
  function onContextMenuKeydown(e: KeyboardEvent) {
    const menu = contextMenuRef.value
    if (!menu) return
    const items = [...menu.querySelectorAll<HTMLElement>('.dt-context-item:not(.disabled)')]
    if (items.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault?.()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      _menuFocusIndex.value = (_menuFocusIndex.value + delta + items.length) % items.length
      updateMenuFocus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault?.()
      items[_menuFocusIndex.value]?.click()
    }
  }

  return {
    // 灯箱
    _lightboxSrc,
    onImageClick,
    closeLightbox,
    // 选项面板
    _optDrop,
    optDropRef,
    _optFocusIndex,
    isOptionDroppable,
    openOptDrop,
    closeOptDrop,
    pickOption,
    onOptDropKeydown,
    // 单元格右键菜单
    onCellContextMenuGuard,
    onContextCopyCell,
    onContextPasteCell,
    onContextClearCell,
    // 键盘导航
    contextMenuRef,
    onContextMenuKeydown,
  }
}
