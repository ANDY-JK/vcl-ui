<script setup lang="ts">
// 列设置弹层（列显隐 / 顺序 / 宽度 / 固定面板）— 从 DataTable.vue 区块化抽出（§18-②）
// 行为约定：共享列状态经 injectDataTableContext 注入（与主文件同一引用）；
// 面板显隐与定位由本组件持有，主文件经 defineExpose 的 show/toggle/close/unfixFromMenu 驱动。
// ⛔ 保护语义（z-index var(--z-top)、动画时序、禁 clamp）在 data-table-global.css，原样保留。
import { computed, nextTick, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { computeFloatingPosition } from '@/components/_internal/useFloating'
import { markLayerOpen, matchPinyin, colTitle, sortColumnsByOrder } from './composables/utils'
import { injectDataTableContext } from './composables/context'
import type { Column } from './composables/types'

const props = defineProps<{ columns: Column[] }>()

const t = useT()

const {
  hiddenColumns,
  columnWidths,
  columnOrder: _columnOrder,
  userResizedCols: _userResizedCols,
  dynamicFixedLeft,
  dynamicFixedRight,
  visibleColumns,
  isColumnFixed,
  fixLeftCascade,
  fixRightCascade,
  headerMinW,
  clearPersisted: _clearPersisted,
  applyAutoFit,
  notify,
  closeFilter,
} = injectDataTableContext()

const _colSettingsShow = ref(false)
const _colSettingsAbove = ref(false)
const _colSettingsStyle = ref<Record<string, string>>({})
const colSettingsRef = ref<HTMLElement | null>(null)
const _colSettingsWidth = 380
/** 面板列列表：全部列（含隐藏列），按当前拖拽顺序 */
const _settingsColumns = computed(() => sortColumnsByOrder(props.columns, _columnOrder.value))
/** 列名搜索关键词 */
const colKeyword = ref('')
/** 过滤后的列列表（保留全量索引，固定/顺序判断不受过滤影响） */
const _filteredSettingsColumns = computed(() => {
  const kw = colKeyword.value.trim().toLowerCase()
  return _settingsColumns.value
    .map((col, i) => ({ col, i }))
    .filter(({ col }) => {
      if (!kw) return true
      const title = colTitle(col)
      return title.toLowerCase().includes(kw) || matchPinyin(title, kw)
    })
})
function toggleColSettings(e?: MouseEvent) {
  _colSettingsShow.value = !_colSettingsShow.value
  if (!_colSettingsShow.value) return
  markLayerOpen()
  closeFilter()
  const btn = (e?.currentTarget as HTMLElement | null) ?? null
  const rect = btn?.getBoundingClientRect()
  if (!rect) {
    _colSettingsStyle.value = { top: '56px', right: '16px' }
    return
  }
  // 用通用算法预估方向和位置
  const result = computeFloatingPosition({
    rect,
    floatingW: _colSettingsWidth,
    floatingH: 300,
    offset: 4,
    defaultDirection: 'down',
  })
  _colSettingsAbove.value = result.direction === 'up'
  _colSettingsStyle.value =
    result.direction === 'up'
      ? { bottom: `${window.innerHeight - rect.top + 4}px`, left: `${result.left}px` }
      : { top: `${rect.bottom + 4}px`, left: `${result.left}px` }
  // 渲染后按实际高度修正方向
  nextTick(() => {
    const el = colSettingsRef.value
    if (!el) return
    const h = el.offsetHeight
    const fitsBelow = rect.bottom + 4 + h <= window.innerHeight - 8
    const spaceAbove = rect.top - 8
    const spaceBelow = window.innerHeight - rect.bottom
    if (!fitsBelow && spaceAbove > spaceBelow) {
      _colSettingsAbove.value = true
      _colSettingsStyle.value = { bottom: `${window.innerHeight - rect.top + 4}px`, left: `${result.left}px` }
    }
  })
}
function closeColSettings() {
  _colSettingsShow.value = false
}
function toggleColVisible(colKey: string) {
  if (hiddenColumns.value.has(colKey)) {
    hiddenColumns.value.delete(colKey)
  } else {
    const visibleCount = props.columns.length - hiddenColumns.value.size
    if (visibleCount <= 1) return // 至少保留一列
    hiddenColumns.value.add(colKey)
  }
  hiddenColumns.value = new Set(hiddenColumns.value)
}
/** 全部显示 / 全部隐藏（保留第一列 — 按当前排序后的第一列，与表格实际显示顺序一致） */
function toggleAllColsVisible(show: boolean) {
  if (show) {
    hiddenColumns.value = new Set()
  } else {
    hiddenColumns.value = new Set(_settingsColumns.value.map((c) => c.key).slice(1))
  }
}
/** 当前是否全部列可见（驱动「全部隐藏/全部显示」切换按钮文案） */
const allColumnsVisible = computed(() => hiddenColumns.value.size === 0)
/** 是否已存在手动调整的列宽（驱动「重置列宽」按钮亮起/置灰） */
const _userResizeTick = ref(0)
watch(columnWidths, () => {
  _userResizeTick.value++
})
const hasManualWidths = computed(() => {
  void _userResizeTick.value
  return _userResizedCols.value.size > 0
})
/** 重置列宽：清除手动调整的列宽与持久化存储，恢复 autoFit 自动列宽 */
function resetColumnWidths() {
  _userResizedCols.value.clear()
  columnWidths.value = {}
  _clearPersisted('colwidth')
  applyAutoFit()
  notify(t('table.colWidthReset'))
}
function moveCol(colKey: string, dir: -1 | 1) {
  const keys = [..._columnOrder.value]
  const idx = keys.indexOf(colKey)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= keys.length) return
  keys.splice(idx, 1)
  keys.splice(target, 0, colKey)
  _columnOrder.value = keys
}
/** 面板列宽显示（与表头渲染一致的回退） */
function colWidthPx(col: Column): number {
  return Math.round(columnWidths.value[col.key] || Math.max(headerMinW(col), 60))
}
/** 面板列宽微调（步进 10px，下限表头最小宽），写入 columnWidths 自动持久化 */
function adjustColWidth(colKey: string, delta: number) {
  const col = props.columns.find((c) => c.key === colKey)
  const minW = col ? Math.max(headerMinW(col), 30) : 30
  const cur = columnWidths.value[colKey] || minW
  columnWidths.value = { ...columnWidths.value, [colKey]: Math.max(minW, Math.round(cur + delta)) }
  _userResizedCols.value.add(colKey)
}
/** 当前左侧连续固定列数（与右键菜单/表头右键状态同步） */
const _leftFixedCount = computed(() => {
  const keys = _settingsColumns.value.map((c) => c.key)
  let n = 0
  while (n < keys.length && dynamicFixedLeft.value.has(keys[n])) n++
  return n
})
/** 当前右侧连续固定列数 */
const _rightFixedCount = computed(() => {
  const keys = _settingsColumns.value.map((c) => c.key)
  let n = 0
  while (n < keys.length && dynamicFixedRight.value.has(keys[keys.length - 1 - n])) n++
  return n
})
/** 设置固定前 N 列（0 = 不固定） */
function setLeftFixedCount(n: number) {
  const keys = _settingsColumns.value.map((c) => c.key)
  dynamicFixedLeft.value = new Set(n > 0 ? keys.slice(0, n) : [])
}
/** 设置固定后 N 列（0 = 不固定） */
function setRightFixedCount(n: number) {
  const keys = _settingsColumns.value.map((c) => c.key)
  dynamicFixedRight.value = new Set(n > 0 ? keys.slice(keys.length - n) : [])
}
/** 每列固定按钮：左 = 该列及左侧所有列；右 = 该列及右侧所有列；无 = 从该列断开区域（保留外侧） */
function setColFixed(col: Column, pos: 'left' | 'right' | null) {
  if (pos === 'left') fixLeftCascade(col.key)
  else if (pos === 'right') fixRightCascade(col.key)
  else {
    const keys = _settingsColumns.value.map((c) => c.key)
    const idx = keys.indexOf(col.key)
    if (idx < 0) return
    const l = new Set(dynamicFixedLeft.value)
    const r = new Set(dynamicFixedRight.value)
    if (l.has(col.key)) {
      // 左侧区域从该列断开：取消该列及其右侧的左侧固定
      for (const k of keys.slice(idx)) l.delete(k)
    }
    if (r.has(col.key)) {
      // 右侧区域从该列断开：取消该列及其左侧的右侧固定
      for (const k of keys.slice(0, idx + 1)) r.delete(k)
    }
    dynamicFixedLeft.value = l
    dynamicFixedRight.value = r
  }
}
/** 固定快捷操作：全部固定左 / 全部固定右 / 取消全部固定 */
function setAllFixed(side: 'left' | 'right' | null) {
  const keys = _settingsColumns.value.map((c) => c.key)
  if (side === 'left') {
    dynamicFixedLeft.value = new Set(keys)
    dynamicFixedRight.value = new Set()
  } else if (side === 'right') {
    dynamicFixedRight.value = new Set(keys)
    dynamicFixedLeft.value = new Set()
  } else {
    dynamicFixedLeft.value = new Set()
    dynamicFixedRight.value = new Set()
  }
}
/** 全部固定左/右：当前所有列已动态固定到该侧时激活（驱动切换按钮） */
const allFixedLeft = computed(() => {
  const keys = visibleColumns.value.map((c) => c.key)
  return keys.length > 0 && keys.every((k) => dynamicFixedLeft.value.has(k))
})
const allFixedRight = computed(() => {
  const keys = visibleColumns.value.map((c) => c.key)
  return keys.length > 0 && keys.every((k) => dynamicFixedRight.value.has(k))
})
/** 是否没有任何动态固定（驱动「取消固定」置灰；静态 fixed 由 props 决定，不受本按钮影响） */
const nothingFixed = computed(() => dynamicFixedLeft.value.size === 0 && dynamicFixedRight.value.size === 0)
/** 固定开关：激活时再点取消，未激活时全部固定到该侧 */
function toggleAllFixed(side: 'left' | 'right') {
  const active = side === 'left' ? allFixedLeft.value : allFixedRight.value
  setAllFixed(active ? null : side)
}
/** 列头右键「取消固定」：从该列断开区域（保留外侧固定） */
function onUnfixFromMenu(colKey: string) {
  const keys = _settingsColumns.value.map((c) => c.key)
  const idx = keys.indexOf(colKey)
  if (idx < 0) return
  if (dynamicFixedLeft.value.has(colKey)) setLeftFixedCount(Math.max(0, idx))
  if (dynamicFixedRight.value.has(colKey)) setRightFixedCount(Math.max(0, keys.length - 1 - idx))
}
/** 面板固定区域摘要：固定前 N 列 / 固定后 M 列 */
const _fixedSummary = computed(() => {
  const parts: string[] = []
  if (_leftFixedCount.value > 0) parts.push(t('table.fixedLeftCount', { n: _leftFixedCount.value }))
  if (_rightFixedCount.value > 0) parts.push(t('table.fixedRightCount', { n: _rightFixedCount.value }))
  return parts.length ? parts.join(t('table.fixedJoin')) : ''
})

