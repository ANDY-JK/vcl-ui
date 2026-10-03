<script setup lang="ts">
// 分页脚注 — 从 DataTable.vue 区块化抽出（§18-②）
// 行为约定：分页状态经 injectDataTableContext 注入（与主文件同一引用）；
// 样式自 data-table-scoped.css 迁入本组件 scoped（根节点仍带主文件 scope id，外部布局规则不受影响）。
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import { injectDataTableContext } from './composables/context'

defineProps<{
  /** 全屏态不渲染分页（主文件传入 _isFullscreen） */
  fullscreen: boolean
  pageSize: number
  totalPages: number
  selectable: boolean
}>()

const t = useT()

const { selectedKeys: _selectedKeys, currentPage: _currentPage, displayPages, setPage } = injectDataTableContext()
</script>

<template>
  <!-- ========== 分页控件 ========== -->
  <div v-if="!fullscreen && pageSize > 0 && totalPages > 1" class="table-pagination">
    <span class="pagination-status">
      <template v-if="selectable && _selectedKeys.length > 0"
        >{{ t('table.selected') }} <strong>{{ _selectedKeys.length }}</strong> {{ t('table.rows') }} - </template
      >{{ t('table.pageInfo', { current: _currentPage, total: totalPages }) }}
    </span>
    <button
      class="page-btn"
      :disabled="_currentPage <= 1"
      :aria-label="t('table.prevPage')"
      @click="setPage(_currentPage - 1)"
    >
      <IconSvg type="chevron-left" size="sm" />
    </button>
    <template v-for="p in displayPages" :key="p">
      <button v-if="p !== '...'" class="page-btn" :class="{ active: p === _currentPage }" @click="setPage(p as number)">
        {{ p }}
      </button>
      <span v-else class="page-ellipsis">...</span>
    </template>
    <button
      class="page-btn"
      :disabled="_currentPage >= totalPages"
      :aria-label="t('table.nextPage')"
      @click="setPage(_currentPage + 1)"
    >
      <IconSvg type="chevron-right" size="sm" />
    </button>
  </div>
</template>

<!-- 自 data-table-scoped.css 迁入（分页区块专用；.table-wrap.auto-height/.fullscreen 下
     的 flex-shrink 规则仍留在主文件——它们以子组件根节点为目标且匹配其父 scope id） -->
<style src="./data-table-pagination-scoped.css" scoped></style>
