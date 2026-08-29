<script setup lang="ts">
// 富文本字段 — composition 感知的受控 contenteditable（审计 §20 富文本专项）
// IME 安全三守卫：外部赋值才写 DOM / 合成期不 emit / 自身回声不回写
// 写入唯一出口 richtextSyncFromDom（input/合成/工具栏命令/粘贴共用），消毒后 emit
import { computed, ref, watch } from 'vue'
import { warnOnce } from '@/components/_internal/warnOnce'
import { sanitizeHTML } from '@/components/data/composables/sanitize'
import type { FormField } from '../types'

const props = defineProps<{
  /** 字段定义（取 props 占位等，值经 modelValue 走 v-model） */
  field: FormField
  /** 当前值（HTML 字符串） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

/** 富文本当前值（只读）。DOM 由下方 watch 单向同步，写入一律经 richtextSyncFromDom emit */
const richtextContent = computed(() => (props.modelValue as string) ?? '')
/** 当前字段的富文本编辑器 DOM（template ref，实例隔离，替代全局 querySelector） */
const richtextEl = ref<HTMLElement | null>(null)
/** IME 合成中标记：合成期间不 emit，避免 DOM 回写打断中文输入法 */
const richtextComposing = ref(false)
/** 上次 emit 的消毒结果：区分「自身 emit 的回声」与「外部赋值」，回声不回写 DOM（保光标与合成文本） */
let richtextLastEmitted = ''

// DOM 回写唯一入口：外部赋值（值 ≠ 上次 emit）才重设 innerHTML；响应式 HTML 绑定（已弃用）会在每次按键后重置
// DOM 打断 IME 合成，故弃用（审计 §19 富文本专项）
watch(
  [richtextEl, richtextContent],
  ([el, val]) => {
    if (!el) return
    if (el.innerHTML === val) {
      richtextLastEmitted = val
      return
    }
    if (val === richtextLastEmitted) return
    el.innerHTML = val
    richtextLastEmitted = val
  },
  { flush: 'post' },
)

/** 从 DOM 取消毒后内容 emit 给父层（写入 modelValue 的唯一出口） */
function richtextSyncFromDom(): void {
  const el = richtextEl.value
  if (!el) return
  const html = sanitizeHTML(el.innerHTML)
  richtextLastEmitted = html
  emit('update:modelValue', html)
}

function onRichtextInput(): void {
  if (richtextComposing.value) return
  richtextSyncFromDom()
}

function onRichtextCompositionStart(): void {
  richtextComposing.value = true
}

function onRichtextCompositionEnd(): void {
  richtextComposing.value = false
  richtextSyncFromDom()
}

/** 粘贴消毒：富文本剪贴板先过白名单再插入（默认插入的是原始 HTML，事件属性在随后消毒前就会触发） */
function onRichtextPaste(e: ClipboardEvent): void {
  const raw = e.clipboardData?.getData('text/html')
  if (!raw) return
  e.preventDefault()
  const clean = sanitizeHTML(raw)
  const sel = window.getSelection()
  const el = richtextEl.value
  if (sel && sel.rangeCount > 0 && el?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(range.createContextualFragment(clean))
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  } else {
    el?.insertAdjacentHTML('beforeend', clean)
  }
  richtextSyncFromDom()
}

function execRichtext(cmd: string, val?: string): void {
  const el = richtextEl.value
  if (!el) return
  el.focus()
  // execCommand 已被标准废弃，新浏览器可能移除：失效时只告警一次，不让工具栏点击抛错
  try {
    if (typeof document.execCommand !== 'function') {
      warnOnce('richtext-execcommand', '[FormRenderer] document.execCommand 不可用，富文本工具栏在此环境已失效')
      return
    }
    document.execCommand(cmd, false, val)
    // 手动同步（execCommand 不触发 input 事件）
    richtextSyncFromDom()
  } catch (e) {
    warnOnce('richtext-execcommand', '[FormRenderer] 富文本命令执行失败: ' + String(e))
  }
}
</script>

<template>
  <div class="fb-richtext">
    <div class="fb-richtext-toolbar">
      <button type="button" @click="execRichtext('bold')"><b>B</b></button>
      <button type="button" @click="execRichtext('italic')"><i>I</i></button>
      <button type="button" @click="execRichtext('underline')"><u>U</u></button>
      <span class="fb-rt-sep" />
      <button type="button" @click="execRichtext('insertUnorderedList')">•</button>
      <button type="button" @click="execRichtext('insertOrderedList')">1.</button>
      <span class="fb-rt-sep" />
      <button type="button" @click="execRichtext('formatBlock', '<h4>')">H</button>
      <button type="button" @click="execRichtext('formatBlock', '<p>')">P</button>
    </div>
    <div
      ref="richtextEl"
      class="fb-richtext-body"
      contenteditable="true"
      @input="onRichtextInput"
      @compositionstart="onRichtextCompositionStart"
      @compositionend="onRichtextCompositionEnd"
      @paste="onRichtextPaste"
    />
  </div>
</template>

<style scoped>
.fb-richtext {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--fb-radius, 6px);
  border-color: var(--fb-field-border, var(--color-border, #e2e8f0));
  overflow: hidden;
  width: var(--fb-control-width, 100%);
}
.fb-richtext-toolbar {
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  background: var(--color-bg-alt, #f8fafc);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
  flex-wrap: wrap;
}
.fb-richtext-toolbar button {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--color-text-muted, #64748b);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.fb-richtext-toolbar button:hover {
  background: var(--color-bg-soft, #f1f5f9);
  color: var(--color-text, #1e293b);
}
.fb-rt-sep {
  width: 1px;
  height: 16px;
  background: var(--color-border, #e2e8f0);
  margin: 0 2px;
}
.fb-richtext-body {
  padding: 8px 12px;
  min-height: 50px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-richtext-body:empty::before {
  content: var(--fb-rt-placeholder);
  color: var(--color-text-muted, #94a3b8);
}
</style>
