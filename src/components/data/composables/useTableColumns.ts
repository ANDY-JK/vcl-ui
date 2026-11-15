// ⛔ 保护 — 禁止修改 autoFit/columnWidths/fixedOffsets 核心算法
//    禁止引入外部列宽输入（已移除 Column.width）
//    需我确认：autoFitSampleSize/minColumnWidth 等参数默认值调整
// ==================== 列管理（显隐 / 拖拽 / 固定偏移 / 自动列宽） ====================
import { ref, computed, watch, nextTick, onUnmounted, getCurrentInstance, type ComputedRef, type Ref } from 'vue'
import type { Column } from './types'
import type { TableRow } from '@/components/_internal/api-any'
import { measureColumnWidth, measureDomTextWidth, sortColumnsByOrder } from './utils'
import { BP_LG } from '@/components/_internal/breakpoints'

/** 拖完列宽后抑制紧随的 click（mouseup 与 click 同帧触发，不抑制会误触排序/筛选） */
const _RESIZE_CLICK_GUARD_MS = 150
/** 数据变化后重算自适应列宽的防抖：连续刷新只重排一次 */
const _AUTOFIT_DEBOUNCE_MS = 200

// 表头图标尺寸常量（与 IconSvg size="sm" 对齐）
const SORT_ARROW_W = 24 // 排序箭头图标 16 + sort-arrows padding 左右各 4
const FILTER_ICON_W = 24 // 筛选图标宽
const ICON_GAP = 2 // 标题→图标间距（对齐 .th-inner gap）
const FILTER_GAP = 0 // 图标间微间距
/** 全局列宽下限：任何路径写入的列宽都不低于此值（表头最小宽是逐列动态底线，
 *  这是兜底常数）——拖拽、双击自适应、autoFit 压缩、固定列偏移回退四处同口径，
 *  修复前拖拽/双击缺 60 下限，短标题列（关排序筛选）能写到 35px，与压缩口径分裂 */
const GLOBAL_MIN_COL_W = 60

