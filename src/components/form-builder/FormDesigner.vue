<script setup lang="ts">
/**
 * FormDesigner — 低代码表单设计器 (v3)
 *
 * v3 核心变化：
 * 1. 四栏布局：字段面板 + 大纲树 + 画布 + 属性面板
 * 2. 设备切换：桌面/平板/手机三种画布宽度
 * 3. 撤销/重做：基于不可变更新栈的 undo/redo
 * 4. 高级表单设置：标签位置、标签宽度、提交模式、提交后清空
 * 5. 标签页切换：设计 / 预览 / Schema 代码查看
 * 6. 容器嵌套：支持 card/grid/tabs/collapse/steps 容器
 *
 * 布局：
 * ┌─────────┬──────────┬──────────────┬─────────┐
 * │ 字段面板 │ 大纲树   │   画布区域    │ 属性面板 │
 * │ (左)    │ (左2)   │  设计/预览    │  (右)   │
 * └─────────┴──────────┴──────────────┴─────────┘
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { downloadBlob, deepClone, uuid } from '@/components/_internal/utils'
import { copyText } from '@/components/_internal/useCopy'
import IconSvg from '@/components/basic/IconSvg.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import Group from '@/components/form/Group.vue'
import FormBuilder from './FormBuilder.vue'
import DesignerPanel from './designer/DesignerPanel.vue'
import DesignerCanvas from './designer/DesignerCanvas.vue'
import PropsPanel from './designer/PropsPanel.vue'
import OutlineTree from './designer/OutlineTree.vue'
import {
  createField,
  toFormSchema,
  flattenNodes,
  findNode,
  updateNodeInTree,
  removeNodeFromTree,
  insertNode,
  insertChildNode,
  isContainerNode,
  getNodePath,
  moveNodeRelative,
  findParent,
  FORM_DESIGN_VERSION,
  type DesignerNode,
  type DesignerNodeType,
  type DesignerContainerConfig,
  type FormMeta,
  type FormDesign,
} from './designer/types'

const t = useT()

const props = withDefaults(
  defineProps<{
    /** 设计数据（v-model:nodes，v3 用 nodes 代替 fields） */
    nodes?: DesignerNode[]
    /** @deprecated v2 兼容，会自动转换为 nodes */
    fields?: DesignerNode[]
    /** 表单元信息（v-model:meta） */
    meta?: FormMeta
    /** 画布高度 */
    height?: string
  }>(),
  {
    nodes: () => [],
    fields: () => [],
    meta: () => ({}),
    height: '600px',
  },
)

const emit = defineEmits<{
  'update:nodes': [nodes: DesignerNode[]]
  'update:fields': [fields: DesignerNode[]]
  'update:meta': [meta: FormMeta]
}>()

// ════════════════════════════════════════
// 节点数据（兼容 v2 fields → v3 nodes）
// ════════════════════════════════════════

/** 是否曾收到过非空 nodes（v3 模式）：此后清空也不再回退 fields，避免旧 fields 复活画布 */
const hasOwnNodes = ref(false)
watch(
  () => props.nodes.length,
  (len) => {
    if (len) hasOwnNodes.value = true
  },
  { immediate: true },
)
/** 当前节点列表（优先用 v3 nodes，兼容 v2 fields） */
const currentNodes = computed(() => {
  if (props.nodes.length) return props.nodes
  return hasOwnNodes.value ? [] : props.fields
})

function patchNodes(list: DesignerNode[]): void {
  emit('update:nodes', list)
  emit('update:fields', list) // 向后兼容
}

// ════════════════════════════════════════
// 状态
// ════════════════════════════════════════

const selectedId = ref<string | null>(null)
/** 多选集合（Ctrl/Cmd+点选进入；空 = 单选模式） */
const selectedIds = ref<Set<string>>(new Set())
const activeTab = ref<'design' | 'preview' | 'outline' | 'schema'>('design')
const showSettings = ref(false)
const previewData = ref<Record<string, unknown>>({})
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')

const selectedNode = computed(() => {
  if (!selectedId.value) return null
  return findNode(currentNodes.value, selectedId.value)
})

/** 是否处于多选模式 */
const isMultiSelect = computed(() => selectedIds.value.size > 0)

