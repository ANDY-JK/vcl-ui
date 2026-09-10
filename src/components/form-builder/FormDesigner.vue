<script setup lang="ts">
/**
 * FormDesigner — 可视化表单设计器
 *
 * ┌─────────┬──────────┬──────────────┬─────────┐
 * │ 字段面板 │ 大纲树   │   画布区域    │ 属性面板 │
 * │ (左)    │ (左2)   │  设计/预览    │  (右)   │
 * └─────────┴──────────┴──────────────┴─────────┘
 *
 * 超长逻辑已按块外移（超 800 行约束整改）：
 * - useDesignerOps：撤销/重做 + 节点增删改/剪贴板/排序
 * - useFormIO：JSON 导入导出 + 分享码识别
 * - useFormManager：保存 / 我的表单 / 存储方式 / 分享码生成
 * - DesignerSettings：表单设置面板（含存储配置 UI）
 * - SavedFormsDrawer：我的表单抽屉
 */
import { ref, computed, watch, provide, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { copyText } from '@/components/_internal/useCopy'
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import FormBuilder from './FormBuilder.vue'
import DesignerPanel from './designer/DesignerPanel.vue'
import DesignerCanvas from './designer/DesignerCanvas.vue'
import DesignerSettings from './designer/DesignerSettings.vue'
import DesignerShortcuts from './designer/DesignerShortcuts.vue'
import PropsPanel from './designer/PropsPanel.vue'
import OutlineTree from './designer/OutlineTree.vue'
import {
  findNode,
  flattenNodes,
  isContainerNode,
  getNodePath,
  toFormSchema,
  FORM_DESIGN_VERSION,
  type DesignerNode,
  type FormMeta,
  type FormDesign,
} from './designer/types'
import { type FormStore, type FormMetaItem } from './designer/store'
import { useFormManager } from './designer/useFormManager'
import { useDesignerOps } from './designer/useDesignerOps'
import { useDesignerAutosave } from './designer/useDesignerAutosave'
import { useFormIO } from './designer/useFormIO'
import { FORM_MANAGER_KEY } from './designer/context'
import SavedFormsDrawer from './designer/SavedFormsDrawer.vue'

const t = useT()

const props = withDefaults(
  defineProps<{
    /** 设计节点树（v-model:nodes） */
    nodes?: DesignerNode[]
    /** @deprecated v2 兼容，会自动转换为 nodes */
    fields?: DesignerNode[]
    /** 表单元信息（v-model:meta） */
    meta?: FormMeta
    /** 画布高度 */
    height?: string
    /** 宿主注入的存储实现（注入后「存储方式」切换 UI 隐藏，保存/列表/收集全部走此实现） */
    store?: FormStore
  }>(),
  {
    nodes: () => [],
    fields: () => [],
    meta: () => ({}),
    height: '600px',
    store: undefined,
  },
)

const emit = defineEmits<{
  'update:nodes': [nodes: DesignerNode[]]
  'update:fields': [fields: DesignerNode[]]
  'update:meta': [meta: FormMeta]
  /** 保存成功（新建或覆盖）后通知宿主，携带存储层返回的表单元信息 */
  saved: [item: FormMetaItem]
}>()

// ══ 节点数据（兼容 v2 fields → v3 nodes） ══

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

// ══ 状态 ══

const selectedId = ref<string | null>(null)
/** 多选集合（Ctrl/Cmd+点选进入；空 = 单选模式） */
const selectedIds = ref<Set<string>>(new Set())
const activeTab = ref<'design' | 'preview' | 'outline' | 'schema'>('design')
const showSettings = ref(false)
const showShortcuts = ref(false)
const previewData = ref<Record<string, unknown>>({})
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')

// ══ 面板宽度 / 显隐（可拖拽调宽并记忆；主体过窄时自动收起大纲列）══

/** 宽度与显隐的持久化 key（同一浏览器记住用户调过的布局） */
const PANEL_STORE_KEY = 'vcl-designer-panels'
/** 面板宽度下限/上限：再窄放不下内容，再宽会把画布挤没 */
const PANEL_MIN_W = 150
const PANEL_MAX_W = 420
/** 主体宽度小于此值时自动收起大纲列，优先保证画布可用 */
const NARROW_W = 1080

const bodyRef = ref<HTMLElement | null>(null)
const paletteW = ref(220)
const outlineW = ref(190)
const propsW = ref(290)
const showPalette = ref(true)
const showOutline = ref(true)
const showProps = ref(true)
/** 主体实测宽度（0 = 尚未测量） */
const bodyW = ref(0)
const resizing = ref<'palette' | 'outline' | 'props' | null>(null)
const narrow = computed(() => bodyW.value > 0 && bodyW.value < NARROW_W)
/** 大纲列实际可见性 = 用户开关 && 非窄屏 */
const outlineVisible = computed(() => showOutline.value && !narrow.value)

function clampPanelW(w: number): number {
  return Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, Math.round(w)))
}

