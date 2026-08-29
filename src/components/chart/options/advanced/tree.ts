// ⛔ 保护 — 树图 builder
import type { EChartsOption } from 'echarts'
import type { BuildParams } from '../../utils/types'
import { textColor } from '../common'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：builder 生成的图表文案按当前语言 */
const t = useT()

export function buildTree(p: BuildParams): EChartsOption {
  const tData = p.data.treeData || p.series[0]?.data || [{ name: t('chart.treeRoot'), children: [] }]
  return {
    backgroundColor: 'transparent' as const,
    title: p.title
      ? { text: p.title, left: 'center', textStyle: { fontSize: 14, color: textColor(p), fontWeight: 600 } }
      : undefined,
    tooltip: p.showTooltip ? { trigger: 'item' as const, triggerOn: 'mousemove' } : undefined,
    series: [
      {
        type: 'tree' as const,
        data: tData as Record<string, unknown>[],
        left: '10%',
        right: '15%',
        top: p.title ? 40 : 16,
        bottom: 16,
        symbolSize: 8,
        orient: 'LR' as const, // 从左到右
        label: {
          position: 'left' as const,
          verticalAlign: 'middle' as const,
          align: 'right' as const,
          color: textColor(p),
          fontSize: 11,
        },
        leaves: { label: { position: 'right' as const, verticalAlign: 'middle' as const, align: 'left' as const } },
        emphasis: { focus: 'descendant' as const },
        expandAndCollapse: true,
        animationDuration: 550,
        animationDurationUpdate: 750,
      },
    ],
  }
}
