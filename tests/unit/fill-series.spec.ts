// fill-series 填充规则行为锁定：数字等差 / 日期按天 / 文本循环
// 背景：填充柄（拖拽批量填充）的取值推断是纯函数，必须有回归锁。
// ⚠️ 日期用例注入固定基准，避免跨月/跨年随机红。
import { describe, it, expect } from 'vitest'
import { fillLine, buildFillCells } from '@/components/data/composables/fill-series'

describe('fill-series · 数字', () => {
  it('单格向下：步长 1（Excel 默认）', () => {
    expect(fillLine(['1'], 3, true)).toEqual(['2', '3', '4'])
  })

  it('单格向上：往前递减', () => {
    expect(fillLine(['5'], 2, false)).toEqual(['4', '3'])
  })

  it('多格按首末推导步长：(10,20,30) → 40,50', () => {
    expect(fillLine(['10', '20', '30'], 2, true)).toEqual(['40', '50'])
  })

  it('小数步长不产生浮点噪声（0.1 步进）', () => {
    expect(fillLine(['0.1', '0.2'], 2, true)).toEqual(['0.3', '0.4'])
  })

  it('负数与负步长', () => {
    expect(fillLine(['-5'], 2, true)).toEqual(['-4', '-3'])
    expect(fillLine(['30', '20', '10'], 2, true)).toEqual(['0', '-10'])
  })
})

describe('fill-series · 日期', () => {
  it('单格日期按天递进', () => {
    expect(fillLine(['2026-09-12'], 3, true)).toEqual(['2026-09-13', '2026-09-14', '2026-09-15'])
  })

  it('跨月正确进位（9-30 → 10-01）', () => {
    expect(fillLine(['2026-09-30'], 1, true)).toEqual(['2026-10-01'])
  })

  it('跨年正确进位（12-31 → 次年 01-01）', () => {
    expect(fillLine(['2026-12-31'], 1, true)).toEqual(['2027-01-01'])
  })

  it('闰年 2-28 → 2-29；平年 2-28 → 3-01', () => {
    expect(fillLine(['2024-02-28'], 1, true)).toEqual(['2024-02-29'])
    expect(fillLine(['2025-02-28'], 1, true)).toEqual(['2025-03-01'])
  })

  it('多格日期按首末推导天步长（间隔 7 天）', () => {
    expect(fillLine(['2026-09-01', '2026-09-08'], 1, true)).toEqual(['2026-09-15'])
  })

  it('向上填充往前推日期', () => {
    expect(fillLine(['2026-09-12'], 2, false)).toEqual(['2026-09-11', '2026-09-10'])
  })
})

describe('fill-series · 文本与混合', () => {
  it('文本循环重复源序列（不做尾部数字递增，避免静默改写编码）', () => {
    expect(fillLine(['电子产品', '办公用品'], 4, true)).toEqual([
      '电子产品',
      '办公用品',
      '电子产品',
      '办公用品',
    ])
  })

  it('单格文本循环为同值', () => {
    expect(fillLine(['在线'], 3, true)).toEqual(['在线', '在线', '在线'])
  })

  it('SKU 编码保持循环，不擅自递增数字', () => {
    expect(fillLine(['SKU-1001'], 2, true)).toEqual(['SKU-1001', 'SKU-1001'])
  })

  it('数字与文本混合 → 走循环（不猜）', () => {
    expect(fillLine(['1', 'A'], 2, true)).toEqual(['1', 'A'])
  })

  it('空值循环填空串', () => {
    expect(fillLine([''], 2, true)).toEqual(['', ''])
  })
})

describe('fill-series · buildFillCells 方向与偏移', () => {
  const src = [
    ['1', 'A'],
    ['2', 'B'],
  ]

  it('down：每列独立推断，行偏移从源末行之后开始', () => {
    const cells = buildFillCells(src, 'down', 1)
    // 列 0 是数字 → 等差 3；列 1 是文本 → 循环 A
    expect(cells).toEqual([
      { rowOffset: 2, colOffset: 0, value: '3' },
      { rowOffset: 2, colOffset: 1, value: 'A' },
    ])
  })

  it('up：行偏移为负，紧贴源首行之上', () => {
    const cells = buildFillCells(src, 'up', 1)
    expect(cells.every((c) => c.rowOffset === -1)).toBe(true)
    expect(cells.map((c) => c.value)).toEqual(['0', 'B'])
  })

  it('right：每行独立推断，列偏移从源末列之后开始', () => {
    // 行 0 = ['1','A'] 混合 → 循环填 '1'；行 1 = ['2','B'] 混合 → 循环填 '2'
    const cells = buildFillCells(src, 'right', 1)
    expect(cells).toEqual([
      { rowOffset: 0, colOffset: 2, value: '1' },
      { rowOffset: 1, colOffset: 2, value: '2' },
    ])
  })

  it('right：纯数字行按等差横向推断', () => {
    const numeric = [['10', '20', '30']]
    const cells = buildFillCells(numeric, 'right', 2)
    expect(cells).toEqual([
      { rowOffset: 0, colOffset: 3, value: '40' },
      { rowOffset: 0, colOffset: 4, value: '50' },
    ])
  })

  it('count=0 或空源 → 无输出', () => {
    expect(buildFillCells(src, 'down', 0)).toEqual([])
    expect(buildFillCells([], 'down', 2)).toEqual([])
  })
})
