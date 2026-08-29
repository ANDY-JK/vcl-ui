<script setup lang="ts">
// 评分矩阵字段 — 行列标题来自 props.matrixRows/matrixCols（换行分隔），值为 {行标题: 列标题} 映射
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
  /** 字段定义（matrixRows/matrixCols 取自 props） */
  field: FormField
  /** 当前值（行标题 → 列标题） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/** 矩阵行标题 */
const matrixRows = computed(() => {
  const raw = (props.field.props?.matrixRows as string) ?? ''
  return raw.split('\n').filter(Boolean)
})

/** 矩阵列标题 */
const matrixCols = computed(() => {
  const raw = (props.field.props?.matrixCols as string) ?? ''
  return raw.split('\n').filter(Boolean)
})

function selectCell(row: string, col: string): void {
  emit('update:modelValue', { ...((props.modelValue as Record<string, string>) ?? {}), [row]: col })
}
</script>

<template>
  <div v-if="matrixRows.length && matrixCols.length" class="fb-matrix">
    <div class="fb-matrix-head">
      <div class="fb-matrix-cell fb-matrix-first">·</div>
      <div v-for="col in matrixCols" :key="col" class="fb-matrix-cell">{{ col }}</div>
    </div>
    <div v-for="(row, ri) in matrixRows" :key="ri" class="fb-matrix-row">
      <div class="fb-matrix-cell fb-matrix-first">{{ row }}</div>
      <div v-for="col in matrixCols" :key="col" class="fb-matrix-cell">
        <input
          type="radio"
          :name="`matrix-${field.key}-${ri}`"
          :value="col"
          :checked="(modelValue as Record<string, string>)?.[row] === col"
          @change="selectCell(row, col)"
        />
      </div>
    </div>
  </div>
  <div v-else class="fb-matrix-empty">{{ t('formBuilder.matrixEmpty') }}</div>
</template>

<style scoped>
.fb-matrix {
  border: 1px solid var(--color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--color-border, #e2e8f0));
  border-radius: var(--fb-radius, 6px);
  overflow: hidden;
  width: var(--fb-control-width, 100%);
}
.fb-matrix-head,
.fb-matrix-row {
  display: flex;
}
.fb-matrix-head {
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}
.fb-matrix-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}
.fb-matrix-cell {
  flex: 1;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted, #64748b);
}
.fb-matrix-first {
  flex: 1.5;
  justify-content: flex-start;
  color: var(--color-text, #1e293b);
}
.fb-matrix-cell input[type='radio'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.fb-matrix-empty {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: var(--fb-radius, 6px);
  width: var(--fb-control-width, 100%);
}
</style>
