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
import { ref, computed, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import IconSvg from '@/components/basic/IconSvg.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import Group from '@/components/form/Group.vue'
import FormBuilder from './FormBuilder.vue'
import DesignerPanel from './designer/DesignerPanel.vue'
import DesignerCanvas from './designer/DesignerCanvas.vue'
import PropsPanel from './designer/PropsPanel.vue'
import OutlineTree from './designer/OutlineTree.vue'
import {
  createField, toFormSchema, flattenNodes, findNode, updateNodeInTree,
  removeNodeFromTree, insertNode, insertChildNode, isContainerNode,
  getNodePath, moveNodeRelative, findParent,
  type DesignerNode, type DesignerNodeType, type FormMeta, type FormDesign,
} from './designer/types'

const t = useT()

const props = withDefaults(defineProps<{
  /** 设计数据（v-model:nodes，v3 用 nodes 代替 fields） */
  nodes?: DesignerNode[]
  /** @deprecated v2 兼容，会自动转换为 nodes */
  fields?: DesignerNode[]
  /** 表单元信息（v-model:meta） */
  meta?: FormMeta
  /** 画布高度 */
  height?: string
}>(), {
  nodes: () => [],
  fields: () => [],
  meta: () => ({}),
  height: '600px',
})

const emit = defineEmits<{
  'update:nodes': [nodes: DesignerNode[]]
  'update:fields': [fields: DesignerNode[]]
  'update:meta': [meta: FormMeta]
}>()

// ════════════════════════════════════════
// 节点数据（兼容 v2 fields → v3 nodes）
// ════════════════════════════════════════

/** 当前节点列表（优先用 v3 nodes，兼容 v2 fields） */
const currentNodes = computed(() => {
  return props.nodes.length ? props.nodes : props.fields
})

function patchNodes(list: DesignerNode[]): void {
  emit('update:nodes', list)
  emit('update:fields', list) // 向后兼容
}

// ════════════════════════════════════════
// 状态
// ════════════════════════════════════════

const selectedId = ref<string | null>(null)
const activeTab = ref<'design' | 'preview' | 'outline' | 'schema'>('design')
const showSettings = ref(false)
const previewData = ref<Record<string, unknown>>({})
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')

const selectedNode = computed(() => {
  if (!selectedId.value) return null
  return findNode(currentNodes.value, selectedId.value)
})

const tip = ref('')
let _tipTimer: ReturnType<typeof setTimeout> | null = null
function showTip(msg: string): void {
  tip.value = msg
  if (_tipTimer) clearTimeout(_tipTimer)
  _tipTimer = setTimeout(() => { tip.value = '' }, 2500)
}

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
  undoStack.value.push(JSON.parse(JSON.stringify(currentNodes.value)))
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
  // 结构操作打断了属性编辑的连续性，重置跟踪，下次属性编辑重新快照
  editingPropId = null
}

function undo(): void {
  if (!undoStack.value.length) return
  redoStack.value.push(JSON.parse(JSON.stringify(currentNodes.value)))
  const prev = undoStack.value.pop()!
  patchNodes(prev)
}

function redo(): void {
  if (!redoStack.value.length) return
  undoStack.value.push(JSON.parse(JSON.stringify(currentNodes.value)))
  const next = redoStack.value.pop()!
  patchNodes(next)
}

// ════════════════════════════════════════
// 节点操作（不可变更新 + 快照）
// ════════════════════════════════════════

function addNode(type: DesignerNodeType): void {
  snapshot()
  const f = createField(type, flattenNodes(currentNodes.value).length + 1)
  patchNodes([...currentNodes.value, f])
  selectedId.value = f.id
}

function insertAt(type: DesignerNodeType, index: number): void {
  snapshot()
  const f = createField(type, flattenNodes(currentNodes.value).length + 1)
  patchNodes(insertNode(currentNodes.value, f, index))
  selectedId.value = f.id
}

