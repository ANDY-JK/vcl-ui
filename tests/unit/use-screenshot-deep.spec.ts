/**
 * useScreenshot.ts — 截图/下载/复制（175 行）
 *
 * ## 为什么补（单文件口径 语句 29.5% / **分支 15%** / 函数 25%，52/78 行未覆盖 —— 全库最差）
 *
 * 三个 export 都是**用户可见动作**（导出图片、复制到剪贴板），而此前只被
 * `screenshot-copy-cleanup.spec.ts` 扫到「复制失败后不留游离节点」一条。未覆盖的是：
 *
 * ① **`captureElement` 的整条降级链**：`useCORS: true` 失败 → 自动重试 `useCORS: false`。
 *    这是「页面里有跨域图片」时唯一能让截图成功的东西，不测就等于没有。
 * ② **完整内容尺寸**：宽高取 `scrollWidth/scrollHeight`（含溢出部分），而不是视口 ——
 *    长表格截图只截到一屏是经典 bug。
 * ③ **`onclone` 的两件事**：复制 CSS 自定义属性（否则克隆体里 `var(--xxx)` 全丢，
 *    斑马行/主题色变白）、以及**递归**清掉裁剪约束（否则克隆体被 `overflow:hidden` 截断）。
 *    两条都只在克隆文档里发生，不驱动 `onclone` 就完全测不到。
 * ④ **失败必须返回 null 而不是抛**（调用方没有 try/catch），且要走 `reportWarn` 留痕。
 * ⑤ `toBlob` 给 null 时**reject → 外层兜住 → null**（不能返回一个 blob 为 undefined 的对象）。
 * ⑥ `downloadScreenshot`：`filename` 缺省时要生成带时间戳的名字；`<a>` 必须被 `click()`。
 * ⑦ `copyScreenshotToClipboard` 的**两级降级**：Clipboard API 成功 → true；
 *    不可用或抛错 → 富文本 `<img> + execCommand` 降级；连 dataUrl 都没有 → false。
 * ⑧ 降级路径里挂到 body 上的 holder **无论成败都必须摘掉**（每失败一次留一个游离节点）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const obs = vi.hoisted(() => ({ reportWarn: vi.fn() }))
vi.mock('@/components/_internal/runtime-observer', async (orig) => {
  const actual = await orig<Record<string, unknown>>()
  return { ...actual, reportWarn: obs.reportWarn }
})
vi.mock('html2canvas', () => ({ default: vi.fn() }))

import { captureElement, downloadScreenshot, copyScreenshotToClipboard } from '@/components/_internal/useScreenshot'

/** 取到被 mock 的 html2canvas（每次用例重置实现） */
async function h2c() {
  return (await import('html2canvas')).default as unknown as ReturnType<typeof vi.fn>
}

/** 造一个假 canvas：toDataURL 记录 MIME 入参，toBlob 可控 */
function fakeCanvas(opts: { blob?: Blob | null; dataUrl?: string } = {}) {
  const blob = opts.blob === undefined ? new Blob(['x'], { type: 'image/png' }) : opts.blob
  return {
    toDataURL: vi.fn((_mime?: string) => opts.dataUrl ?? 'data:image/png;base64,AAA'),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(blob)),
  } as unknown as HTMLCanvasElement
}

/** 造一个带完整内容尺寸的元素 */
function el(width = 800, height = 600) {
  const d = document.createElement('div')
  Object.defineProperty(d, 'scrollWidth', { value: width, configurable: true })
  Object.defineProperty(d, 'scrollHeight', { value: height, configurable: true })
  return d
}

