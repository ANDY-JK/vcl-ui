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
      // 必须看返回值：downloadScreenshot 在 DOM 异常 / 无 document 时返回 false。
      // 无条件报"已下载"会让用户去下载文件夹找一张不存在的图（2026-11-01 #269）。
      const ok = downloadScreenshot(result.dataUrl)
      o.notify(ok ? o.t('table.screenshotDownloaded') : o.t('table.screenshotFail'), ok ? 'success' : 'error')
    } else if (o.shotMode() === 'copy') {
      const ok = await copyScreenshotToClipboard(result.blob, result.dataUrl)
      o.notify(ok ? o.t('table.screenshotCopied') : o.t('table.screenshotCopyFail'), ok ? 'success' : 'error')
    } else {
      // preview 模式：弹窗预览
      modal.value = { visible: true, dataUrl: result.dataUrl, blob: result.blob }
    }
  }

  /**
   * 关闭预览并**释放**截图内容。
   *
   * 一张 2x 的整表截图，dataURL 是几 MB 的字符串、blob 又是几 MB ——
   * 只把 `visible` 置 false 的话，它们会一直挂在这个 ref 上：用户按十几次"导出"，
   * 内存就多压十几份全表截图（第 121 轮由用例照出：关闭后 dataUrl 仍可读到）。
   */
  function closeModal(): void {
    modal.value = { visible: false, dataUrl: '', blob: null }
  }

  function downloadFromModal(): void {
    const ok = downloadScreenshot(modal.value.dataUrl)
    if (ok) {
      o.notify(o.t('table.screenshotDownloaded'), 'success')
      closeModal()
    } else {
      // 下载失败**不关弹窗**：图还在，用户可以改试"复制"或重试；关掉就什么都留不下了
      o.notify(o.t('table.screenshotFail'), 'error')
    }
  }

  async function copyFromModal(): Promise<void> {
    const ok = modal.value.blob ? await copyScreenshotToClipboard(modal.value.blob, modal.value.dataUrl) : false
    o.notify(ok ? o.t('table.screenshotCopied') : o.t('table.screenshotCopyFail'), ok ? 'success' : 'error')
    closeModal()
  }

  // closeModal 必须一起导出：宿主还有别的关闭入口（Esc / 点遮罩外 / 打开单元格详情时互踢），
  // 只置 visible=false 会让 dataUrl/blob 继续挂着（本条由第 121 轮的用例照出）
  return { modal, capture, downloadFromModal, copyFromModal, closeModal }
}

/**
 * buildTsv — 表格 TSV 复制/导出的纯函数构建器（复制到剪贴板可粘贴进 Excel）。
 *
 * 公式注入防护（CSV 注入的 TSV 变体）：以 = + - @ 或制表符/回车开头的单元格加单引号
 * 前缀，Excel 按文本打开，防止 =HYPERLINK() 等公式在粘贴后被执行。表头不防护（列名
 * 由调用方列定义给出，非用户数据）。
 *
 * 控制字符清洗（2026-10-31，用户反馈"细节"类缺陷）：值内的 \t / \n / \r 一律替换成
 * 空格 —— TSV 用 \t 分列、\n 分行，值里出现这两个字符会让粘贴进 Excel 后行列错位
 * （多行文本被拆成多行，后续列全部串行）。col.render 允许返回多行文本，数据本身
 * 也可含控制字符，构建器必须自己兜住。表头同理清洗（列名来自调用方，同样可能带）。
 */
export function buildTsv(header: string[], rows: string[][]): string {
  const sanitize = (s: string) => s.replace(/[\t\r\n]+/g, ' ')
  return [
    header.map(sanitize).join('\t'),
    ...rows.map((r) => r.map((s) => (/^[=+\-@\t\r]/.test(s) ? `'${sanitize(s)}` : sanitize(s))).join('\t')),
  ].join('\n')
}