function persistPanels(): void {
  try {
    localStorage.setItem(
      PANEL_STORE_KEY,
      JSON.stringify({
        paletteW: paletteW.value,
        outlineW: outlineW.value,
        propsW: propsW.value,
        showPalette: showPalette.value,
        showOutline: showOutline.value,
        showProps: showProps.value,
      }),
    )
  } catch {
    // 隐私模式 / 配额满：记不住不影响使用
  }
}

function restorePanels(): void {
  // SSR 安全：localStorage 在无 window 环境是未定义标识符，先于 try 拦截
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(PANEL_STORE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<{
      paletteW: number
      outlineW: number
      propsW: number
      showPalette: boolean
      showOutline: boolean
      showProps: boolean
    }>
    if (typeof saved.paletteW === 'number') paletteW.value = clampPanelW(saved.paletteW)
    if (typeof saved.outlineW === 'number') outlineW.value = clampPanelW(saved.outlineW)
    if (typeof saved.propsW === 'number') propsW.value = clampPanelW(saved.propsW)
    if (typeof saved.showPalette === 'boolean') showPalette.value = saved.showPalette
    if (typeof saved.showOutline === 'boolean') showOutline.value = saved.showOutline
    if (typeof saved.showProps === 'boolean') showProps.value = saved.showProps
  } catch {
    // 缓存损坏：回落默认宽度
  }
}

restorePanels()

