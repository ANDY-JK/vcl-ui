/**
 * `useTableScreenshot` —— DataTable 截图导出的**编排层**（第 121 轮）。
 *
 * 为什么此前一直没人测：真正的重活（canvas 自绘、html2canvas、剪贴板降级）都在下游模块里，
 * 而这一层只做"取表 → 上限守卫 → 分发到下载/复制/预览"。看着像胶水，但它决定三件事，
 * 且每一件出错的后果都很具体：
 *   ① **行数上限守卫**：几千行不拦 → canvas 高度超过浏览器上限（约 16383px@2x）→ 黑屏/卡死；
 *   ② **分发是否真的走了对应交付方式**（预览模式却触发下载 = 用户点一下电脑就开始下载文件）；
 *   ③ **资源回收**：预览弹窗关闭时必须把 dataUrl/blob **主动释放** —— 一张 2x 的全表截图
 *      是几 MB 的字符串，按十几次导出不释放就是内存只增不减。
 *
 * 下游模块（canvas-screenshot / useScreenshot）在此全部 mock：本文件只验编排逻辑，
 * 它们的内部行为已由 `canvas-screenshot.spec.ts` / `use-screenshot-deep.spec.ts` /
 * `screenshot-copy-cleanup.spec.ts` 覆盖，不在这里重复。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureTableCanvas = vi.fn()
const downloadScreenshot = vi.fn()
const copyScreenshotToClipboard = vi.fn()

vi.mock('@/components/data/composables/canvas-screenshot', () => ({
  captureTableCanvas: (...a: unknown[]) => captureTableCanvas(...a),
}))
vi.mock('@/components/_internal/useScreenshot', () => ({
  downloadScreenshot: (...a: unknown[]) => downloadScreenshot(...a),
  copyScreenshotToClipboard: (...a: unknown[]) => copyScreenshotToClipboard(...a),
}))

const { useTableScreenshot } = await import('@/components/data/composables/useTableScreenshot')

const DATA_URL = 'data:image/png;base64,AAAA'
const BLOB = new Blob(['x'], { type: 'image/png' })

/** 造一个"表格"：rows 行（含表头），scrollHeight 可指定 */
function fakeTable(rows: number, scrollHeight = 400): HTMLTableElement {
  const table = document.createElement('table')
  for (let i = 0; i < rows; i++) table.appendChild(document.createElement('tr'))
  Object.defineProperty(table, 'scrollHeight', { value: scrollHeight, configurable: true })
  return table
}

function setup(opts: { rows?: number; scrollHeight?: number; table?: HTMLTableElement | null; mode?: string } = {}) {
  const notify = vi.fn()
  const t = vi.fn((key: string) => `T:${key}`)
  const closeOtherModals = vi.fn()
  const getShotTable = vi.fn(() => ('table' in opts ? opts.table : fakeTable(opts.rows ?? 3, opts.scrollHeight)))
  const api = useTableScreenshot({
    getShotTable,
    maxRows: () => 100,
    shotMode: () => (opts.mode ?? 'preview') as 'preview' | 'download' | 'copy',
    notify,
    t,
    closeOtherModals,
  })
  return { ...api, notify, t, closeOtherModals, getShotTable }
}

beforeEach(() => {
  captureTableCanvas.mockReset().mockResolvedValue({ dataUrl: DATA_URL, blob: BLOB, canvas: null })
  downloadScreenshot.mockReset().mockReturnValue(true)
  copyScreenshotToClipboard.mockReset().mockResolvedValue(true)
})

// ════════════════════════════════════════════════════════════════════
// 上限守卫：花大代价之前先拦
// ════════════════════════════════════════════════════════════════════
describe('行数/高度上限守卫（先拦再画，别让浏览器黑屏）', () => {
  it('行数超过 maxRows → 警告并不截图（一次 canvas 都不画）', async () => {
    const s = setup({ rows: 101 })
    await s.capture()
    expect(captureTableCanvas).not.toHaveBeenCalled()
    expect(s.notify).toHaveBeenCalledWith('T:table.tooManyRows', 'warning')
    expect(s.modal.value.visible).toBe(false)
  })

  it('行数正好等于上限 → 放行（边界不该被误拦）', async () => {
    const s = setup({ rows: 100 })
    await s.capture()
    expect(captureTableCanvas).toHaveBeenCalledTimes(1)
  })

  it('行数不多但**高度**超 8000px → 同样拦（虚拟化表格一行也能很高）', async () => {
    const s = setup({ rows: 5, scrollHeight: 8001 })
    await s.capture()
    expect(captureTableCanvas, '高度超限比行数超限更隐蔽').not.toHaveBeenCalled()
    expect(s.notify).toHaveBeenCalledWith('T:table.tooManyRows', 'warning')
  })

  it('没有表格元素 → 行数按 0 计，照样尝试截图（由下游返回 null 兜底）', async () => {
    captureTableCanvas.mockResolvedValue(null)
    const s = setup({ table: null })
    await s.capture()
    expect(captureTableCanvas).toHaveBeenCalledWith(null)
    expect(s.notify).toHaveBeenCalledWith('T:table.screenshotFail', 'error')
  })

  it('截图前先关掉其它内部弹窗（否则 ModalManager 冲突）', async () => {
    const s = setup()
    await s.capture()
    expect(s.closeOtherModals).toHaveBeenCalledTimes(1)
    // 顺序：先关弹窗，再取表格
    expect(s.closeOtherModals.mock.invocationCallOrder[0]).toBeLessThan(s.getShotTable.mock.invocationCallOrder[0])
  })
})