export function useTableColumns(
  props: {
    columns: Column[]
    autoFit?: boolean
    selectable?: boolean
    cardBreakpoint?: number
    bordered?: boolean
    /** 判图白名单：透传给 measureColumnWidth，测量判图口径与单元格渲染一致 */
    imageDomains?: string[]
  },
  tableWrapRef: Ref<HTMLElement | null>,
  displayData: ComputedRef<TableRow[]>,
  actionsWidth?: ComputedRef<number>,
) {
  // --- 列显隐 ---
  const hiddenColumns = ref<Set<string>>(new Set())

  // --- 动态固定列（右键菜单操作，级联规则：第N列固定 → 1~N 全固定） ---
  const dynamicFixedLeft = ref<Set<string>>(new Set())
  const dynamicFixedRight = ref<Set<string>>(new Set())

  /**
   * 把列配置里的静态 fixed 并入动态固定状态（作为初始/默认固定）。
   * 之后用户可通过右键/列设置修改或取消，并随动态状态持久化。
   */
  function syncStaticFixed(): void {
    const l = new Set(dynamicFixedLeft.value)
    const r = new Set(dynamicFixedRight.value)
    for (const c of props.columns) {
      if (c.fixed === 'left') l.add(c.key)
      else if (c.fixed === 'right') r.add(c.key)
    }
    dynamicFixedLeft.value = l
    dynamicFixedRight.value = r
  }
  syncStaticFixed()
  watch(
    () => props.columns.map((c) => c.key).join(','),
    () => syncStaticFixed(),
  )

  /** 级联固定到左侧：该列及之前所有列 */
  function fixLeftCascade(colKey: string) {
    const keys = displayColumns.value.map((c) => c.key)
    const idx = keys.indexOf(colKey)
    if (idx < 0) return
    const newLeft = keys.slice(0, idx + 1)
    // 与左侧固定重叠的右侧列从右区域移除（保持右区域连续后缀）
    const newRight = new Set([...dynamicFixedRight.value].filter((k) => !newLeft.includes(k)))
    dynamicFixedLeft.value = new Set(newLeft)
    dynamicFixedRight.value = newRight
  }
  /** 级联固定到右侧：该列及之后所有列 */
  function fixRightCascade(colKey: string) {
    const keys = displayColumns.value.map((c) => c.key)
    const idx = keys.indexOf(colKey)
    if (idx < 0) return
    const newRight = keys.slice(idx)
    // 与右侧固定重叠的左侧列从左区域移除（保持左区域连续前缀）
    const newLeft = new Set([...dynamicFixedLeft.value].filter((k) => !newRight.includes(k)))
    dynamicFixedRight.value = new Set(newRight)
    dynamicFixedLeft.value = newLeft
  }
  // （已删除 `unfixColumn`，#292）它把列从 fixed 集合里**单点删除**，会在固定区中间打出空洞 ——
  // 而本组件的列宽/定位逻辑假设固定区是**连续前缀 / 连续后缀**（见 DataTableColumnSettings 的
  // `_leftFixedCount` / `_rightFixedCount` 用 while 逐列数连续段）。
  // 真实入口是列头右键 → `DataTableColumnSettings.onUnfixFromMenu()`（区域从该列断开），
  // 语义已在 column-settings-panel.spec 里锁定。留着一个"看起来能做同一件事"的集合级 API，
  // 下一个接线的人必然踩空洞。
  /** 双击自适应：测量该列内容宽度并设置 */
  function autoFitColumn(col: Column) {
    const sample = displayData.value.slice(0, 60)
    const hW = headerMinW(col)
    const { maxW } = measureColumnWidth(col, sample, props.imageDomains)
    columnWidths.value[col.key] = Math.ceil(Math.max(hW, maxW + 20, GLOBAL_MIN_COL_W))
    // 双击也是用户主动调整列宽，标记并触发持久化
    _userResizedCols.value.add(col.key)
    columnWidths.value = { ...columnWidths.value }
  }

  /** 列是否固定（静态 prop + 动态） */
  function isColumnFixed(col: Column): 'left' | 'right' | false {
    if (dynamicFixedLeft.value.has(col.key)) return 'left'
    if (dynamicFixedRight.value.has(col.key)) return 'right'
    return false
  }

  const visibleColumns = computed(() => props.columns.filter((c) => !hiddenColumns.value.has(c.key)))

  // --- 列宽拖拽 ---
  const resizing = ref<{ colKey: string; startX: number; startW: number } | null>(null)
  const columnWidths = ref<Record<string, number>>({})
  /** 用户手动拖拽过的列，applyAutoFit 不覆盖 */
  const _userResizedCols = ref<Set<string>>(new Set())
  /** 拖拽刚结束时为 true，抑制后续 click 误触排序/筛选（150ms 后重置） */
  const _resizeJustEnded = ref(false)

  function onResizeMove(e: MouseEvent) {
    if (!resizing.value) return
    const diff = e.clientX - resizing.value.startX
    const col = visibleColumns.value.find((c) => c.key === resizing.value!.colKey)
    // 复用 applyAutoFit 同一套动态底线
    const floor = col ? Math.max(headerMinW(col), GLOBAL_MIN_COL_W) : GLOBAL_MIN_COL_W
    const target = Math.max(floor, resizing.value.startW + diff)
    const delta = (columnWidths.value[resizing.value.colKey] ?? target) - target // 收窄为正
    columnWidths.value[resizing.value.colKey] = target
    // ★ 防浏览器摊还：table-layout:auto + width:100% 下，写入总宽小于容器宽时，
    //   浏览器会把差额等比摊回各列填满容器 —— 拖窄被弹回、底线上下不齐（「拖拽不利索」根源）。
    //   对策：收窄量 δ 按其余列宽占比分摊出去，写入总宽与拖前恒等，浏览器无差可还。
    //   仅在表格当前无横向滚动时启用；溢出态浏览器尊重写入宽自然溢出，本就 1:1。
    //   δ ≤ 0（拖宽）不介入：富余态浏览器只会整体放大，拖拽列仍跟手。
    if (delta <= 0) return
    const scroller = tableWrapRef.value?.querySelector('.table-scroll') as HTMLElement | null
    if (!scroller || scroller.scrollWidth > scroller.clientWidth + 1) return
    const others = visibleColumns.value.filter((c) => c.key !== resizing.value!.colKey)
    if (others.length === 0) return
    const baseW = others.map((c) => columnWidths.value[c.key] ?? Math.max(headerMinW(c), GLOBAL_MIN_COL_W))
    const total = baseW.reduce((s, w) => s + w, 0)
    let remain = delta
    others.forEach((c, i) => {
      // 最后一列兜剩余量，消掉按占比取整的误差
      const give = i === others.length - 1 ? remain : Math.min(remain, Math.floor((delta * baseW[i]) / total))
      if (give > 0) columnWidths.value[c.key] = baseW[i] + give
      remain -= give
    })
  }

  function onResizeEnd() {
    if (resizing.value) {
      _userResizedCols.value.add(resizing.value.colKey)
      // userResizedCols 在 mouseup 才更新，但 columnWidths 已在 mousemove 中稳定，
      // watch 不会自动触发；通过浅拷贝 columnWidths 强制触发一次持久化写入
      columnWidths.value = { ...columnWidths.value }
    }
    document.removeEventListener('mousemove', onResizeMove)
    document.removeEventListener('mouseup', onResizeEnd)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    resizing.value = null
    // 抑制紧随的 click 事件误触排序/筛选（mouseup → click 在同帧触发）
    _resizeJustEnded.value = true
    setTimeout(() => {
      _resizeJustEnded.value = false
    }, _RESIZE_CLICK_GUARD_MS)
  }

  function startResize(col: Column, e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.target as HTMLElement).closest('th')
    if (!th) return
    resizing.value = {
      colKey: col.key,
      startX: e.clientX,
      startW: th.getBoundingClientRect().width,
    }
    document.addEventListener('mousemove', onResizeMove)
    document.addEventListener('mouseup', onResizeEnd)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  // --- 固定列偏移 ---
  const fixedLeftOffsets = computed(() => {
    const map: Record<string, number> = {}
    let offset = props.selectable ? 40 : 0
    for (const col of displayColumns.value) {
      if (isColumnFixed(col) === 'left') {
        map[col.key] = offset
        // 与模板 th 宽度公式保持一致（有值 ≥30，无值回退表头最小宽），避免 autoFit=false 时固定列错位
        offset += Math.max(columnWidths.value[col.key] || Math.max(headerMinW(col), GLOBAL_MIN_COL_W), 30)
      }
    }
    return map
  })

  const fixedRightOffsets = computed(() => {
    const map: Record<string, number> = {}
    // 操作列固定在右侧边缘，右侧固定列需让出操作列宽度（与模板 ×zoomX 一致）
    let offset = actionsWidth?.value ?? 0
    const reversed = [...displayColumns.value].reverse()
    for (const col of reversed) {
      if (isColumnFixed(col) === 'right') {
        map[col.key] = offset
        offset += Math.max(columnWidths.value[col.key] || Math.max(headerMinW(col), GLOBAL_MIN_COL_W), 30)
      }
    }
    return map
  })

  // --- autoFit 智能列宽压缩 ---
  /** 表头文字宽度缓存：measureDomTextWidth 内部强制 reflow（写样式+读 getBoundingClientRect），
      每列每次渲染重复测量 = N 列 × 强制布局；按文本缓存后同文本只测一次 */
  const _headerTextWCached = new Map<string, number>()
  /** 表头最小宽度 = DOM 实测文字宽度 + 图标 + 间距 */
  function headerMinW(col: Column): number {
    const text = col.title || col.label || col.key
    let textW = _headerTextWCached.get(text)
    if (textW === undefined) {
      textW = measureDomTextWidth(text, 14, 600)
      _headerTextWCached.set(text, textW)
    }
    let w = textW
    if (col.sortable !== false || col.filterable !== false) w += ICON_GAP
    if (col.sortable !== false) w += SORT_ARROW_W
    if (col.filterable !== false) w += FILTER_GAP + FILTER_ICON_W
    return Math.ceil(w + 21) // TH padding 10px×2 + flex 子像素舍入 1px
  }

  // ── applyAutoFit 冷却：多 watch 并发触发时只执行最后一次 ──
  // BEFORE: watch(visibleColumns)+watch(displayData)+DataTable watch 各自独立触发 applyAutoFit，
  //         数据加载阶段可能 3-5 次连续重算列宽，导致表格左右抖动。
  // AFTER: 300ms 冷却窗口内多次调用只保留最后一次，大幅减少列宽重算次数。
  let _autoFitTimer: ReturnType<typeof setTimeout> | null = null
  /** 冷却窗口：一帧约 16ms，300ms 足够覆盖"一次数据加载里连发的 3~5 个 watch"；
   *  再长会让拖窗口后的列宽跟随变钝。未实测比较过取值，改前先想清楚这两端。 */
  const _AUTOFIT_COOLDOWN_MS = 300

  function applyAutoFit() {
    if (!props.autoFit) return

    // ★ 冷却机制：窗口内重复调用只重置计时器，实际执行最后一次。
    //
    // #508：两条分支**必须都**把 `_autoFitTimer` 归零。旧写法里合并分支直接
    // `setTimeout(applyAutoFitCore, 300)` —— 计时器触发后 id 留在变量里（永远是真值），
    // 于是"同帧并发合并"只要发生过一次，此后每次调用都走合并分支、**永久延后 300ms**，
    // 上面注释那句"首调用走 setTimeout(0)"变成不可达代码。用户可见症状：窗口缩放 /
    // 数据加载后列宽总慢半拍；连续触发时冷却窗口也就永远关不上。
    // 现在统一成"先算该等多久 → 清掉旧计时器 → 排一个新的（触发时归零再跑）"。
    const waitMs = _autoFitTimer ? _AUTOFIT_COOLDOWN_MS : 0
    if (_autoFitTimer) clearTimeout(_autoFitTimer)
    _autoFitTimer = setTimeout(() => {
      _autoFitTimer = null
      applyAutoFitCore()
    }, waitMs) // 首调用 waitMs=0 也走 setTimeout，收集同帧内的并发触发
  }

  /** applyAutoFit 实际计算逻辑（原 applyAutoFit 函数体，未改动） */
  function applyAutoFitCore() {
    const container = tableWrapRef.value
    if (!container) return

    // 容器可视宽 - 表格边框开销 - padding
    const containerW = container.getBoundingClientRect().width - 2
    const cols = visibleColumns.value
    if (cols.length === 0) return

    // 扣掉元素边框/间距 + 复选框列宽
    const selectW = props.selectable ? 40 : 0
    const actionsW = actionsWidth?.value ?? 0
    const borderOverhead = (props.bordered ? cols.length + 4 : 0) + 8
    const usableW = containerW - borderOverhead - selectW - actionsW

    const minW = GLOBAL_MIN_COL_W
    const sampleN = 60
    const sample = displayData.value.slice(0, sampleN)

    // 1. 计算每列理想宽 + 平均内容宽（用于压缩保底）；allImage 标记纯图列（不参与剩余宽摊派）
    const measured = cols.map((col) => {
      const hW = headerMinW(col)
      const m = measureColumnWidth(col, sample, props.imageDomains)
      return { ideal: Math.ceil(Math.max(hW, m.maxW + 20, GLOBAL_MIN_COL_W)), allImage: m.allImage }
    })
    const ideal: number[] = measured.map((m) => m.ideal)

    const hMins = cols.map((col) => headerMinW(col))
    const totalHMin = hMins.reduce((s, w) => s + w, 0)
    const totalIdeal = ideal.reduce((s, w) => s + w, 0)

    // 保存用户手动拖拽过的列宽，autoFit 不覆盖
    const _savedUserWidths: Record<string, number> = {}
    for (const key of _userResizedCols.value) {
      if (columnWidths.value[key]) _savedUserWidths[key] = columnWidths.value[key]
    }

    // 将 final 宽度写入 columnWidths，缩放至恰好填满容器（不低于表头最小宽）
    const applyFinal = (final: number[]) => {
      const sum = final.reduce((s, w) => s + w, 0)
      if (sum > 0 && Math.abs(sum - usableW) > 1) {
        const ratio = usableW / sum
        // 等比缩放但保底：不低于 headerMinW
        for (let i = 0; i < final.length; i++) {
          final[i] = Math.round(Math.max(hMins[i], final[i] * ratio))
        }
        // 纠正四舍五入误差
        let diff = usableW - final.reduce((s, w) => s + w, 0)
        for (let i = 0; diff !== 0 && i < final.length; i++) {
          const adj = diff > 0 ? 1 : -1
          final[i] += adj
          diff -= adj
        }
      }
      const map: Record<string, number> = {}
      cols.forEach((col, i) => {
        map[col.key] = final[i]
      })
      columnWidths.value = map
    }

    // 容器装不下所有列的最小宽 → 不压缩，保持最小宽自然溢出滚动
    if (totalHMin > usableW) {
      columnWidths.value = {}
      for (let i = 0; i < cols.length; i++) {
        columnWidths.value[cols[i].key] = hMins[i]
      }
    }
    // 不溢出：多余空间按 ideal 占比分配，视觉均匀不集中。
    // 纯图列不参与摊派（权重 0，钉在内容宽）——缩略图列被摊平会大片留白，富余让给文字列；
    // 全部都是纯图列时回退按 ideal 占比（总得有列吸收富余）
    else if (totalIdeal <= usableW) {
      const extra = usableW - totalIdeal
      const map: Record<string, number> = {}
      if (extra > 0) {
        const weights = ideal.map((w, i) => (measured[i].allImage ? 0 : w))
        const weightSum = weights.reduce((s, w) => s + w, 0)
        const denom = weightSum > 0 ? weightSum : totalIdeal
        cols.forEach((col, i) => {
          map[col.key] = Math.round(ideal[i] + extra * (weights[i] / denom))
        })
        // 纠正四舍五入误差
        let diff = usableW - Object.values(map).reduce((s: number, w: number) => s + w, 0)
        for (const col of cols) {
          if (diff === 0) break
          const adj = diff > 0 ? 1 : -1
          map[col.key] += adj
          diff -= adj
        }
      } else {
        cols.forEach((col, i) => {
          map[col.key] = ideal[i]
        })
      }
      columnWidths.value = map
    }
    // 溢出 → 瀑布流递增压缩（先压最宽列，逐步扩展压缩组）
    else {
      const final = [...ideal]
      let remaining = totalIdeal - usableW

      // 按理想宽降序排列可压缩列；floor 保底含平均内容宽，防止单元格内容截断
      const sorted = cols
        .map((_col, i) => ({ idx: i, ideal: ideal[i], hMin: hMins[i] }))
        .filter((c) => c.ideal > c.hMin)
        .sort((a, b) => b.ideal - a.ideal)
      // 每列压缩保底：hMin / ideal·40%比例 / 硬下限 — 不依赖 avgW，避免高方差失真
      const colFloor = (c: (typeof sorted)[number]) => Math.max(c.hMin, Math.ceil(c.ideal * 0.4), minW)

      // 贪心压缩：按 ideal 降序逐列扛溢出，扛到保底线才轮下一列 — 窄列优先保护
      for (const sc of sorted) {
        if (remaining <= 0) break
        const canGive = final[sc.idx] - colFloor(sc)
        if (canGive >= remaining) {
          final[sc.idx] -= remaining
          break
        }
        final[sc.idx] = colFloor(sc)
        remaining -= canGive
      }

      applyFinal(final)
      // applyFinal 等比缩放可能突破 colFloor 保底线 → 拉回安全线
      for (const sc of sorted) {
        const key = cols[sc.idx].key
        if (columnWidths.value[key] < colFloor(sc)) columnWidths.value[key] = colFloor(sc)
      }
    }

    // 恢复用户手动调整的列宽（最后执行，覆盖 autoFit 计算值）
    for (const [key, w] of Object.entries(_savedUserWidths)) {
      columnWidths.value[key] = w
    }
  }
  watch(visibleColumns, () => {
    nextTick(applyAutoFit)
  })

  // 异步数据到达后 debounce 重算列宽，服务端分页/搜索每次数据变更都触发
  let _dataDebounce: ReturnType<typeof setTimeout> | null = null
  watch(displayData, (data) => {
    if (!data || data.length === 0) return
    if (_dataDebounce) clearTimeout(_dataDebounce)
    _dataDebounce = setTimeout(() => {
      _dataDebounce = null
      requestAnimationFrame(() => requestAnimationFrame(applyAutoFit))
    }, _AUTOFIT_DEBOUNCE_MS)
  })

  // 只在真的有宿主组件时注册卸载清理：单测会直接调用本 composable（不在任何组件里），
  // 无活动实例时 onUnmounted 无效且会刷 warn（每次跑单测 3 条），把真警告淹掉。
  // 没有宿主也就没有卸载，不存在"漏清理"的对象。
  if (getCurrentInstance()) {
    onUnmounted(() => {
      if (_dataDebounce) clearTimeout(_dataDebounce)
      if (_autoFitTimer) clearTimeout(_autoFitTimer)
    })
  }

  // --- 移动端卡片视图 ---
  // 无 window（SSR/预渲染）时按最宽档处理：服务端不该渲染出卡片视图，水合后 resize 监听会纠正
  const _windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : BP_LG)

  const isCardView = computed(() => {
    if (!props.cardBreakpoint || props.cardBreakpoint <= 0) return false
    return _windowWidth.value < props.cardBreakpoint
  })

  function onWindowResizeCard() {
    _windowWidth.value = window.innerWidth
    // 双 RAF 等待浏览器完成 resize 后的布局重算
    nextTick(() => {
      requestAnimationFrame(() => requestAnimationFrame(applyAutoFit))
    })
  }

  // ==================== 列拖拽排序 ====================
  const _columnOrder = ref<string[]>(props.columns.map((c) => c.key))
  // 列顺序变化后，固定区域按「前 N 列 / 后 M 列」语义跟随新顺序重建，
  // 避免固定集合停留在旧列 key 上造成中间空洞/偏移错位
  watch(_columnOrder, (order, oldOrder) => {
    if (!oldOrder || !order || oldOrder.length !== order.length) return
    const oldKeys = oldOrder
    let leftN = 0
    while (leftN < oldKeys.length && dynamicFixedLeft.value.has(oldKeys[leftN])) leftN++
    let rightM = 0
    while (rightM < oldKeys.length && dynamicFixedRight.value.has(oldKeys[oldKeys.length - 1 - rightM])) rightM++
    if (leftN > 0) dynamicFixedLeft.value = new Set(order.slice(0, leftN))
    if (rightM > 0) dynamicFixedRight.value = new Set(order.slice(order.length - rightM))
  })
  const _dragCol = ref<string | null>(null)
  const _dragOverCol = ref<string | null>(null)

  function onColDragStart(e: DragEvent, colKey: string) {
    _dragCol.value = colKey
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', colKey)
    }
  }
  function onColDragOver(e: DragEvent, colKey: string) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    _dragOverCol.value = colKey
  }
  function onColDragLeave(_e: DragEvent, colKey: string) {
    if (_dragOverCol.value === colKey) _dragOverCol.value = null
  }
  function onColDrop(e: DragEvent, targetKey: string) {
    e.preventDefault()
    if (!_dragCol.value || _dragCol.value === targetKey) {
      _dragCol.value = null
      _dragOverCol.value = null
      return
    }
    const keys = [..._columnOrder.value]
    const fromIdx = keys.indexOf(_dragCol.value)
    const toIdx = keys.indexOf(targetKey)
    if (fromIdx >= 0 && toIdx >= 0) {
      keys.splice(fromIdx, 1)
      keys.splice(toIdx, 0, _dragCol.value)
      _columnOrder.value = keys
    }
    _dragCol.value = null
    _dragOverCol.value = null
  }
  function onColDragEnd() {
    _dragCol.value = null
    _dragOverCol.value = null
  }

  // 按拖拽顺序重排可见列
  const displayColumns = computed(() => sortColumnsByOrder(visibleColumns.value, _columnOrder.value))

  return {
    hiddenColumns,
    visibleColumns,
    displayColumns,
    resizing,
    columnWidths,
    startResize,
    onResizeMove,
    onResizeEnd,
    fixedLeftOffsets,
    fixedRightOffsets,
    applyAutoFit,
    isCardView,
    _windowWidth,
    onWindowResizeCard,
    dynamicFixedLeft,
    dynamicFixedRight,
    fixLeftCascade,
    fixRightCascade,
    isColumnFixed,
    autoFitColumn,
    _userResizedCols,
    _resizeJustEnded,
    headerMinW,
    // 列拖拽
    _columnOrder,
    _dragCol,
    _dragOverCol,
    onColDragStart,
    onColDragOver,
    onColDragLeave,
    onColDrop,
    onColDragEnd,
  }
}
