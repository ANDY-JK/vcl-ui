/**
 * useImageExport — ImagePreview 的「导出为 PNG / 复制到剪贴板」管道
 *
 * ## 为什么补（118 行，语句 1.5% / 分支 0% / 函数 10%）
 *
 * 这是全项目覆盖率最低的模块之一：**没有任何 spec 引用过它**（`grep useImageExport tests/` 为空）。
 * 它承担三个用户可见动作：下载 PNG、复制 PNG、以及把「当前缩放平移下的标注」正确
 * 映射到导出图。三类失败模式都只能在这里拦：
 *   · 跨域图片直接 drawImage 会**污染 canvas** → toBlob 抛 SecurityError（所以先 CORS fetch）
 *   · SVG 等 createImageBitmap 不支持的格式 → 退回 blob URL + Image
 *   · 未加载 / 合成失败时**不能静默** → 必须 notify 错误文案
 *
 * ## harness 要点
 *
 * · happy-dom 无 `createImageBitmap`、canvas `getContext('2d')` 行为不稳 →
 *   用**可记录调用的 Proxy 假 ctx** + 直接改写 `HTMLCanvasElement.prototype`
 * · `fetch` / `Image` / `URL.createObjectURL` 全部 stubGlobal 或直接改写
 * · `paintAnno` 用 vi.mock 换 spy（保留真实 `mapAnnoToImage`），这样既能断言
 *   「每个标注都画了」，又能断言**映射后的坐标**确实等于真实 mapAnnoToImage 的输出
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import { useImageExport } from '@/components/data/composables/useImageExport'
import { mapAnnoToImage } from '@/components/data/composables/image-anno-paint'
import type { Annotation } from '@/components/data/composables/annotation-types'

/* paintAnno 换 spy；mapAnnoToImage 保持真实（用于对照断言） */
vi.mock('@/components/data/composables/image-anno-paint', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/data/composables/image-anno-paint')>()),
  paintAnno: vi.fn(),
}))

import { paintAnno } from '@/components/data/composables/image-anno-paint'

/* 下载/复制工具换 spy */
const downloadMock = vi.hoisted(() => vi.fn<(dataUrl: string, filename?: string) => boolean>())
const copyMock = vi.hoisted(() => vi.fn<(blob: Blob, dataUrl?: string) => Promise<boolean>>())
vi.mock('@/components/_internal/useScreenshot', () => ({
  captureElement: vi.fn(),
  downloadScreenshot: downloadMock,
  copyScreenshotToClipboard: copyMock,
}))

const paintSpy = paintAnno as unknown as ReturnType<typeof vi.fn>

/* ═══════════ 可记录调用的假 canvas 2D 上下文 ═══════════ */

interface FakeCtx {
  drawImage: ReturnType<typeof vi.fn>
  [k: string]: unknown
}

function makeFakeCtx(): FakeCtx {
  const drawImage = vi.fn()
  const store: Record<string, unknown> = { drawImage }
  // 未知成员一律给 no-op 函数（paintAnno 会调 beginPath/moveTo/lineTo/stroke 等）；
  // 属性赋值（lineWidth / strokeStyle 等）走 set 直接落进 store
  return new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k as string]
      if (typeof k === 'symbol') return undefined
      return () => undefined
    },
    set(t, k, v) {
      t[k as string] = v
      return true
    },
  }) as FakeCtx
}

let ctx: FakeCtx
let toBlobImpl: (cb: (b: Blob | null) => void) => void
let toDataURLImpl: () => string
const origGetContext = HTMLCanvasElement.prototype.getContext
const origToBlob = HTMLCanvasElement.prototype.toBlob
const origToDataURL = HTMLCanvasElement.prototype.toDataURL

const PNG = new Blob(['png-bytes'], { type: 'image/png' })

/* ═══════════ 被测宿主 ═══════════ */

const REC = { left: 10, top: 20, width: 400, height: 300 }
const STAGE = { left: 3, top: 5, width: 800, height: 600 }

function makeImg(over: Partial<Record<string, unknown>> = {}) {
  return {
    naturalWidth: 800,
    naturalHeight: 600,
    src: 'https://cdn.example.com/a.png',
    getBoundingClientRect: () => REC,
    ...over,
  } as unknown as HTMLImageElement
}