beforeEach(() => {
  obs.reportWarn.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/* ═══════════ ① captureElement ═══════════ */

describe('captureElement', () => {
  it('**成功：返回 dataUrl + canvas + blob**', async () => {
    const canvas = fakeCanvas({ dataUrl: 'data:image/png;base64,OK' })
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(canvas)

    const r = await captureElement(el())
    expect(r, '不该为 null').not.toBeNull()
    expect(r!.dataUrl).toBe('data:image/png;base64,OK')
    expect(r!.canvas).toBe(canvas)
    expect(r!.blob).toBeInstanceOf(Blob)
  })

  it('**导出格式必须是 PNG**（MIME 要显式传，不能靠浏览器默认）', async () => {
    const canvas = fakeCanvas()
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(canvas)
    await captureElement(el())
    const mime = (canvas.toDataURL as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(mime, 'toDataURL 显式传 image/png').toBe('image/png')
    const blobMime = (canvas.toBlob as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1]
    expect(blobMime, 'toBlob 也传 PNG').toBe('image/png')
  })

  it('**默认参数：scale=2、backgroundColor=#ffffff、尺寸取 scroll 而非视口**', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(fakeCanvas())

    await captureElement(el(1234, 5678))
    const opts = mock.mock.calls[0]![1] as Record<string, unknown>
    expect(opts.scale, '默认 Retina 2x').toBe(2)
    expect(opts.backgroundColor).toBe('#ffffff')
    expect(opts.width, '含溢出宽度').toBe(1234)
    expect(opts.height, '含溢出高度').toBe(5678)
    expect(opts.windowWidth).toBe(1234)
    expect(opts.windowHeight).toBe(5678)
    expect(opts.logging).toBe(false)
  })

  it('**自定义 scale/backgroundColor 生效**', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(fakeCanvas())
    await captureElement(el(), { scale: 3, backgroundColor: null })
    const opts = mock.mock.calls[0]![1] as Record<string, unknown>
    expect(opts.scale).toBe(3)
    expect(opts.backgroundColor, '可显式置透明').toBeNull()
  })

  it('**scale 下限钳到 0.1**（传 0 / 负数不能把 canvas 做成 0 宽）', async () => {
    const mock = await h2c()
    for (const bad of [0, -5]) {
      mock.mockReset()
      mock.mockResolvedValue(fakeCanvas())
      await captureElement(el(), { scale: bad })
      expect((mock.mock.calls[0]![1] as Record<string, unknown>).scale, `scale=${bad} 应钳到 0.1`).toBe(0.1)
    }
  })

  it('**首次用 useCORS:true + allowTaint:false**', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(fakeCanvas())
    await captureElement(el())
    const opts = mock.mock.calls[0]![1] as Record<string, unknown>
    expect(opts.useCORS).toBe(true)
    expect(opts.allowTaint).toBe(false)
  })

  it('**useCORS 失败 → 自动降级重试 useCORS:false**（跨域图片场景的唯一出路）', async () => {
    const mock = await h2c()
    mock.mockReset()
    const canvas = fakeCanvas()
    mock.mockRejectedValueOnce(new Error('tainted canvas')).mockResolvedValueOnce(canvas)

    const r = await captureElement(el())
    expect(mock, '重试了一次').toHaveBeenCalledTimes(2)
    const retryOpts = mock.mock.calls[1]![1] as Record<string, unknown>
    expect(retryOpts.useCORS, '降级为 false').toBe(false)
    expect(retryOpts.allowTaint, '降级分支不再带 allowTaint').toBeUndefined()
    expect(r, '降级后仍成功').not.toBeNull()
    expect(obs.reportWarn, '降级不该报错（属预期内）').not.toHaveBeenCalled()
  })

  it('**两次都失败 → reportWarn + 返回 null**（不抛给调用方）', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockRejectedValue(new Error('boom'))
    const r = await captureElement(el())
    expect(r).toBeNull()
    expect(obs.reportWarn).toHaveBeenCalledTimes(1)
    expect(String(obs.reportWarn.mock.calls[0]![0])).toContain('截图失败')
  })

  it('**html2canvas 返回 null → 返回 null，且不报错**（这是空的成功结果，不是异常）', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(null)
    expect(await captureElement(el())).toBeNull()
    expect(obs.reportWarn, '不该走异常上报').not.toHaveBeenCalled()
  })

  it('**toBlob 给 null → 走兜底返回 null**（不能返回 blob 为空的成功结果）', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(fakeCanvas({ blob: null }))
    const r = await captureElement(el())
    expect(r, 'toBlob 失败要兜住').toBeNull()
    expect(obs.reportWarn).toHaveBeenCalled()
  })

  it('**onclone：只复制 `--` 开头的 CSS 变量，且值取对**', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(fakeCanvas())
    await captureElement(el())
    const onclone = (mock.mock.calls[0]![1] as Record<string, unknown>).onclone as (
      d: Document,
      e: HTMLElement,
    ) => void

    // 伪造 getComputedStyle：索引 0 是自定义属性、索引 1 是普通属性
    const setProperty = vi.fn()
    const fakeStyle = { 0: '--brand', 1: 'color', length: 2, getPropertyValue: (p: string) => (p === '--brand' ? '#f00' : 'rgb(0,0,0)') }
    vi.stubGlobal('getComputedStyle', () => fakeStyle as unknown as CSSStyleDeclaration)

    const clonedEl = document.createElement('div')
    onclone({ documentElement: { style: { setProperty } } } as unknown as Document, clonedEl)

    expect(setProperty, '只复制自定义属性').toHaveBeenCalledTimes(1)
    expect(setProperty).toHaveBeenCalledWith('--brand', '#f00')
    vi.unstubAllGlobals()
  })

  it('**onclone：展开克隆体的裁剪约束**（否则长内容被截断）', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(fakeCanvas())
    await captureElement(el())
    const onclone = (mock.mock.calls[0]![1] as Record<string, unknown>).onclone as (
      d: Document,
      e: HTMLElement,
    ) => void

    const clonedEl = document.createElement('div')
    onclone({ documentElement: { style: { setProperty: vi.fn() } } } as unknown as Document, clonedEl)
    const s = clonedEl.style
    expect(s.overflow).toBe('visible')
    expect(s.overflowX).toBe('visible')
    expect(s.overflowY).toBe('visible')
    expect(s.maxHeight).toBe('none')
    expect(s.maxWidth).toBe('none')
    expect(s.height).toBe('auto')
    expect(s.width).toBe('auto')
    expect(s.contain).toBe('none')
    // ⚠️ happy-dom 会把 `flex: none` 这种 shorthand 归一化展开成 '0 0 auto'，
    // 所以只能断言「被显式重置过（非空）」；浏览器里读到的是 'none' 或 '0 0 auto' 都算对
    expect(s.flex, 'flex 被重置过').not.toBe('')
    expect(['none', '0 0 auto']).toContain(s.flex)
  })

  it('**onclone：递归清理子元素，但跳过非 HTMLElement（如 SVG 图标）**', async () => {
    const mock = await h2c()
    mock.mockReset()
    mock.mockResolvedValue(fakeCanvas())
    await captureElement(el())
    const onclone = (mock.mock.calls[0]![1] as Record<string, unknown>).onclone as (
      d: Document,
      e: HTMLElement,
    ) => void

    const child = document.createElement('span')
    child.style.overflow = 'hidden'
    const clonedEl = document.createElement('div')
    clonedEl.appendChild(child)
    // querySelectorAll('*') 只返回 Element，不会返回文本节点；
    // 真正会走进 instanceof 假分支的是 SVGElement（表格里的内联图标就是），它没有 style 可写
    clonedEl.insertAdjacentHTML('beforeend', '<svg><rect/></svg>')
    const svg = clonedEl.querySelector('svg')!
    expect(svg instanceof HTMLElement, '前置：SVG 不是 HTMLElement').toBe(false)

    expect(() =>
      onclone({ documentElement: { style: { setProperty: vi.fn() } } } as unknown as Document, clonedEl),
    ).not.toThrow()
    expect(child.style.overflow, '子元素裁剪也展开').toBe('visible')
    expect(child.style.maxHeight).toBe('none')
    expect(child.style.maxWidth).toBe('none')
    // SVG 被跳过：其 overflow 不被改写（本来也不该被当布局容器处理）
    expect((svg as unknown as { style: CSSStyleDeclaration }).style.overflow, 'SVG 不被动').not.toBe('visible')
  })
})

