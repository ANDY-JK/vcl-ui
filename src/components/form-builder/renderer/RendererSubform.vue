<script setup lang="ts">
// 子表单字段 — 列定义来自 props.subformColumns（"label|key|type" 换行分隔），值为行对象数组
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
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
        <button class="fb-subform-del" type="button" :aria-label="t('common.delete')" @click="removeRow(ri)">
          <!-- SVG 图标代替文本 ×：文本字形受字体度量摆布、垂直光学居中不可控（同 Select tag-close 的修复口径） -->
          <IconSvg type="x" size="xs" />
        </button>
      </div>
    </div>
    <div v-else class="fb-subform-empty">{{ t('formBuilder.subformEmpty') }}</div>
  </div>
</template>

<style src="./renderer-subform-scoped.css" scoped></style>
