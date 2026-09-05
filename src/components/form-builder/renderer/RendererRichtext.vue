<script setup lang="ts">
// 富文本字段 — composition 感知的受控 contenteditable（审计 §20 富文本专项）
// IME 安全三守卫：外部赋值才写 DOM / 合成期不 emit / 自身回声不回写（逻辑下沉 useRichtext.ts）
// 2026-09 full 档落地：消费设计器 richtextToolbar 配置，面向发文章场景扩展
// 标题/引用/代码块/对齐/颜色/链接/插图/表格/撤销重做/清格式 + 字数统计/预览/全屏
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'
import RichtextToolbar from './RichtextToolbar.vue'
import { useRichtextEditor, type RichtextExecOptions } from './useRichtext'
import { sanitizeHTML } from '@/components/data/composables/sanitize'
import { useT } from '@/components/_internal/i18n'
import type { FormField } from '../types'

type RtPanel = 'color' | 'link' | 'image' | null

const props = defineProps<{
  /** 字段定义（props.richtextToolbar / props.richtextMinChars 等配置，值经 modelValue 走 v-model） */
  field: FormField
  /** 当前值（HTML 字符串） */
  modelValue: unknown
}>()

const emit = defineEmits<{
  'update:modelValue': [v: unknown]
}>()

const t = useT()

/** 设计器工具栏档位（full = 文章编辑全量按钮；未配置 = simple 保持旧行为） */
const isFull = computed(() => props.field.props?.richtextToolbar === 'full')
/** 最小字数（与 useFormValidator 校验同源），字数条低于阈值时警示 */
const minChars = computed(() => Number(props.field.props?.richtextMinChars ?? 0))

/** 当前字段的富文本编辑器 DOM（template ref，实例隔离，替代全局 querySelector） */
const editorEl = ref<HTMLElement | null>(null)
const previewEl = ref<HTMLElement | null>(null)
const toolbarWrap = ref<HTMLElement | null>(null)

const {
  content,
  plainTextLength,
  onInput,
  onCompositionStart,
  onCompositionEnd,
  onPaste,
  exec,
  saveSelection,
  applyLink,
  insertImage,
  insertTable,
  applyInlineCode,
} = useRichtextEditor(editorEl, toRef(props, 'modelValue'), emit)

/** 当前打开的工具栏面板（容器持有：全局 Esc 分派 = 先关面板再退全屏） */
const panel = ref<RtPanel>(null)
const previewing = ref(false)
const fullscreen = ref(false)

function onPanel(name: RtPanel): void {
  if (name) saveSelection()
  panel.value = name
}

function onExec(cmd: string, val?: string, opts?: RichtextExecOptions): void {
  exec(cmd, val, opts)
}

function onUnlink(): void {
  exec('unlink')
}

function onApplyLink(url: string, newTab: boolean): void {
  applyLink(url, newTab)
  panel.value = null
}

function onApplyImage(src: string): void {
  insertImage(src)
  panel.value = null
}

function togglePreview(): void {
  panel.value = null
  previewing.value = !previewing.value
}

function toggleFullscreen(): void {
  fullscreen.value = !fullscreen.value
}

// 预览渲染：与编辑区同样走 DOM 单向同步（响应式绑定在源码锁定向测试中禁用），仅预览态写入节省消毒开销
watch(
  [previewEl, previewing, content],
  ([pel, on, html]) => {
    if (pel && on) pel.innerHTML = sanitizeHTML(html)
  },
  { flush: 'post' },
)

// 全屏滚动锁定；卸载时恢复，防路由切换后 body 残留 overflow:hidden
// 已知边界：同页多实例时，任一实例退出全屏/卸载都会清掉滚动锁（引用计数未做，多实例同时全屏场景罕见）
watch(fullscreen, (on) => {
  document.body.style.overflow = on ? 'hidden' : ''
})
onUnmounted(() => {
  document.body.style.overflow = ''
})

/** 全局 Esc：面板开着先关面板，再退全屏 */
function onGlobalKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (panel.value) {
    panel.value = null
    return
  }
  if (fullscreen.value) fullscreen.value = false
}

/** 点击工具栏/面板以外区域收起面板（编辑区继续输入时面板不应遮挡） */
function onDocPointerDown(e: MouseEvent): void {
  if (!panel.value) return
  const target = e.target as Node | null
  if (target && toolbarWrap.value?.contains(target)) return
  panel.value = null
}

onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('mousedown', onDocPointerDown)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('mousedown', onDocPointerDown)
})
</script>

<template>
  <div class="fb-richtext" :class="{ 'fb-richtext--full': isFull, 'fb-richtext--fullscreen': fullscreen }">
    <div ref="toolbarWrap" class="fb-rt-toolbar-wrap">
      <RichtextToolbar
        :mode="isFull ? 'full' : 'simple'"
        :previewing="previewing"
        :fullscreen="fullscreen"
        :panel="panel"
        @panel="onPanel"
        @exec="onExec"
        @link="onApplyLink"
        @image="onApplyImage"
        @table="insertTable"
        @inline-code="applyInlineCode"
        @unlink="onUnlink"
        @toggle-preview="togglePreview"
        @toggle-fullscreen="toggleFullscreen"
      />
    </div>
    <div
      v-show="!previewing"
      ref="editorEl"
      class="fb-richtext-body"
      contenteditable="true"
      @input="onInput"
      @compositionstart="onCompositionStart"
      @compositionend="onCompositionEnd"
      @paste="onPaste"
    />
    <div v-show="previewing" ref="previewEl" class="fb-richtext-preview" />
    <div
      v-if="isFull"
      class="fb-rt-status"
      :class="{ 'fb-rt-status--warn': minChars > 0 && plainTextLength < minChars }"
    >
      <template v-if="minChars > 0">{{
        t('formBuilder.rtWordCountMin', { len: plainTextLength, min: minChars })
      }}</template>
      <template v-else>{{ t('formBuilder.rtWordCount', { len: plainTextLength }) }}</template>
    </div>
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
.fb-rt-toolbar-wrap {
  position: relative;
}

