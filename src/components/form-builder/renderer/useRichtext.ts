// 富文本编辑核心逻辑（自 RendererRichtext 下沉为 composable，full 工具栏扩展时建立）
// 受控同步三守卫：外部赋值才写 DOM / IME 合成期不 emit / 自身回声不回写
// 写入唯一出口 syncFromDom（input/合成/工具栏命令/粘贴/插入共用），消毒后 emit
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { warnOnce } from '@/components/_internal/warnOnce'
import { sanitizeHTML } from '@/components/data/composables/sanitize'
import { htmlToPlainText } from '../useFormValidator'

/** exec 命令选项：css=true 时产生 style 样式（foreColor/hiliteColor），用完即还原避免污染 b/i 等标签命令 */
export interface RichtextExecOptions {
  css?: boolean
}

export type RichtextEmit = (evt: 'update:modelValue', v: unknown) => void

/** HTML 特殊字符转义（链接/图片/行内码插值用，防属性逃逸） */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** 3×3 空白表格（&nbsp; 保单元格高度；末尾补段落防光标困在表格里；行列增删不在本期范围） */
const TABLE_HTML = `<table><tbody>${'<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>'.repeat(3)}</tbody></table><p><br></p>`

export interface UseRichtextReturn {
  /** 去标签纯文本字数（与校验器同口径：trim 后计数） */
  plainTextLength: ComputedRef<number>
  /** 当前受控内容（预览区同步用） */
  content: ComputedRef<string>
  syncFromDom: () => void
  onInput: () => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
  onPaste: (e: ClipboardEvent) => void
  exec: (cmd: string, val?: string, opts?: RichtextExecOptions) => void
  saveSelection: () => void
  applyLink: (url: string, newTab: boolean) => void
  insertImage: (src: string) => void
  insertTable: () => void
  applyInlineCode: () => void
}

export function useRichtextEditor(
  elRef: Ref<HTMLElement | null>,
  modelValue: Ref<unknown>,
  emit: RichtextEmit,
): UseRichtextReturn {
  /** IME 合成中标记：合成期间不 emit，避免 DOM 回写打断中文输入法 */
  const composing = ref(false)
  /** 上次 emit 的消毒结果：区分「自身 emit 的回声」与「外部赋值」，回声不回写 DOM（保光标与合成文本） */
  let lastEmitted = ''
  /** 面板打开前保存的选区：链接/图片输入框抢焦点后，确认插入时恢复 */
  let savedRange: Range | null = null

  const content = computed(() => (typeof modelValue.value === 'string' ? modelValue.value : ''))
  const plainTextLength = computed(() => htmlToPlainText(content.value).trim().length)

  // DOM 回写唯一入口：外部赋值（值 ≠ 上次 emit）才重设 innerHTML；响应式 HTML 绑定会在每次按键后
  // 重置 DOM 打断 IME 合成，故改用 DOM 单向同步（审计 §19 富文本专项；源码锁定向测试锁定 renderer 目录零响应式 HTML 绑定）
  // 外部值（schema 导入/服务端回流）可能未经消毒，写入前一律过白名单（自产值幂等，开销可忽略）
  watch(
    [elRef, content],
    ([el, val]) => {
      if (!el) return
      if (el.innerHTML === val) {
        lastEmitted = val
        return
      }
      if (val === lastEmitted) return
      el.innerHTML = sanitizeHTML(val)
      lastEmitted = val
    },
    { flush: 'post' },
  )

  /** 从 DOM 取消毒后内容 emit 给父层（写入 modelValue 的唯一出口） */
  function syncFromDom(): void {
    const el = elRef.value
    if (!el) return
    const html = sanitizeHTML(el.innerHTML)
    lastEmitted = html
    emit('update:modelValue', html)
  }

  function onInput(): void {
    if (composing.value) return
    syncFromDom()
  }

  function onCompositionStart(): void {
    composing.value = true
  }

  function onCompositionEnd(): void {
    composing.value = false
    syncFromDom()
  }

  /** 粘贴消毒：富文本剪贴板先过白名单再插入（默认插入的是原始 HTML，事件属性在随后消毒前就会触发） */
  function onPaste(e: ClipboardEvent): void {
    const raw = e.clipboardData?.getData('text/html')
    if (!raw) return
    e.preventDefault()
    const clean = sanitizeHTML(raw)
    const sel = window.getSelection()
    const el = elRef.value
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
    syncFromDom()
  }

  /** 执行编辑命令。execCommand 已被标准废弃但仍是免依赖方案：失效时只告警一次，不让工具栏点击抛错 */
  function exec(cmd: string, val?: string, opts?: RichtextExecOptions): void {
    const el = elRef.value
    if (!el) return
    el.focus()
    try {
      if (typeof document.execCommand !== 'function') {
        warnOnce('richtext-execcommand', '[FormRenderer] document.execCommand 不可用，富文本工具栏在此环境已失效')
        return
      }
      if (opts?.css) document.execCommand('styleWithCSS', false, 'true')
      document.execCommand(cmd, false, val)
      if (opts?.css) document.execCommand('styleWithCSS', false, 'false')
      // 手动同步（execCommand 不触发 input 事件）
      syncFromDom()
    } catch (e) {
      warnOnce('richtext-execcommand', '[FormRenderer] 富文本命令执行失败: ' + String(e))
    }
  }

  /** 记录当前编辑器内选区（面板输入框抢焦点前调用） */
  function saveSelection(): void {
    const el = elRef.value
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (el.contains(range.commonAncestorContainer)) savedRange = range.cloneRange()
  }

  /** 恢复此前保存的选区；无保存记录或选区已随 DOM 重写失效时仅聚焦编辑器（光标落默认位置） */
  function restoreSelection(): void {
    const el = elRef.value
    if (!el) return
    el.focus()
    if (!savedRange || !savedRange.startContainer.isConnected) return
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(savedRange)
  }

  /** execCommand 后选区收缩于新链接内，向上找 a 补 target（消毒器会在导出时补 rel） */
  function markLinkTarget(): void {
    const el = elRef.value
    if (!el) return
    let node: Node | null = window.getSelection()?.anchorNode ?? null
    while (node && el.contains(node)) {
      if (node instanceof HTMLAnchorElement) {
        node.setAttribute('target', '_blank')
        syncFromDom()
        return
      }
      node = node.parentNode
    }
  }

  /** 插入/更新链接：有选区走 createLink（保留选中文本），否则插入纯链接文本 */
  function applyLink(url: string, newTab: boolean): void {
    if (!url) return
    restoreSelection()
    if (savedRange && !savedRange.collapsed) {
      exec('createLink', url)
      if (newTab) markLinkTarget()
    } else {
      const attrs = `href="${escapeHtml(url)}"${newTab ? ' target="_blank"' : ''}`
      exec('insertHTML', `<a ${attrs}>${escapeHtml(url)}</a>`)
    }
  }

  function insertImage(src: string): void {
    restoreSelection()
    exec('insertHTML', `<img src="${escapeHtml(src)}" alt="">`)
  }

  function insertTable(): void {
    restoreSelection()
    exec('insertHTML', TABLE_HTML)
  }

  /** 行内代码：取选区纯文本包 <code>（execCommand 无对应命令） */
  function applyInlineCode(): void {
    const text = window.getSelection()?.toString() ?? ''
    if (!text) return
    exec('insertHTML', `<code>${escapeHtml(text)}</code>`)
  }

  return {
    plainTextLength,
    content,
    syncFromDom,
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
  }
}