interface Host {
  api: ReturnType<typeof useImageExport>
  notify: ReturnType<typeof vi.fn>
  imgEl: Ref<HTMLImageElement | null>
  annoCanvas: Ref<HTMLCanvasElement | null>
  annotations: Ref<Annotation[]>
  isLoaded: ReturnType<typeof vi.fn>
  title: ReturnType<typeof vi.fn>
}

function makeHost(opts: { loaded?: boolean; titleText?: string; noStage?: boolean } = {}): Host {
  const notify = vi.fn()
  const isLoaded = vi.fn(() => opts.loaded !== false)
  const title = vi.fn(() => opts.titleText ?? '我的截图')
  const imgEl = ref<HTMLImageElement | null>(makeImg())
  const stage = { getBoundingClientRect: () => STAGE } as unknown as HTMLElement
  const cvsEl = { parentElement: opts.noStage ? null : stage } as unknown as HTMLCanvasElement
  const annoCanvas = ref<HTMLCanvasElement | null>(cvsEl)
  const annotations = ref<Annotation[]>([])
  const api = useImageExport({
    imgEl,
    annoCanvas,
    annotations,
    isLoaded,
    title,
    t: (k: string) => 'T:' + k,
    notify,
  })
  return { api, notify, imgEl, annoCanvas, annotations, isLoaded, title }
}

const RECT: Annotation = { type: 'rect', id: 'a1', color: '#f00', lw: 3, x: 40, y: 60, w: 100, h: 80 }
const PEN: Annotation = {
  type: 'pen',
  id: 'a2',
  color: '#0f0',
  lw: 2,
  points: [
    { x: 10, y: 10 },
    { x: 20, y: 30 },
  ],
}

