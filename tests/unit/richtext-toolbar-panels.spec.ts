/**
 * RichtextToolbar.vue — 富文本工具栏（503 行）深挖
 *
 * ## 为什么补（单文件口径 语句 71.7% / 分支 87.6% / **函数 40.7%**，46 行未覆盖）
 *
 * 既有 2 个 spec 都走 `FormRenderer` 集成路径，覆盖的是「按钮点了命令对不对」；
 * 剩下整层没被驱动的是**插图/插链接这两条输入链**：
 *
 * ① `pickFile` —— 点击上传按钮必须真的触发隐藏 `<input type=file>`；
 * ② `imageFileError` —— 三道校验（**非图片 / 超 2MB / 通过**），且超限文案与非图片文案
 *    **必须不同**（否则用户不知道是格式还是体积被拒）；
 * ③ `onFileChange` —— **没选文件就返回**、**每次都要把 input.value 清空**
 *    （不清空则同一文件第二次选不触发 change）、校验失败只落错误不读文件；
 * ④ `readImageFile` —— FileReader 的 `onload`（字符串才 emit、非字符串静默）与
 *    `onerror`（落「读取失败」文案）**两条回调**，以及读成功后的表单复位；
 * ⑤ `confirmLink` / `normalizeUrl` —— `www.` 自动补 `https://`、非法协议不 emit、
 *    成功后排空表单并把 newTab 复位成 true；
 * ⑥ `confirmImage` —— `data:image` 超长度上限被拒、http(s) 放行、非法不 emit；
 * ⑦ `togglePanel` —— 同一按钮二次点击要关闭（emit null）而不是再打开；
 * ⑧ 面板互斥（color / link / image 只有一个在 DOM 里）、按钮 `is-active` 高亮、
 *    确认按钮 `disabled` 随校验态变化；预览中隐藏编辑按钮、全屏按钮文案随状态切换。
 *
 * ## harness
 *
 * 直接挂载本组件（props 全可控），按钮用 `aria-label` 定位（与既有 spec 同一约定）。
 * **FileReader 用可控替身**：happy-dom 的 FileReader 是异步真实现，既无法在测试里
 * 稳定控制「读到一半失败」，也没法断言 `readAsDataURL` 的调用参数；同时
 * `console.warn` 被 setup.ts 全局 spy，这里不额外制造新噪音类别。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import RichtextToolbar from '@/components/form-builder/renderer/RichtextToolbar.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

/* ═══════════ FileReader 替身 ═══════════ */

type FakeReader = { onload: null | (() => void); onerror: null | (() => void); result: unknown; url: string }

const fr = vi.hoisted(() => ({ instances: [] as FakeReader[], throwRead: false }))

class StubFileReader {
  onload: null | (() => void) = null
  onerror: null | (() => void) = null
  result: unknown = null
  url = ''
  constructor() {
    fr.instances.push(this as unknown as FakeReader)
  }
  readAsDataURL(file: { name?: string }) {
    if (fr.throwRead) throw new Error('read boom')
    this.url = `data:image/png;base64,${file?.name ?? 'x'}`
  }
}

function mountToolbar(props: Record<string, unknown> = {}) {
  return mount(RichtextToolbar, {
    props: { mode: 'full', panel: null, ...props },
    attachTo: document.body,
  })
}

/** aria-label 定位按钮（i18n 源文案，与既有 spec 同一约定） */
const btn = (w: ReturnType<typeof mountToolbar>, label: string) => w.find(`button[aria-label="${label}"]`)

const lastExec = (w: ReturnType<typeof mountToolbar>) => {
  const ev = w.emitted('exec')
  expect(ev, '至少 emit 过 exec').toBeTruthy()
  return ev![ev!.length - 1] as [string, string?, { css?: boolean }?]
}

/** 造一个 size/type 可控的 File（happy-dom 的 File 支持这两种入参） */
const makeFile = (name: string, type: string, size: number) => new File([new Uint8Array(Math.min(size, 8))], name, { type })
/** 需要「体积 > 2MB」时不必真分配 2MB，直接给 size 打补丁 */
const bigFile = (name: string, type: string) => {
  const f = makeFile(name, type, 4)
  Object.defineProperty(f, 'size', { value: 2 * 1024 * 1024 + 1 })
  return f
}

