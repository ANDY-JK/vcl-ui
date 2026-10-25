/**
 * useRichtext.ts 的工具栏命令与选区生命周期 —— 此前只有「源码锁 + 挂载行为」两类测试
 *
 * ## 为什么补（单文件口径 语句 64.2% / 分支 48.4%，34/106 行未覆盖）
 *
 * 既有 `richtext-xss.spec.ts` 是**集成级**：走 FormRenderer 挂载、锁零 v-html、
 * 验证外部赋值消毒 / 粘贴消毒 / IME 合成不 emit。它做得很好，但 composable 里
 * 一整块「工具栏命令 + 选区」代码完全没被测过：
 *
 *   `exec` / `saveSelection` / `restoreSelection` / `markLinkTarget` /
 *   `applyLink` / `insertImage` / `insertTable` / `applyInlineCode` / `onPaste` 的选区分支
 *
 * 这些正是**用户点工具栏时会跑的路径**，而且是最容易崩的一类：
 *
 * ① **选区生命周期**：面板输入框（链接 URL / 图片地址）抢焦点后，原选区作废。
 *    `saveSelection` 存、`restoreSelection` 取，取不到就只能聚焦编辑器。
 *    链接有选区时走 `createLink`（保留选中文本），无选区时走 `insertHTML`（插纯链接文本）——
 *    两条分支产物完全不同。
 * ② **`markLinkTarget` 的向上遍历**：`execCommand('createLink')` 后选区收缩在新 `<a>` 内，
 *    要向上找祖先锚点补 `target="_blank"`；找不到就必须原样退出（不能死循环）。
 * ③ **`execCommand` 已废弃**：环境不支持时只告警一次、不抛错，工具栏点击不能炸。
 *    命令抛错（某些浏览器对非法参数抛异常）同样只告警一次。
 * ④ **粘贴的选区分支**：光标在编辑器内 → 用 Range 在原位插入；
 *    否则（无选区/选区在编辑器外）→ 退化到 `insertAdjacentHTML('beforeend')`。
 * ⑤ **行内代码的取值口径**：`execCommand` 无对应命令，取选区纯文本包 `<code>`；
 *    必须 `escapeHtml`，否则选中 `a & b` 会插出坏 HTML。
 *
 * ## happy-dom 能力（实测，决定写法）
 *
 * - Selection/Range **完整可用**：`addRange` / `cloneRange` / `collapsed` /
 *   `startContainer.isConnected` / `deleteContents` / `collapse` / `removeAllRanges` /
 *   `createContextualFragment` 全部真实工作 → 选区路径可以真跑，不需要假 Selection。
 * - **`document.execCommand` 是 `undefined`** → 主路径必须 stub；
 *   而「不支持」这条分支反而是**默认真实可达**的。
 * - `ref()` 包装 DOM 后 `contains` / `focus` / `innerHTML` 读写全部正常（身份也保留），
 *   故用 `ref` 与生产（模板 ref）口径一致，无需 `shallowRef` 规避。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRichtextEditor } from '@/components/form-builder/renderer/useRichtext'
import { setRuntimeObserver } from '@/components/_internal/runtime-observer'
import { sanitizeHTML } from '@/components/_internal/sanitize'

let warns: string[] = []

beforeEach(() => {
  warns = []
  setRuntimeObserver({ warn: (...args: unknown[]) => void warns.push(args.map(String).join(' ')) })
})

afterEach(() => {
  setRuntimeObserver(null)
  delete (document as unknown as { execCommand?: unknown }).execCommand
  document.body.innerHTML = ''
})

interface Ctx {
  el: HTMLElement
  elRef: ReturnType<typeof ref<HTMLElement | null>>
  model: ReturnType<typeof ref<unknown>>
  emitted: unknown[]
  api: ReturnType<typeof useRichtextEditor>
  /** 本次 execCommand 调用序列 */
  execCalls: Array<{ cmd: string; ui: boolean; val?: string }>
}

/** 造一个真实挂载的 contenteditable + composable；execCommand 默认保持 happy-dom 的原生缺失态 */
function setup(initial = '<p>正文</p>', opts: { stubExec?: boolean; onExec?: (cmd: string, val?: string) => void } = {}): Ctx {
  const el = document.createElement('div')
  el.contentEditable = 'true'
  el.innerHTML = initial
  document.body.appendChild(el)

  const elRef = ref<HTMLElement | null>(null)
  const model = ref<unknown>(initial)
  const emitted: unknown[] = []
  const api = useRichtextEditor(elRef, model, (_e, v) => void emitted.push(v))

  const execCalls: Array<{ cmd: string; ui: boolean; val?: string }> = []
  if (opts.stubExec !== false) {
    ;(document as unknown as { execCommand: unknown }).execCommand = (cmd: string, ui: boolean, val?: string) => {
      execCalls.push({ cmd, ui, val })
      opts.onExec?.(cmd, val)
      return true
    }
  }

  elRef.value = el
  return { el, elRef, model, emitted, api, execCalls }
}