beforeEach(() => {
  ctx = makeFakeCtx()
  toBlobImpl = (cb) => cb(PNG)
  toDataURLImpl = () => 'data:image/png;base64,AAAA'
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  HTMLCanvasElement.prototype.toBlob = vi.fn(function (this: HTMLCanvasElement, cb: (b: Blob | null) => void) {
    toBlobImpl(cb)
  }) as never
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => toDataURLImpl()) as never
  paintSpy.mockClear()
  downloadMock.mockReset().mockReturnValue(true)
  copyMock.mockReset().mockResolvedValue(true)
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = origGetContext
  HTMLCanvasElement.prototype.toBlob = origToBlob
  HTMLCanvasElement.prototype.toDataURL = origToDataURL
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ═══════════ buildExportCanvas ═══════════ */

describe('buildExportCanvas 合成', () => {
  it('**图片缺失 → null**（不建 canvas）', async () => {
    const h = makeHost()
    h.imgEl.value = null
    expect(await h.api.buildExportCanvas()).toBeNull()
  })

  it('**标注画布无父元素（stage 缺失）→ null**', async () => {
    const h = makeHost({ noStage: true })
    expect(await h.api.buildExportCanvas()).toBeNull()
  })

  it('**naturalWidth/Height 为 0（未真正加载）→ null**', async () => {
    const h = makeHost()
    h.imgEl.value = makeImg({ naturalWidth: 0 })
    expect(await h.api.buildExportCanvas()).toBeNull()
    h.imgEl.value = makeImg({ naturalHeight: 0 })
    expect(await h.api.buildExportCanvas()).toBeNull()
  })

  it('**fetch 成功 + createImageBitmap 可用：用位图绘制并水合标注**', async () => {
    const bmp = { tag: 'bitmap' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => PNG }))
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bmp))
    const h = makeHost()
    h.annotations.value = [RECT, PEN]

    const cvs = await h.api.buildExportCanvas()
    expect(cvs, '返回 canvas').toBeInstanceOf(HTMLCanvasElement)
    // canvas 尺寸取 natural 尺寸（不是显示尺寸）
    expect(cvs!.width).toBe(800)
    expect(cvs!.height).toBe(600)
    expect(fetch).toHaveBeenCalledWith('https://cdn.example.com/a.png', { mode: 'cors', cache: 'force-cache' })
    expect(ctx.drawImage, '用位图而非原 img 绘制').toHaveBeenCalledWith(bmp, 0, 0, 800, 600)
    expect(paintSpy, '两个标注各画一次').toHaveBeenCalledTimes(2)
  })

  it('**标注映射精确**：每个标注的映射参数等于真实 mapAnnoToImage 的输出', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => PNG }))
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({}))
    const h = makeHost()
    h.annotations.value = [RECT]

    await h.api.buildExportCanvas()

    // 显示尺寸 400×300 → 导出 800×600；stage 原点 (3,5)，img 原点 (10,20)
    const sx = 800 / REC.width // 2
    const sy = 600 / REC.height // 2
    const offX = REC.left - STAGE.left // 7
    const offY = REC.top - STAGE.top // 15
    expect(sx).toBe(2)
    expect(sy).toBe(2)
    const expected = mapAnnoToImage(RECT, sx, sy, offX, offY)
    const passed = paintSpy.mock.calls[0]![1] as Annotation
    expect(passed, '映射后的标注').toEqual(expected)
    expect(passed).toEqual({ ...RECT, x: 66, y: 90, w: 200, h: 160 })
    // 第 3 参数 sel=false；第 4 参数 sAvg = (sx+sy)/2 = 2
    expect(paintSpy.mock.calls[0]![2]).toBe(false)
    expect(paintSpy.mock.calls[0]![3], 'sAvg = (2+2)/2').toBe(2)
    expect(paintSpy.mock.calls[0]![0], '传入的是假 ctx').toBe(ctx)
  })

  it('**非等比缩放：sAvg 取 sx/sy 的均值**（长宽比不同）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => PNG }))
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({}))
    const REC2 = { left: 0, top: 0, width: 200, height: 300 }
    const h = makeHost()
    h.imgEl.value = makeImg({ getBoundingClientRect: () => REC2 })
    h.annotations.value = [PEN]

    await h.api.buildExportCanvas()
    const sx = 800 / REC2.width // 4
    const sy = 600 / REC2.height // 2
    const offX = REC2.left - STAGE.left // 0 - 3 = -3（stage 原点仍在 (3,5)）
    const offY = REC2.top - STAGE.top // 0 - 5 = -5
    expect(paintSpy.mock.calls[0]![3], 'sAvg = (4+2)/2 = 3').toBe(3)
    expect(paintSpy.mock.calls[0]![1]).toEqual(mapAnnoToImage(PEN, sx, sy, offX, offY))
  })

  it('**无标注时不画**（paintAnno 不被调用）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => PNG }))
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({}))
    const h = makeHost()
    h.annotations.value = []
    const cvs = await h.api.buildExportCanvas()
    expect(cvs).toBeInstanceOf(HTMLCanvasElement)
    expect(paintSpy).not.toHaveBeenCalled()
  })

  it('**createImageBitmap 不支持 → 退回 blob URL + Image**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => PNG }))
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')))
    const createObjectURL = vi.fn(() => 'blob:fake-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    // Image 的 src setter 触发 onload（解码成功）
    class FakeImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      private _src = ''
      set src(v: string) {
        this._src = v
        queueMicrotask(() => this.onload?.())
      }
      get src() {
        return this._src
      }
    }
    vi.stubGlobal('Image', FakeImage)

    const h = makeHost()
    const cvs = await h.api.buildExportCanvas()
    expect(createObjectURL, '造了 blob URL').toHaveBeenCalledWith(PNG)
    expect(revokeObjectURL, '用完就 revoke').toHaveBeenCalledWith('blob:fake-url')
    expect(cvs, '仍返回 canvas').toBeInstanceOf(HTMLCanvasElement)
    // 用解码后的 Image 绘制（不是 fetch 的 bitmap）
    const drawn = ctx.drawImage.mock.calls[0]![0] as FakeImage
    expect(drawn, '绘制的是 FakeImage 实例').toBeInstanceOf(FakeImage)
    expect(drawn.src, 'src 是 blob URL').toBe('blob:fake-url')
  })

  it('**blob 解码失败 → 被外层 catch 吞掉，退回原始 img 绘制**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => PNG }))
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')))
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL })
    class BadImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.())
      }
      get src() {
        return ''
      }
    }
    vi.stubGlobal('Image', BadImage)

    const h = makeHost()
    const img = h.imgEl.value!
    const cvs = await h.api.buildExportCanvas()
    expect(cvs, '不抛、仍返回 canvas').toBeInstanceOf(HTMLCanvasElement)
    expect(ctx.drawImage, '退回原始 img').toHaveBeenCalledWith(img, 0, 0, 800, 600)
  })

  it('**fetch 返回非 2xx → 不取 blob，退回原始 img**', async () => {
    const blobFn = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, blob: blobFn }))
    const h = makeHost()
    const img = h.imgEl.value!
    await h.api.buildExportCanvas()
    expect(blobFn, 'res.ok 假 → 不读 blob').not.toHaveBeenCalled()
    expect(ctx.drawImage).toHaveBeenCalledWith(img, 0, 0, 800, 600)
  })

  it('**fetch 抛错（无 CORS 头）→ 退回原始 img**（toBlob 阶段会失败并提示）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    const h = makeHost()
    const img = h.imgEl.value!
    const cvs = await h.api.buildExportCanvas()
    expect(cvs).toBeInstanceOf(HTMLCanvasElement)
    expect(ctx.drawImage).toHaveBeenCalledWith(img, 0, 0, 800, 600)
  })

  it('**getContext 返回 null → null**（不崩）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    const h = makeHost()
    expect(await h.api.buildExportCanvas()).toBeNull()
  })
})

