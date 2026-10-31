// captureTableCanvas 行为锁定测试（Canvas 自绘表格截图：null 守卫/2x 缩放/文本截断/多行上限/toBlob 失败）
// happy-dom 无真实 canvas 渲染管线 → 用桩 canvas 替代，只锁逻辑不锁像素
import { describe, it, expect, vi, afterEach } from 'vitest'
import { captureTableCanvas } from '@/components/data/composables/canvas-screenshot'

type CtxSpy = {
  scaleCalls: number[]
  fillTextCalls: Array<[string, number, number]>
  measureText: (t: string) => { width: number }
  /** 每次 fillRect 的样式快照（TD-80：不只记"调了什么方法"，还要记"用什么样式调"） */
  fills: Array<{ style: string; x: number; y: number; w: number; h: number }>
  /** 每次 strokeRect 的样式快照（边框色 / 线宽 / 半像素偏移都是易回归项） */
  strokes: Array<{ style: string; width: number; x: number; y: number; w: number; h: number }>
  /** 每次 fillText 的样式快照（颜色 / 字号 / 对齐方式） */
  texts: Array<{ style: string; font: string; align: string; text: string }>
}

function makeFakeCanvas(opts: { toBlobFail?: boolean } = {}) {
  const spy: CtxSpy = {
    scaleCalls: [],
    fillTextCalls: [],
    // 每个字符 7px（与「截断算法可预期」的约定）
    measureText: (t: string) => ({ width: t.length * 7 }),
    fills: [],
    strokes: [],
    texts: [],
  }
  // 属性的值必须**在调用发生时**快照，不能事后读 ctx.fillStyle
  // （下一次赋值会覆盖，旧断言就永远看不到"这次用的是哪个颜色"—— 正是 TD-80 的漏洞形态）
  const ctx = {
    scale: (...a: number[]) => spy.scaleCalls.push(...a),
    fillRect(x: number, y: number, w: number, h: number) {
      spy.fills.push({ style: String(this.fillStyle), x, y, w, h })
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      spy.strokes.push({ style: String(this.strokeStyle), width: Number(this.lineWidth), x, y, w, h })
    },
    fillText(t: string, x: number, y: number) {
      spy.fillTextCalls.push([String(t), x, y])
      spy.texts.push({ style: String(this.fillStyle), font: String(this.font), align: String(this.textAlign), text: String(t) })
    },
    measureText: spy.measureText,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
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

  it('文本超列宽：列宽自适应扩到内容自然宽，文本完整绘制（不再截断加…）', async () => {
    const { canvas, spy } = makeFakeCanvas()
    const long = '长'.repeat(20) // 20 字 × 7px = 140px 自然宽；呈现宽 100 被截断
    const table = makeTable([[{ text: long }, '短']])
    await captureTableCanvas(table)
    // 文本完整（无省略号）——用户反馈「截图内容显示不全」的行为锁
    expect(spy.fillTextCalls[0][0]).toBe(long)
    // 画布宽 = 自适应后：长文本列扩到 140+16=156，短列保持 100 → (156+100)×2
    expect(canvas.width).toBe(512)
  })

  it('未被截断的列保持呈现宽（自适应只扩不缩，与页面观感一致）', async () => {
    const { canvas } = makeFakeCanvas()
    const table = makeTable([['短', '也短']])
    await captureTableCanvas(table)
    expect(canvas.width).toBe(400) // 100+100，各列未被截断 → 不变
  })

  it('虚拟滚动占位行（aria-hidden）不计入画布高度与绘制', async () => {
    const { canvas, spy } = makeFakeCanvas()
    const table = makeTable([['A1'], ['B1']])
    // 模拟虚拟滚动上下占位：单格大高度、aria-hidden、无内容
    for (const h of [900, 800]) {
      const tr = document.createElement('tr')
      tr.setAttribute('aria-hidden', 'true')
      const td = document.createElement('td')
      tr.appendChild(td)
      vi.spyOn(tr, 'getBoundingClientRect').mockReturnValue({ height: h } as DOMRect)
      table.appendChild(tr)
    }
    await captureTableCanvas(table)
    // 画布高只含两行真实数据（40+40）×2，占位行的 1700px 不计入 —— 「图片太大很空」的行为锁
    expect(canvas.height).toBe(160)
    // 占位行无内容 → 不产生 fillText
    expect(spy.fillTextCalls.map((c) => c[0])).toEqual(['A1', 'B1'])
  })

  it('toBlob 返回 null → reject（不静默吞掉）', async () => {
    makeFakeCanvas({ toBlobFail: true })
    const table = makeTable([['a']])
    await expect(captureTableCanvas(table)).rejects.toThrow('toBlob failed')
  })
})