/** 在编辑器内选中 [start,end) 字符（真 Range，走 happy-dom 的真实实现） */
function selectIn(el: HTMLElement, start: number, end: number, node?: Node): Range {
  const target = node ?? el.firstChild!.firstChild!
  const r = document.createRange()
  r.setStart(target, start)
  r.setEnd(target, end)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(r)
  return r
}

const clearSel = () => window.getSelection()!.removeAllRanges()

/* ═══════════ ① syncFromDom / onInput 的守卫 ═══════════ */

describe('syncFromDom 守卫', () => {
  it('**没有元素 → 不 emit、不抛错**', () => {
    const elRef = ref<HTMLElement | null>(null)
    const emitted: unknown[] = []
    const api = useRichtextEditor(elRef, ref(''), (_e, v) => void emitted.push(v))
    expect(() => api.syncFromDom()).not.toThrow()
    expect(emitted).toHaveLength(0)
  })

  it('**有元素 → emit 消毒后的 DOM 内容**', () => {
    const c = setup('<p>正文</p>')
    c.el.innerHTML = '<p>正文</p><script>alert(1)</script>'
    c.api.syncFromDom()
    expect(c.emitted, 'script 被剥离').toEqual([sanitizeHTML('<p>正文</p><script>alert(1)</script>')])
    expect(String(c.emitted[0])).not.toContain('script')
  })

  it('**composing 期间 onInput 不 emit，compositionend 补一次**', () => {
    const c = setup('<p>正文</p>')
    c.api.onCompositionStart()
    c.el.innerHTML = '<p>拼音候选</p>'
    c.api.onInput()
    expect(c.emitted, '合成中不 emit').toHaveLength(0)
    c.el.innerHTML = '<p>你好</p>'
    c.api.onCompositionEnd()
    expect(c.emitted).toEqual(['<p>你好</p>'])
  })

  it('**非合成期 onInput 直接 emit**', () => {
    const c = setup('<p>正文</p>')
    c.el.innerHTML = '<p>追加</p>'
    c.api.onInput()
    expect(c.emitted).toEqual(['<p>追加</p>'])
  })
})

/* ═══════════ ② watch 回写守卫 ═══════════ */

describe('外部赋值回写守卫', () => {
  it('**DOM 已等于外部值 → 只记回声，不重写**', async () => {
    const c = setup('<p>正文</p>')
    c.model.value = '<p>正文</p>' // 与 DOM 相同
    await nextTick()
    expect(c.el.innerHTML).toBe('<p>正文</p>')
  })

  it('**外部值 ≠ 上次 emit → 写入并消毒**', async () => {
    const c = setup('<p>旧</p>')
    c.model.value = '<img src="x" onerror="alert(1)"><p>外部</p>'
    await nextTick()
    expect(c.el.innerHTML).not.toContain('onerror')
    expect(c.el.innerHTML).toContain('<p>外部</p>')
  })

  it('**外部值 === 上次 emit（自身回声）→ 不重写 DOM**', async () => {
    const c = setup('<p>正文</p>')
    c.el.innerHTML = '<p>用户输入</p>'
    c.api.syncFromDom() // lastEmitted = '<p>用户输入</p>'
    expect(c.emitted.at(-1)).toBe('<p>用户输入</p>')
    // 父层 v-model 回流同一字符串：DOM 必须保持用户编辑结果，不被重设
    c.model.value = '<p>用户输入</p>'
    await nextTick()
    expect(c.el.innerHTML).toBe('<p>用户输入</p>')
  })
})

/* ═══════════ ③ exec ═══════════ */

