// ⛔ 保护 — 瀑布图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { buildCommonChrome, buildXAxis, buildYAxis } from '../common'

export function buildWaterfall(p: BuildParams): EChartsOption {
  const common = buildCommonChrome(p)
  const rawData = (p.series[0]?.data as number[]) || []
  let cumulative = 0
  const base: (number | string)[] = [],
    values: number[] = [],
    pos: boolean[] = []
  for (let i = 0; i < rawData.length; i++) {
    const v = rawData[i]
    if (i === 0) {
      base.push(0)
      values.push(v >= 0 ? v : 0)
      cumulative = v
    } else {
      const val = v
      if (val >= 0) {
        base.push(cumulative)
        values.push(val)
      } else {
        base.push(cumulative + val)
        values.push(Math.abs(val))
      }
      cumulative += val
    }
    pos.push(v >= 0)
  }
  return {
    ...common,
    xAxis: buildXAxis(p),
    yAxis: buildYAxis(p),
    series: [
      {
        type: 'bar' as const,
        name: '基底',
        data: base as (number | string)[],
        stack: 'wf',
        itemStyle: { color: 'transparent' },
        barMaxWidth: 48,
      },
      {
        type: 'bar' as const,
        name: p.series[0]?.name || '数值',
        data: values.map((v, i) => ({ value: v, itemStyle: { color: pos[i] ? '#22AD5F' : '#E54545' } })),
        stack: 'wf',
        barMaxWidth: 48,
      },
    ],
  }
}
