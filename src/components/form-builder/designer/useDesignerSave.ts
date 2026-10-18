/**
 * useDesignerSave — 保存 / 分享弹窗逻辑（拆分自 FormDesigner.vue，超 800 行整改）
 *
 * 职责：保存弹窗（名称输入 + 写入走 manager.saveForm）、分享码与发布链接的生成/复制。
 * 写入与草稿作废的衔接：保存成功经 onSaved 回调交还给组件（组件接 discardDraft）。
 */
import { ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { copyText } from '@/components/_internal/useCopy'
import { type DesignerNode, type FormMeta } from './types'
import type { useFormManager } from './useFormManager'

export interface DesignerSaveHost {
  /** 当前画布节点（getter 保持响应） */
  getNodes: () => DesignerNode[]
  /** 当前表单元信息 */
  getMeta: () => FormMeta
  /** 表单管理实例（保存/分享码） */
  manager: ReturnType<typeof useFormManager>
  /** 保存成功后回调（组件侧作废未保存草稿） */
  onSaved?: () => void
  /** 轻提示 */
  showTip: (msg: string) => void
}

export function useDesignerSave(opts: DesignerSaveHost) {
  const t = useT()

  // ── 保存弹窗（本地状态：名称输入 + 开关；写入走 manager.saveForm） ──
  const saveVisible = ref(false)
  const saveName = ref('')

  function openSave(): void {
    if (!opts.getNodes().length) {
      opts.showTip(t('fbd.nothingToSave'))
      return
    }
    saveName.value = opts.getMeta().title ?? ''
    saveVisible.value = true
  }

  async function onConfirmSave(): Promise<void> {
    const item = await opts.manager.saveForm(saveName.value)
    if (item) {
      saveVisible.value = false
      opts.onSaved?.() // 已有耐久副本，草稿不再需要
    }
  }

  // ── 分享弹窗 ──
  const shareVisible = ref(false)
  const shareCode = ref('')

  /**
   * 打开分享弹窗。
   *
   * 走异步版本 `buildShareCodeAsync()`：宿主配了签发者时产出 FD2 已签名码
   * （本地 HMAC 或将来接的服务端）；没配则与原先一致产出 FD1。
   * 签名失败**显式提示**，不静默退回未签名码——否则用户以为签了，实际没有。
   */
  async function openShare(): Promise<void> {
    let code: string
    try {
      code = await opts.manager.buildShareCodeAsync()
    } catch (e) {
      opts.showTip(`${t('fbd.shareSignFail')}：${e instanceof Error ? e.message : String(e)}`)
      return
    }
    if (!code) {
      opts.showTip(t('fbd.nothingToSave'))
      return
    }
    shareCode.value = code
    shareVisible.value = true
  }

  async function copyShare(): Promise<void> {
    const ok = await copyText(shareCode.value)
    opts.showTip(ok ? t('fbd.shareCopied') : t('fbd.copyFail'))
  }

  /** 发布链接：宿主应用需注册 `#/form/:code` 路由指向 FormShareView。SSR 下回落相对链接 */
  function buildShareUrl(): string {
    const base = typeof location === 'undefined' || !location.origin ? '' : `${location.origin}${location.pathname}`
    return `${base}#/form/${shareCode.value}`
  }

  async function copyShareLink(): Promise<void> {
    const ok = await copyText(buildShareUrl())
    opts.showTip(ok ? t('fbd.shareLinkCopied') : t('fbd.copyFail'))
  }

  return {
    saveVisible,
    saveName,
    openSave,
    onConfirmSave,
    shareVisible,
    shareCode,
    openShare,
    copyShare,
    buildShareUrl,
    copyShareLink,
  }
}