/* ════════════════════════════════════════
 * 绘制样式锁定（TD-80 收口，2026-11-01 #275）
 *
 * 旧 mock 只暴露 `fillStyle: ''` 这样的**可变属性**，断言只能比"调了 fillRect 几次"。
 * 于是"表头底色错了 / 边框色错了 / 文字颜色错了"这类回归**全绿通过** ——
 * 第 182 轮 pen 高亮被换成白描边、藏了两轮，就是这个形态。
 * 现在 mock 在**调用发生时**快照样式（下一次赋值不会覆盖），下面锁住关键绘制口径。
 * ════════════════════════════════════════ */
describe('绘制样式（不只比方法名）', () => {
  it('**底色先铺白**：第一笔 fillRect 必须是 #ffffff 铺满整张画布', () => {
    const { spy } = makeFakeCanvas()
    return captureTableCanvas(makeTable([['甲'], ['乙']])).then(() => {
      expect(spy.fills[0], '第一笔应是铺底').toEqual({ style: '#ffffff', x: 0, y: 0, w: expect.any(Number), h: expect.any(Number) })
      // 铺底必须覆盖整张画布，否则透明底在深色页面上会露出后面的内容
      expect(spy.fills[0]!.w).toBeGreaterThan(0)
      expect(spy.fills[0]!.h).toBeGreaterThan(0)
    })
  })

  it('**每个单元格先填背景再描边框**，边框色 #d8dee9、线宽 1、半像素偏移', () => {
    const { spy } = makeFakeCanvas()
    return captureTableCanvas(makeTable([['甲', '乙'], ['丙', '丁']])).then(() => {
      // 2 行 × 2 列 → 4 次描边
      expect(spy.strokes.length, '每格一次描边').toBe(4)
      for (const s of spy.strokes) {
        expect(s.style, '边框色固定 #d8dee9').toBe('#d8dee9')
        expect(s.width, '线宽 1').toBe(1)
        // 半像素偏移是"1px 边框不发虚"的关键；取整成整数会让线糊成两像素
        expect(s.x % 1, 'x 半像素偏移').toBe(0.5)
        expect(s.y % 1, 'y 半像素偏移').toBe(0.5)
      }
      // 填背景次数 = 格数（另加 1 次整张铺底）
      expect(spy.fills.length, '铺底 1 次 + 每格 1 次').toBe(5)
    })
  })

  it('**文字颜色/字号取自计算样式**（不是硬编码黑）；每个有文本的格都有 fillText', () => {
    const { spy } = makeFakeCanvas()
    return captureTableCanvas(makeTable([['甲', '乙'], ['丙', '丁']])).then(() => {
      expect(spy.texts.length, '2 行 × 2 列都有文本').toBe(4)
      for (const t of spy.texts) {
        expect(t.style, '文字色应来自 cs.color').not.toBe('')
        expect(t.font, '字号应来自 cs.fontSize/fontFamily').not.toBe('')
        expect(t.align).toMatch(/^(left|center|right)$/)
      }
      // 表头文字与内容文字都要画出来（不是只画了内容）
      const all = spy.texts.map((t) => t.text).join('|')
      expect(all).toContain('甲')
      expect(all).toContain('乙')
    })
  })
})
describe('样式取不到时的兜底（#275）', () => {
  it('**计算样式为空时文字仍用可见颜色/字体**（否则 Canvas 静默忽略非法赋值 → 沿用背景色）', () => {
    const { spy } = makeFakeCanvas()
    // happy-dom 的 getComputedStyle 对无样式表元素返回空串 —— 正好模拟"样式表没加载"
    return captureTableCanvas(makeTable([['甲', '乙']])).then(() => {
      expect(spy.texts.length).toBe(2)
      for (const t of spy.texts) {
        expect(t.style, '文字色不能是空串（空串赋值在 Canvas 里被忽略）').not.toBe('')
        expect(t.style, '兜底色必须与白底可区分').not.toBe('#ffffff')
        expect(t.font, '字体串不能含空段').not.toMatch(/^\s|^\s*$|\s$/)
        expect(t.font, '字体必须有尺寸').toMatch(/\d+px/)
      }
    })
  })
})
