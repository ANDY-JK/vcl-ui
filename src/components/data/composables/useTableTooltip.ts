/**
 * DataTable 截断文本气泡 composable
 *
 * 功能：当单元格文本被截断（ellipsis）时，hover 300ms 后显示 tooltip。
 * - 自动检测文本是否溢出（scrollWidth > clientWidth）
 * - 超过 50 字的有弹窗图标，不用 tooltip
 * - 使用 computeFloatingPosition 自动判断弹出方向（上/下）
 * - HTML 转义 + \n→<br> 支持多行文本
 */
import { ref, onUnmounted, type Ref } from 'vue'
import { computeFloatingPosition } from '@/components/_internal/useFloating'
import { EXPAND_ICON_TEXT_MIN } from './utils'

export interface UseTableTooltipOptions {
  /** 截断模式，仅 ellipsis 模式下激活 tooltip */
  truncateMode: Ref<string>
}

export interface TableTooltipReturn {
  _tooltipText: Ref<string>
  _tooltipVisible: Ref<boolean>
  _tooltipStyle: Ref<Record<string, string>>
  showTooltip: (e: MouseEvent, text: string) => void
  hideTooltip: () => void
  onTooltipKeydown: (e: KeyboardEvent) => void
}

export function useTableTooltip(options: UseTableTooltipOptions): TableTooltipReturn {
  const { truncateMode } = options

  const _tooltipText = ref('')
  const _tooltipVisible = ref(false)
  const _tooltipStyle = ref<Record<string, string>>({})
  let _tooltipTimer: ReturnType<typeof setTimeout> | null = null

  function showTooltip(e: MouseEvent, text: string) {
    if (!text || truncateMode.value !== 'ellipsis') return
    // 超长文本由展开图标承接（阈值与 DataTable 渲染图标的判定同源）
    if (text.length > EXPAND_ICON_TEXT_MIN) return
    const td = (e.target as HTMLElement).closest('td') as HTMLElement | null
    if (!td) return
    // 检测内部 .cell-text-inner span 是否溢出
    const span = td.querySelector('.cell-text-inner') as HTMLElement | null
    if (!span || span.scrollWidth <= span.clientWidth + 2) return
    _tooltipTimer = setTimeout(() => {
      const rect = td.getBoundingClientRect()
      // 转义 HTML 后 \n → <br>，支持多行文本正常换行
      _tooltipText.value = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\n/g, '<br>')
      _tooltipStyle.value = (() => {
        const result = computeFloatingPosition({
          rect,
          floatingW: Math.min(400, window.innerWidth - rect.left - 16),
          floatingH: 80, // 预估 tooltip 高度
          offset: 4,
          defaultDirection: 'down',
        })
        const base: Record<string, string> = {
          position: 'fixed',
          left: `${result.left}px`,
          maxWidth: `${Math.min(400, window.innerWidth - result.left - 16)}px`,
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 'var(--z-tooltip, 3000)',
        }
        // above 模式用 bottom 定位，底边贴着单元格顶部
        return result.above
          ? { ...base, bottom: `${window.innerHeight - rect.top + 4}px`, top: 'auto' }
          : { ...base, top: `${result.top}px` }
      })()
      _tooltipVisible.value = true
    }, 300)
  }

  function hideTooltip() {
    if (_tooltipTimer) {
      clearTimeout(_tooltipTimer)
      _tooltipTimer = null
    }
    _tooltipVisible.value = false
  }

  function onTooltipKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') hideTooltip()
  }

  onUnmounted(() => {
    if (_tooltipTimer) clearTimeout(_tooltipTimer)
  })

  return {
    _tooltipText,
    _tooltipVisible,
    _tooltipStyle,
    showTooltip,
    hideTooltip,
    onTooltipKeydown,
  }
}
