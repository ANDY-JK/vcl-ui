<script setup lang="ts">
// 批量修改弹窗 — 从 DataTable.vue 区块化抽出（§18-②）
// 行为约定：选中键/备注输入框引用经 injectDataTableContext 注入（与主文件同一引用）；
// batchChange 事件由本组件 emit，主文件转发（对外事件面不变）。
import { nextTick, ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useFocusTrap } from '@/components/_internal/useFocusTrap'
import { colTitle } from './composables/utils'
import { injectDataTableContext } from './composables/context'

defineProps<{ selectable: boolean }>()

const emit = defineEmits<{
  'batch-change': [colKey: string, newValue: string, rowKeys: string[]]
}>()

const t = useT()

const { visibleColumns, selectedKeys: _selectedKeys, noteInputEl, setNoteInputEl } = injectDataTableContext()

const _batchShow = ref(false)
const _batchCol = ref('')
const _batchValue = ref('')
const dialogRef = ref<HTMLElement | null>(null)
// aria-modal=true 的承诺要有 Tab 循环兜底：否则键盘 Tab 会"消失"进被遮住的背景表格
const { activate: activateTrap, deactivate: deactivateTrap } = useFocusTrap({
  visible: _batchShow,
  getContainer: () => dialogRef.value,
})
function openBatchEdit() {
  if (_selectedKeys.value.length === 0) return
  _batchCol.value = visibleColumns.value[0]?.key ?? ''
  _batchValue.value = ''
  _batchShow.value = true
  nextTick(() => {
    noteInputEl.value?.focus()
    // 陷阱聚焦在 input 之后激活，避免抢走首焦点
    activateTrap()
  })
}
function confirmBatchEdit() {
  if (!_batchCol.value || _batchShow.value === false) return
  emit('batch-change', _batchCol.value, _batchValue.value, [..._selectedKeys.value])
  // #511：确定（含输入框回车）是**最常走**的关闭路径，早先只隐藏不停用陷阱 ——
  // 于是 useFocusTrap 的 active 永远为真：window 上的 keydown 监听留到卸载才摘、
  // lastFocusedEl 一直不清、同一实例再次 open() 时 activate() 因 `if (active) return` 空转。
  // 三条关闭路径必须一致（取消/Esc 早就对了）。
  deactivateTrap()
  _batchShow.value = false
}
function closeBatchEdit() {
  deactivateTrap()
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
    ref="dialogRef"
    class="note-editor"
    :style="{
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%,-50%)',
      zIndex: 'var(--vcl-z-tooltip, 3000)',
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
      <button type="button" class="dt-filter-btn dt-filter-btn-apply" @click="confirmBatchEdit">
        {{ t('common.ok') }}
      </button>
      <button type="button" class="dt-filter-btn dt-filter-btn-reset" @click="closeBatchEdit">
        {{ t('common.cancel') }}
      </button>
    </div>
  </div>
</template>
