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
  /**
   * 外部判定为无效（不带文案）：挂到**组容器**上（#345）。
   * 这两类字段都有多个可聚焦控件（省市区下拉 / 多行多列输入），
   * 错误描述的是"整组没填对"，所以挂容器而不是逐个控件。
   */
  invalid?: boolean
  /** 外部错误元素的 id：挂到 aria-describedby，读屏可回查「为什么无效」 */
  describedby?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/**
 * 子表单解析列定义（`label|key|type` 换行分隔）。
 *
 * 第 142 轮修的三类畸形输入（都是"静默产生坏结构"）：
 * - **纯空格/制表符行**：原来 `filter(Boolean)` 只挡空串，`"   "` 活着 → 多出一列"列"；
 * - **缺 key 的行**：原来回退成字面量 `'col'`，**两行都缺就共用同一数据字段**
 *   （输入互串、只存一个值），且 `v-for :key` 重复；
 * - **显式重复 key**：同上，两列绑同一字段。
 *
 * 现在：逐行 trim 后去空行；缺 key 回退为 `col`，由"已占用就追加序号"兜住重复；
 * 空白 label 带上序号以便区分（否则两列都叫"列"）。
 */
const subformCols = computed(() => {
  const raw = (props.field.props?.subformColumns as string) ?? ''
  const used = new Set<string>()
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line, i) => {
      const [label, key, type] = line.split('|')
      let colKey = key?.trim() || 'col'
      if (used.has(colKey)) {
        // 显式重复（或与回退名撞车）：追加序号，避免两列绑同一字段 + v-for 重复 key
        let n = i + 1
        while (used.has(`${colKey}_${n}`)) n++
        colKey = `${colKey}_${n}`
      }
      used.add(colKey)
      return {
        label: label?.trim() || `${t('formBuilder.column')} ${i + 1}`,
        key: colKey,
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
  <div
    class="fb-subform"
    role="group"
    :aria-label="field.label"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
  >
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