/* ═══════════ toPngBlob ═══════════ */

describe('toPngBlob', () => {
  it('**正常：回调拿到 blob 并透传**', async () => {
    const h = makeHost()
    toBlobImpl = (cb) => cb(PNG)
    const cvs = document.createElement('canvas')
    expect(await h.api.toPngBlob(cvs)).toBe(PNG)
  })

  it('**回调拿到 null → 返回 null**（不算异常）', async () => {
    const h = makeHost()
    toBlobImpl = (cb) => cb(null)
    expect(await h.api.toPngBlob(document.createElement('canvas'))).toBeNull()
  })

  it('**toBlob 抛 SecurityError（跨域污染）→ 返回 null**，不向外抛', async () => {
    const h = makeHost()
    HTMLCanvasElement.prototype.toBlob = vi.fn(() => {
      throw new DOMException('tainted', 'SecurityError')
    }) as never
    expect(await h.api.toPngBlob(document.createElement('canvas'))).toBeNull()
  })

  it('**请求的 MIME 是 image/png**', async () => {
    const h = makeHost()
    const spy = vi.fn(function (this: HTMLCanvasElement, cb: (b: Blob | null) => void) {
      cb(PNG)
    })
    HTMLCanvasElement.prototype.toBlob = spy as never
    await h.api.toPngBlob(document.createElement('canvas'))
    expect(spy.mock.calls[0]![1]).toBe('image/png')
  })
})

/* ═══════════ downloadImage ═══════════ */

