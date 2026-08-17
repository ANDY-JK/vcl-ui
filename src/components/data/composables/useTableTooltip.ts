// ==================== 截断 tooltip + 单元格详情弹窗 ====================
import { ref } from 'vue'

export function useTableTooltip(props: { truncateMode?: 'ellipsis' | 'wrap' | 'none' }) {
  const _tooltipText = ref('')
  const _tooltipVisible = ref(false)
  const _tooltipStyle = ref<Record<string, string>>({})
  let _tooltipTimer: ReturnType<typeof setTimeout> | null = null

  function showTooltip(e: MouseEvent, text: string) {
    if (!text || props.truncateMode !== 'ellipsis') return
    if (text.length > 50) return
    const td = (e.target as HTMLElement).closest('td') as HTMLElement | null
    if (!td) return
    const span = td.querySelector('.cell-text-inner') as HTMLElement | null
    if (!span || span.scrollWidth <= span.clientWidth + 2) return
    _tooltipTimer = setTimeout(() => {
      const rect = td.getBoundingClientRect()
      _tooltipText.value = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>')
      _tooltipStyle.value = {
        position: 'fixed',
        left: `${Math.max(4, rect.left)}px`,
        top: `${rect.bottom + 4}px`,
        maxWidth: `${Math.min(400, window.innerWidth - rect.left - 16)}px`,
        maxHeight: '200px',
        overflowY: 'auto',
        zIndex: 'var(--z-tooltip, 3000)',
      }
      _tooltipVisible.value = true
    }, 300)
  }

  function hideTooltip() {
    if (_tooltipTimer) { clearTimeout(_tooltipTimer); _tooltipTimer = null }
    _tooltipVisible.value = false
  }

  function onTooltipKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') hideTooltip()
  }

  /** 清理定时器（供 onUnmounted 调用） */
  function cleanupTooltip() {
    if (_tooltipTimer) clearTimeout(_tooltipTimer)
  }

  return {
    _tooltipText,
    _tooltipVisible,
    _tooltipStyle,
    showTooltip,
    hideTooltip,
    onTooltipKeydown,
    cleanupTooltip,
  }
}

// ==================== 截断单元格详情弹窗 ====================
export function useCellDetailModal() {
  const _cellDetailModal = ref<{ visible: boolean; title: string; content: string }>({
    visible: false, title: '', content: '',
  })

  function openCellDetail(colTitle: string, text: string, closeScreenshot?: () => void) {
    if (closeScreenshot) closeScreenshot()
    _cellDetailModal.value = { visible: true, title: colTitle, content: text }
  }

  return {
    _cellDetailModal,
    openCellDetail,
  }
}

// ==================== 图片预览灯箱 ====================
export function useImageLightbox() {
  let _lightboxTimer: ReturnType<typeof setTimeout> | null = null
  const _lightboxSrc = ref('')

  function onImageClick(_e: MouseEvent, src: string) {
    if (_lightboxTimer) { clearTimeout(_lightboxTimer); _lightboxTimer = null; return }
    _lightboxTimer = setTimeout(() => {
      _lightboxSrc.value = src
      _lightboxTimer = null
    }, 280)
  }

  function closeLightbox() { _lightboxSrc.value = '' }

  function cleanupLightbox() {
    if (_lightboxTimer) clearTimeout(_lightboxTimer)
  }

  return {
    _lightboxSrc,
    onImageClick,
    closeLightbox,
    cleanupLightbox,
  }
}
