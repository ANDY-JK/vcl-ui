<script setup lang="ts">
// 分页脚注 — 从 DataTable.vue 区块化抽出（§18-②）
//
// ⚠️ 第 140 轮：本文件是"手写副本"，长期缺了 nav/Pagination.vue 已有的四样东西 ——
//    <nav> 地标 + aria-label、type="button"、aria-current="page"、省略号 aria-hidden。
//    其中 type="button" 不只是无障碍问题：<button type="button"> 默认 type 是 submit，
//    宿主把 <DataTable> 放进自己的 <form>（后台 CRUD 常见写法）时，点一下页码就提交了表单。
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
  <nav
    v-if="!fullscreen && pageSize > 0 && totalPages > 1"
    class="table-pagination"
    :aria-label="t('pagination.navLabel')"
  >
    <span class="pagination-status">
      <template v-if="selectable && _selectedKeys.length > 0"
        >{{ t('table.selected') }} <strong>{{ _selectedKeys.length }}</strong> {{ t('table.rows') }} - </template
      >{{ t('table.pageInfo', { current: _currentPage, total: totalPages }) }}
    </span>
    <button
      type="button"
      class="page-btn"
      :disabled="_currentPage <= 1"
      :aria-label="t('table.prevPage')"
      @click="setPage(_currentPage - 1)"
    >
      <IconSvg type="chevron-left" size="sm" />
    </button>
    <template v-for="p in displayPages" :key="p">
      <button
        v-if="p !== '...'"
        type="button"
        class="page-btn"
        :class="{ active: p === _currentPage }"
        :aria-current="p === _currentPage ? 'page' : undefined"
        @click="setPage(p as number)"
      >
        {{ p }}
      </button>
      <!-- 省略号是纯装饰：读屏不该把它念成一个页码 -->
      <span v-else class="page-ellipsis" aria-hidden="true">...</span>
    </template>
    <button
      type="button"
      class="page-btn"
      :disabled="_currentPage >= totalPages"
      :aria-label="t('table.nextPage')"
      @click="setPage(_currentPage + 1)"
    >
      <IconSvg type="chevron-right" size="sm" />
    </button>
  </nav>
</template>

<!-- 自 data-table-scoped.css 迁入（分页区块专用；.table-wrap.auto-height/.fullscreen 下
     的 flex-shrink 规则仍留在主文件——它们以子组件根节点为目标且匹配其父 scope id） -->
<style src="./data-table-pagination-scoped.css" scoped></style>
