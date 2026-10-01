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
<style scoped>
.table-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--vcl-space-1);
  padding: var(--vcl-space-2) var(--vcl-space-3);
  border-top: 1px solid var(--vcl-color-border-light);
  background: var(--vcl-color-bg);
  border-radius: 0 0 var(--vcl-radius-lg) var(--vcl-radius-lg);
  position: relative;
}

.pagination-status {
  position: absolute;
  left: var(--vcl-space-3);
  font-size: var(--vcl-fs-12);
  color: var(--vcl-color-text-muted);
  white-space: nowrap;
}
.pagination-status strong {
  color: var(--vcl-color-primary-on-surface);
}

.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: calc(28px * var(--vcl-scale));
  height: calc(28px * var(--vcl-scale));
  padding: 0 var(--vcl-space-1);
  font-size: var(--vcl-fs-12);
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-sm);
  background: var(--vcl-color-surface);
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
  transition: all var(--vcl-transition-fast);
}
.page-btn:hover:not(:disabled):not(.active) {
  border-color: var(--vcl-color-primary);
  color: var(--vcl-color-primary-on-surface);
}
.page-btn.active {
  /* 2026-10-01：实心底压白字用 solid 档（primary 压白仅 4.28，solid 5.84 达标），与 Pagination 组件对齐 */
  background: var(--vcl-color-primary-solid);
  border-color: var(--vcl-color-primary-solid);
  color: #fff;
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-btn:focus-visible {
  /* 2026-10-01：键盘可聚焦控件须有可见焦点环（对齐通用按钮 2px 主色 outline，原被 outline:none 吞掉致键盘用户看不到当前位置） */
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 2px;
  z-index: 1;
}

.page-ellipsis {
  width: calc(32px * var(--vcl-scale));
  text-align: center;
  color: var(--vcl-color-text-muted);
}
</style>
