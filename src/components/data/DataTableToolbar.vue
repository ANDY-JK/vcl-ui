<script setup lang="ts">
// 工具栏（行数统计 / 筛选 chip 行 / 清除按钮 / 搜索密度缩放导出全屏截图视图列设置等按钮排 / 滚动进度条）
// — 从 DataTable.vue 区块化抽出（§18-②，含原第 5 优先级「筛选 chip 行」）。
// 行为约定：共享状态经 injectDataTableContext 注入（与主文件同一引用）；
// toolbar-actions 插槽由主文件转发，外部插槽 API 不变。
import { nextTick, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import { colTitle } from './composables/utils'
import { injectDataTableContext } from './composables/context'
import type { Column } from './composables/types'

defineProps<{
  columns: Column[]
  exportable: boolean
  excelExportable: boolean
  /** 列设置按钮开关（主文件 prop 透传） */
  colSettings: boolean
  selectable: boolean
  maxHeight: string
  autoHeight: boolean
  /** 编辑模式：为 true 时工具栏显示撤销/重做按钮（可发现性 + 触屏可用，等价 Ctrl+Z / Ctrl+Y） */
  editable: boolean
}>()

const t = useT()

const {
  activeFilters,
  sortState,
  globalSearch,
  showGlobalSearch,
  removeFilter,
  clearPersisted,
  clearAllFilters,
  clearSort,
  dense: _dense,
  zoomX: _zoomX,
  zoomY: _zoomY,
  resetZoom,
  exportCSV,
  exportExcel,
  isFullscreen: _isFullscreen,
  toggleFullscreen,
  captureScreenshot,
  copyTableData,
  isCardViewEffective,
  toggleCardMode,
  canUndo,
  canRedo,
  undoFromToolbar,
  redoFromToolbar,
  displayData,
  displayTotal,
  selectedKeys: _selectedKeys,
  colSettingsPanel,
  batchDialog,
  scrollable: _scrollable,
  scrollProgress: _scrollProgress,
  cardViewHeight: _cardViewHeight,
  onProgressMouseDown,
  pinnedRowPcts: _pinnedRowPcts,
  scrollToPinnedRow,
} = injectDataTableContext()

// 全局搜索输入框焦点目标：输入框在本区块内，模板 ref 归本组件
const globalSearchRef = ref<HTMLInputElement | null>(null)
function toggleGlobalSearch() {
  showGlobalSearch.value = !showGlobalSearch.value
  if (!showGlobalSearch.value) globalSearch.value = ''
  else nextTick(() => globalSearchRef.value?.focus())
}

/** 密度切换（dense 引用归主文件，切换函数归本区块） */
function toggleDense() {
  _dense.value = !_dense.value
}

/** 清除筛选（同时清除持久化） */
function handleClearFilters(): void {
  clearAllFilters()
  clearPersisted('filter')
}
/** 清除排序（同时清除持久化） */
function handleClearSort(): void {
  clearSort()
  clearPersisted('sort')
}
</script>

<template>
  <!-- ========== 工具栏 ========== -->
  <div class="table-top-bar">
    <div class="table-toolbar">
      <span class="toolbar-count">
        <template v-if="activeFilters.length > 0 || globalSearch">
          {{ t('table.filteredPrefix') }} <strong>{{ displayData.length }}</strong> /
          {{ t('table.totalRows', { n: displayTotal }) }}
        </template>
        <template v-else> {{ t('table.totalRows', { n: displayTotal }) }} </template>
      </span>
      <template v-if="activeFilters.length > 0">
        <span v-for="[key, s] in activeFilters" :key="key" class="filter-chip">
          <!-- 列可能已被移除但持久化筛选残留：找不到列时回退显示 key，避免非空断言崩溃 -->
          {{ colTitle(columns.find((c) => c.key === key)) || key }}
          <span class="filter-chip-count">({{ s.selectedValues.length }})</span>
          <IconSvg
            type="x"
            size="sm"
            class="filter-chip-close"
            :aria-label="t('table.removeFilter', { name: colTitle(columns.find((c) => c.key === key)) || key })"
            @click="removeFilter(key)"
          />
        </span>
      </template>
      <!-- 清除操作居中 -->
      <div class="toolbar-center">
        <button v-if="activeFilters.length > 0" type="button" class="toolbar-clear" @click="handleClearFilters">
          {{ t('table.clearFilters') }}
        </button>
        <button v-if="sortState.key" type="button" class="toolbar-clear" @click="handleClearSort">
          {{ t('table.clearSort') }}
        </button>
      </div>
      <!-- 功能按钮靠右 -->
      <div class="toolbar-right">
        <!-- 编辑撤销/重做（仅编辑模式；键盘等价 Ctrl+Z / Ctrl+Y，按钮给触屏与可发现性） -->
        <template v-if="editable">
          <button
            type="button"
            class="toolbar-export-btn"
            :title="t('table.undo')"
            :disabled="!canUndo"
            @click="undoFromToolbar()"
          >
            <IconSvg type="undo-2" size="sm" />
          </button>
          <button
            type="button"
            class="toolbar-export-btn"
            :title="t('table.redo')"
            :disabled="!canRedo"
            @click="redoFromToolbar()"
          >
            <IconSvg type="redo-2" size="sm" />
          </button>
        </template>
        <!-- 全局搜索 -->
        <div class="global-search-wrap" :class="{ active: showGlobalSearch }">
          <input
            v-if="showGlobalSearch"
            ref="globalSearchRef"
            v-model="globalSearch"
            type="text"
            class="global-search-input"
            :placeholder="t('table.searchAllCols')"
            @keydown.escape="toggleGlobalSearch"
          />
          <button
            type="button"
            class="global-search-toggle"
            :title="showGlobalSearch ? t('table.closeSearch') : t('table.globalSearch')"
            @click="toggleGlobalSearch"
          >
            <IconSvg :type="showGlobalSearch ? 'x' : 'search'" size="sm" />
          </button>
        </div>
        <!-- 密度切换 -->
        <button
          v-if="!isCardViewEffective"
          type="button"
          class="toolbar-export-btn"
          :title="_dense ? t('table.defaultDensity') : t('table.compactMode')"
          @click="toggleDense"
        >
          <IconSvg :type="_dense ? 'chevron-up' : 'list'" size="sm" />
        </button>
        <!-- 缩放指示器 -->
        <button
          type="button"
          class="toolbar-export-btn toolbar-zoom-btn"
          :title="_zoomX !== 1 || _zoomY !== 1 ? t('table.zoomResetHint') : t('table.zoomHint')"
          @click="resetZoom"
        >
          {{ Math.round(_zoomY * 100) }}%
        </button>
        <!-- CSV 导出 -->
        <button
          v-if="exportable"
          type="button"
          class="toolbar-export-btn"
          :title="t('table.downloadCsv')"
          @click="exportCSV"
        >
          <IconSvg type="download" size="sm" />
        </button>
        <!-- Excel 导出 -->
        <button
          v-if="excelExportable"
          type="button"
          class="toolbar-export-btn"
          :title="t('table.downloadExcel')"
          @click="exportExcel"
        >
          <IconSvg type="file-spreadsheet" size="sm" />
        </button>
        <!-- 全屏 -->
        <button
          type="button"
          class="toolbar-export-btn"
          :title="_isFullscreen ? t('table.exitFullscreen') : t('table.fullscreenShow')"
          @click="toggleFullscreen"
        >
          <IconSvg
            :type="_isFullscreen ? 'full-screen-square-linear' : 'full-screen-linear'"
            provider="solar"
            size="sm"
          />
        </button>
        <!-- 截图 -->
        <button
          type="button"
          class="toolbar-export-btn"
          :title="t('table.screenshotExport')"
          @click="captureScreenshot"
        >
          <IconSvg type="camera" size="sm" />
        </button>
        <!-- 复制 -->
        <button type="button" class="toolbar-export-btn" :title="t('table.copyTableData')" @click="copyTableData">
          <IconSvg type="copy" size="sm" />
        </button>
        <!-- 视图切换 -->
        <button
          type="button"
          class="toolbar-export-btn"
          :title="isCardViewEffective ? t('table.switchToList') : t('table.switchToCard')"
          @click="toggleCardMode"
        >
          <IconSvg :type="isCardViewEffective ? 'table' : 'layout-grid'" size="sm" />
        </button>
        <!-- 列设置 -->
        <button
          v-if="colSettings"
          type="button"
          class="toolbar-export-btn col-settings-btn"
          :class="{ active: colSettingsPanel?.show }"
          :title="t('table.colSettings')"
          @click.stop="colSettingsPanel?.toggle($event)"
        >
          <IconSvg type="settings" size="sm" />
        </button>
        <!-- 批量修改 -->
        <button
          v-if="selectable && _selectedKeys.length > 0"
          type="button"
          class="toolbar-clear"
          @click="batchDialog?.open()"
        >
          {{ t('table.batchEdit', { n: _selectedKeys.length }) }}
        </button>
        <!-- 自定义工具栏按钮（使用方扩展：刷新/导入等） -->
        <!-- @slot toolbar-actions: 工具栏右侧自定义操作区（使用方扩展：刷新/导入等） -->
        <slot name="toolbar-actions" />
      </div>
    </div>

    <!-- 滚动进度条：有高度约束 + 实际溢出时自动显示，无溢出则隐藏 -->
    <div
      v-if="_scrollable && (maxHeight || autoHeight || (isCardViewEffective && _cardViewHeight))"
      class="table-progress-track"
      @mousedown="onProgressMouseDown"
    >
      <div class="table-progress" :style="{ width: _scrollProgress + '%' }" />
      <!-- 固定行锚点（支持多处标记） -->
      <div
        v-for="anchor in _pinnedRowPcts"
        :key="anchor.key"
        class="table-progress-anchor"
        :style="{ left: anchor.pct + '%' }"
        :title="t('table.jumpToPinned')"
        @mousedown.stop
        @click.stop="scrollToPinnedRow(anchor.key)"
      />
    </div>
  </div>
</template>

<style scoped src="./composables/data-table-toolbar.css"></style>