describe('exec', () => {
  it('**没有元素 → 直接返回**', () => {
    const elRef = ref<HTMLElement | null>(null)
    const emitted: unknown[] = []
    const api = useRichtextEditor(elRef, ref(''), (_e, v) => void emitted.push(v))
    api.exec('bold')
    expect(emitted).toHaveLength(0)
  })

  it('**execCommand 不可用（happy-dom 默认）→ 前置检测告警、不抛错、不 emit**', () => {
    const c = setup('<p>正文</p>', { stubExec: false })
    expect(() => c.api.exec('bold')).not.toThrow()
    expect(c.emitted, '命令没执行就不该同步').toHaveLength(0)
    // 必须走「不可用」前置检测，而不是等到 TypeError 再被 catch 兜住：
    // 两条路径的告警文案不同，此处钉死前者（warnOnce 全局去重，断言只能放在首条用例里）
    expect(warns.join('\n'), '给出可诊断的告警').toContain('execCommand')
    expect(warns.join('\n'), '走的是前置检测而非 catch 兜底').toContain('不可用')
    expect(warns.join('\n'), '不能等到抛错才降级').not.toContain('执行失败')
  })

  it('**正常路径：调 execCommand 并手动同步（execCommand 不触发 input）**', () => {
    const c = setup('<p>正文</p>')
    c.el.innerHTML = '<b>加粗</b>'
    c.api.exec('bold')
    expect(c.execCalls, '转发命令名与值').toEqual([{ cmd: 'bold', ui: false, val: undefined }])
    expect(c.emitted, 'execCommand 不触发 input，必须手动同步').toEqual(['<b>加粗</b>'])
  })

  it('**css=true → styleWithCSS 用完即还原**（不污染后续 b/i 标签命令）', () => {
    const c = setup('<p>正文</p>')
    c.api.exec('foreColor', '#dc2626', { css: true })
    expect(c.execCalls.map((x) => x.cmd)).toEqual(['styleWithCSS', 'foreColor', 'styleWithCSS'])
    expect(c.execCalls[0]!.val).toBe('true')
    expect(c.execCalls[1]!.val).toBe('#dc2626')
    expect(c.execCalls[2]!.val, '必须还原成 false').toBe('false')
  })

  it('**css 未传 → 不插入 styleWithCSS**', () => {
    const c = setup('<p>正文</p>')
    c.api.exec('bold')
    expect(c.execCalls.map((x) => x.cmd)).toEqual(['bold'])
  })

  it('**css=false 显式传 → 同样不插入**', () => {
    const c = setup('<p>正文</p>')
    c.api.exec('bold', undefined, { css: false })
    expect(c.execCalls.map((x) => x.cmd)).toEqual(['bold'])
  })

  it('**命令抛错 → 告警、不向上抛，且不 emit**', () => {
    const c = setup('<p>正文</p>')
    ;(document as unknown as { execCommand: unknown }).execCommand = () => {
      throw new Error('boom-unique-97')
    }
    expect(() => c.api.exec('bold')).not.toThrow()
    expect(c.emitted, '抛错后不应继续同步').toHaveLength(0)
    expect(warns.join('\n'), '带原始错误信息').toContain('boom-unique-97')
  })

  it('**执行前会聚焦编辑器**（工具栏点是 mousedown 抢焦点后的补救）', () => {
    const c = setup('<p>正文</p>')
    const focus = vi.spyOn(c.el, 'focus')
    c.api.exec('bold')
    expect(focus).toHaveBeenCalled()
  })
})

/* ═══════════ ④ execCommand 缺失只告警一次（独立模块实例，避免全局去重干扰） ═══════════ */

describe('execCommand 缺失告警只出一次', () => {
  it('**连续两次调用只产生 1 条告警**（warnOnce 去重）', async () => {
    vi.resetModules()
    const captured: string[] = []
    const obs = await import('@/components/_internal/runtime-observer')
    obs.setRuntimeObserver({ warn: (...a: unknown[]) => void captured.push(a.map(String).join(' ')) })
    const fresh = await import('@/components/form-builder/renderer/useRichtext')

    const el = document.createElement('div')
    el.innerHTML = '<p>x</p>'
    document.body.appendChild(el)
    const elRef = fresh !== null ? ref<HTMLElement | null>(null) : ref(null)
    const api = fresh.useRichtextEditor(elRef, ref(''), () => {})
    elRef.value = el
    // 保证 execCommand 确实缺失
    delete (document as unknown as { execCommand?: unknown }).execCommand

    api.exec('bold')
    api.exec('italic')
    api.exec('underline')
    expect(captured, '同一消息只警示一次，不刷屏').toHaveLength(1)
    obs.setRuntimeObserver(null)
  })
})

/* ═══════════ ⑤ onPaste 的两条插入分支 ═══════════ */

function pasteEvent(html: string | null): Event {
  const ev = new Event('paste', { cancelable: true })
  Object.defineProperty(ev, 'clipboardData', {
    value: { getData: (t: string) => (t === 'text/html' && html !== null ? html : '') },
  })
  return ev
}

