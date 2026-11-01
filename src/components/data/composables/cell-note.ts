// ==================== 备注模式 & 原始值气泡 ====================
import { ref, watch } from 'vue'
import { nextTick } from 'vue'
import type { CellEditProps, CellEditEmit } from './cell-types'
import type { CellWriteApi } from './cell-write'

export interface CellNoteDeps {
  props: CellEditProps
  emit: CellEditEmit
  write: CellWriteApi
}

export function useCellNote(deps: CellNoteDeps) {
  const { props, emit, write } = deps

  // ==================== 备注模式 ====================
  const notes = ref<Record<string, Record<string, string>>>(props.notes ?? {})
  watch(
    () => props.notes,
    (val) => {
      if (val) notes.value = { ...val }
    },
    { deep: true },
  )
  const noteEditing = ref<{ rowKey: string; colKey: string } | null>(null)
  const noteDraft = ref('')
  const noteTooltip = ref<{ rowKey: string; colKey: string; text: string; x: number; y: number } | null>(null)
  const noteInputEl = ref<HTMLInputElement | null>(null)

  function setNoteInputEl(el: unknown) {
    noteInputEl.value = (el as HTMLInputElement) || null
  }

  /** 某单元格是否有备注 */
  function hasNote(rowKey: string, colKey: string): boolean {
    return !!notes.value[rowKey]?.[colKey]
  }

  /** 获取备注文本 */
  function getNote(rowKey: string, colKey: string): string {
    return notes.value[rowKey]?.[colKey] ?? ''
  }

  /** 鼠标悬停显示备注 */
  function showNoteTooltip(e: MouseEvent, rowKey: string, colKey: string) {
    if (!props.noteMode) return
    const text = notes.value[rowKey]?.[colKey]
    if (!text) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    noteTooltip.value = {
      rowKey,
      colKey,
      text,
      x: rect.left,
      y: rect.top - 4,
    }
  }

  function hideNoteTooltip() {
    noteTooltip.value = null
  }

  /** 点击备注指示器 → 弹出输入框 */
  function startNoteEdit(e: MouseEvent, rowKey: string, colKey: string) {
    if (!props.noteMode) return
    e.stopPropagation()
    noteEditing.value = { rowKey, colKey }
    noteDraft.value = notes.value[rowKey]?.[colKey] ?? ''
    nextTick(() => {
      const el = noteInputEl.value
      el?.focus()
    })
  }

  function commitNote() {
    if (!noteEditing.value) return
    const { rowKey, colKey } = noteEditing.value
    const val = noteDraft.value.trim()
    if (val) {
      if (!notes.value[rowKey]) notes.value[rowKey] = {}
      notes.value[rowKey][colKey] = val
    } else {
      if (notes.value[rowKey]) {
        delete notes.value[rowKey][colKey]
        if (Object.keys(notes.value[rowKey]).length === 0) delete notes.value[rowKey]
      }
    }
    emit.cellNote(rowKey, colKey, val)
    noteEditing.value = null
  }

  function cancelNote() {
    noteEditing.value = null
  }

  function onNoteKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault?.()
      commitNote()
    } else if (e.key === 'Escape') {
      // 取消备注即消费 Esc，避免连外层弹窗一起关（#280）
      e.preventDefault?.()
      cancelNote()
    }
  }

  // ==================== @patch 2026-07-15 原始值气泡（hover 已编辑单元格显示原始值） ====================
  const originalTooltip = ref<{ text: string; x: number; y: number } | null>(null)

  /** hover 已编辑单元格时，若开启了 originalTooltip 则弹出原始值气泡 */
  function showOriginalTooltip(e: MouseEvent, rowKey: string, colKey: string, originalText: string) {
    if (!props.originalTooltip) return
    if (!write.overrides.value[rowKey]?.[colKey]) return
    const rect = (e.target as HTMLElement).getBoundingClientRect()
    originalTooltip.value = {
      text: originalText,
      x: rect.left,
      y: rect.top - 4,
    }
  }

  function hideOriginalTooltip() {
    originalTooltip.value = null
  }

  return {
    notes,
    noteEditing,
    noteDraft,
    noteTooltip,
    noteInputEl,
    setNoteInputEl,
    hasNote,
    getNote,
    showNoteTooltip,
    hideNoteTooltip,
    startNoteEdit,
    commitNote,
    cancelNote,
    onNoteKeydown,
    originalTooltip,
    showOriginalTooltip,
    hideOriginalTooltip,
  }
}

export type CellNoteApi = ReturnType<typeof useCellNote>