/** 处理画布/大纲树选中事件（additive = Ctrl/Cmd+点选） */
function handleSelect(id: string, additive = false): void {
  if (additive) {
    // Ctrl/Cmd+点选：切换该节点在多选集合中的状态
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
    // 主选中保持为最后点击的节点（属性面板编辑用）
    selectedId.value = id
  } else {
    // 普通点选：清空多选，恢复单选
    selectedIds.value = new Set()
    selectedId.value = id
  }
}

/** 清除选中（含多选） */
function clearSelection(): void {
  selectedId.value = null
  selectedIds.value = new Set()
}

const tip = ref('')
let _tipTimer: ReturnType<typeof setTimeout> | null = null
function showTip(msg: string): void {
  tip.value = msg
  if (_tipTimer) clearTimeout(_tipTimer)
  _tipTimer = setTimeout(() => {
    tip.value = ''
  }, 2500)
}
onUnmounted(() => {
  if (_tipTimer) clearTimeout(_tipTimer)
})

// ════════════════════════════════════════
// 撤销/重做
// ════════════════════════════════════════

const undoStack = ref<DesignerNode[][]>([])
const redoStack = ref<DesignerNode[][]>([])
const canUndo = computed(() => undoStack.value.length > 0)
const canRedo = computed(() => redoStack.value.length > 0)

/** 当前正在做「属性编辑」的字段 id（用于把连续属性编辑合并为一个撤销单元） */
let editingPropId: string | null = null

/** 记录快照（每次操作前调用） */
function snapshot(): void {
  undoStack.value.push(deepClone(currentNodes.value))
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
  // 结构操作打断了属性编辑的连续性，重置跟踪，下次属性编辑重新快照
  editingPropId = null
}

function undo(): void {
  if (!undoStack.value.length) return
  redoStack.value.push(deepClone(currentNodes.value))
  const prev = undoStack.value.pop()!
  patchNodes(prev)
}

function redo(): void {
  if (!redoStack.value.length) return
  undoStack.value.push(deepClone(currentNodes.value))
  const next = redoStack.value.pop()!
  patchNodes(next)
}

// ════════════════════════════════════════
// 节点操作（不可变更新 + 快照）
// ════════════════════════════════════════

/** 生成不与现有节点冲突的字段 key 序号（避免删除中间节点后 fieldN 撞 key 串数据） */
function nextFieldSeq(): number {
  const used = new Set(flattenNodes(currentNodes.value).map((n) => n.key))
  let i = used.size + 1
  while (used.has(`field${i}`)) i++
  return i
}

function addNode(type: DesignerNodeType): void {
  snapshot()
  const f = createField(type, nextFieldSeq())
  patchNodes([...currentNodes.value, f])
  selectedId.value = f.id
}

function insertAt(type: DesignerNodeType, index: number): void {
  snapshot()
  const f = createField(type, nextFieldSeq())
  patchNodes(insertNode(currentNodes.value, f, index))
  selectedId.value = f.id
}

function insertIntoContainer(type: DesignerNodeType, containerId: string, index: number, slot?: number): void {
  snapshot()
  const f = createField(type, nextFieldSeq())
  // tabs/collapse/steps 容器：记录字段所在槽位（第几个 tab/折叠项/步骤）
  if (slot !== undefined && slot >= 0) f.containerSlot = slot
  const updated = insertChildNode(currentNodes.value, containerId, f, index)
  if (updated !== currentNodes.value) {
    patchNodes(updated)
    selectedId.value = f.id
  }
}

/** 把字段移动到 tabs/collapse/steps 容器的指定槽位 */
function assignSlot(sourceId: string, slot: number): void {
  snapshot()
  const updated = updateNodeInTree(currentNodes.value, sourceId, { containerSlot: slot })
  patchNodes(updated)
}

/** 待删除节点 id（容器带子节点时需确认） */
const pendingRemoveId = ref<string | null>(null)
const pendingRemoveLabel = ref('')
/** 待批量删除的 id 集合（多选删除确认用） */
const pendingRemoveIds = ref<string[]>([])