describe('onPaste', () => {
  it('**没有 text/html → 不 preventDefault、不改内容**（纯文本粘贴交回浏览器）', () => {
    const c = setup('<p>正文</p>')
    const ev = pasteEvent(null)
    c.api.onPaste(ev as ClipboardEvent)
    expect(ev.defaultPrevented).toBe(false)
    expect(c.el.innerHTML).toBe('<p>正文</p>')
    expect(c.emitted).toHaveLength(0)
  })

  it('**光标在编辑器内 → Range 原位插入消毒内容**', () => {
    const c = setup('<p>AB</p>')
    selectIn(c.el, 1, 1) // 光标在 A 与 B 之间
    const ev = pasteEvent('<b>加粗</b><img src=x onerror=alert(1)>')
    c.api.onPaste(ev as ClipboardEvent)
    expect(ev.defaultPrevented).toBe(true)
    expect(c.el.innerHTML).not.toContain('onerror')
    expect(c.el.innerHTML).toContain('<b>加粗</b>')
    expect(c.el.innerHTML, '插入在光标处而非末尾').toContain('A<b>加粗</b>')
  })

  // 注：`sel.removeAllRanges(); sel.addRange(range)` 在本环境（以及 range 即选区自身 range 的
  // 浏览器里）是**冗余**的 —— 实测 `window.getSelection().getRangeAt(0) === range`，
  // 直接改动该 range（deleteContents/collapse/insertNode）选区就跟着变。
  // 负向对照探针「onPaste 不恢复选区」因此杀不死，属已实证的行为等价，不是漏测。
  it('**Range 插入后选区收缩到插入内容之后**（继续输入不会插到前面）', () => {
    const c = setup('<p>AB</p>')
    selectIn(c.el, 1, 1)
    c.api.onPaste(pasteEvent('<i>i</i>') as ClipboardEvent)
    const sel = window.getSelection()!
    expect(sel.rangeCount, '选区已恢复').toBe(1)
    expect(sel.getRangeAt(0).collapsed, '收缩为光标').toBe(true)
  })

  it('**无选区 → 退化到末尾插入**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.onPaste(pasteEvent('<b>尾巴</b>') as ClipboardEvent)
    expect(c.el.innerHTML).toContain('<b>尾巴</b>')
    expect(c.emitted.at(-1), '插入后同步').toBe(sanitizeHTML('<p>正文</p><b>尾巴</b>'))
  })

  it('**选区在编辑器之外 → 也走末尾插入**（不把内容插到别的字段里）', () => {
    const other = document.createElement('p')
    other.textContent = '别的元素'
    document.body.appendChild(other)
    const c = setup('<p>正文</p>')
    selectIn(other, 0, 2, other.firstChild!) // 选区落在编辑器外
    c.api.onPaste(pasteEvent('<b>尾巴</b>') as ClipboardEvent)
    expect(c.el.innerHTML).toContain('<b>尾巴</b>')
    expect(other.innerHTML, '别的元素未被污染').toBe('别的元素')
  })

  it('**Range 有选区（非折叠）→ 先 deleteContents 再插入**（替换选中文本）', () => {
    const c = setup('<p>ABCD</p>')
    selectIn(c.el, 1, 3) // 选中 BC
    c.api.onPaste(pasteEvent('<b>X</b>') as ClipboardEvent)
    expect(c.el.innerHTML).not.toContain('BC')
    expect(c.el.innerHTML).toContain('A')
    expect(c.el.innerHTML).toContain('<b>X</b>')
    expect(c.el.innerHTML).toContain('D')
  })
})

/* ═══════════ ⑥ saveSelection / restoreSelection ═══════════ */

