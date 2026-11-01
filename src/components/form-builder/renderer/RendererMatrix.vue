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
  /**
   * 外部判定为无效（不带文案）：挂到**可聚焦控件/组容器**上（#344）。
   * 每个渲染器的可聚焦元素不同：证件号是 input、矩阵是单选组容器。
   */
  invalid?: boolean
  /** 外部错误元素的 id：挂到 aria-describedby，读屏可回查「为什么无效」 */
  describedby?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/**
 * 矩阵行标题。第 142 轮：先 trim 再判空 —— 原来 `filter(Boolean)` 只挡空串，
 * 一行空格/制表符会变成表头里的一个空白格子（用户按两下回车就会出现）。
 */
const matrixRows = computed(() => {
  const raw = (props.field.props?.matrixRows as string) ?? ''
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '')
})

/** 矩阵列标题（同 matrixRows：先 trim 再判空） */
const matrixCols = computed(() => {
  const raw = (props.field.props?.matrixCols as string) ?? ''
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s !== '')
})

function selectCell(row: string, col: string): void {
  emit('update:modelValue', { ...((props.modelValue as Record<string, string>) ?? {}), [row]: col })
}
</script>

<template>
  <div
    v-if="matrixRows.length && matrixCols.length"
    class="fb-matrix"
    role="radiogroup"
    :aria-label="field.label"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
  >
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
  border: 1px solid var(--vcl-color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--vcl-color-border, #e2e8f0));
  border-radius: var(--fb-radius, calc(6px * var(--vcl-scale)));
  overflow: hidden;
  width: var(--fb-control-width, 100%);
}
.fb-matrix-head,
.fb-matrix-row {
  display: flex;
}
.fb-matrix-head {
  background: var(--vcl-color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--vcl-color-border-light, #f1f5f9);
}
.fb-matrix-row:not(:last-child) {
  border-bottom: 1px solid var(--vcl-color-border-light, #f1f5f9);
}
.fb-matrix-cell {
  flex: 1;
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--vcl-fs-11);
  font-weight: 600;
  color: var(--vcl-color-text-muted, #64748b);
}
.fb-matrix-first {
  flex: 1.5;
  justify-content: flex-start;
  color: var(--vcl-color-text, #1e293b);
}
.fb-matrix-cell input[type='radio'] {
  width: calc(16px * var(--vcl-scale));
  height: calc(16px * var(--vcl-scale));
  cursor: pointer;
}
.fb-matrix-empty {
  padding: calc(20px * var(--vcl-scale));
  text-align: center;
  font-size: var(--vcl-fs-12);
  color: var(--vcl-color-text-muted, #94a3b8);
  border: 1px dashed var(--vcl-color-border, #e2e8f0);
  border-radius: var(--fb-radius, calc(6px * var(--vcl-scale)));
  width: var(--fb-control-width, 100%);
}
</style>