function removeNode(id: string): void {
  // 多选模式下：删除整个选中集合（含当前 id）
  if (selectedIds.value.size > 0 && selectedIds.value.has(id)) {
    const ids = [...selectedIds.value]
    const hasContainerWithChildren = ids.some((nid) => {
      const n = findNode(currentNodes.value, nid)
      return n && isContainerNode(n) && !!n.children?.length
    })
    if (hasContainerWithChildren || ids.length > 1) {
      pendingRemoveIds.value = ids
      return
    }
    doRemoveNodes(ids)
    return
  }

  const node = findNode(currentNodes.value, id)
  if (!node) return
  // 容器节点带子节点时，删除会连带删掉子字段，弹确认
  if (isContainerNode(node) && node.children?.length) {
    pendingRemoveId.value = id
    pendingRemoveLabel.value = node.label
    return
  }
  doRemoveNode(id)
}

function doRemoveNode(id: string): void {
  doRemoveNodes([id])
}

/** 批量删除多个节点（单次快照） */
function doRemoveNodes(ids: string[]): void {
  snapshot()
  let next = currentNodes.value
  for (const id of ids) {
    next = removeNodeFromTree(next, id)
  }
  patchNodes(next)
  if (selectedId.value && ids.includes(selectedId.value)) selectedId.value = null
  selectedIds.value = new Set()
}

function onConfirmRemove(): void {
  const id = pendingRemoveId.value
  pendingRemoveId.value = null
  pendingRemoveLabel.value = ''
  if (id) doRemoveNode(id)
}

function onConfirmRemoveBatch(): void {
  const ids = pendingRemoveIds.value
  pendingRemoveIds.value = []
  if (ids.length) doRemoveNodes(ids)
}

function duplicateNode(id: string): void {
  snapshot()
  const node = findNode(currentNodes.value, id)
  if (!node) return
  const copy = cloneNode(node)
  // 找到原节点位置，插入到后面
  const flat = flattenNodes(currentNodes.value)
  const idx = flat.findIndex((f) => f.id === id)
  if (idx >= 0) {
    patchNodes(insertNode(currentNodes.value, copy, idx + 1))
  } else {
    patchNodes([...currentNodes.value, copy])
  }
  selectedId.value = copy.id
}

// ════════════════════════════════════════
// 复制/粘贴（Ctrl+C / Ctrl+V 跨会话剪贴板）
// ════════════════════════════════════════

/** 被复制的节点（深拷贝，避免后续编辑污染剪贴板内容） */
let clipboardNode: DesignerNode | null = null

/** 深拷贝节点并生成新 id（key 加 _copy 后缀避免重复） */
function cloneNode(node: DesignerNode): DesignerNode {
  const copy: DesignerNode = deepClone(node)
  copy.id = uuid('n')
  if (node.key) copy.key = node.key + '_copy'
  // 递归重生成子节点 id，避免与新节点 id 冲突
  if (copy.children?.length) {
    const rekey = (list: DesignerNode[]): void => {
      for (const child of list) {
        child.id = uuid('n')
        if (child.children?.length) rekey(child.children)
      }
    }
    rekey(copy.children)
  }
  return copy
}

/** 复制选中节点到剪贴板 */
function copyNode(id: string): void {
  const node = findNode(currentNodes.value, id)
  if (!node) return
  clipboardNode = deepClone(node)
  showTip(t('formBuilder.copied'))
}

/** 粘贴剪贴板节点到选中节点之后（同父级） */
function pasteNode(id: string): void {
  if (!clipboardNode) {
    showTip(t('formBuilder.nothingToPaste'))
    return
  }
  snapshot()
  const copy = cloneNode(clipboardNode)
  // 找到选中节点的父级和索引，插入到其后
  const loc = findParent(currentNodes.value, id)
  if (!loc) {
    patchNodes([...currentNodes.value, copy])
  } else {
    const siblings = [...loc.parent]
    siblings.splice(loc.index + 1, 0, copy)
    if (loc.parent === currentNodes.value) {
      patchNodes(siblings)
    } else {
      const rebuild = (list: DesignerNode[]): DesignerNode[] =>
        list.map((n) => {
          if (n.children === loc.parent) return { ...n, children: siblings }
          if (n.children?.length) return { ...n, children: rebuild(n.children) }
          return n
        })
      patchNodes(rebuild(currentNodes.value))
    }
  }
  selectedId.value = copy.id
}