describe('选区保存与恢复', () => {
  it('**没有元素 → saveSelection 静默返回**', () => {
    const elRef = ref<HTMLElement | null>(null)
    const api = useRichtextEditor(elRef, ref(''), () => {})
    expect(() => api.saveSelection()).not.toThrow()
  })

  it('**选区在编辑器内 → 被保存；恢复后能命中**（通过 applyLink 的 createLink 分支验证）', () => {
    const c = setup('<p>hello world</p>')
    selectIn(c.el, 0, 5) // 选中 hello
    c.api.saveSelection()
    clearSel() // 模拟面板输入框抢走焦点
    c.api.applyLink('https://example.com', false)
    expect(c.execCalls[0], '有非折叠选区 → 走 createLink').toEqual({
      cmd: 'createLink',
      ui: false,
      val: 'https://example.com',
    })
  })

  it('**选区在编辑器外 → 不保存**（恢复后无法 createLink，退化到 insertHTML）', () => {
    const other = document.createElement('p')
    other.textContent = '外部文本'
    document.body.appendChild(other)
    const c = setup('<p>正文</p>')
    selectIn(other, 0, 2, other.firstChild!)
    c.api.saveSelection()
    clearSel()
    c.api.applyLink('https://example.com', false)
    expect(c.execCalls[0]!.cmd, '没有可用选区 → insertHTML').toBe('insertHTML')
  })

  it('**rangeCount=0 → saveSelection 静默返回**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    expect(() => c.api.saveSelection()).not.toThrow()
    c.api.applyLink('https://example.com', false)
    expect(c.execCalls[0]!.cmd, '无选区 → insertHTML').toBe('insertHTML')
  })

  it('**保存的选区已断开连接 → addRange 被跳过**（isConnected 守卫生效）', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 0, 5)
    c.api.saveSelection()
    clearSel()
    // 把编辑器整体摘出文档：保存的 range 所在容器 isConnected 变 false
    document.body.removeChild(c.el)
    c.api.applyLink('https://example.com', false)
    expect(window.getSelection()!.rangeCount, 'isConnected=false 时不 addRange').toBe(0)
    // ⚠️ 但分支判定只看 savedRange.collapsed，不看连接性 —— 命令仍然发的是 createLink。
    // 生产后果：面板抢焦点后若 DOM 被重写，createLink 会作用在过期选区上（可能落在错误位置）。
    // 如实钉死现状，作为 P3 记录（修复：把连接性一并纳入分支判定）。
    expect(c.execCalls[0]!.cmd, '失效选区仍走了 createLink（现状）').toBe('createLink')
  })

  it('**恢复选区会重新 addRange**（restoreSelection 的 addRange 分支）', () => {
    const c = setup('<p>hello world</p>')
    selectIn(c.el, 0, 5)
    c.api.saveSelection()
    clearSel()
    expect(window.getSelection()!.rangeCount).toBe(0)
    c.api.applyLink('https://example.com', false)
    // createLink 之后 restoreSelection 应已把保存的 range 放回
    expect(window.getSelection()!.rangeCount, '选区已恢复').toBe(1)
  })
})

/* ═══════════ ⑦ markLinkTarget ═══════════ */

