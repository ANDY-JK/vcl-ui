// 修复锁定：markArea 全链路已实现（ChartProps.markArea → buildMarkArea → series.markArea），
// 但按需注册表漏了 MarkAreaComponent → ECharts 运行时报「markArea is used but not imported」且静默不绘制。
// 注册清单属 ⛔ 保护区：本用例只锁「已导入 + 追加在既有清单末尾」，不锁具体顺序调整。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/components/chart/utils/echarts-setup.ts'), 'utf8')

function useBlock(): string {
  const start = src.indexOf('use([')
  return src.slice(start, src.indexOf('])', start))
}

describe('echarts 按需注册 · MarkAreaComponent', () => {
  it('从 echarts/components 导入 MarkAreaComponent', () => {
    expect(src).toMatch(/MarkAreaComponent,[\s\S]{0,40}from 'echarts\/components'/)
  })

  it('注册进 use([...])，且追加在既有清单末尾（既有相对顺序不变）', () => {
    const block = useBlock()
    const iMarkLine = block.indexOf('MarkLineComponent')
    const iMarkPoint = block.indexOf('MarkPointComponent')
    const iTimeline = block.indexOf('TimelineComponent')
    const iMarkArea = block.indexOf('MarkAreaComponent')

    expect(iMarkLine).toBeGreaterThan(-1)
    expect(iMarkPoint).toBeGreaterThan(iMarkLine)
    expect(iTimeline).toBeGreaterThan(iMarkPoint)
    expect(iMarkArea).toBeGreaterThan(iTimeline)
  })
})