/** 拖分隔条调宽（属性面板在右侧，向左拖才变宽） */
function startResize(key: 'palette' | 'outline' | 'props', e: MouseEvent): void {
  e.preventDefault()
  const startX = e.clientX
  const dir = key === 'props' ? -1 : 1
  const startW = key === 'palette' ? paletteW.value : key === 'outline' ? outlineW.value : propsW.value
  resizing.value = key
  const onMove = (ev: MouseEvent): void => {
    const next = clampPanelW(startW + (ev.clientX - startX) * dir)
    if (key === 'palette') paletteW.value = next
    else if (key === 'outline') outlineW.value = next
    else propsW.value = next
  }
  const onUp = (): void => {
    resizing.value = null
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    persistPanels()
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function togglePanel(key: 'palette' | 'outline' | 'props'): void {
  if (key === 'palette') showPalette.value = !showPalette.value
  else if (key === 'outline') showOutline.value = !showOutline.value
  else showProps.value = !showProps.value
  persistPanels()
}

/** 主体宽度实测：窄屏自动收起大纲列 */
let bodyObserver: ResizeObserver | null = null
watch(
  bodyRef,
  (el) => {
    bodyObserver?.disconnect()
    bodyObserver = null
    if (!el) return
    bodyObserver = new ResizeObserver(() => {
      bodyW.value = el.clientWidth
    })
    bodyObserver.observe(el)
    bodyW.value = el.clientWidth
  },
  { flush: 'post' },
)
onUnmounted(() => {
  bodyObserver?.disconnect()
  bodyObserver = null
})

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

// ══ 节点操作与历史（撤销/重做 + 增删改 + 剪贴板）— 逻辑在 useDesignerOps ══

const {
  canUndo,
  canRedo,
  snapshot,
  snapshotMeta,
  undo,
  redo,
  addNode,
  insertAt,
  insertIntoContainer,
  assignSlot,
  doRemoveNodes,
  duplicateNode,
  copyNode,
  pasteNode,
  moveNode,
  reorderNode,
  sortNode,
  updateContainerConfig,
  updateNode,
  onLabelChange,
} = useDesignerOps({
  nodes: () => currentNodes.value,
  meta: () => props.meta,
  patch: patchNodes,
  patchAll: (nodes, meta) => {
    patchNodes(nodes)
    if (meta) emit('update:meta', meta)
  },
  selectedId,
  selectedIds,
  showTip,
})

// ══ 草稿自动保存（P2-13）：空白启动恢复上次未保存设计，变更防抖落盘 ══

const { discardDraft } = useDesignerAutosave({
  getNodes: () => currentNodes.value,
  getMeta: () => props.meta,
  hasInitialNodes: () => props.nodes.length > 0 || props.fields.length > 0,
  applyDraft: (d) => {
    patchNodes(d.nodes)
    emit('update:meta', { ...props.meta, ...d.meta })
  },
  showTip,
})

// ══ 表单管理（保存 / 我的表单 / 存储 / 分享）— 逻辑在 useFormManager ══

const manager = useFormManager({
  nodes: () => currentNodes.value,
  meta: () => props.meta,
  updateMeta: (m) => emit('update:meta', m),
  applyNodes: (list) => patchNodes(list),
  snapshot,
  injectedStore: () => props.store,
  showTip,
  onFormOpened: () => {
    activeTab.value = 'design'
    discardDraft() // 已打开耐久副本，未保存草稿作废
  },
  onSaved: (item) => emit('saved', item),
})

/** 表单管理实例共享给设置面板与我的表单抽屉（reactive 按引用共享，非 prop 单向流） */
provide(FORM_MANAGER_KEY, manager)

// ── 保存弹窗（本地状态：名称输入 + 开关；写入走 manager.saveForm） ──
const saveVisible = ref(false)
const saveName = ref('')

function openSave(): void {
  if (!currentNodes.value.length) {
    showTip(t('fbd.nothingToSave'))
    return
  }
  saveName.value = props.meta.title ?? ''
  saveVisible.value = true
}

async function onConfirmSave(): Promise<void> {
  const item = await manager.saveForm(saveName.value)
  if (item) {
    saveVisible.value = false
    discardDraft() // 已有耐久副本，草稿不再需要
  }
}

// ── 分享弹窗 ──
const shareVisible = ref(false)
const shareCode = ref('')

function openShare(): void {
  const code = manager.buildShareCode()
  if (!code) {
    showTip(t('fbd.nothingToSave'))
    return
  }
  shareCode.value = code
  shareVisible.value = true
}

async function copyShare(): Promise<void> {
  const ok = await copyText(shareCode.value)
  showTip(ok ? t('fbd.shareCopied') : t('fbd.copyFail'))
}

/** 发布链接：宿主应用需注册 `#/form/:code` 路由指向 FormShareView */
function buildShareUrl(): string {
  return `${location.origin}${location.pathname}#/form/${shareCode.value}`
}

async function copyShareLink(): Promise<void> {
  const ok = await copyText(buildShareUrl())
  showTip(ok ? t('fbd.shareLinkCopied') : t('fbd.copyFail'))
}

// ══ 导入/导出 — 逻辑在 useFormIO ══

const {
  exportJson,
  importText,
  showImport,
  importError,
  importDragOver,
  closeImport,
  onImportDrop,
  onImportFileSelect,
  applyImport,
} = useFormIO({
  nodes: () => currentNodes.value,
  meta: () => props.meta,
  patch: patchNodes,
  snapshot,
  updateMeta: (m) => emit('update:meta', m),
  showTip,
})

function selectFromOutline(id: string) {
  handleSelect(id)
  activeTab.value = 'design'
}

// ══ 删除确认流（容器带子节点 / 多选删除需确认） ══

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
  doRemoveNodes([id])
}

function onConfirmRemove(): void {
  const id = pendingRemoveId.value
  pendingRemoveId.value = null
  pendingRemoveLabel.value = ''
  if (id) doRemoveNodes([id])
}

function onConfirmRemoveBatch(): void {
  const ids = pendingRemoveIds.value
  pendingRemoveIds.value = []
  if (ids.length) doRemoveNodes(ids)
}

// ══ 键盘快捷键（画布聚焦生效） ══

function onCanvasKeydown(e: KeyboardEvent): void {
  const tag = (e.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  // ? 键呼出快捷键帮助（无需选中节点）
  if (e.key === '?') {
    e.preventDefault()
    showShortcuts.value = !showShortcuts.value
    return
  }

  // 撤销/重做不依赖选中节点
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
    return
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
    return
  }

  if (!selectedId.value) return
  const id = selectedId.value
  // 多选模式下结构操作作用于整个选中集合（删除在上游 removeNode 已处理）
  const ids = selectedIds.value.size ? [...selectedIds.value] : [id]

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    removeNode(id)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
    e.preventDefault()
    duplicateNode(ids)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault()
    copyNode(ids)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault()
    pasteNode(id)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
    e.preventDefault()
    moveNode(ids, -1)
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
    e.preventDefault()
    moveNode(ids, 1)
  }
}

