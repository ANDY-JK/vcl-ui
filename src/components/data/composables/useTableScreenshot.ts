/**
 * useTableScreenshot — DataTable 截图导出编排（自主文件下沉，M3 持续拆分）
 *
 * 职责：行数上限守卫 → captureTableCanvas 截图 → 按 shotMode 分发（下载/复制/预览弹窗）。
 * 通知（notify/i18n）由宿主经回调注入；预览弹窗状态由本模块持有，DataTable 模板据
 * modal.visible 渲染 lightbox。取截图目标与「关闭其它内部弹窗」是宿主自身的布局知识，
 * 以回调注入保持模块无 DOM 结构依赖。
 */
import { ref } from 'vue'
import { captureTableCanvas } from './canvas-screenshot'
import { downloadScreenshot, copyScreenshotToClipboard } from '@/components/_internal/useScreenshot'

export interface TableScreenshotOptions {
  /** 取截图目标表格元素（.table-scroll 内的 table.data-table） */
  getShotTable: () => HTMLTableElement | null
  /** 行数上限（props.screenshotMaxRows） */
  maxRows: () => number
  /** 交付方式 */
  shotMode: () => 'preview' | 'download' | 'copy'
  /** 统一通知出口（宿主 notify） */
  notify: (message: string, type?: 'success' | 'error' | 'warning') => void
  /** i18n 文案 */
  t: (key: string, params?: Record<string, unknown>) => string
  /** 截图前需先关闭的其它内部弹窗（如单元格详情，避免与 ModalManager 冲突） */
  closeOtherModals?: () => void
}

export function useTableScreenshot(o: TableScreenshotOptions) {
  const modal = ref({ visible: false, dataUrl: '', blob: null as Blob | null })

  async function capture(): Promise<void> {
    o.closeOtherModals?.()
    // 内容过多限制：避免几千行生成超大 canvas 卡死/黑屏（浏览器 canvas 高度上限约 16383px@2x）
    const shotTable = o.getShotTable()
    const rowCount = shotTable?.querySelectorAll('tr').length ?? 0
    if (rowCount > o.maxRows() || (shotTable?.scrollHeight ?? 0) > 8000) {
      o.notify(o.t('table.tooManyRows', { n: rowCount }), 'warning')
      return
    }
    const result = await captureTableCanvas(shotTable)
    if (!result) {
      o.notify(o.t('table.screenshotFail'), 'error')
      return
    }

    if (o.shotMode() === 'download') {
      downloadScreenshot(result.dataUrl)
      o.notify(o.t('table.screenshotDownloaded'), 'success')
    } else if (o.shotMode() === 'copy') {
      const ok = await copyScreenshotToClipboard(result.blob, result.dataUrl)
      o.notify(ok ? o.t('table.screenshotCopied') : o.t('table.screenshotCopyFail'), ok ? 'success' : 'error')
    } else {
      // preview 模式：弹窗预览
      modal.value = { visible: true, dataUrl: result.dataUrl, blob: result.blob }
    }
  }

  function downloadFromModal(): void {
    downloadScreenshot(modal.value.dataUrl)
    o.notify(o.t('table.screenshotDownloaded'), 'success')
    modal.value.visible = false
  }

  async function copyFromModal(): Promise<void> {
    const ok = modal.value.blob ? await copyScreenshotToClipboard(modal.value.blob, modal.value.dataUrl) : false
    o.notify(ok ? o.t('table.screenshotCopied') : o.t('table.screenshotCopyFail'), ok ? 'success' : 'error')
    modal.value.visible = false
  }

  return { modal, capture, downloadFromModal, copyFromModal }
}

/**
 * buildTsv — 表格 TSV 复制/导出的纯函数构建器（复制到剪贴板可粘贴进 Excel）。
 *
 * 公式注入防护（CSV 注入的 TSV 变体）：以 = + - @ 或制表符/回车开头的单元格加单引号
 * 前缀，Excel 按文本打开，防止 =HYPERLINK() 等公式在粘贴后被执行。表头不防护（列名
 * 由调用方列定义给出，非用户数据）。
 */
export function buildTsv(header: string[], rows: string[][]): string {
  return [header.join('\t'), ...rows.map((r) => r.map((s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)).join('\t'))].join(
    '\n',
  )
}
