/**
 * useCollectShare — FormCollect 的分享弹窗段下沉（TD-29 第一刀：805 → 止涨线内）
 *
 * 三件套：openShare（设计编码 + 短链/完整码降级）→ generateQr（qrcode 动态生成）→
 * copyShareLink / copyShareCode（复制 + 统一 showTip 通知）。依赖面全部窄接口注入：
 * meta/fields（重建 FormDesign 用）、store（存表拿短链 id）、t / showTip（i18n 与提示出口）。
 * 无响应式耦合：组件侧 `...share` 展开即可用，模板引用零改动。
 */
import { ref } from 'vue'
import { copyText } from '@/components/_internal/useCopy'
import QRCode from 'qrcode/lib/browser.js'
import { encodeShareCode, shareShortLink, shareFullLink } from './designer/share'
import type { DesignerField, FormDesign, FormMeta } from './designer/types'
import type { FormStore } from './designer/store'

export interface CollectShareOptions {
  /** 设计器 meta（openShare 时取快照） */
  meta: () => FormMeta
  /** 设计器 fields（openShare 时取快照） */
  fields: () => DesignerField[]
  /** 表单存储（短链 = 先存表拿 id；不可用时降级完整分享码链接） */
  store: FormStore
  /** i18n */
  t: (key: string, params?: Record<string, unknown>) => string
  /** 统一提示出口（宿主 showTip） */
  showTip: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void
}

export function useCollectShare(o: CollectShareOptions) {
  /** 分享弹窗状态 */
  const shareVisible = ref(false)
  const shareLink = ref('')
  const shareCode = ref('')
  /** 发布链接二维码（dataURL，动态加载 qrcode 生成） */
  const shareQr = ref('')
  /** 二维码生成失败提示（链接过长超出二维码容量） */
  const shareQrError = ref('')
  /** 分享已存入 store 的表单 id（组件生命周期内复用，避免反复保存同一表单） */
  const shareFormId = ref('')

  /**
   * 打开分享弹窗：将本组件承接的表单设计编码为分享码/发布链接。
   * FormCollect 由外部传入 fields/meta（不含完整 FormDesign），这里重建 FormDesign 结构。
   * 发布链接用短链（设计先存入 store 拿 id，链接只带 id → 二维码容量有限也能放下）。
   */
  async function openShare(): Promise<void> {
    const design: FormDesign = { meta: { ...o.meta() }, nodes: o.fields() }
    shareCode.value = encodeShareCode(design)
    try {
      // 存入 store（已有同名表单则复用 id，避免重复保存）
      let formId = shareFormId.value
      if (!formId) {
        const item = await o.store.saveForm(null, design, design.meta.title || o.t('fbd.untitled'))
        formId = item.id
        shareFormId.value = formId
      }
      shareLink.value = shareShortLink(formId)
    } catch {
      // store 不可用时退回完整分享码链接（跨设备可靠，长表单链接超长）
      shareLink.value = shareFullLink(shareCode.value)
    }
    // 异步生成二维码（不阻塞弹窗打开）
    void generateQr()
    shareVisible.value = true
  }

  /** 发布链接 → 二维码 dataURL（qrcode 浏览器端实现；短链只有几十字符，任何表单都能放下） */
  async function generateQr(): Promise<void> {
    shareQr.value = ''
    shareQrError.value = ''
    try {
      shareQr.value = await QRCode.toDataURL(shareLink.value, {
        width: 180,
        margin: 1,
        errorCorrectionLevel: 'M',
      })
    } catch {
      shareQr.value = ''
      shareQrError.value = o.t('fbd.qrGenFail')
    }
  }

  async function copyShareLink(): Promise<void> {
    const ok = await copyText(shareLink.value)
    o.showTip(ok ? o.t('fbd.shareLinkCopied') : o.t('fbd.copyFail'), ok ? 'success' : 'error')
  }

  async function copyShareCode(): Promise<void> {
    const ok = await copyText(shareCode.value)
    o.showTip(ok ? o.t('fbd.shareCopied') : o.t('fbd.copyFail'), ok ? 'success' : 'error')
  }

  return { shareVisible, shareLink, shareCode, shareQr, shareQrError, openShare, copyShareLink, copyShareCode }
}
