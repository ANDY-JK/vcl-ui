<script setup lang="ts">
// 子表单字段 — 列定义来自 props.subformColumns（"label|key|type" 换行分隔），值为行对象数组
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
  /** 字段定义（subformColumns 取自 props） */
  field: FormField
  /** 当前值（行对象数组） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/** 子表单解析列定义 */
const subformCols = computed(() => {
  const raw = (props.field.props?.subformColumns as string) ?? ''
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [label, key, type] = line.split('|')
      return {
        label: label?.trim() || t('formBuilder.column'),
        key: key?.trim() || 'col',
        type: type?.trim() || 'text',
      }
    })
})

/** 子表单行数据 */
const subformRows = computed(() => {
  const val = props.modelValue
  if (Array.isArray(val)) return val as Record<string, unknown>[]
  return []
})

/** 更新子表单单元格值 */
function updateSubformCell(rowIndex: number, colKey: string, value: unknown): void {
  const rows = [...subformRows.value]
  if (!rows[rowIndex]) rows[rowIndex] = {}
  rows[rowIndex] = { ...rows[rowIndex], [colKey]: value }
  emit('update:modelValue', rows)
}

function addRow(): void {
  emit('update:modelValue', [...subformRows.value, {}])
}

function removeRow(rowIndex: number): void {
  emit(
    'update:modelValue',
    subformRows.value.filter((_, i) => i !== rowIndex),
  )
}
</script>

<template>
  <div class="fb-subform">
    <div class="fb-subform-head">
      <span class="fb-subform-title">{{
        t('formBuilder.subformHead', { cols: subformCols.length, rows: subformRows.length })
      }}</span>
      <button class="fb-subform-add" type="button" @click="addRow">
        {{ t('formBuilder.addRow') }}
      </button>
    </div>
    <div v-if="subformRows.length" class="fb-subform-rows">
      <div v-for="(row, ri) in subformRows" :key="ri" class="fb-subform-row">
        <div v-for="col in subformCols" :key="col.key" class="fb-subform-cell">
          <input
            class="fb-subform-input"
            :value="row[col.key] ?? ''"
            :placeholder="col.label"
            @input="updateSubformCell(ri, col.key, ($event.target as HTMLInputElement).value)"
          />
        </div>
        <button class="fb-subform-del" type="button" @click="removeRow(ri)">×</button>
      </div>
    </div>
    <div v-else class="fb-subform-empty">{{ t('formBuilder.subformEmpty') }}</div>
  </div>
</template>

<style scoped>
.fb-subform {
  border: 1px solid var(--color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--color-border, #e2e8f0));
  border-radius: var(--fb-radius, calc(6px * var(--vcl-scale)));
  overflow: hidden;
  width: var(--fb-control-width, 100%);
}
.fb-subform-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(6px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  font-size: var(--fs-12);
  font-weight: 600;
  color: var(--color-text-secondary, #64748b);
}
.fb-subform-add {
  font-size: var(--fs-11);
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  padding: 2px calc(8px * var(--vcl-scale));
  border-radius: calc(4px * var(--vcl-scale));
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg, #fff);
  display: inline-flex;
  align-items: center;
  gap: calc(3px * var(--vcl-scale));
}
.fb-subform-add:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary, #3b82f6);
}
.fb-subform-rows {
  display: flex;
  flex-direction: column;
}
.fb-subform-row {
  display: flex;
  gap: calc(6px * var(--vcl-scale));
  padding: calc(6px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  align-items: center;
}
.fb-subform-row:last-child {
  border-bottom: none;
}
.fb-subform-cell {
  flex: 1;
  min-width: 0;
}
.fb-subform-input {
  width: 100%;
  border: 1px solid var(--color-border, #e2e8f0);
  border-color: var(--fb-field-border, var(--color-border, #e2e8f0));
  border-radius: var(--fb-radius, calc(4px * var(--vcl-scale)));
  padding: calc(5px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  font-size: var(--fs-12);
  background: var(--color-bg, #fff);
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-subform-input:focus {
  border-color: var(--fb-field-focus-border, var(--color-primary, #3b82f6));
}
.fb-subform-del {
  flex-shrink: 0;
  width: calc(22px * var(--vcl-scale));
  height: calc(22px * var(--vcl-scale));
  border: none;
  border-radius: calc(4px * var(--vcl-scale));
  background: transparent;
  color: var(--color-text-muted, #94a3b8);
  cursor: pointer;
  font-size: var(--fs-14);
}
.fb-subform-del:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger-on-surface);
}
.fb-subform-empty {
  padding: calc(16px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  text-align: center;
  font-size: var(--fs-12);
  color: var(--color-text-muted, #94a3b8);
}
</style>
