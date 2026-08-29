// ==================== 表格 Canvas 自绘截图（纯 DOM 工具，从 DataTable.vue 迁出 · §18-② 阶段 C） ====================
// 无响应式依赖：输入表格元素，输出 PNG dataURL + Blob。
// 绕开 html2canvas 对 <table> 行高的渲染缺陷（行内空白/行高翻倍/底部裁剪）。

/** Canvas 自绘表格截图 */
export async function captureTableCanvas(
  table: HTMLTableElement | null,
): Promise<{ dataUrl: string; blob: Blob; canvas: HTMLCanvasElement } | null> {
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
      ctx.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#ffffff'
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
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
  return { dataUrl, blob, canvas }
}

/** Canvas 文本截断（按像素宽度） */
function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0 || ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}
