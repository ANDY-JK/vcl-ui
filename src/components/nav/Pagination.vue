<script setup lang="ts">
// ⛔ 保护 — 分页，禁止：clamp() → px，页码计算逻辑，ellipsis 行为
//    需我确认：pageSize 选项、maxPages 显示数
import { computed, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import { calcTotalPages } from './utils/pagination-utils'

const t = useT()

interface Props {
  /** 受控当前页（v-model:modelValue，1 起） */
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

/** 渲染项：页码或省略号；key 保证两个省略号不重复（v-for :key 唯一性） */
interface PageEntry {
  key: string
  value: number | '...'
}

const pages = computed<PageEntry[]>(() => {
  const current = props.modelValue
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
      :disabled="modelValue <= 1"
      :aria-label="t('pagination.prevPage')"
      @click="goTo(modelValue - 1)"
    >
      <IconSvg type="chevron-left" size="sm" />
    </button>

    <button
      v-for="p in pages"
      :key="p.key"
      type="button"
      class="page-btn"
      :class="{ active: p.value === modelValue, ellipsis: p.value === '...' }"
      :disabled="p.value === '...'"
      :aria-hidden="p.value === '...' || undefined"
      :aria-current="p.value === modelValue ? 'page' : undefined"
      @click="typeof p.value === 'number' && goTo(p.value)"
    >
      {{ p.value }}
    </button>

    <button
      type="button"
      class="page-btn"
      :disabled="modelValue >= totalPages"
      :aria-label="t('pagination.nextPage')"
      @click="goTo(modelValue + 1)"
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

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-1);
}

.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: calc(34px * var(--vcl-scale));
  height: calc(34px * var(--vcl-scale));
  padding: 0 var(--vcl-space-1);
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-sm);
  background: var(--vcl-color-surface);
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
  transition: all var(--vcl-transition-fast);
}
.page-btn:hover:not(:disabled):not(.active) {
  border-color: var(--vcl-color-primary);
  color: var(--vcl-color-primary-on-surface);
}
.page-btn.active {
  /* 2026-10-01：实心底压白字用 solid 档（primary 压白仅 4.28，solid 5.84 达标） */
  background: var(--vcl-color-primary-solid);
  border-color: var(--vcl-color-primary-solid);
  color: white;
}
.page-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.page-btn.ellipsis {
  border-color: transparent;
  background: transparent;
  cursor: default;
}

.page-info {
  margin-left: calc(12px * var(--vcl-scale));
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

.page-jumper {
  display: flex;
  align-items: center;
  margin-left: var(--vcl-space-1);
}

.jumper-input {
  width: calc(56px * var(--vcl-scale));
  height: calc(34px * var(--vcl-scale));
  padding: 0 var(--vcl-space-1);
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-sm);
  background: var(--vcl-color-surface);
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  outline: none;
  box-sizing: border-box;
  text-align: center;
}
.jumper-input:focus {
  border-color: var(--vcl-color-primary);
}
.jumper-input::-webkit-inner-spin-button,
.jumper-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.jumper-input {
  -moz-appearance: textfield;
}
</style>
