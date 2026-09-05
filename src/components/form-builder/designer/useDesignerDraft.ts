/**
 * 设计器草稿存取（P2-13）
 *
 * 设计 JSON（nodes + meta）按固定键存 IndexedDB（store=form-designer-drafts，TTL 7 天），
 * 防御策略与 useFormStorage 同款：容量保护（2MB）/ 脏数据拒载 / 不可用环境静默降级。
 *
 * 独立成文件：useDesignerAutosave（接线）跨模块导入本文件，
 * 测试可经 vi.mock 本模块拦截存取而不影响接线逻辑（同文件内部引用不可拦截）。
 */
import { dbPut, dbGet, dbDelete } from '@/components/storage/indexedDB'
import { toPlainJson } from '../useFormStorage'
import type { DesignerNode, FormMeta } from './types'

// ════════════════════════════════════════
// 常量
// ════════════════════════════════════════

/** IndexedDB store 名（设计器草稿专用，与运行时 form-drafts 区分） */
export const DRAFT_STORE = 'form-designer-drafts'

/** 草稿存储键（单设计器全局一份：恢复「最近一次未保存的设计」语义） */
export const DRAFT_KEY = 'designer-autosave'

/** 草稿 TTL：7 天（毫秒） */
const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000

/** 草稿最大大小（2MB，防超出 IndexedDB 配额） */
const DRAFT_MAX_SIZE = 2 * 1024 * 1024

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
    try {
      const raw = await dbGet<unknown>(DRAFT_STORE, DRAFT_KEY)
      if (raw === null || raw === undefined) return null
      if (!isValidDraft(raw)) {
        console.warn('[FormDesigner] 设计草稿数据无效，自动清除')
        await dbDelete(DRAFT_STORE, DRAFT_KEY).catch(() => {})
        return null
      }
      return raw
    } catch (err) {
      console.warn('[FormDesigner] 设计草稿加载失败:', err)
      return null
    }
  }

  async function saveDraft(nodes: DesignerNode[], meta: FormMeta): Promise<void> {
    try {
      // 节点树来自响应式 props：Proxy 无法 structuredClone，须先纯化为纯 JSON
      const plain = toPlainJson({ nodes, meta })
      // 数据大小检查（防止超出 IndexedDB 配额）
      let size = 0
      try {
        size = new Blob([JSON.stringify(plain)]).size
      } catch {
        /* Blob 不可用时跳过容量检查 */
      }
      if (size > DRAFT_MAX_SIZE) {
        console.warn(`[FormDesigner] 设计草稿过大 (${(size / 1024 / 1024).toFixed(1)}MB)，跳过保存`)
        return
      }
      const draft: DesignerDraft = { nodes: plain.nodes, meta: plain.meta, savedAt: new Date().toISOString() }
      await dbPut(DRAFT_STORE, DRAFT_KEY, draft, DRAFT_TTL)
    } catch (err) {
      console.warn('[FormDesigner] 设计草稿保存失败:', err)
    }
  }

  async function clearDraft(): Promise<void> {
    try {
      await dbDelete(DRAFT_STORE, DRAFT_KEY)
    } catch {
      console.warn('[FormDesigner] 设计草稿清除失败')
    }
  }

  return { loadDraft, saveDraft, clearDraft }
}