function moveNode(id: string, dir: -1 | 1): void {
  snapshot()
  // 定位节点所在层级，在其父级（根级或某容器 children）内交换
  const loc = findParent(currentNodes.value, id)
  if (!loc) return
  const i = loc.index
  const j = i + dir
  if (j < 0 || j >= loc.parent.length) return
  const siblings = [...loc.parent]
  ;[siblings[i], siblings[j]] = [siblings[j], siblings[i]]
  // 根级直接 patch；容器内需重建树
  if (loc.parent === currentNodes.value) {
    patchNodes(siblings)
  } else {
    const rebuild = (list: DesignerNode[]): DesignerNode[] =>
      list.map((n) => {
        if (n.children === loc.parent) return { ...n, children: siblings }
        if (n.children?.length) return { ...n, children: rebuild(n.children) }
        return n
      })
    patchNodes(rebuild(currentNodes.value))
  }
}

function reorderNode(from: number, to: number): void {
  snapshot()
  const list = [...currentNodes.value]
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved!)
  patchNodes(list)
}

/**
 * 拖拽排序：跨容器移动节点
 *
 * slot：拖入 tabs/collapse/steps 容器内部时，把节点归入当前激活的槽位
 * （画布容器交互化后只展示激活槽位，落点必须与之保持一致）。
 */
function sortNode(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside', slot?: number): void {
  snapshot()
  let updated = moveNodeRelative(currentNodes.value, sourceId, targetId, position)
  if (slot !== undefined && slot >= 0 && position === 'inside') {
    updated = updateNodeInTree(updated, sourceId, { containerSlot: slot })
  }
  patchNodes(updated)
}

/** 更新容器配置（画布「+ 添加」标签页等操作，进撤销栈） */
function updateContainerConfig(id: string, config: DesignerContainerConfig): void {
  snapshot()
  patchNodes(updateNodeInTree(currentNodes.value, id, { containerConfig: config }))
}

function updateNode(id: string, patchObj: Partial<DesignerNode>): void {
  // 属性编辑进撤销栈：对同一字段的连续编辑合并为一个撤销单元（首次编辑时快照一次）
  if (editingPropId !== id) {
    snapshot()
    editingPropId = id
  }
  patchNodes(updateNodeInTree(currentNodes.value, id, patchObj))
}

function onLabelChange(id: string, label: string): void {
  const node = findNode(currentNodes.value, id)
  if (!node) return
  const autoKey = /^field\d+$/.test(node.key ?? '') || !node.key
  updateNode(id, { label, ...(autoKey ? { key: label.trim() || node.key } : {}) })
}

function patchMeta(p: Partial<FormMeta>): void {
  emit('update:meta', { ...props.meta, ...p })
}

// ════════════════════════════════════════
// 键盘快捷键
// ════════════════════════════════════════

function onCanvasKeydown(e: KeyboardEvent): void {
  if (!selectedId.value) return
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  const id = selectedId.value

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    removeNode(id)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault()
    duplicateNode(id)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault()
    copyNode(id)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault()
    pasteNode(id)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
    e.preventDefault()
    moveNode(id, -1)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
    e.preventDefault()
    moveNode(id, 1)
  }
}

// ════════════════════════════════════════
// 导入/导出
// ════════════════════════════════════════

function exportJson(): void {
  if (!currentNodes.value.length) {
    showTip(t('formBuilder.noExportableFields'))
    return
  }
  const design: FormDesign = { schemaVersion: FORM_DESIGN_VERSION, meta: props.meta, nodes: currentNodes.value }
  const json = JSON.stringify(design, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  downloadBlob(blob, 'form-design.json')
  void copyText(json)
  showTip(t('fbd.exportedTip'))
}

const importText = ref('')
const showImport = ref(false)
const importError = ref('')
// 事件处理用命名函数：模板内联多语句 handler 会被 prettier(semi:false) 去分号重排，导致 Vue 表达式解析失败
function closeImport() {
  showImport.value = false
  importError.value = ''
}
function selectFromOutline(id: string) {
  handleSelect(id)
  activeTab.value = 'design'
}
const importDragOver = ref(false)

function onImportDrop(e: DragEvent): void {
  e.preventDefault()
  importDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  if (!file.name.endsWith('.json')) {
    importError.value = t('fbd.jsonFileRequired')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = String(reader.result ?? '')
    applyImport()
  }
  reader.onerror = () => {
    importError.value = t('fbd.fileReadFail')
  }
  reader.readAsText(file)
}

function onImportFileSelect(e: Event): void {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = String(reader.result ?? '')
    applyImport()
  }
  reader.onerror = () => {
    importError.value = t('fbd.fileReadFail')
  }
  reader.readAsText(file)
}