// ══ 预览 & Schema 查看 ══

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

// ══ 清空 ══

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

function patchMeta(p: Partial<FormMeta>): void {
  snapshotMeta(Object.keys(p)[0] ?? '') // 表单设置进撤销栈（同键连续编辑合并）
  emit('update:meta', { ...props.meta, ...p })
}

// ══ 统计 ══

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
        <button
          class="ld-btn"
          :class="{ active: showShortcuts }"
          :title="t('fbd.shortcuts')"
          @click="showShortcuts = !showShortcuts"
        >
          <IconSvg type="keyboard" size="xs" /> {{ t('fbd.shortcuts') }}
        </button>
        <span class="ld-sep" />
        <!-- 面板显隐（窄屏下大纲自动收起，此时按钮禁用并说明原因） -->
        <button
          class="ld-btn ld-btn-icon"
          :class="{ active: showPalette }"
          :title="t('fbd.togglePalette')"
          @click="togglePanel('palette')"
        >
          <IconSvg type="panel-left" size="xs" />
        </button>
        <button
          class="ld-btn ld-btn-icon"
          :class="{ active: outlineVisible }"
          :disabled="narrow"
          :title="narrow ? t('fbd.outlineAutoHidden') : t('fbd.toggleOutline')"
          @click="togglePanel('outline')"
        >
          <IconSvg type="list-tree" size="xs" />
        </button>
        <button
          class="ld-btn ld-btn-icon"
          :class="{ active: showProps }"
          :title="t('fbd.toggleProps')"
          @click="togglePanel('props')"
        >
          <IconSvg type="panel-right" size="xs" />
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
        <button class="ld-btn" :disabled="manager.saving" @click="openSave">
          <IconSvg type="save" size="xs" /> {{ t('fbd.save') }}
        </button>
        <button class="ld-btn" @click="manager.openForms">
          <IconSvg type="folder-open" size="xs" /> {{ t('fbd.myForms') }}
        </button>
        <button class="ld-btn" @click="openShare"><IconSvg type="share-2" size="xs" /> {{ t('fbd.share') }}</button>
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

    <!-- 快捷键帮助面板（按钮 / 画布 ? 键呼出） -->
    <DesignerShortcuts v-if="showShortcuts" />

    <!-- 表单设置面板（基础 + 高级 + 数据存储） -->
    <DesignerSettings v-if="showSettings" :meta="meta" @patch-meta="patchMeta" />

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
    <div
      v-if="activeTab === 'design'"
      ref="bodyRef"
      class="ld-body"
      :class="{ 'is-resizing': resizing }"
      :style="{ height }"
    >
      <!-- 左栏：字段面板 -->
      <DesignerPanel v-if="showPalette" :style="{ width: `${paletteW}px` }" @add="addNode" />
      <div
        v-if="showPalette"
        class="ld-splitter"
        :class="{ active: resizing === 'palette' }"
        :title="t('fbd.resizePanel')"
        @mousedown="startResize('palette', $event)"
      />

      <!-- 左2栏：大纲树（主体过窄时自动收起） -->
      <OutlineTree
        v-if="outlineVisible"
        :style="{ width: `${outlineW}px` }"
        :nodes="currentNodes"
        :selected-id="selectedId"
        @select="handleSelect"
        @remove="removeNode"
        @move="sortNode"
      />
      <div
        v-if="outlineVisible"
        class="ld-splitter"
        :class="{ active: resizing === 'outline' }"
        :title="t('fbd.resizePanel')"
        @mousedown="startResize('outline', $event)"
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
      <template v-if="showProps">
        <div
          class="ld-splitter"
          :class="{ active: resizing === 'props' }"
          :title="t('fbd.resizePanel')"
          @mousedown="startResize('props', $event)"
        />
        <PropsPanel
          v-if="selectedNode"
          :style="{ width: `${propsW}px` }"
          :node="selectedNode"
          :all-nodes="currentNodes"
          @update="updateNode(selectedNode.id, $event)"
          @name-change="onLabelChange(selectedNode.id, $event)"
        />
        <aside v-else class="ldp-props" :style="{ width: `${propsW}px` }">
          <div class="ldp-props-empty">
            <span>{{ t('fbd.emptySelectTip') }}</span>
          </div>
        </aside>
      </template>
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

  <!-- 保存表单弹窗 -->
  <ModalBox
    :visible="saveVisible"
    :title="t('fbd.saveTitle')"
    modal-type="default"
    @update:visible="saveVisible = $event"
  >
    <div class="ld-save-form">
      <label class="ld-save-label">{{ t('fbd.saveNameLabel') }}</label>
      <input
        v-model="saveName"
        class="ld-save-input"
        :placeholder="t('fbd.saveNamePh')"
        @keydown.enter.prevent="onConfirmSave"
      />
    </div>
    <template #footer>
      <Button :text="t('common.cancel')" variant="secondary" @click="saveVisible = false" />
      <Button
        :text="manager.saving ? t('fbd.saving') : t('fbd.save')"
        variant="primary"
        :loading="manager.saving"
        :disabled="manager.saving"
        @click="onConfirmSave"
      />
    </template>
  </ModalBox>

  <!-- 分享表单弹窗 -->
  <ModalBox
    :visible="shareVisible"
    :title="t('fbd.shareTitle')"
    modal-type="default"
    @update:visible="shareVisible = $event"
  >
    <div class="ld-share-dialog">
      <p class="ld-share-hint">{{ t('fbd.shareCodeHint') }}</p>
      <textarea
        class="ld-share-code"
        readonly
        rows="5"
        :value="shareCode"
        @focus="($event.target as HTMLTextAreaElement).select()"
      />
      <div class="ld-share-actions">
        <Button :text="t('common.copy')" variant="secondary" :icon="'copy'" @click="copyShare" />
      </div>
      <div class="ld-share-publish">
        <p class="ld-share-hint">{{ t('fbd.shareLinkHint') }}</p>
        <div class="ld-share-actions">
          <Button :text="t('fbd.shareLinkCopy')" variant="primary" :icon="'link'" @click="copyShareLink" />
        </div>
      </div>
    </div>
  </ModalBox>

  <!-- 我的表单抽屉（列表 / 重命名 / 删除 / 覆盖打开确认） -->
  <SavedFormsDrawer />
</template>

<style src="./designer/designer.css"></style>