/* ── 编辑区 / 预览区 ── */
.fb-richtext-body {
  padding: 8px 12px;
  min-height: 50px;
  font-size: 13px;
  color: var(--color-text, #1e293b);
  outline: none;
}
.fb-richtext--full .fb-richtext-body {
  min-height: var(--fb-rt-min-height-full, 160px);
  line-height: 1.7;
}
.fb-richtext-preview {
  padding: 12px 16px;
  min-height: 50px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text, #1e293b);
  background: var(--color-surface, #fff);
}
.fb-richtext-body:empty::before {
  content: var(--fb-rt-placeholder);
  color: var(--color-text-muted, #94a3b8);
}

/* 编辑区内容样式（innerHTML 注入的节点无 scoped 标记，须 :deep 下钻） */
.fb-richtext-body :deep(h1),
.fb-richtext-preview :deep(h1) {
  font-size: 1.6em;
  font-weight: 600;
  margin: 0.5em 0 0.35em;
}
.fb-richtext-body :deep(h2),
.fb-richtext-preview :deep(h2) {
  font-size: 1.4em;
  font-weight: 600;
  margin: 0.5em 0 0.35em;
}
.fb-richtext-body :deep(h3),
.fb-richtext-preview :deep(h3) {
  font-size: 1.2em;
  font-weight: 600;
  margin: 0.5em 0 0.35em;
}
.fb-richtext-body :deep(h4),
.fb-richtext-preview :deep(h4) {
  font-size: 1.05em;
  font-weight: 600;
  margin: 0.5em 0 0.3em;
}
.fb-richtext-body :deep(blockquote),
.fb-richtext-preview :deep(blockquote) {
  border-left: 3px solid var(--color-border, #e2e8f0);
  margin: 8px 0;
  padding: 2px 12px;
  color: var(--color-text-muted, #64748b);
}
.fb-richtext-body :deep(pre),
.fb-richtext-preview :deep(pre) {
  background: var(--color-bg-soft, #f1f5f9);
  border-radius: 4px;
  padding: 10px 12px;
  overflow-x: auto;
  font-family: var(--fb-rt-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 12px;
  margin: 8px 0;
}
.fb-richtext-body :deep(code),
.fb-richtext-preview :deep(code) {
  font-family: var(--fb-rt-font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  background: var(--color-bg-soft, #f1f5f9);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 0.92em;
}
.fb-richtext-body :deep(pre code),
.fb-richtext-preview :deep(pre code) {
  background: transparent;
  padding: 0;
}
.fb-richtext-body :deep(hr),
.fb-richtext-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border, #e2e8f0);
  margin: 14px 0;
}
.fb-richtext-body :deep(img),
.fb-richtext-preview :deep(img) {
  max-width: 100%;
  border-radius: 4px;
}
.fb-richtext-body :deep(table),
.fb-richtext-preview :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
}
.fb-richtext-body :deep(th),
.fb-richtext-body :deep(td),
.fb-richtext-preview :deep(th),
.fb-richtext-preview :deep(td) {
  border: 1px solid var(--color-border, #e2e8f0);
  padding: 4px 10px;
  min-width: 32px;
}
.fb-richtext-body :deep(a),
.fb-richtext-preview :deep(a) {
  color: var(--color-primary, #4f46e5);
}
.fb-richtext-body :deep(ul),
.fb-richtext-body :deep(ol),
.fb-richtext-preview :deep(ul),
.fb-richtext-preview :deep(ol) {
  padding-left: 1.4em;
}

/* ── 字数状态条 ── */
.fb-rt-status {
  display: flex;
  justify-content: flex-end;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--color-text-muted, #94a3b8);
  border-top: 1px solid var(--color-border-light, #f1f5f9);
  background: var(--color-bg-alt, #f8fafc);
}
.fb-rt-status--warn {
  color: var(--color-warning, #d97706);
}

/* ── 全屏编辑：固定覆盖视口，正文限宽居中保阅读节奏 ── */
.fb-richtext--fullscreen {
  position: fixed;
  inset: 0;
  z-index: var(--fb-rt-fullscreen-z, 1000);
  width: 100%;
  border: none;
  border-radius: 0;
  background: var(--color-bg, #fff);
  display: flex;
  flex-direction: column;
}
.fb-richtext--fullscreen .fb-rt-toolbar-wrap {
  flex-shrink: 0;
}
.fb-richtext--fullscreen .fb-richtext-body,
.fb-richtext--fullscreen .fb-richtext-preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  width: 100%;
  max-width: var(--fb-rt-fullscreen-width, 860px);
  margin: 0 auto;
  padding: 24px 32px;
  font-size: 15px;
}
.fb-richtext--fullscreen .fb-rt-status {
  flex-shrink: 0;
}
</style>