const fileInput = (w: ReturnType<typeof mountToolbar>) => w.find('input[type="file"]').element as HTMLInputElement

/** 模拟用户选择文件：给 input 挂 files 后触发 change */
async function chooseFile(w: ReturnType<typeof mountToolbar>, file: File | null) {
  const input = fileInput(w)
  Object.defineProperty(input, 'files', { value: file ? [file] : null, configurable: true, writable: true })
  await w.find('input[type="file"]').trigger('change')
  await flushPromises()
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null

beforeEach(() => {
  vi.stubGlobal('FileReader', StubFileReader)
})

afterEach(() => {
  fr.instances = []
  fr.throwRead = false
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/* ═══════════ ① simple / full 两档 ═══════════ */

describe('两档工具栏', () => {
  it('**simple 档只有基础命令，没有 full 档的链接/图片/预览**', async () => {
    const w = mountToolbar({ mode: 'simple' })
    await flushPromises()
    for (const l of [t('formBuilder.rtBold'), t('formBuilder.rtItalic'), t('formBuilder.rtUnderline')]) {
      expect(btn(w, l).exists(), `${l} 在 simple 档`).toBe(true)
    }
    expect(btn(w, t('formBuilder.rtH1')).exists(), 'simple 没有 H1').toBe(false)
    expect(btn(w, t('formBuilder.rtLink')).exists()).toBe(false)
    expect(btn(w, t('formBuilder.rtImage')).exists()).toBe(false)
    expect(btn(w, t('formBuilder.rtPreview')).exists()).toBe(false)
    w.unmount()
  })

  it('**simple 档点击 emit 正确的 exec 命令**', async () => {
    const w = mountToolbar({ mode: 'simple' })
    await flushPromises()
    await btn(w, t('formBuilder.rtBold')).trigger('click')
    expect(lastExec(w)).toEqual(['bold'])
    await btn(w, t('formBuilder.rtH4')).trigger('click')
    expect(lastExec(w)).toEqual(['formatBlock', '<h4>'])
    await btn(w, t('formBuilder.rtUl')).trigger('click')
    expect(lastExec(w)).toEqual(['insertUnorderedList'])
    w.unmount()
  })

  it('**full 档：编辑类按钮 emit 各自的命令**', async () => {
    const w = mountToolbar({ mode: 'full' })
    await flushPromises()
    const cases: Array<[string, unknown[]]> = [
      [t('formBuilder.rtUndo'), ['undo']],
      [t('formBuilder.rtRedo'), ['redo']],
      [t('formBuilder.rtH1'), ['formatBlock', '<h1>']],
      [t('formBuilder.rtQuote'), ['formatBlock', '<blockquote>']],
      [t('formBuilder.rtHr'), ['insertHorizontalRule']],
      [t('formBuilder.rtAlignCenter'), ['justifyCenter']],
      [t('formBuilder.rtClearFormat'), ['removeFormat']],
    ]
    for (const [label, expected] of cases) {
      await btn(w, label).trigger('click')
      expect(lastExec(w), label).toEqual(expected)
    }
    w.unmount()
  })

  it('**inline-code / table / unlink / 预览 / 全屏各自 emit 专用事件**', async () => {
    const w = mountToolbar({ mode: 'full' })
    await flushPromises()
    await btn(w, t('formBuilder.rtInlineCode')).trigger('click')
    await btn(w, t('formBuilder.rtTable')).trigger('click')
    await btn(w, t('formBuilder.rtUnlink')).trigger('click')
    await btn(w, t('formBuilder.rtPreview')).trigger('click')
    await btn(w, t('formBuilder.rtFullscreen')).trigger('click')
    expect(w.emitted('inline-code')).toBeTruthy()
    expect(w.emitted('table')).toBeTruthy()
    expect(w.emitted('unlink')).toBeTruthy()
    expect(w.emitted('toggle-preview')).toBeTruthy()
    expect(w.emitted('toggle-fullscreen')).toBeTruthy()
    w.unmount()
  })

  it('**剩余 full 档按钮逐一覆盖**（斜体/下划线/删除线/H2/H3/段落/两种列表/行内码/代码块/右对齐）', async () => {
    const w = mountToolbar({ mode: 'full' })
    await flushPromises()
    const cases: Array<[string, unknown[]]> = [
      [t('formBuilder.rtItalic'), ['italic']],
      [t('formBuilder.rtUnderline'), ['underline']],
      [t('formBuilder.rtStrike'), ['strikeThrough']],
      [t('formBuilder.rtH2'), ['formatBlock', '<h2>']],
      [t('formBuilder.rtH3'), ['formatBlock', '<h3>']],
      [t('formBuilder.rtParagraph'), ['formatBlock', '<p>']],
      [t('formBuilder.rtUl'), ['insertUnorderedList']],
      [t('formBuilder.rtOl'), ['insertOrderedList']],
      [t('formBuilder.rtCodeBlock'), ['formatBlock', '<pre>']],
      [t('formBuilder.rtAlignLeft'), ['justifyLeft']],
      [t('formBuilder.rtAlignRight'), ['justifyRight']],
    ]
    for (const [label, expected] of cases) {
      const b = btn(w, label)
      expect(b.exists(), `${label} 存在`).toBe(true)
      await b.trigger('click')
      expect(lastExec(w), label).toEqual(expected)
    }
    w.unmount()
  })

  it('**预览中隐藏编辑按钮，但保留预览/全屏**', async () => {
    const w = mountToolbar({ mode: 'full', previewing: true })
    await flushPromises()
    expect(btn(w, t('formBuilder.rtBold')).exists(), '预览中不显示加粗').toBe(false)
    expect(btn(w, t('formBuilder.rtLink')).exists()).toBe(false)
    expect(btn(w, t('formBuilder.rtPreview')).exists(), '预览按钮仍在').toBe(true)
    expect(btn(w, t('formBuilder.rtFullscreen')).exists(), '全屏按钮仍在').toBe(true)
    expect(btn(w, t('formBuilder.rtPreview')).classes().includes('is-active'), '预览按钮高亮').toBe(true)
    w.unmount()
  })

  it('**全屏态：按钮文案切换到「退出全屏」且高亮**', async () => {
    const w = mountToolbar({ mode: 'full', fullscreen: true })
    await flushPromises()
    expect(btn(w, t('formBuilder.rtFullscreen')).exists(), '不再显示「全屏」').toBe(false)
    const exit = btn(w, t('formBuilder.rtExitFullscreen'))
    expect(exit.exists(), '显示「退出全屏」').toBe(true)
    expect(exit.classes().includes('is-active'), '全屏按钮高亮').toBe(true)
    w.unmount()
  })
})

/* ═══════════ ② 面板互斥与开关 ═══════════ */

describe('面板开关', () => {
  it('**首次点击打开、再次点击关闭（emit null）**', async () => {
    const w = mountToolbar({ mode: 'full', panel: null })
    await flushPromises()
    await btn(w, t('formBuilder.rtColor')).trigger('click')
    expect(w.emitted('panel')![0]![0], '打开色板').toBe('color')

    // 父级回填 panel='color' 后再点同一按钮 → 应关闭
    await w.setProps({ panel: 'color' })
    await btn(w, t('formBuilder.rtColor')).trigger('click')
    expect(w.emitted('panel')!.at(-1)![0], '再点关闭').toBe(null)
    w.unmount()
  })

  it('**三个面板互斥：同一时刻只有一个在 DOM 里**', async () => {
    for (const [panel, sel] of [
      ['color', '.fb-rt-panel'],
      ['link', '.fb-rt-panel'],
      ['image', '.fb-rt-panel'],
    ] as const) {
      const w = mountToolbar({ mode: 'full', panel })
      await flushPromises()
      expect(document.querySelectorAll(sel).length, `panel=${panel} 只有一个面板`).toBe(1)
      w.unmount()
    }
    const w = mountToolbar({ mode: 'full', panel: null })
    await flushPromises()
    expect(q('.fb-rt-panel'), '无面板时不渲染').toBeNull()
    w.unmount()
  })

  it('**当前面板对应的按钮高亮**', async () => {
    const all = [
      ['color', t('formBuilder.rtColor')],
      ['link', t('formBuilder.rtLink')],
      ['image', t('formBuilder.rtImage')],
    ] as const
    for (const [panel, label] of all) {
      const w = mountToolbar({ mode: 'full', panel })
      await flushPromises()
      expect(btn(w, label).classes().includes('is-active'), `${panel} 按钮高亮`).toBe(true)
      // 互斥：其它两个必须不亮（只验「该亮的亮」抓不到恒真）
      for (const [other, otherLabel] of all) {
        if (other === panel) continue
        expect(btn(w, otherLabel).classes().includes('is-active'), `${other} 不该高亮`).toBe(false)
      }
      w.unmount()
    }
  })

  it('**取消按钮一律 emit panel(null)**', async () => {
    for (const panel of ['link', 'image'] as const) {
      const w = mountToolbar({ mode: 'full', panel })
      await flushPromises()
      const cancel = w.findAll('.fb-rt-panel-actions button').find((b) => b.text() === t('formBuilder.rtCancel'))
      expect(cancel, `${panel} 面板有取消`).toBeTruthy()
      await cancel!.trigger('click')
      expect(w.emitted('panel')!.at(-1)![0]).toBe(null)
      w.unmount()
    }
  })
})

/* ═══════════ ③ 色板 ═══════════ */

describe('色板面板', () => {
  it('**正文色 6 个 + 高亮色 4 个，点击都带 css:true**', async () => {
    const w = mountToolbar({ mode: 'full', panel: 'color' })
    await flushPromises()
    // ⚠️ 「去点»面板」按钮的 aria-label 恰好是色板按钮的前缀，必须按「后缀是 #hex」筛
    // 两组色板各自在一个 .fb-rt-panel-row 里（label 文案本身也是按钮，不能用后缀区分）
    const rows = w.findAll('.fb-rt-panel-row')
    expect(rows.length, '正文色 / 高亮两行').toBe(2)
    const textSwatches = rows[0]!.findAll('button')
    const hlSwatches = rows[1]!.findAll('button')
    expect(textSwatches.length, '正文色 6 个').toBe(6)
    expect(hlSwatches.length, '高亮色 4 个').toBe(4)

    await textSwatches[1]!.trigger('click')
    expect(lastExec(w), '正文色走 foreColor + css 选项').toEqual(['foreColor', '#dc2626', { css: true }])
    await hlSwatches[0]!.trigger('click')
    expect(lastExec(w), '高亮走 hiliteColor').toEqual(['hiliteColor', '#fef08a', { css: true }])
    w.unmount()
  })
})

/* ═══════════ ④ 链接面板 ═══════════ */

describe('链接面板', () => {
  const linkPanel = () => {
    const w = mountToolbar({ mode: 'full', panel: 'link' })
    return w
  }
  const urlInput = (w: ReturnType<typeof mountToolbar>) => w.find('.fb-rt-panel input[type="text"]')
  const confirmBtn = (w: ReturnType<typeof mountToolbar>) =>
    w.findAll('.fb-rt-panel-actions button').find((b) => b.classes().includes('is-primary'))!

  it('**合法 URL 确认 → emit link，并复位表单（输入清空、newTab 回到 true）**', async () => {
    const w = linkPanel()
    await flushPromises()
    await urlInput(w).setValue('https://example.com/a')
    await nextTick()
    await confirmBtn(w).trigger('click')
    expect(w.emitted('link')![0], 'url + newTab').toEqual(['https://example.com/a', true])

    expect((urlInput(w).element as HTMLInputElement).value, '确认后清空输入').toBe('')
    const cb = w.find('.fb-rt-panel-check input[type="checkbox"]')
    expect((cb.element as HTMLInputElement).checked, 'newTab 复位为 true').toBe(true)
    w.unmount()
  })

  it('**www. 开头的地址自动补 https://**', async () => {
    const w = linkPanel()
    await flushPromises()
    await urlInput(w).setValue('www.example.com')
    await nextTick()
    await confirmBtn(w).trigger('click')
    expect(w.emitted('link')![0]![0], '补全协议').toBe('https://www.example.com')
    w.unmount()
  })

  it('**取消勾选 newTab → emit false，且确认后勾选态复位成 true**', async () => {
    const w = linkPanel()
    await flushPromises()
    const cb = w.find('.fb-rt-panel-check input[type="checkbox"]')
    await urlInput(w).setValue('https://a.com')
    await cb.setValue(false)
    await nextTick()
    expect((cb.element as HTMLInputElement).checked, '前置：已取消勾选').toBe(false)
    await confirmBtn(w).trigger('click')
    expect(w.emitted('link')![0]![1]).toBe(false)
    // 复位必须能被观测：从 false 变回 true 才说明真的写了 resetForm
    expect((cb.element as HTMLInputElement).checked, '确认后勾选态复位').toBe(true)
    w.unmount()
  })

  it('**非法协议：确认按钮 disabled、显示错误提示、Enter 也不 emit**', async () => {
    const w = linkPanel()
    await flushPromises()
    await urlInput(w).setValue('javascript:alert(1)')
    await nextTick()
    expect(confirmBtn(w).attributes('disabled'), '非法地址禁点确认').toBeDefined()
    expect(q('.fb-rt-panel-hint')!.textContent, '给出非法提示').toContain(t('formBuilder.rtLinkInvalid'))

    await urlInput(w).trigger('keydown.enter')
    await flushPromises()
    expect(w.emitted('link'), 'Enter 也不能绕过校验').toBeUndefined()
    w.unmount()
  })

  it('**Enter 键在合法时等价于点确认**', async () => {
    const w = linkPanel()
    await flushPromises()
    await urlInput(w).setValue('mailto:a@b.com')
    await nextTick()
    await urlInput(w).trigger('keydown.enter')
    await flushPromises()
    expect(w.emitted('link')![0]![0]).toBe('mailto:a@b.com')
    w.unmount()
  })

  it('**空输入不显示错误提示**（只在有内容且非法时才提示）', async () => {
    const w = linkPanel()
    await flushPromises()
    expect(q('.fb-rt-panel-hint'), '空初始态无错误').toBeNull()
    w.unmount()
  })
})

/* ═══════════ ⑤ 图片面板：URL 通道 ═══════════ */

describe('图片面板（URL 通道）', () => {
  const imgPanel = () => mountToolbar({ mode: 'full', panel: 'image' })
  const urlInput = (w: ReturnType<typeof mountToolbar>) => w.find('.fb-rt-panel input[type="text"]')
  const confirmBtn = (w: ReturnType<typeof mountToolbar>) =>
    w.findAll('.fb-rt-panel-actions button').find((b) => b.classes().includes('is-primary'))!

  it('**http(s) 地址确认 → emit image 并复位**', async () => {
    const w = imgPanel()
    await flushPromises()
    await urlInput(w).setValue('https://cdn.example.com/a.png')
    await nextTick()
    await confirmBtn(w).trigger('click')
    expect(w.emitted('image')![0]![0]).toBe('https://cdn.example.com/a.png')
    expect((urlInput(w).element as HTMLInputElement).value, '确认后清空').toBe('')
    w.unmount()
  })

  it('**短 data:image 通过；超长度上限被拒**', async () => {
    const w = imgPanel()
    await flushPromises()
    await urlInput(w).setValue('data:image/png;base64,AAAA')
    await nextTick()
    expect(confirmBtn(w).attributes('disabled'), '短 dataURL 可确认').toBeUndefined()
    await confirmBtn(w).trigger('click')
    expect(w.emitted('image')![0]![0]).toBe('data:image/png;base64,AAAA')

    // 超过 DATAURL_MAX_CHARS（2.8M 字符）→ 禁点
    await urlInput(w).setValue('data:image/png;base64,' + 'A'.repeat(2.9 * 1024 * 1024))
    await nextTick()
    expect(confirmBtn(w).attributes('disabled'), '超长 dataURL 禁点').toBeDefined()
    w.unmount()
  })

  it('**非图片地址（含普通链接、超长 data:text）都不放行，且有内容时给出非法提示**', async () => {
    const w = imgPanel()
    await flushPromises()
    expect(q('.fb-rt-panel-hint'), '空初始态无提示').toBeNull()
    for (const bad of ['ftp://a/b.png', 'data:text/html,<script>', 'javascript:void 0']) {
      await urlInput(w).setValue(bad)
      await nextTick()
      expect(confirmBtn(w).attributes('disabled'), `${bad} 应被拒`).toBeDefined()
      // 有内容且非法 → 必须出提示（只验 disabled 抓不到「提示被隐藏」）
      expect(q('.fb-rt-panel-hint')!.textContent, `${bad} 应给提示`).toContain(t('formBuilder.rtLinkInvalid'))
      await urlInput(w).trigger('keydown.enter')
      await flushPromises()
    }
    expect(w.emitted('image'), '一次都不该 emit').toBeUndefined()
    w.unmount()
  })

  it('**Enter 在 URL 合法时等价于点确认**', async () => {
    const w = imgPanel()
    await flushPromises()
    await urlInput(w).setValue('https://a.com/x.jpg')
    await nextTick()
    await urlInput(w).trigger('keydown.enter')
    await flushPromises()
    expect(w.emitted('image')![0]![0]).toBe('https://a.com/x.jpg')
    w.unmount()
  })
})

/* ═══════════ ⑥ 图片面板：本地文件通道 ═══════════ */

describe('图片面板（本地文件通道）', () => {
  const imgPanel = () => mountToolbar({ mode: 'full', panel: 'image' })

  it('**点「上传图片」会触发隐藏 file input 的 click**', async () => {
    const w = imgPanel()
    await flushPromises()
    const input = fileInput(w)
    const clickSpy = vi.spyOn(input, 'click')
    const uploadBtn = w.findAll('.fb-rt-panel-actions button').find((b) => b.text() === t('formBuilder.rtImageUpload'))!
    await uploadBtn.trigger('click')
    expect(clickSpy, '真的打开了文件选择器').toHaveBeenCalled()
    w.unmount()
  })

  it('**非图片文件 → 报「无效」且不读文件**', async () => {
    const w = imgPanel()
    await flushPromises()
    await chooseFile(w, makeFile('a.txt', 'text/plain', 10))
    expect(q('.fb-rt-panel-hint.is-error')!.textContent).toContain(t('formBuilder.rtImageInvalid'))
    expect(fr.instances.length, '没有创建 FileReader').toBe(0)
    expect(w.emitted('image'), '不该 emit image').toBeUndefined()
    w.unmount()
  })

  it('**超过 2MB → 报「过大」（与「无效」是不同文案）**', async () => {
    const w = imgPanel()
    await flushPromises()
    await chooseFile(w, bigFile('big.png', 'image/png'))
    const text = q('.fb-rt-panel-hint.is-error')!.textContent!
    expect(text).toContain(t('formBuilder.rtImageTooLarge'))
    expect(text, '不能报成格式错误').not.toContain(t('formBuilder.rtImageInvalid'))
    expect(fr.instances.length, '超限不读文件').toBe(0)
    w.unmount()
  })

  it('**合法图片 → 读成 dataURL 后 emit image，并复位错误与输入**', async () => {
    const w = imgPanel()
    await flushPromises()
    // 先制造一次错误，验证成功后错误被清掉
    await chooseFile(w, makeFile('a.txt', 'text/plain', 10))
    expect(q('.fb-rt-panel-hint.is-error')).not.toBeNull()

    await chooseFile(w, makeFile('ok.png', 'image/png', 100))
    expect(fr.instances.length, '创建了 FileReader').toBe(1)
    const reader = fr.instances[0]!
    expect(reader.url, '读的是这个文件').toBe('data:image/png;base64,ok.png')
    // 模拟读取完成
    // 先人为塞一条错误，验证 onload 成功与 onFileChange 复位**两条路都能清掉它**
    reader.result = 'data:image/png;base64,OK'
    reader.onload!()
    await nextTick()
    expect(w.emitted('image')![0]![0], 'emit 读到的 dataURL').toBe('data:image/png;base64,OK')
    expect(q('.fb-rt-panel-hint.is-error'), '错误文案被清掉').toBeNull()
    w.unmount()
  })

  it('**读取成功后 error 被清空（不经过 onFileChange）**', async () => {
    const w = imgPanel()
    await flushPromises()
    // 用 URL 通道制造一条错误？不行——那个 hint 不是 is-error。
    // 正确做法：先选一次被拒的文件（非图片）落 error，再选一次合法文件**全程不刷新**，
    // 这样 error 只能由 onload → resetForm 清掉。
    await chooseFile(w, makeFile('a.txt', 'text/plain', 10))
    expect(q('.fb-rt-panel-hint.is-error'), '前置：有错误').not.toBeNull()

    // 再选一个合法文件：onFileChange 会先清一次 error，因此这条路径杀不掉「成功不清」。
    // 为了只验 onload，这里**直接调用 reader 回调**前先把 error 重新塞回去：
    await chooseFile(w, makeFile('ok.png', 'image/png', 100))
    const reader = fr.instances[0]!
    reader.onerror!()
    await nextTick()
    expect(q('.fb-rt-panel-hint.is-error'), '前置：重新塞回错误').not.toBeNull()

    reader.result = 'data:image/png;base64,OK'
    reader.onload!()
    await nextTick()
    expect(w.emitted('image')![0]![0], '前置：成功 emit').toBe('data:image/png;base64,OK')
    expect(q('.fb-rt-panel-hint.is-error'), '成功回调必须清掉错误').toBeNull()
    w.unmount()
  })

  it('**读到非字符串结果 → 静默不 emit**（result 是 ArrayBuffer 等异常情形）', async () => {
    const w = imgPanel()
    await flushPromises()
    await chooseFile(w, makeFile('ok.png', 'image/png', 100))
    const reader = fr.instances[0]!
    reader.result = new ArrayBuffer(8)
    reader.onload!()
    await nextTick()
    expect(w.emitted('image'), '非字符串不 emit').toBeUndefined()
    w.unmount()
  })

  it('**读取失败 → 落「读取失败」文案**', async () => {
    const w = imgPanel()
    await flushPromises()
    await chooseFile(w, makeFile('ok.png', 'image/png', 100))
    fr.instances[0]!.onerror!()
    await nextTick()
    expect(q('.fb-rt-panel-hint.is-error')!.textContent).toContain(t('formBuilder.rtImageReadFailed'))
    w.unmount()
  })

  it('**没选文件（用户取消）→ 不报错、不读文件**', async () => {
    const w = imgPanel()
    await flushPromises()
    await chooseFile(w, null)
    expect(q('.fb-rt-panel-hint.is-error'), '取消选择不是错误').toBeNull()
    expect(fr.instances.length).toBe(0)
    w.unmount()
  })

  it('**每次 change 都把 input.value 清空**（否则同一文件选第二次不触发）', async () => {
    const w = imgPanel()
    await flushPromises()
    // file input 的 value 只允许被程序赋空串（赋其它值抛 InvalidStateError），
    // 所以「是否清空」只能观测**写 value 这个动作**：装一个记录型 setter
    const seen: string[] = []
    Object.defineProperty(fileInput(w), 'value', {
      configurable: true,
      get: () => 'C:\\fakepath\\picked.png',
      set: (v: string) => seen.push(v),
    })
    await chooseFile(w, makeFile('ok.png', 'image/png', 100))
    expect(seen, '成功分支把 value 置空').toContain('')
    expect(fr.instances.length, '前置：确实进了读取流程').toBe(1)

    // 失败分支同样要在校验之前就清空（否则同一文件重选不触发 change）
    seen.length = 0
    Object.defineProperty(fileInput(w), 'value', {
      configurable: true,
      get: () => 'C:\\fakepath\\a.txt',
      set: (v: string) => seen.push(v),
    })
    await chooseFile(w, makeFile('a.txt', 'text/plain', 10))
    expect(seen, '失败分支也置空').toContain('')
    w.unmount()
  })
})