<script setup lang="ts">
// ⛔ 保护 — 分页，禁止：clamp() → px，页码计算逻辑，ellipsis 行为
//    需我确认：pageSize 选项、maxPages 显示数
import { computed, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import { calcTotalPages } from './utils/pagination-utils'

const t = useT()

interface Props {
  /** 受控当前页（v-model:modelValue，1 起）。超出 `[1, totalPages]` 时组件会把页码拉回合法页并 emit 纠正值（典型：搜索/筛选后总数变小、宿主没重置页码） */
  modelValue: number
  /** 总条数 */
  total: number
  /** 每页行数（默认 10） */
  pageSize?: number
  /** 显示页码快速跳转输入框 */
  showQuickJumper?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pageSize: 10,
  showQuickJumper: false,
})

const emit = defineEmits<{
  /** v-model——页码变化 */
  'update:modelValue': [v: number]
}>()

// pageSize<=0 时按 1 处理，避免 Math.ceil(total/0)=Infinity 导致分页循环无限渲染（逻辑在 pagination-utils）
const totalPages = computed(() => calcTotalPages(props.total, props.pageSize))

/**
 * 合法页码：把受控值钳进 `[1, totalPages]`。
 *
 * 为什么需要（第 161 轮实测）：列表做搜索/筛选后 total 会变小，宿主通常不会重置页码，
 * 于是 `modelValue` 停在旧的越界页上。此时原实现会出现三件连锁反应：
 * ① `pages` 窗口以越界值为中心 → 没有任何页码带 active（界面看不出"我在第几页"）；
 * ② "上一页"按钮 `modelValue <= 1` 不成立所以**可点**，但 `goTo(modelValue - 1)` 又被
 *    `page <= totalPages` 拒掉 → 点了毫无反应（死按钮）；
 * ③ "下一页"已禁用 → 用户被困在一个空白页上。
 * 这里只**归一化输入**，`pages` 的窗口算法与省略号规则一字未改（见下方 pages）。
 */
const clampedPage = computed(() => Math.min(Math.max(1, props.modelValue), totalPages.value))

// 越界自愈：只在真的越界时 emit 纠正值（合法状态绝不打扰宿主，避免无谓的重复请求）。
// immediate 覆盖"首帧就传入越界值"的情形（如从 localStorage 恢复的旧页码）。
watch(
  [() => props.modelValue, totalPages],
  ([cur, tp]) => {
    const fixed = Math.min(Math.max(1, cur), tp)
    if (fixed !== cur) emit('update:modelValue', fixed)
  },
  { immediate: true },
)

/** 渲染项：页码或省略号；key 保证两个省略号不重复（v-for :key 唯一性） */
interface PageEntry {
  key: string
  value: number | '...'
}

const pages = computed<PageEntry[]>(() => {
  const current = clampedPage.value
  const total = totalPages.value
  const delta = 2
  const range: PageEntry[] = []
  let ellipsisIdx = 0

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push({ key: `p${i}`, value: i })
    } else if (range[range.length - 1]?.value !== '...') {
      range.push({ key: `e${ellipsisIdx++}`, value: '...' })
    }
  }
  return range
})

function goTo(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    emit('update:modelValue', page)
  }
}

// 快速跳转：Enter 跳转，页码钳制在 1..totalPages
const jumperValue = ref('')
function onJumperKeyup(e: KeyboardEvent) {
  if (e.key !== 'Enter') return
  const n = parseInt(jumperValue.value, 10)
  if (!Number.isNaN(n)) goTo(Math.min(totalPages.value, Math.max(1, n)))
  jumperValue.value = ''
}
</script>

<template>
  <nav class="pagination" role="navigation" :aria-label="t('pagination.navLabel')">
    <button
      type="button"
      class="page-btn"
      :disabled="clampedPage <= 1"
      :aria-label="t('pagination.prevPage')"
      @click="goTo(clampedPage - 1)"
    >
      <IconSvg type="chevron-left" size="sm" />
    </button>

    <button
      v-for="p in pages"
      :key="p.key"
      type="button"
      class="page-btn"
      :class="{ active: p.value === clampedPage, ellipsis: p.value === '...' }"
      :disabled="p.value === '...'"
      :aria-hidden="p.value === '...' || undefined"
      :aria-current="p.value === clampedPage ? 'page' : undefined"
      @click="typeof p.value === 'number' && goTo(p.value)"
    >
      {{ p.value }}
    </button>

    <button
      type="button"
      class="page-btn"
      :disabled="clampedPage >= totalPages"
      :aria-label="t('pagination.nextPage')"
      @click="goTo(clampedPage + 1)"
    >
      <IconSvg type="chevron-right" size="sm" />
    </button>

    <span v-if="showQuickJumper" class="page-jumper">
      <input
        v-model="jumperValue"
        type="number"
        class="jumper-input"
        min="1"
        :max="totalPages"
        :aria-label="t('pagination.jumpPage')"
        @keyup="onJumperKeyup"
      />
    </span>

    <span class="page-info"
      >{{ t('pagination.total') }} {{ Number.isFinite(total) ? total : 0 }} {{ t('pagination.items') }}</span
    >
  </nav>
</template>

<style src="./pagination-scoped.css" scoped></style>
