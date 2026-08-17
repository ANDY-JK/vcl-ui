// ==================== Canvas 自绘表格截图 ====================
import { ref, type Ref } from 'vue'
import { downloadScreenshot, copyScreenshotToClipboard } from '../../_internal/useScreenshot'

export interface ScreenshotState {
  visible: boolean
  dataUrl: string
  blob: Blob | null
}

export function useTableScreenshot(
  tableWrapRef: Ref<HTMLElement | null>,
  props: {
    shotMode?: 'preview' | 'download' | 'copy'
    screenshotMaxRows?: number
  },
  notify: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
  /** 关闭其他内部弹窗的回调（返回 true 表示有弹窗被关闭） */
  closeOtherModals: () => void,
) {
  const _screenshotModal = ref<ScreenshotState>({ visible: false, dataUrl: '', blob: null })

  /** Canvas 文本截断（按像素宽度） */
  function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
    if (maxW <= 0 || ctx.measureText(text).width <= maxW) return text
    let t = text
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  /** Canvas 自绘表格截图：绕开 html2canvas 对 <table> 行高的渲染缺陷 */
  async function captureTableCanvas(): Promise<{ dataUrl: string; blob: Blob; canvas: HTMLCanvasElement } | null> {
    const el = tableWrapRef.value?.querySelector('.table-scroll') as HTMLElement | null
    const table = el?.querySelector('table.data-table') as HTMLTableElement | null
    if (!table) return null
    const scale = 2
    const width = Math.max(1, table.scrollWidth)
    const height = Math.max(1, table.scrollHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const rows = [...table.querySelectorAll('tr')]
    let y = 0
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll<HTMLElement>('th, td')]
      const rowH = tr.getBoundingClientRect().height || 40
      let x = 0
      for (const cell of cells) {
        const w = cell.getBoundingClientRect().width || 120
        const cs = getComputedStyle(cell)
        // 背景（行样式/斑马纹/表头底色直接来自计算样式）
        ctx.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
          ? cs.backgroundColor
          : '#ffffff'
        ctx.fillRect(x, y, w, rowH)
        // 边框
        ctx.strokeStyle = '#d8dee9'
        ctx.lineWidth = 1
        ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, rowH - 1))
        // 文本（支持最多 3 行）
        const text = (cell.innerText || '').trim()
        if (text) {
          ctx.fillStyle = cs.color
          ctx.font = '13px "Microsoft YaHei", "PingFang SC", sans-serif'
          ctx.textAlign = (cs.textAlign || 'left') as CanvasTextAlign
          ctx.textBaseline = 'middle'
          const pad = 8
          const maxW = Math.max(0, w - pad * 2)
          const lines: string[] = text.split('\n').slice(0, 3)
          const lh = Math.min(18, rowH / lines.length)
          lines.forEach((line, i) => {
            const tx = cs.textAlign === 'center' ? x + w / 2 : cs.textAlign === 'right' ? x + w - pad : x + pad
            ctx.fillText(truncateCanvasText(ctx, line, maxW), tx, y + rowH / 2 + (i - (lines.length - 1) / 2) * lh)
          })
        }
        x += w
      }
      y += rowH
    }

    const dataUrl = canvas.toDataURL('image/png')
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png'),
    )
    return { dataUrl, blob, canvas }
  }

  async function captureScreenshot() {
    // 关闭其他内部弹窗（避免与 ModalManager 冲突）
    closeOtherModals()
    // 内容过多限制：避免几千行生成超大 canvas 卡死/黑屏
    const shotEl = tableWrapRef.value?.querySelector('.table-scroll') as HTMLElement | null
    const shotTable = shotEl?.querySelector('table.data-table')
    const rowCount = shotTable?.querySelectorAll('tr').length ?? 0
    const maxRows = props.screenshotMaxRows ?? 400
    if (rowCount > maxRows || (shotTable?.scrollHeight ?? 0) > 8000) {
      notify(`内容过多（${rowCount} 行），请先筛选或分页后再截图`, 'warning')
      return
    }
    const result = await captureTableCanvas()
    if (!result) {
      notify('截图失败，请重试', 'error')
      return
    }

    const mode = props.shotMode ?? 'preview'
    if (mode === 'download') {
      downloadScreenshot(result.dataUrl)
      notify('截图已下载', 'success')
    } else if (mode === 'copy') {
      const ok = await copyScreenshotToClipboard(result.blob, result.dataUrl)
      notify(ok ? '截图已复制' : '复制失败（当前环境可能不支持图片复制），请使用「下载 PNG」', ok ? 'success' : 'error')
    } else {
      // preview 模式：弹窗预览
      _screenshotModal.value = { visible: true, dataUrl: result.dataUrl, blob: result.blob }
    }
  }

  function downloadScreenshotFromModal() {
    downloadScreenshot(_screenshotModal.value.dataUrl)
    notify('截图已下载', 'success')
    _screenshotModal.value.visible = false
  }

  async function copyScreenshotFromModal() {
    const ok = _screenshotModal.value.blob
      ? await copyScreenshotToClipboard(_screenshotModal.value.blob, _screenshotModal.value.dataUrl)
      : false
    notify(ok ? '截图已复制' : '复制失败（当前环境可能不支持图片复制），请使用「下载 PNG」', ok ? 'success' : 'error')
    _screenshotModal.value.visible = false
  }

  return {
    _screenshotModal,
    captureScreenshot,
    downloadScreenshotFromModal,
    copyScreenshotFromModal,
  }
}
