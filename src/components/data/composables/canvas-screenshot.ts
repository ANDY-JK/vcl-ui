// ==================== 表格 Canvas 自绘截图（纯 DOM 工具，从 DataTable.vue 迁出 · §18-② 阶段 C） ====================
// 无响应式依赖：输入表格元素，输出 PNG dataURL + Blob。
// 绕开 html2canvas 对 <table> 行高的渲染缺陷（行内空白/行高翻倍/底部裁剪）。
//
// 2026-10-31（用户反馈：截图内容被截断 / 图片太大很空）重写尺寸与列宽两个口径：
//   ① 画布高度 = **实际绘制行**高之和（不再是 table.scrollHeight）—— 虚拟滚动的
//      上下占位 tr（aria-hidden、单格大高度、无内容）此前被当成普通行画进图里，
//      一张 21 行的表画布高 200044px，图里 97% 是空白格子；
//   ② 列宽自适应内容 —— 此前列宽取页面呈现宽（getBoundingClientRect），文本超出
//      即截断加 …，截图丢内容；现在先测每列内容的自然宽，被截断的列扩到自然宽
//      （未截断的列保持原宽，与页面观感一致）。固定列同样适用：扩宽按列整体生效，
//      表头与数据行仍对齐。
//   ③ 字号读计算样式（此前写死 13px，与页面实际渲染不一致）。

/** 列的自适应结果：呈现宽 vs 内容自然宽，取大者 */
interface ColSizing {
  /** 页面呈现宽（getBoundingClientRect） */
  shown: number
  /** 内容自然宽（最长文本 + 两侧 padding） */
  natural: number
}

/** 单元格文本行数上限（与旧实现一致，超出行合并为前三行） */
const MAX_TEXT_LINES = 3
/** 单元格两侧留白 */
const CELL_PAD = 8

/** Canvas 自绘表格截图 */
export async function captureTableCanvas(
  table: HTMLTableElement | null,
): Promise<{ dataUrl: string; blob: Blob; canvas: HTMLCanvasElement } | null> {
  if (!table) return null

  // 收集实际绘制行：跳过虚拟滚动的占位行（aria-hidden）
  const allRows = [...table.querySelectorAll('tr')]
  const rows = allRows.filter((tr) => tr.getAttribute('aria-hidden') !== 'true')
  if (rows.length === 0) return null

  // ── 第一遍：量尺寸（行高、列宽自适应） ──
  const measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureCtx) return null
  // 列宽按「各行列数可能不同」（表头/数据/合计行）取每列序号的最大值
  const colSizing: ColSizing[] = []
  const rowHeights: number[] = []
  const rowCells: HTMLElement[][] = []

  for (const tr of rows) {
    const cells = [...tr.querySelectorAll<HTMLElement>('th, td')]
    rowCells.push(cells)
    rowHeights.push(tr.getBoundingClientRect().height || 40)
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      const shown = cell.getBoundingClientRect().width || 120
      const text = (cell.innerText || '').trim()
      let natural = shown
      if (text && measureCtx) {
        const cs = getComputedStyle(cell)
        measureCtx.font = `${cs.fontSize} ${cs.fontFamily}`
        const textW = Math.max(
          ...text
            .split('\n')
            .slice(0, MAX_TEXT_LINES)
            .map((line) => measureCtx.measureText(line).width),
        )
        // 只有内容被呈现宽截断时才扩宽；未被截断保持原宽（与页面观感一致）
        natural = Math.max(shown, Math.ceil(textW) + CELL_PAD * 2)
      }
      colSizing[i] = {
        shown: Math.max(colSizing[i]?.shown ?? 0, shown),
        natural: Math.max(colSizing[i]?.natural ?? 0, natural),
      }
    }
  }

  // 每列最终宽：呈现宽与内容自然宽取大（自适应只扩不缩）
  const colWidths = colSizing.map((c) => Math.max(c.shown, c.natural))
  const width = Math.max(
    1,
    colWidths.reduce((a, b) => a + b, 0),
  )
  const height = Math.max(
    1,
    rowHeights.reduce((a, b) => a + b, 0),
  )

  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // ── 第二遍：绘制 ──
  let y = 0
  for (let r = 0; r < rows.length; r++) {
    const cells = rowCells[r]
    const rowH = rowHeights[r]
    let x = 0
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      const w = colWidths[i]
      const cs = getComputedStyle(cell)
      // 背景（行样式/斑马纹/表头底色直接来自计算样式）
      ctx.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#ffffff'
      ctx.fillRect(x, y, w, rowH)
      // 边框
      ctx.strokeStyle = '#d8dee9'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, rowH - 1))
      // 文本（支持最多 3 行；字号读计算样式）
      const text = (cell.innerText || '').trim()
      if (text) {
        ctx.fillStyle = cs.color
        ctx.font = `${cs.fontSize} ${cs.fontFamily}`
        ctx.textAlign = (cs.textAlign || 'left') as CanvasTextAlign
        ctx.textBaseline = 'middle'
        const maxW = Math.max(0, w - CELL_PAD * 2)
        const lines: string[] = text.split('\n').slice(0, MAX_TEXT_LINES)
        const lh = Math.min(18, rowH / lines.length)
        lines.forEach((line, li) => {
          const tx = cs.textAlign === 'center' ? x + w / 2 : cs.textAlign === 'right' ? x + w - CELL_PAD : x + CELL_PAD
          ctx.fillText(truncateCanvasText(ctx, line, maxW), tx, y + rowH / 2 + (li - (lines.length - 1) / 2) * lh)
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

/** Canvas 文本截断（按像素宽度；列已自适应后只在极端长文本时兜底触发） */
function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0 || ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}