/* ═══════════ ② downloadScreenshot ═══════════ */

describe('downloadScreenshot', () => {
  it('**创建 <a> 并 click，返回 true**', () => {
    const clicked: HTMLAnchorElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = realCreate(tag)
      if (tag === 'a') {
        ;(node as HTMLAnchorElement).click = () => clicked.push(node as HTMLAnchorElement)
      }
      return node
    })

    const ok = downloadScreenshot('data:image/png;base64,ZZ', 'report.png')
    expect(ok).toBe(true)
    expect(clicked.length, '真的触发了点击').toBe(1)
    expect(clicked[0]!.download).toBe('report.png')
    expect(clicked[0]!.href).toContain('data:image/png;base64,ZZ')
  })

  it('**未给文件名时生成带时间戳的名字**', () => {
    const made: HTMLAnchorElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = realCreate(tag)
      if (tag === 'a') {
        ;(node as HTMLAnchorElement).click = () => made.push(node as HTMLAnchorElement)
      }
      return node
    })
    downloadScreenshot('data:image/png;base64,ZZ')
    expect(made[0]!.download).toMatch(/^screenshot_\d+\.png$/)
  })

  it('**抛错时 reportWarn + 返回 false**（不能把异常抛给按钮处理器）', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      throw new Error('no dom')
    })
    expect(downloadScreenshot('data:x')).toBe(false)
    expect(obs.reportWarn).toHaveBeenCalledTimes(1)
    expect(String(obs.reportWarn.mock.calls[0]![0])).toContain('下载截图失败')
  })
})

/* ═══════════ ③ copyScreenshotToClipboard ═══════════ */

