// ⛔ 保护 — 词云 builder（依赖 echarts-wordcloud）
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { textColor } from '../common'

/** 词云条目：调用方可能传对象（{name,value}）也可能传裸字符串（默认权重 10） */
type WordCloudInput = string | number | { name?: unknown; value?: unknown }

export function buildWordCloud(p: BuildParams): EChartsOption {
  // 词云数据：期望 [{name, value}] 格式
  const wcData = p.series[0]?.data || p.data?.pieData || []
  const items = Array.isArray(wcData)
    ? (wcData as WordCloudInput[]).map((d) => {
        if (d !== null && typeof d === 'object') {
          const o = d as { name?: unknown; value?: unknown }
          return { name: String(o.name ?? ''), value: Number(o.value ?? 0) }
        }
        return { name: String(d), value: 10 } // 纯字符串默认权重 10
      })
    : []

  return {
    backgroundColor: 'transparent' as const,
    title: p.title
      ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } }
      : undefined,
    tooltip: p.showTooltip ? { show: true, formatter: '{b}: {c}' } : undefined,
    series: [
      {
        type: 'wordCloud' as const,
        shape: 'circle',
        left: 'center',
        top: p.title ? 40 : 16,
        right: null,
        bottom: null,
        width: '90%',
        height: '80%',
        sizeRange: [12, 48],
        rotationRange: [-45, 45],
        rotationStep: 45,
        gridSize: 8,
        drawOutOfBound: false,
        layoutAnimation: true,
        textStyle: {
          fontFamily: 'sans-serif',
          fontWeight: 'bold',
          color() {
            const colors = ['#4F6EF7', '#22AD5F', '#F59E0B', '#E54545', '#8B5CF6', '#EC4899', '#06B6D4']
            return colors[Math.floor(Math.random() * colors.length)]
          },
        },
        emphasis: {
          focus: 'self' as const,
          textStyle: { shadowBlur: 10, shadowColor: '#333' },
        },
        data: items as Record<string, unknown>[],
      },
    ] as Record<string, unknown>[],
  }
}