describe('markLinkTarget', () => {
  it('**newTab=true 且选区落在新建的 <a> 内 → 补 target=_blank**', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 0, 5)
    c.api.saveSelection()
    clearSel()
    // 模拟 execCommand('createLink') 的真实效果：把选中文本包成 <a> 并把光标放进锚点内
    c.execCalls.length = 0
    ;(document as unknown as { execCommand: unknown }).execCommand = (cmd: string, ui: boolean, val?: string) => {
      c.execCalls.push({ cmd, ui, val })
      if (cmd === 'createLink') {
        const a = document.createElement('a')
        a.setAttribute('href', String(val))
        a.textContent = 'hello'
        c.el.innerHTML = '<p></p>'
        c.el.firstChild!.appendChild(a)
        selectIn(c.el, 1, 1, a.firstChild!) // 光标在锚点文本内
      }
      return true
    }
    const before = c.emitted.length
    c.api.applyLink('https://example.com', true)
    const anchor = c.el.querySelector('a')!
    expect(c.emitted.length - before, '有锚点：exec + markLinkTarget 共 2 次同步').toBe(2)
    expect(anchor.getAttribute('target'), '已补 _blank').toBe('_blank')
    expect(c.emitted.at(-1), '补 target 后同步').toContain('target="_blank"')
  })

  it('**newTab=false → 不去补 target**', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 0, 5)
    c.api.saveSelection()
    clearSel()
    c.api.applyLink('https://example.com', false)
    expect(c.execCalls.map((x) => x.cmd), '只调 createLink').toEqual(['createLink'])
  })

  it('**选区祖先链里没有 <a> → 静默退出，不 emit**', () => {
    const c = setup('<p>hello</p>', {
      onExec: () => {
        // 光标仍在 <p> 文本里，不含锚点
        selectIn(c.el, 1, 1)
      },
    })
    selectIn(c.el, 0, 5)
    c.api.saveSelection()
    clearSel()
    const before = c.emitted.length
    c.api.applyLink('https://example.com', true)
    // exec() 自己会同步一次（execCommand 不触发 input），markLinkTarget 找到锚点时会**再**同步一次。
    // 故此处恰好 +1；下面「补 target」用例是 +2 —— 差值就是 markLinkTarget 内部那次同步。
    expect(c.emitted.length - before, '无锚点：只有 exec 的 1 次同步').toBe(1)
    expect(c.el.querySelector('a')).toBeNull()
  })

  it('**祖先链遍历会一路向上找到深层锚点**（文本节点 → a）', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 0, 5)
    c.api.saveSelection()
    clearSel()
    ;(document as unknown as { execCommand: unknown }).execCommand = (cmd: string, _ui: boolean, val?: string) => {
      if (cmd === 'createLink') {
        // 嵌套结构：a > span > text，光标在最深文本节点 → 必须向上穿过 span 才找到 a
        const a = document.createElement('a')
        a.setAttribute('href', String(val))
        const span = document.createElement('span')
        span.textContent = 'deep'
        a.appendChild(span)
        c.el.innerHTML = '<p></p>'
        c.el.firstChild!.appendChild(a)
        selectIn(c.el, 2, 2, span.firstChild!)
      }
      return true
    }
    c.api.applyLink('https://example.com', true)
    expect(c.el.querySelector('a')!.getAttribute('target'), '穿过 span 找到了 a').toBe('_blank')
  })

  it('**编辑器在"保存选区"之后被卸载 → markLinkTarget 的 el 守卫兜住**', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 0, 5)
    c.api.saveSelection() // savedRange 已是非折叠
    // 面板确认前编辑器被卸载（条件渲染切换）：elRef 变 null
    c.elRef.value = null
    const before = c.emitted.length
    expect(() => c.api.applyLink('https://example.com', true), '不能因卸载就抛错').not.toThrow()
    // restoreSelection / exec / markLinkTarget 三层 el 守卫依次兜住：
    // 没有元素 → 不聚焦、不发命令、不去找锚点，因此没有任何新 emit
    expect(c.emitted.length - before, '三层守卫全部静默返回').toBe(0)
    expect(c.execCalls, 'el 为 null 时 exec 提前返回，不调 execCommand').toHaveLength(0)
  })

  it('**没有元素时 applyLink 不抛错**（锚点遍历的 el 守卫）', () => {
    const elRef = ref<HTMLElement | null>(null)
    const api = useRichtextEditor(elRef, ref(''), () => {})
    ;(document as unknown as { execCommand: unknown }).execCommand = () => true
    expect(() => api.applyLink('https://example.com', true)).not.toThrow()
  })
})

/* ═══════════ ⑧ applyLink 的两条产物分支 ═══════════ */

describe('applyLink', () => {
  it('**url 为空 → 不执行任何命令**', () => {
    const c = setup('<p>正文</p>')
    c.api.applyLink('', false)
    expect(c.execCalls).toHaveLength(0)
  })

  it('**无选区 → insertHTML 纯链接文本**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.applyLink('https://example.com', false)
    expect(c.execCalls).toEqual([
      { cmd: 'insertHTML', ui: false, val: '<a href="https://example.com">https://example.com</a>' },
    ])
  })

  it('**无选区 + newTab → 链接带 target=_blank**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.applyLink('https://example.com', true)
    expect(c.execCalls[0]!.val).toBe('<a href="https://example.com" target="_blank">https://example.com</a>')
  })

  it('**url 含引号/尖括号 → 转义后才进属性与文本**（防属性逃逸）', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.applyLink('https://x/"><script>alert(1)</script>', false)
    const html = String(c.execCalls[0]!.val)
    expect(html, '不产生可执行的 script 标签').not.toContain('<script>')
    expect(html, '双引号被转义').toContain('&quot;')
    expect(html).toContain('&lt;script&gt;')
  })

  it('**url 含 & 与单引号 → 也转义**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.applyLink("https://x/?a=1&b='q'", false)
    const html = String(c.execCalls[0]!.val)
    expect(html).toContain('&amp;')
    expect(html).toContain('&#39;')
  })
})

/* ═══════════ ⑨ insertImage / insertTable ═══════════ */