function applyImport(): void {
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

    snapshot()
    patchNodes(nodes)
    emit('update:meta', meta)
    showImport.value = false
    importText.value = ''
    importError.value = ''
    showTip(t('fbd.importedNodes', { n: nodes.length }))
  } catch (e) {
    importError.value = t('fbd.importParseFail', { err: e instanceof Error ? e.message : String(e) })
  }
}

// ════════════════════════════════════════
// 预览 & Schema 查看
// ════════════════════════════════════════

const previewSchema = computed(() => toFormSchema(currentNodes.value, props.meta))

/** 格式化的 Schema JSON（带高亮） */
const schemaJson = computed(() => {
  const design: FormDesign = { schemaVersion: FORM_DESIGN_VERSION, meta: props.meta, nodes: currentNodes.value }
  return JSON.stringify(design, null, 2)
})

/** 复制 Schema JSON 到剪贴板 */
function copySchema(): void {
  void copyText(schemaJson.value)
  showTip(t('fbd.copiedToClipboard'))
}

watch(activeTab, (v) => {
  if (v === 'preview') previewData.value = {}
})

// ════════════════════════════════════════
// 清空
// ════════════════════════════════════════

const clearAllVisible = ref(false)

function clearAll(): void {
  if (!currentNodes.value.length) return
  clearAllVisible.value = true
}

function onConfirmClearAll(): void {
  clearAllVisible.value = false
  snapshot()
  patchNodes([])
  clearSelection()
}

// ════════════════════════════════════════
// 统计
// ════════════════════════════════════════

const nodeCount = computed(() => flattenNodes(currentNodes.value).length)
const containerCount = computed(() => flattenNodes(currentNodes.value).filter((n) => isContainerNode(n)).length)

/** 选中节点的面包屑路径（从根到选中节点） */
const selectedPath = computed(() => {
  if (!selectedId.value) return []
  return getNodePath(currentNodes.value, selectedId.value)
})
</script>

