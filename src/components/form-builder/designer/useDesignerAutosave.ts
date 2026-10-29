/**
 * 设计器草稿自动保存接线（P2-13）
 *
 * - 挂载时：宿主未给初始节点（空白启动）→ 读草稿恢复 + 提示；宿主自带节点则完全跳过
 * - 节点/meta 变更：防抖 800ms 后落盘；清空画布 = 清除草稿（避免旧稿复活）
 * - 恢复写入期间抑制自动保存，避免恢复后原样回写
 * - 显式保存成功 / 从「我的表单」打开耐久副本时由调用方 discardDraft 丢弃
 *
 * 存取逻辑在 useDesignerDraft（独立文件，测试可 mock）。
 */
import { watch, onMounted, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useDesignerDraft, type DesignerDraft } from './useDesignerDraft'
import type { DesignerNode, FormMeta } from './types'

/** 恢复草稿后解除「抑制自动保存」的等待：留给 v-model 回写的微任务流水线 */
const _DRAFT_APPLY_SETTLE_MS = 50

/** 变更后自动保存的防抖间隔（毫秒） */
const AUTOSAVE_DEBOUNCE = 800

export function useDesignerAutosave(opts: {
  getNodes: () => DesignerNode[]
  getMeta: () => FormMeta
  /** 挂载时宿主是否自带初始节点（true = 宿主管理初始状态，跳过草稿恢复） */
  hasInitialNodes: () => boolean
  /** 草稿应用（写回 nodes/meta） */
  applyDraft: (draft: DesignerDraft) => void
  showTip: (msg: string) => void
}) {
  const t = useT()
  const { loadDraft, saveDraft, clearDraft } = useDesignerDraft()

  /** 恢复写入期间抑制自动保存（恢复本身也是节点变更） */
  let restoring = false
  let restoreTimer: ReturnType<typeof setTimeout> | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  onMounted(async () => {
    if (opts.hasInitialNodes()) return
    const draft = await loadDraft()
    if (draft && draft.nodes.length) {
      restoring = true
      opts.applyDraft(draft)
      opts.showTip(t('fbd.draftRestored'))
      // 等 v-model 回写流水线（微任务）走完再解除抑制
      restoreTimer = setTimeout(() => {
        restoring = false
      }, _DRAFT_APPLY_SETTLE_MS)
    }
  })

  /** 草稿没保存成时只提示一次（成功后复位）——防抖周期内反复失败不该刷屏 */
  let saveWarned = false

  /**
   * 自动保存一次并向用户交代结果。
   *
   * 第 159 轮：此前是 `void saveDraft(...)` —— 超容量跳过与写入失败都只进开发控制台，
   * 用户以为草稿在、刷新后发现没了。现在按结果提示，且只在**首次**失败时提示。
   */
  async function autosaveOnce(nodes: DesignerNode[]): Promise<void> {
    const res = await saveDraft(nodes, opts.getMeta())
    if (res.ok) {
      saveWarned = false
      return
    }
    if (saveWarned) return
    saveWarned = true
    opts.showTip(
      res.reason === 'too-large'
        ? t('fbd.draftTooLarge', { size: (res.size / 1024 / 1024).toFixed(1) })
        : t('fbd.draftSaveFailed'),
    )
  }

  watch(
    [() => opts.getNodes(), () => opts.getMeta()],
    () => {
      if (restoring) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        const nodes = opts.getNodes()
        if (!nodes.length) {
          // 清空画布 → 草稿一并清除，防止旧稿复活
          void clearDraft()
          return
        }
        void autosaveOnce(nodes)
      }, AUTOSAVE_DEBOUNCE)
    },
    { deep: true },
  )

  onUnmounted(() => {
    if (restoreTimer) clearTimeout(restoreTimer)
    if (saveTimer) clearTimeout(saveTimer)
  })

  /** 显式丢弃草稿（表单已保存 / 已打开耐久副本时调用） */
  function discardDraft(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    void clearDraft()
  }

  return { discardDraft }
}
