import { useT } from '@/components/_internal/i18n'
import type { FormData } from './types'
import { useFormStorage, type DraftSaveResult } from './useFormStorage'

/**
 * 草稿自动保存的「结果 → 用户提示」接线（第 159 轮）
 *
 * 为什么单独成文件：`FormBuilder.vue` 已贴住 form-builder 域的止涨线（810 行），
 * 这段逻辑放进去会立刻触线（TD-29 同款处理）。
 *
 * 为什么需要它：`saveDraft` 此前返回 `Promise<void>`，「超容量跳过」与「写入失败」都只进
 * 开发控制台；宿主拿到同一个 `undefined`，用户以为草稿在、刷新后发现没了，全程无提示。
 * 而**恢复**草稿那条路径是有可见 toast 的——"存得上"有反馈、"存不上"没反馈，这个不对称
 * 正是用户会踩的坑。本 composable 把两种失败原因分别翻成**看得懂、可行动**的文案：
 *   - 超容量 → 说出体积，并提示"请及时提交或精简"（这是用户能自己解决的原因）
 *   - 写入失败 → 明确"不影响提交"（否则用户会以为整页坏了，连提交都不敢点）
 *
 * 只提示一次：防抖周期内反复失败会每个字都弹一条，等于没有提示；保存成功后复位，
 * 免得第二次遇到同样问题时变成哑巴。
 */
export function useFormDraftAutosave(opts: {
  /** 取当前表单数据（调用时才读，避免闭包捕获旧值） */
  getData: () => FormData
  /** 提示出口（宿主注入，便于测试与替换为任意 UI） */
  showToast: (msg: string, type: 'warning', ms: number) => void
}) {
  const t = useT()
  const { loadDraft, saveDraft, clearDraft } = useFormStorage()
  /** 是否已经就"存不下来"提示过（成功后复位） */
  let warned = false

  /**
   * 自动保存一次草稿并向用户交代结果。
   * @param key 存储键（FormBuilder 的 storageKey）
   */
  async function autosave(key: string): Promise<DraftSaveResult> {
    const res = await saveDraft(key, opts.getData())
    if (res.ok) {
      warned = false
      return res
    }
    if (warned) return res
    warned = true
    opts.showToast(
      res.reason === 'too-large'
        ? t('formBuilder.draftTooLarge', { size: (res.size / 1024 / 1024).toFixed(1) })
        : t('formBuilder.draftSaveFailed'),
      'warning',
      3000,
    )
    return res
  }

  // 读取/清除也一并转出：宿主只需认识一个入口，省得在两个模块间来回 import
  return { autosave, loadDraft, clearDraft }
}