function insertIntoContainer(type: DesignerNodeType, containerId: string, index: number, slot?: number): void {
  snapshot()
  const f = createField(type, flattenNodes(currentNodes.value).length + 1)
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

function removeNode(id: string): void {
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
  snapshot()
  patchNodes(removeNodeFromTree(currentNodes.value, id))
  if (selectedId.value === id) selectedId.value = null
}

function onConfirmRemove(): void {
  const id = pendingRemoveId.value
  pendingRemoveId.value = null
  pendingRemoveLabel.value = ''
  if (id) doRemoveNode(id)
}

function duplicateNode(id: string): void {
  snapshot()
  const node = findNode(currentNodes.value, id)
  if (!node) return
  const copy: DesignerNode = {
    ...JSON.parse(JSON.stringify(node)),
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    key: node.key ? node.key + '_copy' : undefined,
  }
  // 找到原节点位置，插入到后面
  const flat = flattenNodes(currentNodes.value)
  const idx = flat.findIndex(f => f.id === id)
  if (idx >= 0) {
    patchNodes(insertNode(currentNodes.value, copy, idx + 1))
  } else {
    patchNodes([...currentNodes.value, copy])
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

/** 拖拽排序：跨容器移动节点 */
function sortNode(sourceId: string, targetId: string, position: 'before' | 'after' | 'inside'): void {
  snapshot()
  const updated = moveNodeRelative(currentNodes.value, sourceId, targetId, position)
  patchNodes(updated)
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
    showTip('没有可导出的字段')
    return
  }
  const design: FormDesign = { schemaVersion: 3, meta: props.meta, nodes: currentNodes.value }
  const json = JSON.stringify(design, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'form-design.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  navigator.clipboard?.writeText(json).catch(() => {})
  showTip('已导出 JSON（下载 + 复制到剪贴板）')
}

const importText = ref('')
const showImport = ref(false)
const importError = ref('')
const importDragOver = ref(false)

function onImportDrop(e: DragEvent): void {
  e.preventDefault()
  importDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  if (!file.name.endsWith('.json')) {
    importError.value = '请上传 .json 格式的文件'
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = String(reader.result ?? '')
    applyImport()
  }
  reader.onerror = () => { importError.value = '文件读取失败' }
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
  reader.onerror = () => { importError.value = '文件读取失败' }
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
      meta = (data.meta && typeof data.meta === 'object') ? data.meta : {}

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
      throw new Error('顶层必须是数组或 {meta, nodes/fields} 对象')
    }

    snapshot()
    patchNodes(nodes)
    emit('update:meta', meta)
    showImport.value = false
    importText.value = ''
    importError.value = ''
    showTip(`已导入 ${nodes.length} 个节点`)
  } catch (e) {
    importError.value = 'JSON 解析失败：' + (e instanceof Error ? e.message : String(e))
  }
}

// ════════════════════════════════════════
// 预览 & Schema 查看
// ════════════════════════════════════════

const previewSchema = computed(() => toFormSchema(currentNodes.value, props.meta))

/** 格式化的 Schema JSON（带高亮） */
const schemaJson = computed(() => {
  const design: FormDesign = { schemaVersion: 3, meta: props.meta, nodes: currentNodes.value }
  return JSON.stringify(design, null, 2)
})

/** 复制 Schema JSON 到剪贴板 */
function copySchema(): void {
  navigator.clipboard?.writeText(schemaJson.value).catch(() => {})
  showTip('已复制到剪贴板')
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
  selectedId.value = null
}

// ════════════════════════════════════════
// 统计
// ════════════════════════════════════════

const nodeCount = computed(() => flattenNodes(currentNodes.value).length)
const containerCount = computed(() => flattenNodes(currentNodes.value).filter(n => isContainerNode(n)).length)

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
        表单设计器
      </span>
      <span class="ld-count">{{ nodeCount }} 个节点 · {{ containerCount }} 个容器</span>
      <span v-if="tip" class="ld-tip">{{ tip }}</span>
      <div class="ld-toolbar-actions">
        <!-- 撤销/重做 -->
        <button class="ld-btn" :disabled="!canUndo" @click="undo" title="撤销 Ctrl+Z">
          <IconSvg type="undo-2" size="xs" /> 撤销
        </button>
        <button class="ld-btn" :disabled="!canRedo" @click="redo" title="重做 Ctrl+Shift+Z">
          <IconSvg type="redo-2" size="xs" /> 重做
        </button>
        <span class="ld-sep" />
        <!-- 设备切换 -->
        <div class="ld-device-switch">
          <button class="ld-device-btn" :class="{ active: device === 'desktop' }" @click="device = 'desktop'" title="桌面端">
            <IconSvg type="monitor" size="xs" />
          </button>
          <button class="ld-device-btn" :class="{ active: device === 'tablet' }" @click="device = 'tablet'" title="平板">
            <IconSvg type="tablet" size="xs" />
          </button>
          <button class="ld-device-btn" :class="{ active: device === 'mobile' }" @click="device = 'mobile'" title="手机端">
            <IconSvg type="smartphone" size="xs" />
          </button>
        </div>
        <span class="ld-sep" />
        <!-- 标签页切换 -->
        <button class="ld-btn" :class="{ active: activeTab === 'design' }" @click="activeTab = 'design'">设计</button>
        <button class="ld-btn" :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">预览</button>
        <button class="ld-btn" :class="{ active: activeTab === 'outline' }" @click="activeTab = 'outline'">大纲</button>
        <button class="ld-btn" :class="{ active: activeTab === 'schema' }" @click="activeTab = 'schema'">代码</button>
        <span class="ld-sep" />
        <button class="ld-btn" :class="{ active: showSettings }" @click="showSettings = !showSettings">表单设置</button>
        <span class="ld-sep" />
        <button class="ld-btn" @click="exportJson">
          <IconSvg type="download" size="xs" /> 导出
        </button>
        <button class="ld-btn" @click="showImport = !showImport">
          <IconSvg type="upload" size="xs" /> 导入
        </button>
        <button class="ld-btn ld-danger" @click="clearAll">
          <IconSvg type="trash-2" size="xs" /> 清空
        </button>
      </div>
    </div>

    <!-- 表单设置 -->
    <div v-if="showSettings" class="ld-settings">
      <div class="ld-settings-row wide">
        <label>表单标题</label>
        <input
          class="ld-settings-textarea"
          :value="meta.title ?? ''"
          placeholder="例如：客户满意度调查"
          @input="patchMeta({ title: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="ld-settings-row wide">
        <label>表单描述</label>
        <input
          class="ld-settings-textarea"
          :value="meta.description ?? ''"
          placeholder="填写说明文字（可选）"
          @input="patchMeta({ description: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="ld-settings-row" style="max-width: 200px;">
        <label>布局模式</label>
        <div class="ld-layout-preview">
          <div
            class="ld-layout-thumb"
            :class="{ active: (meta.layout ?? 'single') === 'single' }"
            @click="patchMeta({ layout: 'single' })"
          >
            <div class="ld-thumb-bars"><div></div><div></div><div></div></div>
            <span>单列</span>
          </div>
          <div
            class="ld-layout-thumb"
            :class="{ active: meta.layout === 'grid' }"
            @click="patchMeta({ layout: 'grid' })"
          >
            <div class="ld-thumb-grid"><div></div><div></div><div></div><div></div></div>
            <span>栅格</span>
          </div>
          <div
            class="ld-layout-thumb"
            :class="{ active: meta.layout === 'steps' }"
            @click="patchMeta({ layout: 'steps' })"
          >
            <div class="ld-thumb-steps"><div></div><div></div><div></div></div>
            <span>分步</span>
          </div>
        </div>
      </div>
      <div class="ld-settings-row" style="max-width: 200px;">
        <label>提交按钮文案</label>
        <input class="ld-settings-textarea" :value="meta.submitText ?? '提交'" placeholder="提交" @input="patchMeta({ submitText: ($event.target as HTMLInputElement).value })" />
      </div>
      <div class="ld-settings-row" style="max-width: 160px;">
        <label>实时校验</label>
        <select class="ld-settings-textarea" :value="meta.validateOnChange ? '1' : '0'" @change="patchMeta({ validateOnChange: ($event.target as HTMLSelectElement).value === '1' })">
          <option value="0">仅提交时</option>
          <option value="1">输入时校验</option>
        </select>
      </div>
    </div>

    <!-- 高级表单设置 -->
    <div v-if="showSettings" class="ld-settings ld-settings-advanced">
      <div class="ld-settings-row" style="max-width: 140px;">
        <label>标签位置</label>
        <select class="ld-settings-textarea" :value="meta.labelPosition ?? 'left'" @change="patchMeta({ labelPosition: ($event.target as HTMLSelectElement).value as 'left' | 'top' | 'hidden' })">
          <option value="left">左侧</option>
          <option value="top">上方</option>
          <option value="hidden">隐藏</option>
        </select>
      </div>
      <div class="ld-settings-row" style="max-width: 140px;">
        <label>标签宽度</label>
        <select class="ld-settings-textarea" :value="meta.labelWidth ?? 'default'" @change="patchMeta({ labelWidth: ($event.target as HTMLSelectElement).value as 'default' | '80px' | '120px' | 'auto' })">
          <option value="default">默认 (100px)</option>
          <option value="80px">80px</option>
          <option value="120px">120px</option>
          <option value="auto">自动</option>
        </select>
      </div>
      <div class="ld-settings-row" style="max-width: 140px;">
        <label>重置按钮文案</label>
        <input class="ld-settings-textarea" :value="meta.resetText ?? '重置'" placeholder="重置" @input="patchMeta({ resetText: ($event.target as HTMLInputElement).value })" />
      </div>
      <div class="ld-settings-row" style="max-width: 140px;">
        <label>提交模式</label>
        <select class="ld-settings-textarea" :value="meta.submitMode ?? 'once'" @change="patchMeta({ submitMode: ($event.target as HTMLSelectElement).value as 'once' | 'multiple' | 'unique' })">
          <option value="once">一次性</option>
          <option value="multiple">可多次</option>
          <option value="unique">仅一次</option>
        </select>
      </div>
      <div class="ld-settings-switch-row">
        <label>隐藏底部按钮</label>
        <Group type="switch" :model-value="!!meta.hideActions" @update:model-value="patchMeta({ hideActions: !!$event })" />
      </div>
      <div class="ld-settings-switch-row">
        <label>提交后清空</label>
        <Group type="switch" :model-value="!!meta.clearAfterSubmit" @update:model-value="patchMeta({ clearAfterSubmit: !!$event })" />
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
        <span>拖放 .json 文件到此处</span>
        <label class="ld-import-file-label">
          或点击选择文件
          <input type="file" accept=".json" @change="onImportFileSelect" hidden />
        </label>
      </div>
      <textarea v-model="importText" rows="5" placeholder="或粘贴表单设计 JSON（{meta,nodes} 或数组格式）..." />
      <div class="ld-import-actions">
        <span v-if="importError" class="ld-import-error">{{ importError }}</span>
        <button class="ld-btn" @click="applyImport">应用导入</button>
        <button class="ld-btn" @click="showImport = false; importError = ''">取消</button>
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
        @select="selectedId = $event"
        @remove="removeNode"
        @move="sortNode"
      />

      <!-- 中栏：画布 -->
      <div class="ld-canvas-wrap" tabindex="0" @keydown="onCanvasKeydown">
        <DesignerCanvas
          :nodes="currentNodes"
          :selected-id="selectedId"
          :device="device"
          :form-title="meta.title ?? '表单标题'"
          :form-description="meta.description ?? '表单描述'"
          @select="selectedId = $event"
          @add="addNode"
          @move="moveNode"
          @duplicate="duplicateNode"
          @remove="removeNode"
          @reorder="reorderNode"
          @insert-at="insertAt"
          @insert-into-container="insertIntoContainer"
          @sort-node="sortNode"
          @assign-slot="assignSlot"
          :breadcrumb-path="selectedPath"
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
          <span>选中节点后编辑属性</span>
        </div>
      </aside>
    </div>

    <!-- ═══ 预览标签页 ═══ -->
    <div v-else-if="activeTab === 'preview'" class="ld-body" :style="{ height, display: 'block', padding: '24px', background: 'var(--color-bg-alt, #f8fafc)' }">
      <div class="ld-preview">
        <FormBuilder
          v-model="previewData"
          :schema="previewSchema"
          @submit="showTip('预览数据：' + JSON.stringify($event))"
        />
      </div>
    </div>

    <!-- ═══ 大纲标签页 ═══ -->
    <div v-else-if="activeTab === 'outline'" class="ld-body" :style="{ height, display: 'block', padding: '24px', background: 'var(--color-bg-alt, #f8fafc)' }">
      <div class="ld-outline-full">
        <div class="ld-outline-full-header">
          <div>
            <h3 class="ld-outline-full-title">{{ meta.title ?? '表单标题' }} — 结构树</h3>
            <p class="ld-outline-full-hint">拖拽节点可调整顺序 · 点击节点可跳转到设计器</p>
          </div>
          <div class="ld-outline-full-stats">
            <span>{{ nodeCount }} 个节点</span>
            <span class="ld-outline-full-dot">·</span>
            <span>{{ containerCount }} 个容器</span>
          </div>
        </div>
        <div class="ld-outline-full-body">
          <OutlineTree
            :nodes="currentNodes"
            :selected-id="selectedId"
            @select="selectedId = $event; activeTab = 'design'"
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
            设计代码 (JSON)
          </span>
          <div class="ld-code-actions">
            <button class="ld-btn" @click="copySchema">
              <IconSvg type="copy" size="xs" /> 复制
            </button>
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
    confirm-text="清空"
    variant="danger"
    @update:visible="clearAllVisible = $event"
    @confirm="onConfirmClearAll"
  />

  <!-- 删除容器确认弹窗 -->
  <ConfirmModal
    :visible="!!pendingRemoveId"
    :title="t('formBuilder.removeContainerTitle')"
    :message="t('formBuilder.removeContainerMsg', { label: pendingRemoveLabel })"
    confirm-text="删除"
    variant="warning"
    @update:visible="pendingRemoveId = null"
    @confirm="onConfirmRemove"
  />
</template>

<style src="./designer/designer.css"></style>
