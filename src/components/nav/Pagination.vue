<script setup lang="ts">
// ⛔ 保护 — 分页，禁止：clamp() → px，页码计算逻辑，ellipsis 行为
//    需我确认：pageSize 选项、maxPages 显示数
import { computed, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import { calcTotalPages } from './utils/pagination-utils'

const t = useT()

interface Props {
  modelValue: number
  total: number
  pageSize?: number
  showQuickJumper?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pageSize: 10,
  showQuickJumper: false,
})

const emit = defineEmits<{ 'update:modelValue': [v: number] }>()

// pageSize<=0 时按 1 处理，避免 Math.ceil(total/0)=Infinity 导致分页循环无限渲染（逻辑在 pagination-utils）
const totalPages = computed(() => calcTotalPages(props.total, props.pageSize))

const pages = computed(() => {
  const current = props.modelValue
  const total = totalPages.value
  const delta = 2
  const range: (number | string)[] = []

  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i)
    } else if (range[range.length - 1] !== '...') {
      range.push('...')
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
      :key="p"
      type="button"
      class="page-btn"
      :class="{ active: p === modelValue, ellipsis: p === '...' }"
      :disabled="p === '...'"
      :aria-hidden="p === '...' || undefined"
      :aria-current="p === modelValue ? 'page' : undefined"
      @click="typeof p === 'number' && goTo(p)"
    >
      {{ p }}
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
  gap: var(--space-1);
}

.page-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: clamp(30px, 4.5vw, 34px);
  height: clamp(30px, 4.5vw, 34px);
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: clamp(11px, 1.8vw, 15px);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.page-btn:hover:not(:disabled):not(.active) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.page-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
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
  margin-left: clamp(var(--space-2), 1.5vw, 12px);
  font-size: clamp(11px, 1.8vw, 15px);
  color: var(--color-text-muted);
}

.page-jumper {
  display: flex;
  align-items: center;
  margin-left: var(--space-1);
}

.jumper-input {
  width: clamp(48px, 7vw, 56px);
  height: clamp(30px, 4.5vw, 34px);
  padding: 0 var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  font-size: clamp(11px, 1.8vw, 15px);
  color: var(--color-text-secondary);
  outline: none;
  box-sizing: border-box;
  text-align: center;
}
.jumper-input:focus {
  border-color: var(--color-primary);
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