// ════════════════════════════════════════════════════════════════════
// 分发：三种交付方式
// ════════════════════════════════════════════════════════════════════
describe('按 shotMode 分发', () => {
  it('download → 直接下载并提示成功；**不**打开预览弹窗', async () => {
    const s = setup({ mode: 'download' })
    await s.capture()
    expect(downloadScreenshot).toHaveBeenCalledWith(DATA_URL)
    expect(s.notify).toHaveBeenCalledWith('T:table.screenshotDownloaded', 'success')
    expect(s.modal.value.visible, '下载模式不该再弹预览').toBe(false)
    expect(copyScreenshotToClipboard).not.toHaveBeenCalled()
  })

  it('copy → 交给剪贴板；成功与失败是**两种**提示（失败不能报成功）', async () => {
    const s = setup({ mode: 'copy' })
    await s.capture()
    expect(copyScreenshotToClipboard).toHaveBeenCalledWith(BLOB, DATA_URL)
    expect(s.notify).toHaveBeenLastCalledWith('T:table.screenshotCopied', 'success')

    copyScreenshotToClipboard.mockResolvedValue(false)
    await s.capture()
    expect(s.notify).toHaveBeenLastCalledWith('T:table.screenshotCopyFail', 'error')
  })

  it('preview → 打开弹窗并带上 dataUrl/blob；期间不下载、不碰剪贴板', async () => {
    const s = setup({ mode: 'preview' })
    await s.capture()
    expect(s.modal.value).toEqual({ visible: true, dataUrl: DATA_URL, blob: BLOB })
    expect(downloadScreenshot).not.toHaveBeenCalled()
    expect(copyScreenshotToClipboard).not.toHaveBeenCalled()
  })

  it('截图失败（下游返回 null）→ 报错且**不进预览**（不能让用户看见空白弹窗）', async () => {
    captureTableCanvas.mockResolvedValue(null)
    const s = setup()
    await s.capture()
    expect(s.notify).toHaveBeenCalledWith('T:table.screenshotFail', 'error')
    expect(s.modal.value.visible).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════════
// 预览弹窗内的两个按钮
// ════════════════════════════════════════════════════════════════════
describe('预览弹窗内的 下载 / 复制', () => {
  it('downloadFromModal → 下载、提示、并关闭弹窗', async () => {
    const s = setup()
    await s.capture()
    s.downloadFromModal()
    expect(downloadScreenshot).toHaveBeenCalledWith(DATA_URL)
    expect(s.notify).toHaveBeenLastCalledWith('T:table.screenshotDownloaded', 'success')
    expect(s.modal.value.visible).toBe(false)
  })

  it('copyFromModal → 用弹窗里存的 blob 复制，然后关闭弹窗', async () => {
    const s = setup()
    await s.capture()
    await s.copyFromModal()
    expect(copyScreenshotToClipboard).toHaveBeenCalledWith(BLOB, DATA_URL)
    expect(s.modal.value.visible).toBe(false)
  })

  it('**blob 缺失时不去调剪贴板**，直接报失败（别把 undefined 递给 Clipboard API）', async () => {
    const s = setup()
    s.modal.value = { visible: true, dataUrl: DATA_URL, blob: null }
    await s.copyFromModal()
    expect(copyScreenshotToClipboard, 'blob 为空就别调').not.toHaveBeenCalled()
    expect(s.notify).toHaveBeenLastCalledWith('T:table.screenshotCopyFail', 'error')
  })
})

// ════════════════════════════════════════════════════════════════════
// 资源回收：一张全表截图是几 MB 的常驻字符串
// ════════════════════════════════════════════════════════════════════
describe('关闭预览后必须释放 dataUrl/blob（按多次导出不释放 = 内存只增不减）', () => {
  it('downloadFromModal 之后 dataUrl 与 blob 都被清空', async () => {
    const s = setup()
    await s.capture()
    expect(s.modal.value.dataUrl, '前提：预览时确实存了大字符串').not.toBe('')

    s.downloadFromModal()
    expect(s.modal.value.dataUrl, '几 MB 的 dataURL 不该继续挂着').toBe('')
    expect(s.modal.value.blob).toBeNull()
  })

  it('copyFromModal 之后同样释放（成功与失败两条路径都要）', async () => {
    const s = setup()
    await s.capture()
    await s.copyFromModal()
    expect(s.modal.value.dataUrl).toBe('')
    expect(s.modal.value.blob).toBeNull()

    copyScreenshotToClipboard.mockResolvedValue(false)
    await s.capture()
    await s.copyFromModal()
    expect(s.modal.value.dataUrl, '复制失败也不能把大字符串留着').toBe('')
    expect(s.modal.value.blob).toBeNull()
  })

  it('连续三次 preview → 每次只留一份（不会累积成三份）', async () => {
    const s = setup()
    const big = 'data:image/png;base64,' + 'A'.repeat(4096)
    captureTableCanvas.mockResolvedValue({ dataUrl: big, blob: BLOB, canvas: null })
    for (let i = 0; i < 3; i++) await s.capture()
    expect(s.modal.value.dataUrl).toBe(big)
    expect(s.modal.value.dataUrl.length, '始终只有一份截图，不是累加').toBe(big.length)
  })
})