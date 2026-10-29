import { reportWarn, reportEvent } from '@/components/_internal/runtime-observer'
/**
 * 设计器草稿存取（P2-13）
 *
 * 设计 JSON（nodes + meta）默认存 IndexedDB（TTL 7 天），防御策略与 useFormStorage 同款：
 * 容量保护（2MB）/ 脏数据拒载 / 不可用环境静默降级。
 *
 * **持久化位置可插拔**（2026-10-18，H.1 第 2 项「草稿上云准备」）：
 *   「存哪儿」交给 `draft-storage.ts` 的 DraftStorage 适配器（默认本地 IndexedDB；
 *   宿主可 `setActiveDraftStorage(createHttpDraftStorage({...}))` 换成云端，实现跨设备续填）。
 *   本文件只保留**与存哪儿无关的规则**：纯化、容量上限、脏数据拒载——换存储不会丢任何一道防护。
 *
 * 独立成文件：useDesignerAutosave（接线）跨模块导入本文件，
 * 测试可经 vi.mock 本模块拦截存取而不影响接线逻辑（同文件内部引用不可拦截）。
 */
import { toPlainJson } from '../useFormStorage'
import type { DraftSaveResult } from '../useFormStorage'
import type { DesignerNode, FormMeta } from './types'
import { DRAFT_MAX_SIZE, DRAFT_TTL } from '../draft-policy'
import { getActiveDraftStorage, DRAFT_STORE, DRAFT_KEY } from './draft-storage'

// 常量从适配层再导出（既有引用路径保持不变）
export { DRAFT_STORE, DRAFT_KEY }

/** 设计草稿数据结构 */
export interface DesignerDraft {
  nodes: DesignerNode[]
  meta: FormMeta
  savedAt: string
}

/** 草稿有效性：对象 + nodes 数组 + meta 对象（savedAt 不做强校验，缺省兼容旧稿） */
function isValidDraft(v: unknown): v is DesignerDraft {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const d = v as Partial<DesignerDraft>
  return Array.isArray(d.nodes) && !!d.meta && typeof d.meta === 'object'
}

/**
 * 设计器草稿存取三件套
 *
 * - loadDraft：无草稿/脏数据/环境不可用返回 null（脏数据自动清除）
 * - saveDraft：超 2MB 跳过（与运行时草稿同一容量保护）
 * - clearDraft：删除草稿
 */
export function useDesignerDraft() {
  async function loadDraft(): Promise<DesignerDraft | null> {
    const storage = getActiveDraftStorage(DRAFT_TTL)
    try {
      const raw = await storage.load()
      if (raw === null || raw === undefined) return null
      if (!isValidDraft(raw)) {
        reportWarn('[FormDesigner] 设计草稿数据无效，自动清除')
        await storage.clear().catch(() => {})
        return null
      }
      return raw
    } catch (err) {
      reportWarn('[FormDesigner] 设计草稿加载失败:', err)
      return null
    }
  }

  async function saveDraft(nodes: DesignerNode[], meta: FormMeta): Promise<DraftSaveResult> {
    const storage = getActiveDraftStorage(DRAFT_TTL)
    try {
      // 节点树来自响应式 props：Proxy 无法 structuredClone，须先纯化为纯 JSON
      const plain = toPlainJson({ nodes, meta })
      // 数据大小检查（防止超出存储配额）
      let size = 0
      try {
        size = new Blob([JSON.stringify(plain)]).size
      } catch {
        /* Blob 不可用时跳过容量检查 */
      }
      if (size > DRAFT_MAX_SIZE) {
        reportWarn(`[FormDesigner] 设计草稿过大 (${(size / 1024 / 1024).toFixed(1)}MB)，跳过保存`)
        // 与下面的写入失败同一事件码、同一"这是数据损失"的判断标准：
        // 超容量跳过同样是用户可感知的损失（草稿根本没落盘），不能只躺在自由文本日志里。
        // reason 里区分 'too-large'，宿主看板据此区分"该引导用户精简"还是"存储出问题了"。
        reportEvent(
          'form-designer/draft-save-failed',
          '设计草稿保存失败',
          {
            storage: storage.name,
            nodeCount: nodes.length,
            reason: 'too-large',
            sizeMB: (size / 1024 / 1024).toFixed(1),
          },
          'warn',
        )
        return { ok: false, reason: 'too-large', size }
      }
      const draft: DesignerDraft = { nodes: plain.nodes, meta: plain.meta, savedAt: new Date().toISOString() }
      await storage.save(draft)
      return { ok: true, size }
    } catch (err) {
      reportWarn('[FormDesigner] 设计草稿保存失败:', err)
      // 结构化事件：草稿丢失是用户可感知的数据损失，值得宿主告警（而非只躺在自由文本日志里）
      reportEvent(
        'form-designer/draft-save-failed',
        '设计草稿保存失败',
        {
          storage: storage.name,
          nodeCount: nodes.length,
          reason: err instanceof Error ? err.message : String(err),
        },
        'error',
      )
      return { ok: false, reason: 'error' }
    }
  }

  async function clearDraft(): Promise<void> {
    const storage = getActiveDraftStorage(DRAFT_TTL)
    try {
      await storage.clear()
    } catch {
      reportWarn('[FormDesigner] 设计草稿清除失败')
    }
  }

  return { loadDraft, saveDraft, clearDraft }
}