defineExpose({
  /** 面板显隐（主文件读：工具栏按钮 active 态 / 外点关闭判断） */
  show: _colSettingsShow,
  /** 工具栏列设置按钮点击（含定位计算） */
  toggle: toggleColSettings,
  /** 主文件外点/Esc/滚动关闭路径 */
  close: closeColSettings,
  /** 列头右键「取消固定」入口 */
  unfixFromMenu: onUnfixFromMenu,
})
</script>

<template>
  <!-- ========== 列设置面板（显隐 / 顺序 / 固定） ========== -->
  <Teleport to="body">
    <div
      v-if="_colSettingsShow"
      ref="colSettingsRef"
      class="dt-col-settings"
      :class="{ 'dt-dropdown-above': _colSettingsAbove }"
      :style="_colSettingsStyle"
      @click.stop
    >
      <input v-model="colKeyword" class="dt-col-search" :placeholder="t('table.searchCols')" />
      <div class="dt-col-quick-actions">
        <button
          :title="allColumnsVisible ? t('table.hideAllKeepFirst') : t('table.showAllCols')"
          @click="allColumnsVisible ? toggleAllColsVisible(false) : toggleAllColsVisible(true)"
        >
          {{ allColumnsVisible ? t('table.hideAllCols') : t('table.showAllCols') }}
        </button>
        <button
          class="dt-reset-width-btn"
          :disabled="!hasManualWidths"
          :title="t('table.resetColWidthsHint')"
          @click="resetColumnWidths"
        >
          {{ t('table.resetColWidths') }}
        </button>
        <button
          :class="{ active: allFixedLeft }"
          :title="allFixedLeft ? t('table.unfixAllLeft') : t('table.fixAllLeft')"
          @click="toggleAllFixed('left')"
        >
          {{ t('table.fixAllLeftShort') }}
        </button>
        <button
          :class="{ active: allFixedRight }"
          :title="allFixedRight ? t('table.unfixAllRight') : t('table.fixAllRight')"
          @click="toggleAllFixed('right')"
        >
          {{ t('table.fixAllRightShort') }}
        </button>
        <button :disabled="nothingFixed" :title="t('table.clearAllFixed')" @click="setAllFixed(null)">
          {{ t('table.unfixAll') }}
        </button>
      </div>
      <div class="dt-col-list">
        <div
          v-for="{ col, i } in _filteredSettingsColumns"
          :key="col.key"
          class="dt-col-item"
          :class="{
            hidden: hiddenColumns.has(col.key),
            'in-left-fixed': i < _leftFixedCount,
            'in-right-fixed': i >= _settingsColumns.length - _rightFixedCount,
          }"
        >
          <input
            type="checkbox"
            :checked="!hiddenColumns.has(col.key)"
            :aria-label="t('table.showCol', { name: colTitle(col) })"
            @change="toggleColVisible(col.key)"
          />
          <span class="dt-col-title" :title="colTitle(col)">{{ colTitle(col) }}</span>
          <span class="dt-col-width">
            <button
              :disabled="colWidthPx(col) <= Math.max(headerMinW(col), 30)"
              :title="t('table.narrower')"
              @click="adjustColWidth(col.key, -10)"
            >
              −
            </button>
            <span :title="t('table.colWidthPx', { n: colWidthPx(col) })">{{ colWidthPx(col) }}</span>
            <button :title="t('table.wider')" @click="adjustColWidth(col.key, 10)">+</button>
          </span>
          <span class="dt-col-ops">
            <button :disabled="i === 0" :title="t('table.moveUp')" @click="moveCol(col.key, -1)">↑</button>
            <button
              :disabled="i === _settingsColumns.length - 1"
              :title="t('table.moveDown')"
              @click="moveCol(col.key, 1)"
            >
              ↓
            </button>
            <span class="dt-col-fixed-group" :class="{ disabled: hiddenColumns.has(col.key) }">
              <button
                :class="{ active: !isColumnFixed(col) }"
                :title="t('table.unfixedHint')"
                :disabled="hiddenColumns.has(col.key)"
                @click="setColFixed(col, null)"
              >
                {{ t('common.none') }}
              </button>
              <button
                :class="{ active: isColumnFixed(col) === 'left' }"
                :title="t('table.fixLeftHint')"
                :disabled="hiddenColumns.has(col.key)"
                @click="setColFixed(col, 'left')"
              >
                {{ t('table.leftShort') }}
              </button>
              <button
                :class="{ active: isColumnFixed(col) === 'right' }"
                :title="t('table.fixRightHint')"
                :disabled="hiddenColumns.has(col.key)"
                @click="setColFixed(col, 'right')"
              >
                {{ t('table.rightShort') }}
              </button>
            </span>
          </span>
        </div>
        <div v-if="!_filteredSettingsColumns.length" class="dt-col-no-result">{{ t('table.noMatchCols') }}</div>
      </div>
      <div class="dt-col-footer">
        <span class="dt-col-footer-fixed">{{ t('table.fixedLabel') }}{{ _fixedSummary || t('table.unfixed') }}</span>
        <span class="dt-col-footer-hint">{{ t('table.fixedHint') }}</span>
      </div>
    </div>
  </Teleport>
</template>
