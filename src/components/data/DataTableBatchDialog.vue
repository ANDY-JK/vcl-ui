<script setup lang="ts">
// 批量修改弹窗 — 从 DataTable.vue 区块化抽出（§18-②）
// 行为约定：选中键/备注输入框引用经 injectDataTableContext 注入（与主文件同一引用）；
// batchChange 事件由本组件 emit，主文件转发（对外事件面不变）。
import { nextTick, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { colTitle } from './composables/utils'
import { injectDataTableContext } from './composables/context'

defineProps<{ selectable: boolean }>()

const emit = defineEmits<{
  batchChange: [colKey: string, newValue: string, rowKeys: string[]]
}>()

const t = useT()

const { visibleColumns, selectedKeys: _selectedKeys, noteInputEl, setNoteInputEl } = injectDataTableContext()

const _batchShow = ref(false)
const _batchCol = ref('')
const _batchValue = ref('')
function openBatchEdit() {
  if (_selectedKeys.value.length === 0) return
  _batchCol.value = visibleColumns.value[0]?.key ?? ''
  _batchValue.value = ''
  _batchShow.value = true
  nextTick(() => noteInputEl.value?.focus())
}
function confirmBatchEdit() {
  if (!_batchCol.value || _batchShow.value === false) return
  emit('batchChange', _batchCol.value, _batchValue.value, [..._selectedKeys.value])
  _batchShow.value = false
}
function closeBatchEdit() {
  _batchShow.value = false
}

defineExpose({
  /** 显隐（主文件读：全屏 Esc 关闭顺序判断） */
  show: _batchShow,
  /** 工具栏批量修改按钮入口 */
  open: openBatchEdit,
  /** Esc / 取消按钮关闭路径 */
  close: closeBatchEdit,
})
</script>

<template>
  <!-- 批量修改弹窗 -->
  <div
    v-if="selectable && _batchShow"
    class="note-editor"
    :style="{
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 'var(--z-tooltip, 3000)',
    }"
    role="dialog"
    aria-modal="true"
    @click.stop
    @keydown.escape="closeBatchEdit"
  >
    <div class="note-editor-title">{{ t('table.batchEditTitle', { n: _selectedKeys.length }) }}</div>
    <select v-model="_batchCol" class="note-editor-input">
      <option v-for="col in visibleColumns" :key="col.key" :value="col.key">
        {{ colTitle(col) }}
      </option>
    </select>
    <input
      :ref="setNoteInputEl"
      v-model="_batchValue"
      class="note-editor-input"
      :placeholder="t('table.newValuePlaceholder')"
      @keydown.enter="confirmBatchEdit"
    />
    <div class="note-editor-actions">
      <button class="dt-filter-btn dt-filter-btn-apply" @click="confirmBatchEdit">{{ t('common.ok') }}</button>
      <button class="dt-filter-btn dt-filter-btn-reset" @click="closeBatchEdit">{{ t('common.cancel') }}</button>
    </div>
  </div>
</template>
