/**
 * useRecordModal — FormCollect 的记录查看/审核弹窗状态层（TD-29 第二刀，2026-11-01）
 *
 * ## 为什么抽出来
 *
 * TD-29 登记时 FormCollect 已贴住域止涨线（810）。第一刀抽出分享段
 * （`useCollectShare`，805 → 753）。本轮抽第二刀：记录弹窗的状态 + 打开 +
 * schema 派生 + 审核提交（76 行左右），全是**与页面渲染无关**的状态机。
 *
 * ## 职责边界
 *
 * 只负责「弹窗状态 + 审核提交链路」，不碰渲染、不碰 store 实现细节：
 * - 状态：modal 类型 / 目标记录 / 弹窗内表单数据 / 提交 loading / 错误 / 完成态
 * - 打开：按 mode 回填记录数据
 * - schema：view=只读、review=可编辑（复用页面同一份 toFormSchema）
 * - 提交：有 updateRecord 就原地更新，没有则降级为删+增
 *
 * 并发冲突的处理刻意留在这里：它不是"保存失败"，而是"别人已改过、你手里是旧版本"，
 * 需要刷新列表 + 换面板 + 明说未写入 —— 这套语义与弹窗状态强耦合。
 */
import { computed, ref, type Ref } from 'vue'
import { toFormSchema, type DesignerField, type FormMeta, type CollectRecord } from './designer/types'
import { isConflictError, type FormStore } from './designer/store'

export interface UseRecordModalOptions {
  /** 页面字段（弹窗 schema 与展示都基于同一份） */
  fields: () => DesignerField[]
  /** 表单元信息 */
  meta: () => FormMeta
  /** 存储适配器 */
  store: FormStore
  /** 存储键（随表单配置变化） */
  storageKey: () => string
  /** 重新载入记录列表（冲突时也要用） */
  refreshRecords: () => Promise<void>
  /** 记录列表（冲突后找最新版用） */
  records: Ref<CollectRecord[]>
  /** i18n */
  t: (key: string, params?: Record<string, unknown>) => string
}

export function useRecordModal(opts: UseRecordModalOptions) {
  /** 记录操作弹窗类型：null=关闭 / 'view'=查看 / 'review'=审核 */
  const recordModal = ref<'view' | 'review' | null>(null)
  /** 当前操作的目标记录 */
  const recordTarget = ref<CollectRecord | null>(null)
  /** 记录弹窗内表单数据（回填自记录） */
  const recordFormData = ref<Record<string, unknown>>({})
  /** 记录弹窗内提交 loading / 错误 / 完成态 */
  const recordSubmitting = ref(false)
  const recordError = ref('')
  /** 审核提交完成（弹窗内显示成功态，替代 Toast——页面存在多个 Toast 实例时 Toast 会重复弹） */
  const recordDone = ref(false)

  /** 打开记录查看 / 审核弹窗：回填记录数据，按 mode 注入表单模式 */
  function openRecordModal(mode: 'view' | 'review', record: CollectRecord): void {
    recordTarget.value = record
    recordFormData.value = { ...(record.data ?? {}) }
    recordError.value = ''
    recordDone.value = false
    recordModal.value = mode
  }

  /** 记录弹窗表单 schema（view=全字段只读；review=全字段可编辑+提交） */
  const recordSchema = computed(() => {
    if (!recordModal.value) return null
    const schema = toFormSchema(opts.fields(), opts.meta())
    schema.submitConfig = {
      mode: recordModal.value,
      // view 模式只读展示，不触发提交链路；review 提交走下方 handleRecordSubmit
      apiUrl: '',
      saveUrl: '',
    }
    return schema
  })

  /** 审核提交：原地更新被审核的记录（无 updateRecord 能力时降级为删+增，保持位置） */
  async function handleRecordSubmit(data: Record<string, unknown>): Promise<void> {
    const record = recordTarget.value
    if (!record || recordSubmitting.value) return
    recordSubmitting.value = true
    recordError.value = ''
    try {
      if (typeof opts.store.updateRecord === 'function') {
        await opts.store.updateRecord(opts.storageKey(), record.id, data)
      } else {
        // 降级：外部注入的旧实现无 updateRecord —— 删除后重新写入
        // （store 接口只有 appendRecord，重插后该记录排在列表顶部，无法保持原位）
        await opts.store.removeRecord(opts.storageKey(), record.id)
        await opts.store.appendRecord(opts.storageKey(), { ...record, data: { ...data } })
      }
      await opts.refreshRecords()
      recordDone.value = true
    } catch (e) {
      // 并发冲突不是"保存失败"：别人已改过这条记录，用户手里的才是旧版本。
      // 刷新列表 + 面板换成最新 + 明说"未写入"（不假装成功，也不静默丢弃）。
      if (!isConflictError(e)) {
        recordError.value = opts.t('fbd.reviewRecordFail', { err: e instanceof Error ? e.message : String(e) })
      } else {
        await opts.refreshRecords()
        const fresh = opts.records.value.find((r) => r.id === record.id)
        if (fresh) recordTarget.value = fresh
        recordError.value = opts.t('fbd.reviewRecordConflict', { rev: e.currentRev ?? '-' })
      }
    } finally {
      recordSubmitting.value = false
    }
  }

  return {
    recordModal,
    recordTarget,
    recordFormData,
    recordSubmitting,
    recordError,
    recordDone,
    openRecordModal,
    recordSchema,
    handleRecordSubmit,
  }
}