<template>
  <div class="ld">
    <!-- 工具栏 -->
    <div class="ld-toolbar">
      <span class="ld-title">
        <IconSvg type="layout-template" size="sm" />
        {{ t('fbd.formDesigner') }}
      </span>
      <span class="ld-count">{{ t('fbd.nodesContainers', { n: nodeCount, c: containerCount }) }}</span>
      <span v-if="isMultiSelect" class="ld-tip">{{ t('fbd.selectedCount', { n: selectedIds.size }) }}</span>
      <span v-if="tip" class="ld-tip">{{ tip }}</span>
      <div class="ld-toolbar-actions">
        <!-- 撤销/重做 -->
        <button class="ld-btn" :disabled="!canUndo" :title="t('fbd.undoTitle')" @click="undo">
          <IconSvg type="undo-2" size="xs" /> {{ t('fbd.undo') }}
        </button>
        <button class="ld-btn" :disabled="!canRedo" :title="t('fbd.redoTitle')" @click="redo">
          <IconSvg type="redo-2" size="xs" /> {{ t('fbd.redo') }}
        </button>
        <span class="ld-sep" />
        <!-- 设备切换 -->
        <div class="ld-device-switch">
          <button
            class="ld-device-btn"
            :class="{ active: device === 'desktop' }"
            :title="t('fbd.deviceDesktop')"
            @click="device = 'desktop'"
          >
            <IconSvg type="monitor" size="xs" />
          </button>
          <button
            class="ld-device-btn"
            :class="{ active: device === 'tablet' }"
            :title="t('fbd.deviceTablet')"
            @click="device = 'tablet'"
          >
            <IconSvg type="tablet" size="xs" />
          </button>
          <button
            class="ld-device-btn"
            :class="{ active: device === 'mobile' }"
            :title="t('fbd.deviceMobile')"
            @click="device = 'mobile'"
          >
            <IconSvg type="smartphone" size="xs" />
          </button>
        </div>
        <span class="ld-sep" />
        <!-- 标签页切换 -->
        <button class="ld-btn" :class="{ active: activeTab === 'design' }" @click="activeTab = 'design'">
          {{ t('fbd.tabDesign') }}
        </button>
        <button class="ld-btn" :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">
          {{ t('fbd.tabPreview') }}
        </button>
        <button class="ld-btn" :class="{ active: activeTab === 'outline' }" @click="activeTab = 'outline'">
          {{ t('fbd.tabOutline') }}
        </button>
        <button class="ld-btn" :class="{ active: activeTab === 'schema' }" @click="activeTab = 'schema'">
          {{ t('fbd.tabCode') }}
        </button>
        <span class="ld-sep" />
        <button class="ld-btn" :class="{ active: showSettings }" @click="showSettings = !showSettings">
          {{ t('fbd.formSettings') }}
        </button>
        <span class="ld-sep" />
        <button class="ld-btn" @click="exportJson"><IconSvg type="download" size="xs" /> {{ t('fbd.export') }}</button>
        <button class="ld-btn" @click="showImport = !showImport">
          <IconSvg type="upload" size="xs" /> {{ t('fbd.import') }}
        </button>
        <button class="ld-btn ld-danger" @click="clearAll">
          <IconSvg type="trash-2" size="xs" /> {{ t('fbd.clear') }}
        </button>
      </div>
    </div>

    <!-- 表单设置 -->
    <div v-if="showSettings" class="ld-settings">
      <div class="ld-settings-row wide">
        <label>{{ t('fbd.formTitle') }}</label>
        <input
          class="ld-settings-textarea"
          :value="meta.title ?? ''"
          :placeholder="t('fbd.formTitlePh')"
          @input="patchMeta({ title: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="ld-settings-row wide">
        <label>{{ t('fbd.formDesc') }}</label>
        <input
          class="ld-settings-textarea"
          :value="meta.description ?? ''"
          :placeholder="t('fbd.formDescPh')"
          @input="patchMeta({ description: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="ld-settings-row" style="max-width: 200px">
        <label>{{ t('fbd.layoutMode') }}</label>
        <div class="ld-layout-preview">
          <div
            class="ld-layout-thumb"
            :class="{ active: (meta.layout ?? 'single') === 'single' }"
            @click="patchMeta({ layout: 'single' })"
          >
            <div class="ld-thumb-bars">
              <div></div>
              <div></div>
              <div></div>
            </div>
            <span>{{ t('fbd.layoutSingle') }}</span>
          </div>
          <div
            class="ld-layout-thumb"
            :class="{ active: meta.layout === 'grid' }"
            @click="patchMeta({ layout: 'grid' })"
          >
            <div class="ld-thumb-grid">
              <div></div>
              <div></div>
              <div></div>
              <div></div>
            </div>
            <span>{{ t('fbd.layoutGrid') }}</span>
          </div>
          <div
            class="ld-layout-thumb"
            :class="{ active: meta.layout === 'steps' }"
            @click="patchMeta({ layout: 'steps' })"
          >
            <div class="ld-thumb-steps">
              <div></div>
              <div></div>
              <div></div>
            </div>
            <span>{{ t('fbd.layoutSteps') }}</span>
          </div>
        </div>
      </div>
      <div class="ld-settings-row" style="max-width: 200px">
        <label>{{ t('fbd.submitBtnText') }}</label>
        <input
          class="ld-settings-textarea"
          :value="meta.submitText ?? t('common.submit')"
          :placeholder="t('common.submit')"
          @input="patchMeta({ submitText: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="ld-settings-row" style="max-width: 160px">
        <label>{{ t('fbd.realtimeValidate') }}</label>
        <select
          class="ld-settings-textarea"
          :value="meta.validateOnChange ? '1' : '0'"
          @change="patchMeta({ validateOnChange: ($event.target as HTMLSelectElement).value === '1' })"
        >
          <option value="0">{{ t('fbd.validateOnSubmitOnly') }}</option>
          <option value="1">{{ t('fbd.validateOnInput') }}</option>
        </select>
      </div>
    </div>

    <!-- 高级表单设置 -->
    <div v-if="showSettings" class="ld-settings ld-settings-advanced">
      <div class="ld-settings-row" style="max-width: 140px">
        <label>{{ t('fbp.labelPosition') }}</label>
        <select
          class="ld-settings-textarea"
          :value="meta.labelPosition ?? 'left'"
          @change="
            patchMeta({ labelPosition: ($event.target as HTMLSelectElement).value as 'left' | 'top' | 'hidden' })
          "
        >
          <option value="left">{{ t('fbp.posLeft') }}</option>
          <option value="top">{{ t('fbp.posTop') }}</option>
          <option value="hidden">{{ t('fbp.posHidden') }}</option>
        </select>
      </div>
      <div class="ld-settings-row" style="max-width: 140px">
        <label>{{ t('fbp.labelWidth') }}</label>
        <select
          class="ld-settings-textarea"
          :value="meta.labelWidth ?? 'default'"
          @change="
            patchMeta({
              labelWidth: ($event.target as HTMLSelectElement).value as 'default' | '80px' | '120px' | 'auto',
            })
          "
        >
          <option value="default">{{ t('fbp.labelWidthDefault') }}</option>
          <option value="80px">80px</option>
          <option value="120px">120px</option>
          <option value="auto">{{ t('fbp.auto') }}</option>
        </select>
      </div>
      <div class="ld-settings-row" style="max-width: 140px">
        <label>{{ t('fbd.resetBtnText') }}</label>
        <input
          class="ld-settings-textarea"
          :value="meta.resetText ?? t('common.reset')"
          :placeholder="t('common.reset')"
          @input="patchMeta({ resetText: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="ld-settings-row" style="max-width: 140px">
        <label>{{ t('fbd.submitMode') }}</label>
        <select
          class="ld-settings-textarea"
          :value="meta.submitMode ?? 'once'"
          @change="
            patchMeta({ submitMode: ($event.target as HTMLSelectElement).value as 'once' | 'multiple' | 'unique' })
          "
        >
          <option value="once">{{ t('fbd.modeOnce') }}</option>
          <option value="multiple">{{ t('fbd.modeMultiple') }}</option>
          <option value="unique">{{ t('fbd.modeUnique') }}</option>
        </select>
      </div>
      <div class="ld-settings-switch-row">
        <label>{{ t('fbd.hideActions') }}</label>
        <Group
          type="switch"
          :model-value="!!meta.hideActions"
          @update:model-value="patchMeta({ hideActions: !!$event })"
        />
      </div>
      <div class="ld-settings-switch-row">
        <label>{{ t('fbp.clearAfterSubmit') }}</label>
        <Group
          type="switch"
          :model-value="!!meta.clearAfterSubmit"
          @update:model-value="patchMeta({ clearAfterSubmit: !!$event })"
        />
      </div>
    </div>

    <!-- 导入面板 -->
    <div v-if="showImport" class="ld-import">
      <div
        class="ld-import-dropzone"
        :class="{ 'drag-over': importDragOver }"
        @dragover.prevent="importDragOver = true"
        @dragleave="importDragOver = false"
        @drop="onImportDrop"
      >
        <IconSvg type="upload" size="md" />
        <span>{{ t('fbd.dropJsonHere') }}</span>
        <label class="ld-import-file-label">
          {{ t('fbd.orPickFile') }}
          <input type="file" accept=".json" hidden @change="onImportFileSelect" />
        </label>
      </div>
      <textarea v-model="importText" rows="5" :placeholder="t('fbd.pasteJsonPh')" />
      <div class="ld-import-actions">
        <span v-if="importError" class="ld-import-error">{{ importError }}</span>
        <button class="ld-btn" @click="applyImport">{{ t('fbd.applyImport') }}</button>
        <button class="ld-btn" @click="closeImport">{{ t('common.cancel') }}</button>
      </div>
    </div>

    <!-- ═══ 设计标签页 ═══ -->
    <div v-if="activeTab === 'design'" class="ld-body" :style="{ height }">
      <!-- 左栏：字段面板 -->
      <DesignerPanel @add="addNode" />

      <!-- 左2栏：大纲树 -->
      <OutlineTree
        :nodes="currentNodes"
        :selected-id="selectedId"
        @select="handleSelect"
        @remove="removeNode"
        @move="sortNode"
      />

      <!-- 中栏：画布 -->
      <div class="ld-canvas-wrap" tabindex="0" @keydown="onCanvasKeydown">
        <DesignerCanvas
          :nodes="currentNodes"
          :selected-id="selectedId"
          :selected-ids="[...selectedIds]"
          :device="device"
          :form-title="meta.title ?? t('fbd.formTitle')"
          :form-description="meta.description ?? t('fbd.formDesc')"
          :breadcrumb-path="selectedPath"
          @select="handleSelect"
          @add="addNode"
          @move="moveNode"
          @duplicate="duplicateNode"
          @remove="removeNode"
          @reorder="reorderNode"
          @insert-at="insertAt"
          @insert-into-container="insertIntoContainer"
          @sort-node="sortNode"
          @assign-slot="assignSlot"
          @update-container="updateContainerConfig"
        />
      </div>

      <!-- 右栏：属性面板 -->
      <PropsPanel
        v-if="selectedNode"
        :node="selectedNode"
        :all-nodes="currentNodes"
        @update="updateNode(selectedNode.id, $event)"
        @name-change="onLabelChange(selectedNode.id, $event)"
      />
      <aside v-else class="ldp-props">
        <div class="ldp-props-empty">
          <span>{{ t('fbd.emptySelectTip') }}</span>
        </div>
      </aside>
    </div>

    <!-- ═══ 预览标签页 ═══ -->
    <div
      v-else-if="activeTab === 'preview'"
      class="ld-body"
      :style="{ height, display: 'block', padding: '24px', background: 'var(--color-bg-alt, #f8fafc)' }"
    >
      <div class="ld-preview">
        <FormBuilder
          v-model="previewData"
          :schema="previewSchema"
          @submit="showTip(t('fbd.previewData', { data: JSON.stringify($event) }))"
        />
      </div>
    </div>

    <!-- ═══ 大纲标签页 ═══ -->
    <div
      v-else-if="activeTab === 'outline'"
      class="ld-body"
      :style="{ height, display: 'block', padding: '24px', background: 'var(--color-bg-alt, #f8fafc)' }"
    >
      <div class="ld-outline-full">
        <div class="ld-outline-full-header">
          <div>
            <h3 class="ld-outline-full-title">{{ meta.title ?? t('fbd.formTitle') }} — {{ t('fbd.structureTree') }}</h3>
            <p class="ld-outline-full-hint">{{ t('fbd.outlineHint') }}</p>
          </div>
          <div class="ld-outline-full-stats">
            <span>{{ t('fbd.nodesCount', { n: nodeCount }) }}</span>
            <span class="ld-outline-full-dot">·</span>
            <span>{{ t('fbd.containersCount', { c: containerCount }) }}</span>
          </div>
        </div>
        <div class="ld-outline-full-body">
          <OutlineTree
            :nodes="currentNodes"
            :selected-id="selectedId"
            @select="selectFromOutline"
            @remove="removeNode"
            @move="sortNode"
          />
        </div>
      </div>
    </div>

    <!-- ═══ Schema 代码查看标签页 ═══ -->
    <div v-else-if="activeTab === 'schema'" class="ld-body" :style="{ height, display: 'block', padding: '24px' }">
      <div class="ld-code-panel">
        <div class="ld-code-toolbar">
          <span class="ld-code-title">
            <IconSvg type="code" size="sm" />
            {{ t('fbd.designCodeJson') }}
          </span>
          <div class="ld-code-actions">
            <button class="ld-btn" @click="copySchema"><IconSvg type="copy" size="xs" /> {{ t('common.copy') }}</button>
          </div>
        </div>
        <div class="ld-code-body">
          <pre>{{ schemaJson }}</pre>
        </div>
      </div>
    </div>
  </div>

  <!-- 确认弹窗 -->
  <ConfirmModal
    :visible="clearAllVisible"
    :title="t('formBuilder.clearFieldsTitle')"
    :message="t('formBuilder.clearFieldsMsg')"
    :confirm-text="t('fbd.clear')"
    variant="danger"
    @update:visible="clearAllVisible = $event"
    @confirm="onConfirmClearAll"
  />

  <!-- 删除容器确认弹窗 -->
  <ConfirmModal
    :visible="!!pendingRemoveId"
    :title="t('formBuilder.removeContainerTitle')"
    :message="t('formBuilder.removeContainerMsg', { label: pendingRemoveLabel })"
    :confirm-text="t('common.delete')"
    variant="warning"
    @update:visible="pendingRemoveId = null"
    @confirm="onConfirmRemove"
  />

  <!-- 批量删除确认弹窗 -->
  <ConfirmModal
    :visible="pendingRemoveIds.length > 0"
    :title="t('formBuilder.batchRemoveTitle')"
    :message="t('formBuilder.batchRemoveMsg', { count: pendingRemoveIds.length })"
    :confirm-text="t('common.delete')"
    variant="danger"
    @update:visible="pendingRemoveIds = []"
    @confirm="onConfirmRemoveBatch"
  />
</template>

<style src="./designer/designer.css"></style>
