// buildMarkLine / buildMarkArea 契约（#476）
//
// 这两个 builder 是 `Chart` 的 markLine / markArea 选项入口（`options/common.ts`），
// 此前**一条用例都没有** —— coverage 里 `common.ts` 22 个未覆盖分支大部分是它们
// （单对象 vs 数组、type 型 vs 数值型、color 有无、markArea 默认色）。
// 它们决定 ECharts 拿到的数据结构，形状错了图表上就是「标注不显示」或「画错位置」。
import { describe, it, expect } from 'vitest'
import { buildMarkLine, buildMarkArea } from '@/components/chart/options/common'

describe('buildMarkLine · 形状契约', () => {
  it('undefined → undefined（不生成空 markLine）', () => {
    expect(buildMarkLine(undefined)).toBeUndefined()
  })

  it('单对象自动包成数组；输出恒为 silent + symbol:none', () => {
    const r = buildMarkLine({ value: 10 })!
    expect(r.silent).toBe(true)
    expect(r.symbol).toBe('none')
    expect(Array.isArray(r.data)).toBe(true)
    expect(r.data).toHaveLength(1)
  })

  it('type 型（average/min/max/median）→ 走 type 分支，name 缺省用 type', () => {
    const r = buildMarkLine({ type: 'average' }) as { data: Record<string, unknown>[] }
    expect(r.data[0]).toMatchObject({ type: 'average', name: 'average' })
    expect(r.data[0]!.lineStyle).toEqual({ type: 'dashed' })
  })

  it('type 型 + label + color → name 用 label、lineStyle 带颜色', () => {
    const r = buildMarkLine({ type: 'max', label: '峰值', color: '#f00' }) as { data: Record<string, unknown>[] }
    expect(r.data[0]).toMatchObject({ type: 'max', name: '峰值', lineStyle: { color: '#f00', type: 'dashed' } })
  })

  it('数值型 → 走 yAxis 分支，name 缺省用 value 字符串', () => {
    const r = buildMarkLine({ value: 42 }) as { data: Record<string, unknown>[] }
    expect(r.data[0]).toMatchObject({ yAxis: 42, name: '42' })
  })

  it('数组逐项映射，混合两种形态', () => {
    const r = buildMarkLine([{ type: 'min' }, { value: 3, label: '下限' }]) as { data: Record<string, unknown>[] }
    expect(r.data).toHaveLength(2)
    expect(r.data[0]).toMatchObject({ type: 'min' })
    expect(r.data[1]).toMatchObject({ yAxis: 3, name: '下限' })
  })

  it('反向保护：color 缺省与提供是两种形状（不该把 undefined 写进 lineStyle.color）', () => {
    const noColor = buildMarkLine({ value: 1 }) as { data: Record<string, unknown>[] }
    const withColor = buildMarkLine({ value: 1, color: '#0f0' }) as { data: Record<string, unknown>[] }
    expect(noColor.data[0]!.lineStyle).toEqual({ type: 'dashed' })
    expect(withColor.data[0]!.lineStyle).toEqual({ color: '#0f0', type: 'dashed' })
  })
})

describe('buildMarkArea · 形状契约', () => {
  it('undefined → undefined', () => {
    expect(buildMarkArea(undefined)).toBeUndefined()
  })

  it('单对象包成数组，data 是 [起点, 终点] 两项', () => {
    const r = buildMarkArea({ from: 1, to: 5 })!
    expect(r.silent).toBe(true)
    const data = r.data as Record<string, unknown>[]
    expect(data).toHaveLength(1)
    expect(data[0]).toEqual([{ yAxis: 1, itemStyle: { color: 'rgba(79,110,247,0.08)' } }, { yAxis: 5 }])
  })

  it('color 提供时覆盖默认色（默认色是设计口径，不该被静默改掉）', () => {
    const r = buildMarkArea({ from: 0, to: 2, color: '#123456' }) as { data: Record<string, unknown>[] }
    expect(r.data[0]).toEqual([
      { yAxis: 0, itemStyle: { color: '#123456' } },
      { yAxis: 2 },
    ])
  })

  it('数组逐项映射', () => {
    const r = buildMarkArea([
      { from: 0, to: 1 },
      { from: 2, to: 3, color: '#000' },
    ]) as { data: Record<string, unknown>[] }
    expect(r.data).toHaveLength(2)
    expect(r.data[1]).toEqual([{ yAxis: 2, itemStyle: { color: '#000' } }, { yAxis: 3 }])
  })
})