/** 让出一轮宏任务（setTimeout 0 排队的回调在此之后执行） */
function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('downloadImage', () => {
  // 2026-10-31 起 downloadImage 走 blob + objectURL：这两个 API 需要在本 describe 内桩住
  const createObjectURL = vi.fn(() => 'blob:mock-object-url')
  const revokeObjectURL = vi.fn()
  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('**未加载 → 直接返回**（不合成、不通知）', async () => {
    const h = makeHost({ loaded: false })
    await h.api.downloadImage()
    expect(h.notify).not.toHaveBeenCalled()
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it('**合成失败 → notify 未加载错误**', async () => {
    const h = makeHost()
    h.imgEl.value = null
    await h.api.downloadImage()
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.exportFailNotLoaded', 'error')
    expect(downloadMock).not.toHaveBeenCalled()
  })

  it('**成功：文件名取标题 + notify 成功**（blob 通道：toBlob → objectURL → download）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    const h = makeHost({ titleText: '标注图' })
    await h.api.downloadImage()
    // 2026-10-31 起走 toPngBlob + objectURL（省大 dataURL 内存）：download 收到的是 blob URL 而非 dataURL
    expect(downloadMock).toHaveBeenCalledWith('blob:mock-object-url', '标注图.png')
    // revoke 延后一轮宏任务（#429）—— 断言前必须 flush，否则测的是旧行为
    await flushMacrotask()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-object-url')
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.downloadOk', 'success')
  })

  /* ── #429：blob URL 撤销时机 ─────────────────────────────────────
   * downloadScreenshot 只做 <a download> + click() 就返回；浏览器真正读 blob URL
   * 是异步的（下一轮任务才开始拉数据）。同步 revoke 会在读取前把 URL 抽走 ——
   * Chrome/Safari 表现为"点了下载但文件没下来/0 字节"，且因为 click() 不抛，
   * downloadScreenshot 照样返回 true、通知还是成功：静默失败。*/
  it('**revoke 不早于下一轮宏任务**（blob URL 被读取前不能撤）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    const h = makeHost()
    await h.api.downloadImage()
    expect(downloadMock, '下载已触发').toHaveBeenCalled()
    expect(revokeObjectURL, '同一拍就 revoke = 抽走 URL，下载会静默失败').not.toHaveBeenCalled()
    await flushMacrotask()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-object-url')
    expect(revokeObjectURL, '恰好撤一次').toHaveBeenCalledTimes(1)
  })

  it('**revokeObjectURL 抛错不影响通知**（撤不掉只影响回收时机）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    revokeObjectURL.mockImplementationOnce(() => {
      throw new Error('unsupported')
    })
    const h = makeHost()
    await h.api.downloadImage()
    await flushMacrotask()
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.downloadOk', 'success')
  })

  it('**标题为空 → 回退 image.png**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    const h = makeHost({ titleText: '' })
    await h.api.downloadImage()
    expect(downloadMock.mock.calls[0]![1]).toBe('image.png')
  })

  it('**downloadScreenshot 返回 false → notify 失败**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    downloadMock.mockReturnValue(false)
    const h = makeHost()
    await h.api.downloadImage()
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.downloadFail', 'error')
  })

  it('**toPngBlob 失败（画布污染）→ notify 跨域错误，不走 download**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => {
      throw new DOMException('tainted', 'SecurityError')
    }) as never
    // blob 通道：toBlob 给 null（toPngBlob 返回 null 的口径）
    toBlobImpl = (cb) => cb(null)
    const h = makeHost()
    await h.api.downloadImage()
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.exportFailCrossOrigin', 'error')
    expect(downloadMock).not.toHaveBeenCalled()
  })
})

/* ═══════════ copyImage ═══════════ */

describe('copyImage', () => {
  it('**未加载 → 直接返回**', async () => {
    const h = makeHost({ loaded: false })
    await h.api.copyImage()
    expect(h.notify).not.toHaveBeenCalled()
    expect(copyMock).not.toHaveBeenCalled()
  })

  it('**合成失败 → notify 未加载错误**', async () => {
    const h = makeHost()
    h.imgEl.value = null
    await h.api.copyImage()
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.exportFailNotLoaded', 'error')
  })

  it('**blob 为 null（canvas 被污染）→ notify 跨域错误**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    toBlobImpl = (cb) => cb(null)
    const h = makeHost()
    await h.api.copyImage()
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.exportFailCrossOrigin', 'error')
    expect(copyMock).not.toHaveBeenCalled()
  })

  it('**成功：blob + dataUrl 都交给剪贴板（富文本降级的粮草）+ notify 成功**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    const h = makeHost()
    await h.api.copyImage()
    // #255：第二参数 dataUrl 是 Clipboard API 失败时富文本降级的唯一输入，缺了降级通道必死
    expect(copyMock).toHaveBeenCalledWith(PNG, 'data:image/png;base64,AAAA')
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.copyOk', 'success')
  })

  it('**toDataURL 抛错（理论上不会：blob 出了说明未污染）→ 只少降级通道，主通道照走**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => {
      throw new DOMException('tainted', 'SecurityError')
    }) as never
    const h = makeHost()
    await h.api.copyImage()
    expect(copyMock).toHaveBeenCalledWith(PNG, undefined)
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.copyOk', 'success')
  })

  it('**剪贴板返回 false → notify 复制失败**', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('CORS')))
    copyMock.mockResolvedValue(false)
    const h = makeHost()
    await h.api.copyImage()
    expect(h.notify).toHaveBeenCalledWith('T:imagePreview.copyFail', 'error')
  })
})

/* ═══════════ 返回值契约 ═══════════ */

describe('返回值契约', () => {
  it('**暴露四个方法**', () => {
    const h = makeHost()
    expect(Object.keys(h.api).sort()).toEqual([
      'buildExportCanvas',
      'copyImage',
      'downloadImage',
      'toPngBlob',
    ])
  })
})