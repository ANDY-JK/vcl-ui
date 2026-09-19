// 修复锁定：Chart 的 toolbar 曾经只写进 BuildParams（没有任何 builder 读它），
// 而 BaseChart 用它自己的默认值建 toolbox → <Chart :toolbar="false"> 静默不生效。
// 现在 toolbar 必须由模板绑给 BaseChart，且不再出现在 buildParams 的返回值里。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const src = readFileSync(resolve(process.cwd(), 'src/components/chart/Chart.vue'), 'utf8')

function buildParamsBody(): string {
  const start = src.indexOf('function buildParams')
  const end = src.indexOf('\n}\n', start)
  return src.slice(start, end)
}

function baseChartTag(): string {
  const start = src.indexOf('<BaseChart')
  return src.slice(start, src.indexOf('/>', start))
}

describe('Chart · toolbar 透传链', () => {
  it('模板把 toolbar 绑给 BaseChart', () => {
    expect(baseChartTag()).toMatch(/:toolbar="toolbar"/)
  })

  it('buildParams 不再声明 toolbar —— 全仓无 builder 消费，留着就是假接口', () => {
    expect(buildParamsBody()).not.toMatch(/toolbar:/)
  })
})