describe('insertImage 与 insertTable', () => {
  it('**insertImage → insertHTML img，src 转义**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.insertImage('https://x/a.png')
    expect(c.execCalls[0]).toEqual({ cmd: 'insertHTML', ui: false, val: '<img src="https://x/a.png" alt="">' })
  })

  it('**insertImage 的 src 含引号 → 转义**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.insertImage('x"onerror="alert(1)')
    const html = String(c.execCalls[0]!.val)
    expect(html, '不能逃出 src 属性').not.toContain('onerror="alert(1)"')
    expect(html).toContain('&quot;')
  })

  it('**insertTable → 3×3 空白表格 + 末尾段落**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.insertTable()
    const val = String(c.execCalls[0]!.val)
    expect(c.execCalls[0]!.cmd).toBe('insertHTML')
    expect((val.match(/<tr>/g) ?? []).length, '3 行').toBe(3)
    expect((val.match(/<td>&nbsp;<\/td>/g) ?? []).length, '9 个单元格').toBe(9)
    expect(val, '末尾补段落防光标困在表格里').toMatch(/<\/table><p><br><\/p>$/)
  })

  it('**insertTable 前会先恢复选区**（有保存选区时）', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 0, 3)
    c.api.saveSelection()
    clearSel()
    c.api.insertTable()
    expect(window.getSelection()!.rangeCount, '选区已恢复').toBe(1)
  })
})

/* ═══════════ ⑩ applyInlineCode ═══════════ */

