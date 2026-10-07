/**
 * 设计器导入/导出 — JSON 导出、文件/粘贴导入、分享码识别
 *
 * 从 FormDesigner 拆出（超 800 行约束整改）：
 * - 分享码（FD1. 前缀）先解码回 FormDesign JSON，再走统一 JSON 导入路径
 * - 导入兼容 v3 {meta,nodes} / v2 {meta,fields} / v1 FormSchema / 裸数组四种形态
 */
import { ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { downloadBlob } from '@/components/_internal/utils'
import { copyText } from '@/components/_internal/useCopy'
import { decodeShareCode, SHARE_CODE_PREFIX } from './share'
import { FORM_DESIGN_VERSION, type DesignerNode, type FormDesign, type FormMeta } from './types'
import { uniquifyFieldKey } from './key-utils'

const t = useT()

export interface FormIOHost {
  /** 当前画布节点（getter 保持响应） */
  nodes: () => DesignerNode[]
  /** 当前表单元信息 */
  meta: () => FormMeta
  /** 画布整体替换（受控组件经 emit 回写） */
  patch: (list: DesignerNode[]) => void
  /** 导入前的撤销栈快照 */
  snapshot: () => void
  /** 元信息回写 */
  updateMeta: (m: FormMeta) => void
  /** 轻提示 */
  showTip: (msg: string) => void
}

export function useFormIO(host: FormIOHost) {
  function exportJson(): void {
    if (!host.nodes().length) {
      host.showTip(t('formBuilder.noExportableFields'))
      return
    }
    const design: FormDesign = { schemaVersion: FORM_DESIGN_VERSION, meta: host.meta(), nodes: host.nodes() }
    const json = JSON.stringify(design, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    downloadBlob(blob, 'form-design.json')
    void copyText(json)
    host.showTip(t('fbd.exportedTip'))
  }

  const importText = ref('')
  const showImport = ref(false)
  const importError = ref('')
  const importDragOver = ref(false)

  // 事件处理用命名函数：模板内联多语句 handler 会被 prettier(semi:false) 去分号重排，导致 Vue 表达式解析失败
  function closeImport() {
    showImport.value = false
    importError.value = ''
  }

  function readFileThen(file: File, onFail: () => void): void {
    const reader = new FileReader()
    reader.onload = () => {
      importText.value = String(reader.result ?? '')
      applyImport()
    }
    reader.onerror = onFail
    reader.readAsText(file)
  }

  function onImportDrop(e: DragEvent): void {
    e.preventDefault()
    importDragOver.value = false
    const file = e.dataTransfer?.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json')) {
      importError.value = t('fbd.jsonFileRequired')
      return
    }
    readFileThen(file, () => {
      importError.value = t('fbd.fileReadFail')
    })
  }

  function onImportFileSelect(e: Event): void {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    readFileThen(file, () => {
      importError.value = t('fbd.fileReadFail')
    })
  }

  function applyImport(): void {
    // 分享码（FD1. 前缀）先解码回 FormDesign JSON，再走统一 JSON 导入路径
    const trimmed = importText.value.trim()
    if (trimmed.startsWith(SHARE_CODE_PREFIX)) {
      const design = decodeShareCode(trimmed)
      if (!design) {
        importError.value = t('fbd.shareCodeInvalid')
        return
      }
      importText.value = JSON.stringify(design, null, 2)
    }
    try {
      const data = JSON.parse(importText.value)
      let meta: FormMeta = {}
      let nodes: DesignerNode[] = []

      if (data && !Array.isArray(data) && typeof data === 'object') {
        // v3 格式：{ meta, nodes }
        if (Array.isArray(data.nodes)) {
          nodes = data.nodes.map((n: DesignerNode, i: number) => ({
            ...n,
            id: typeof n.id === 'string' ? n.id : 'n' + Date.now().toString(36) + i,
          }))
        }
        // v2 兼容：{ meta, fields }
        else if (Array.isArray(data.fields)) {
          nodes = data.fields.map((f: DesignerNode, i: number) => ({
            ...f,
            id: typeof f.id === 'string' ? f.id : 'n' + Date.now().toString(36) + i,
          }))
        }
        meta = data.meta && typeof data.meta === 'object' ? data.meta : {}

        // v1 兼容：FormSchema 格式（含 title/fields 等顶层属性）
        if (data.title !== undefined) meta.title = String(data.title)
        if (data.description !== undefined) meta.description = String(data.description)
        if (data.submitText !== undefined) meta.submitText = String(data.submitText)
        if (data.resetText !== undefined) meta.resetText = String(data.resetText)
        if (data.layout !== undefined) meta.layout = data.layout
        if (data.columns !== undefined) meta.columns = Number(data.columns)
        if (data.hideActions !== undefined) meta.hideActions = !!data.hideActions
        if (data.validateOnChange !== undefined) meta.validateOnChange = !!data.validateOnChange
      } else if (Array.isArray(data)) {
        nodes = data.map((n: DesignerNode, i: number) => ({
          ...n,
          id: typeof n.id === 'string' ? n.id : 'n' + Date.now().toString(36) + i,
        }))
      } else {
        throw new Error(t('fbd.importStructureErr'))
      }

      // key 唯一性兜底：手写/历史 JSON 可能携带重复 key（formData 会互相覆盖）。
      // 首个出现者保留原 key，后续重复者追加 _2/_3…（含容器子字段）；
      // used 从空集随遍历累积——预填充会把重复 key 的首个出现者也改名
      const used = new Set<string>()
      const dedupeKeys = (list: DesignerNode[]): DesignerNode[] =>
        list.map((n) => {
          const copy: DesignerNode = { ...n }
          if (copy.key) {
            const unique = uniquifyFieldKey(copy.key, used)
            if (unique !== copy.key) copy.key = unique
            used.add(copy.key)
          }
          if (copy.children?.length) copy.children = dedupeKeys(copy.children)
          return copy
        })
      nodes = dedupeKeys(nodes)

      host.snapshot()
      host.patch(nodes)
      host.updateMeta(meta)
      showImport.value = false
      importText.value = ''
      importError.value = ''
      host.showTip(t('fbd.importedNodes', { n: nodes.length }))
    } catch (e) {
      importError.value = t('fbd.importParseFail', { err: e instanceof Error ? e.message : String(e) })
    }
  }

  return {
    exportJson,
    importText,
    showImport,
    importError,
    importDragOver,
    closeImport,
    onImportDrop,
    onImportFileSelect,
    applyImport,
  }
}
