// captureTableCanvas 行为锁定测试（Canvas 自绘表格截图：null 守卫/2x 缩放/文本截断/多行上限/toBlob 失败）
// happy-dom 无真实 canvas 渲染管线 → 用桩 canvas 替代，只锁逻辑不锁像素
import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureTableCanvas } from '@/components/data/composables/canvas-screenshot'

type CtxSpy = {
  scaleCalls: number[]
  fillTextCalls: Array<[string, number, number]>
  measureText: (t: string) => { width: number }
}

function makeFakeCanvas(opts: { toBlobFail?: boolean } = {}) {
  const spy: CtxSpy = {
    scaleCalls: [],
    fillTextCalls: [],
    // 每个字符 7px（与「截断算法可预期」的约定）
    measureText: (t: string) => ({ width: t.length * 7 }),
  }
  const ctx = {
    scale: (...a: number[]) => spy.scaleCalls.push(...a),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: (t: string, x: number, y: number) => spy.fillTextCalls.push([String(t), x, y]),
    measureText: spy.measureText,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    textAlign: 'left',
    textBaseline: 'middle',
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,FAKE',
    toBlob: (cb: BlobCallback) => {
      setTimeout(() => cb(opts.toBlobFail ? null : new Blob(['png'], { type: 'image/png' })), 0)
    },
  } as unknown as HTMLCanvasElement

  // 只劫持 canvas 标签，其它走原实现（先拿引用防自递归）
  const orig = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
    tag === 'canvas' ? canvas : (orig(tag) as never)) as never)
  return { canvas, spy }
}

/** 造一张 2 行 × 2 列的真 DOM 表格（行高 40 / 格宽 100 经 getBoundingClientRect 桩） */
function makeTable(rows: Array<Array<string | { text: string }>>): HTMLTableElement {
  const table = document.createElement('table')
  document.body.appendChild(table)
  for (const row of rows) {
    const tr = document.createElement('tr')
    table.appendChild(tr)
    vi.spyOn(tr, 'getBoundingClientRect').mockReturnValue({ height: 40 } as DOMRect)
    for (const cell of row) {
      const td = document.createElement('td')
      const text = typeof cell === 'string' ? cell : cell.text
      td.textContent = text
      Object.defineProperty(td, 'innerText', { value: text, configurable: true })
      tr.appendChild(td)
      vi.spyOn(td, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect)
    }
  }
  Object.defineProperty(table, 'scrollWidth', { value: 200, configurable: true })
  Object.defineProperty(table, 'scrollHeight', { value: 80, configurable: true })
  return table
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('captureTableCanvas', () => {
  it('table 为 null → 直接返回 null', async () => {
    expect(await captureTableCanvas(null)).toBeNull()
  })

  it('2d 上下文拿不到（getContext 返回 null）→ null', async () => {
    // 只让 canvas 标签走桩（getContext 返回 null），其它标签走真实现
    const orig = document.createElement.bind(document)
    const badCanvas = { getContext: () => null } as unknown as HTMLCanvasElement
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) =>
      tag === 'canvas' ? badCanvas : (orig(tag) as never)) as never)
    expect(await captureTableCanvas(makeTable([['a']]))).toBeNull()
  })

  it('正常捕获：2x 缩放尺寸 / 白底填充 / 文本逐格绘制 / 返回 dataUrl+Blob', async () => {
    const { canvas, spy } = makeFakeCanvas()
    const table = makeTable([
      ['A1', 'B1'],
      [{ text: 'l1\nl2\nl3\nl4' }, 'D2'],
    ])
    const result = await captureTableCanvas(table)
    expect(result).not.toBeNull()
    expect(canvas.width).toBe(400) // 200 × 2
    expect(canvas.height).toBe(160) // 80 × 2
    expect(spy.scaleCalls).toEqual([2, 2])
    expect(result!.dataUrl).toBe('data:image/png;base64,FAKE')
    expect(result!.blob).toBeInstanceOf(Blob)
    // 每格 drawText：A1/B1 + 多行取前 3 行（l1,l2,l3；l4 被 slice(0,3) 截）+ D2 = 6 次
    expect(spy.fillTextCalls.map((c) => c[0])).toEqual(['A1', 'B1', 'l1', 'l2', 'l3', 'D2'])
  })

  it('文本超列宽：按 measureText 截断加省略号（7px/字，maxW=84 → 11 字 + …）', async () => {
    const { spy } = makeFakeCanvas()
    const long = '长'.repeat(20) // 140px > 84px
    const table = makeTable([[{ text: long }, '短']])
    await captureTableCanvas(table)
    const first = spy.fillTextCalls[0][0]
    expect(first.endsWith('…')).toBe(true)
    expect(first).toBe('长'.repeat(11) + '…') // 12 字时 (12+1)×7=91>84 继续切；11 字时 12×7=84 停
  })

  it('toBlob 返回 null → reject（不静默吞掉）', async () => {
    makeFakeCanvas({ toBlobFail: true })
    const table = makeTable([['a']])
    await expect(captureTableCanvas(table)).rejects.toThrow('toBlob failed')
  })
})
