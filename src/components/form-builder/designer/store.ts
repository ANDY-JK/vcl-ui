/**
 * 表单存储抽象层 — 依赖倒置设计
 *
 * 当前实现：localStorage（同步）
 * 未来接入后端时：实现同接口的 API 版即可，组件无需改动
 */

import type { FormDesign, CollectRecord } from './types'
import { formatDateTimeZh } from '@/components/form/utils/date-utils'
import { uuid } from '@/components/_internal/utils'

/** 已保存的表单元信息（列表展示用） */
export interface FormMetaItem {
  id: string
  name: string
  updatedAt: string
  /** 当前表单的存储 key（字段结构指纹），对应收集记录空间 */
  collectKey: string
}

export interface FormStore {
  /** 表单列表（不含完整设计，仅元信息） */
  listForms(): FormMetaItem[]
  /** 读取表单完整设计 */
  loadForm(id: string): FormDesign | null
  /** 新建/保存表单（id 为空则新建） */
  saveForm(id: string | null, design: FormDesign, name?: string): FormMetaItem
  /** 重命名 */
  renameForm(id: string, name: string): void
  /** 删除表单（连同其收集记录） */
  deleteForm(id: string): void
  /** 读取某表单的收集记录 */
  loadRecords(collectKey: string): CollectRecord[]
  /** 追加收集记录 */
  appendRecord(collectKey: string, record: CollectRecord): void
  /** 删除单条收集记录 */
  removeRecord(collectKey: string, recordId: string): void
  /** 清空某表单收集记录 */
  clearRecords(collectKey: string): void
}

// ════════════════════════════════════════
// 本地实现（localStorage）
// ════════════════════════════════════════

const FORMS_KEY = 'fd_forms_index'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 容量满静默
  }
}

export function createLocalFormStore(): FormStore {
  function listForms(): FormMetaItem[] {
    return read<FormMetaItem[]>(FORMS_KEY, [])
  }
  function saveIndex(list: FormMetaItem[]): void {
    write(FORMS_KEY, list)
  }

  function genId(): string {
    return uuid('f_')
  }

  return {
    listForms() {
      return listForms()
    },

    loadForm(id: string): FormDesign | null {
      return read<FormDesign | null>(`fd_form_${id}`, null)
    },

    saveForm(id, design, name) {
      const index = listForms()
      const now = formatDateTimeZh()
      let item: FormMetaItem
      if (id) {
        const found = index.find(x => x.id === id)
        if (!found) throw new Error(`表单不存在: ${id}`)
        item = found
        item.name = name ?? item.name
        item.updatedAt = now
      } else {
        // collectKey 使用完整字段结构指纹，不截断以避免碰撞
        // v3 优先使用 nodes（树形结构），兼容旧版 fields
        const allFields = design.nodes ?? design.fields ?? []
        const seed = allFields.map(f => `${f.key}:${f.type}`).join('|')
        let h = 0
        for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
        item = {
          id: genId(),
          name: name || design.meta.title || '未命名表单',
          updatedAt: now,
          collectKey: Math.abs(h).toString(36),
        }
        index.unshift(item)
      }
      saveIndex(index)
      write(`fd_form_${item.id}`, design)
      return item
    },

    renameForm(id, name) {
      const index = listForms()
      const item = index.find(x => x.id === id)
      if (!item) return
      item.name = name
      saveIndex(index)
    },

    deleteForm(id) {
      const index = listForms()
      const itemIndex = index.findIndex(x => x.id === id)
      if (itemIndex === -1) return
      const item = index[itemIndex]
      index.splice(itemIndex, 1)
      saveIndex(index)
      localStorage.removeItem(`fd_form_${id}`)
      if (item) localStorage.removeItem(`fd_collect_${item.collectKey}`)
    },

    loadRecords(collectKey) {
      return read<CollectRecord[]>(`fd_collect_${collectKey}`, [])
    },

    appendRecord(collectKey, record) {
      const list = this.loadRecords(collectKey)
      list.unshift(record)
      write(`fd_collect_${collectKey}`, list)
    },

    removeRecord(collectKey, recordId) {
      write(`fd_collect_${collectKey}`, this.loadRecords(collectKey).filter(r => r.id !== recordId))
    },

    clearRecords(collectKey) {
      localStorage.removeItem(`fd_collect_${collectKey}`)
    },
  }
}