describe('copyScreenshotToClipboard', () => {
  const blob = () => new Blob(['x'], { type: 'image/png' })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete (document as unknown as Record<string, unknown>).execCommand
  })

  it('**Clipboard API 成功 → true，不降级**', async () => {
    const write = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { write } })
    vi.stubGlobal('ClipboardItem', class {
      constructor(public items: Record<string, Blob>) {}
    })
    const exec = vi.fn(() => true)
    ;(document as unknown as Record<string, unknown>).execCommand = exec

    await expect(copyScreenshotToClipboard(blob(), 'data:image/png;base64,A')).resolves.toBe(true)
    expect(write, '走了 Clipboard API').toHaveBeenCalledTimes(1)
    expect(exec, '不降级').not.toHaveBeenCalled()
  })

  it('**Clipboard API 抛错 → 降级到 execCommand**', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        write: vi.fn(async () => {
          throw new Error('denied')
        }),
      },
    })
    vi.stubGlobal('ClipboardItem', class {})
    const exec = vi.fn(() => true)
    ;(document as unknown as Record<string, unknown>).execCommand = exec

    await expect(copyScreenshotToClipboard(blob(), 'data:image/png;base64,A')).resolves.toBe(true)
    expect(exec, '降级执行了 execCommand').toHaveBeenCalledWith('copy')
    expect(document.body.querySelector('div[contenteditable]'), 'holder 已摘掉').toBeNull()
  })

  it('**ClipboardItem 不存在（HTTP 环境）→ 直接降级**', async () => {
    vi.stubGlobal('navigator', { clipboard: { write: vi.fn() } })
    // happy-dom 自带 ClipboardItem，必须显式置 undefined 才是「HTTP 非安全上下文」的真实形态
    vi.stubGlobal('ClipboardItem', undefined)
    const exec = vi.fn(() => true)
    ;(document as unknown as Record<string, unknown>).execCommand = exec
    const r = await copyScreenshotToClipboard(blob(), 'data:image/png;base64,A')
    expect(r, '降级结果').toBe(true)
    expect(exec).toHaveBeenCalled()
  })

  it('**连 dataUrl 都没有 → false**（无法降级）', async () => {
    vi.stubGlobal('navigator', {})
    await expect(copyScreenshotToClipboard(blob())).resolves.toBe(false)
  })

  it('**降级时 execCommand 返回 false → 整体 false**', async () => {
    vi.stubGlobal('navigator', {})
    ;(document as unknown as Record<string, unknown>).execCommand = vi.fn(() => false)
    await expect(copyScreenshotToClipboard(blob(), 'data:image/png;base64,A')).resolves.toBe(false)
  })

  it('**降级路径抛错（createRange 不可用）→ false，且 holder 仍被摘掉**', async () => {
    vi.stubGlobal('navigator', {})
    vi.spyOn(document, 'createRange').mockImplementation(() => {
      throw new Error('no range')
    })
    const before = document.body.children.length
    await expect(copyScreenshotToClipboard(blob(), 'data:image/png;base64,A')).resolves.toBe(false)
    expect(document.body.children.length, '不留游离节点').toBe(before)
    expect(document.body.querySelector('div[contenteditable]')).toBeNull()
  })

  it('**降级时 holder 必须在 execCommand 之前已挂到 body**（脱离文档的选区复制不出来）', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('ClipboardItem', undefined)
    let attachedAtCopy: boolean | null = null
    ;(document as unknown as Record<string, unknown>).execCommand = vi.fn(() => {
      // 在「真正复制」这一刻检查：holder 是否在文档里
      attachedAtCopy = document.body.querySelector('div[contenteditable]') !== null
      return true
    })
    await copyScreenshotToClipboard(blob(), 'data:image/png;base64,A')
    expect(attachedAtCopy, '复制时 holder 在文档中').toBe(true)
  })

  it('**降级后必须把用户原有选区还回去**（否则隐藏 div 的选区会劫持用户的选中）', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('ClipboardItem', undefined)
    ;(document as unknown as Record<string, unknown>).execCommand = vi.fn(() => true)

    const removeAllRanges = vi.fn()
    const addRange = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges,
      addRange,
    } as unknown as Selection)

    await copyScreenshotToClipboard(blob(), 'data:image/png;base64,A')
    expect(addRange, '先把 holder 选起来才能复制').toHaveBeenCalledTimes(1)
    // 一次在 addRange 之前、一次在 finally 里复原 —— 少了后者，用户原本选中的文字会被吃掉
    expect(removeAllRanges.mock.calls.length, '必须清两次选区').toBe(2)
  })

  it('**降级时会把 <img> 的 src 设为 dataUrl**（否则复制不出图）', async () => {
    vi.stubGlobal('navigator', {})
    let seenSrc = ''
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const node = realCreate(tag)
      if (tag === 'img') {
        Object.defineProperty(node, 'src', {
          configurable: true,
          set(v: string) {
            seenSrc = v
          },
          get: () => seenSrc,
        })
      }
      return node
    })
    ;(document as unknown as Record<string, unknown>).execCommand = vi.fn(() => true)
    await copyScreenshotToClipboard(blob(), 'data:image/png;base64,IMG')
    expect(seenSrc).toBe('data:image/png;base64,IMG')
  })
})