describe('applyInlineCode', () => {
  it('**无选区文本 → 不插入**', () => {
    const c = setup('<p>正文</p>')
    clearSel()
    c.api.applyInlineCode()
    expect(c.execCalls).toHaveLength(0)
  })

  it('**选中的纯文本 → 包 <code> 插入**', () => {
    const c = setup('<p>npm run build</p>')
    selectIn(c.el, 0, 13)
    c.api.applyInlineCode()
    expect(c.execCalls).toEqual([{ cmd: 'insertHTML', ui: false, val: '<code>npm run build</code>' }])
  })

  it('**选中文本含 & 与 < → 转义后插入**（否则插出坏 HTML）', () => {
    const c = setup('<p>a &amp; b &lt;tag&gt;</p>')
    const textNode = c.el.firstChild!.firstChild!
    selectIn(c.el, 0, textNode.textContent!.length, textNode)
    c.api.applyInlineCode()
    const val = String(c.execCalls[0]!.val)
    expect(val).toBe('<code>a &amp; b &lt;tag&gt;</code>')
    expect(val, '不产生裸 & 或 <').not.toMatch(/&(?!amp;|lt;|gt;|quot;|#39;)/)
  })

  it('**折叠选区（光标无选中）→ 不插入**', () => {
    const c = setup('<p>正文</p>')
    selectIn(c.el, 1, 1)
    c.api.applyInlineCode()
    expect(c.execCalls).toHaveLength(0)
  })
})

/* ═══════════ ⑫ 负向对照加固（第一轮 12 条存活的补断言） ═══════════ */

describe('负向对照加固', () => {
  it('**回声守卫：DOM 与外部值不同但等于上次 emit → 不重写 DOM**', async () => {
    // 区分「syncFromDom 记下 lastEmitted」这一层：
    // 若 syncFromDom 不记回声，则下面的外部赋值会覆盖掉 DOM 里的新内容
    const c = setup('<p>原文</p>')
    c.api.syncFromDom() // lastEmitted = '<p>原文</p>'
    c.el.innerHTML = '<p>用户又改了</p>' // DOM 被用户改动（与 lastEmitted 不同）
    // 父层把同一个旧值回流回来：DOM 已是新内容，不等于 val，只能靠 lastEmitted 挡住
    c.model.value = '<p>原文</p>'
    await nextTick()
    expect(c.el.innerHTML, '回声不该覆盖用户的新输入').toBe('<p>用户又改了</p>')
  })

  it('**DOM 相等守卫走捷径：外部值等于 DOM 时不再重走白名单**', async () => {
    // 实测：happy-dom 重写「同内容」innerHTML 不会破坏选区（rangeCount/offset 都不变），
    // 所以「选区是否保住」在这个环境里**无法分辨**这两条分支。
    // 可分辨的观测量是：捷径命中时不调用 sanitizeHTML。
    const c = setup('<p>x</p>')
    const dirty = '<p onmouseover="evil()">x</p>'
    c.el.innerHTML = dirty // 模拟宿主直写 DOM 且内容等于即将赋的值
    c.model.value = dirty
    await nextTick()
    expect(c.el.innerHTML, '捷径命中 → 原样保留（未重新消毒）').toBe(dirty)

    // 反证：值一不同就走写入路径，白名单立刻生效 → 证明上一条的「保留」确实是捷径所致
    c.model.value = '<p onmouseover="evil()">y</p>'
    await nextTick()
    expect(c.el.innerHTML, '走写入路径时属性被剥离').not.toContain('onmouseover')
    expect(c.el.innerHTML).toContain('y')
  })

  it('**粘贴后 collapse(false) → 第二次粘贴接在第一段之后**（collapse 方向可观测）', () => {
    const c = setup('<p>AB</p>')
    selectIn(c.el, 1, 1)
    c.api.onPaste(pasteEvent('<b>1</b>') as ClipboardEvent)
    c.api.onPaste(pasteEvent('<i>2</i>') as ClipboardEvent)
    const html = c.el.innerHTML
    expect(html, '两段都在').toContain('<b>1</b>')
    expect(html, '两段都在').toContain('<i>2</i>')
    expect(html.indexOf('<b>1</b>'), '第二段接在第一段之后（collapse(false)）').toBeLessThan(html.indexOf('<i>2</i>'))
  })

  it('**saveSelection 存的是克隆：活选区被折叠后仍能走 createLink**', () => {
    const c = setup('<p>hello world</p>')
    const live = selectIn(c.el, 0, 5)
    c.api.saveSelection()
    live.collapse(true) // 面板抢焦点时浏览器把活选区折叠掉
    clearSel()
    c.api.applyLink('https://example.com', false)
    expect(c.execCalls[0]!.cmd, '克隆保住了 0..5 的非折叠状态').toBe('createLink')
  })

  it('**恢复选区会聚焦编辑器**（restoreSelection 的 el.focus）', () => {
    const c = setup('<p>hello</p>')
    const focus = vi.spyOn(c.el, 'focus')
    c.api.insertTable() // restoreSelection 聚焦 1 次 + exec 聚焦 1 次
    expect(focus.mock.calls.length, 'restoreSelection 与 exec 各聚焦一次').toBe(2)
  })

  it('**insertImage 也先恢复选区**（有保存选区时聚焦两次）', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 0, 3)
    c.api.saveSelection()
    clearSel()
    const focus = vi.spyOn(c.el, 'focus')
    c.api.insertImage('https://x/a.png')
    expect(focus.mock.calls.length, 'restoreSelection + exec').toBe(2)
    expect(window.getSelection()!.rangeCount, '保存的选区已放回').toBe(1)
  })

  it('**markLinkTarget 的向上游走有边界：编辑器外层的 <a> 不被改**', () => {
    // 把编辑器包进一个外层 <a>：无边界遍历会一路走到它并误加 target
    const outer = document.createElement('a')
    outer.setAttribute('href', 'https://outer.example')
    document.body.appendChild(outer)
    const c = setup('<p>hello</p>')
    outer.appendChild(c.el) // el 的父级变成外层 <a>
    selectIn(c.el, 0, 5)
    c.api.saveSelection()
    clearSel()
    c.api.applyLink('https://example.com', true)
    expect(outer.getAttribute('target'), '编辑器外的锚点不该被碰').toBeNull()
    expect(outer.parentElement, '外层锚点仍在文档里').toBe(document.body)
  })

  it('**applyLink 的保存选区已折叠 → 走 insertHTML 而非 createLink**', () => {
    const c = setup('<p>hello</p>')
    selectIn(c.el, 3, 3) // 折叠光标（无选中文本）
    c.api.saveSelection()
    clearSel()
    c.api.applyLink('https://example.com', false)
    expect(c.execCalls[0]!.cmd, '折叠选区插纯链接文本').toBe('insertHTML')
  })
})

/* ═══════════ ⑪ 计算属性 ═══════════ */

describe('content / plainTextLength', () => {
  it('**非字符串 modelValue → content 归一为空串**', () => {
    const elRef = ref<HTMLElement | null>(null)
    const api = useRichtextEditor(elRef, ref(123), () => {})
    expect(api.content.value).toBe('')
  })

  it('**plainTextLength 与校验器同口径（trim 后计数）**', () => {
    const elRef = ref<HTMLElement | null>(null)
    const model = ref<unknown>('<p>  ab  </p>')
    const api = useRichtextEditor(elRef, model, () => {})
    expect(api.plainTextLength.value, '标签剥离 + trim').toBe(2)
    model.value = '<p>&nbsp;</p>'
    expect(api.plainTextLength.value, '空白实体不计长度').toBe(0)
  })

  it('**null / undefined → content 空串、长度 0**', () => {
    const elRef = ref<HTMLElement | null>(null)
    const model = ref<unknown>(null)
    const api = useRichtextEditor(elRef, model, () => {})
    expect(api.content.value).toBe('')
    expect(api.plainTextLength.value).toBe(0)
  })
})