<script lang="ts">
import { useT } from '@/components/_internal/i18n'
/** 模块级 t：prop 默认值工厂在 setup 之前执行（defineProps 被提升），不能引用 setup 局部变量 */
const t = useT()
</script>

<script setup lang="ts">
/**
 * 画布区 — 设计器中栏 (v3)
 *
 * v3 核心变化：
 * 1. 支持容器嵌套渲染：card/grid/tabs/collapse/steps 容器可包含子节点
 * 2. 画布工具条：面包屑导航显示当前编辑位置
 * 3. 设备切换：桌面/平板/手机三种画布宽度
 * 4. 容器内拖拽：支持将字段拖入容器内部
 *
 * 交互：
 * 1. 接收从左栏拖入的新字段/容器
 * 2. 节点间拖拽排序（含跨容器拖拽）
 * 3. 点击选中 → 联动右栏属性面板 + 大纲树
 * 4. 每张卡片有上移/下移/复制/删除操作
 */
import { ref, computed, type PropType } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import FormRenderer from '../FormRenderer.vue'
import DesignerChildCard from './DesignerChildCard.vue'
import {
  tabSlots,
  collapseSlots,
  stepSlots,
  childrenInSlot,
  activeTabName,
  activeTabIndex,
  isCollapseOpen,
  activeStepIndex,
  setActiveTab,
  toggleCollapse,
  setActiveStep,
  activeSlotOf,
  localActiveTab,
} from './slot-utils'
import {
  toFormSchema,
  getTypeLabel,
  getTypeIcon,
  isContainerNode,
  findParent,
  type DesignerNode,
  type DesignerNodeType,
  type DesignerContainerConfig,
  type FormMeta,
} from './types'

const props = defineProps({
  nodes: { type: Array as PropType<DesignerNode[]>, default: () => [] },
  selectedId: { type: String as PropType<string | null>, default: null },
  /** 多选集合（Ctrl/Cmd+点选） */
  selectedIds: { type: Array as PropType<string[]>, default: () => [] },
  /** 设备模式 */
  device: { type: String as PropType<'desktop' | 'tablet' | 'mobile'>, default: 'desktop' },
  /** 表单标题（函数默认值：按实例创建时刻的语言翻译） */
  formTitle: { type: String, default: () => t('fbd.formTitle') },
  /** 表单描述 */
  formDescription: { type: String, default: () => t('fbd.formDesc') },
  /** 面包屑路径（从根到选中节点） */
  breadcrumbPath: { type: Array as PropType<DesignerNode[]>, default: () => [] },
})

const emit = defineEmits<{
  /** additive=true 表示 Ctrl/Cmd+点击，追加到多选而非单选 */
  select: [id: string, additive?: boolean]
  add: [type: DesignerNodeType]
  move: [id: string, dir: -1 | 1]
  duplicate: [id: string]
  remove: [id: string]
  reorder: [from: number, to: number]
  insertAt: [type: DesignerNodeType, index: number]
  /** 插入到容器内（slot = tabs/collapse/steps 容器第几个槽位，普通容器省略） */
  insertIntoContainer: [type: DesignerNodeType, containerId: string, index: number, slot?: number]
  /** 拖拽排序：将源节点移动到目标节点之前/之后（跨容器）；slot = 拖入 tabs/collapse/steps 容器内部时的目标槽位 */
  sortNode: [sourceId: string, targetId: string, position: 'before' | 'after' | 'inside', slot?: number]
  /** 把字段移动到 tabs/collapse/steps 容器的指定槽位 */
  assignSlot: [sourceId: string, slot: number]
  /** 更新容器配置（如添加标签页），由 FormDesigner 快照后写入节点 */
  updateContainer: [id: string, config: DesignerContainerConfig]
}>()

// ════════════════════════════════════════
// 拖拽状态
// ════════════════════════════════════════

const dragSource = ref<'panel' | 'sort' | null>(null)
const sortDragId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
/** 落点位置：before/after 显示指示线，inside 显示容器内高亮 */
const dropPos = ref<'before' | 'after' | 'inside' | null>(null)
const canvasDragOver = ref(false)

// ════════════════════════════════════════
// 预览 Schema（供 FormRenderer 使用）
// ════════════════════════════════════════

const previewSchema = computed(() => {
  const meta: FormMeta = { title: '', description: '' }
  return toFormSchema(props.nodes, meta)
})

/** 根据 key 查找字段定义 */
function findFieldByKey(key: string) {
  return previewSchema.value.fields.find((f) => f.key === key)
}

/** 节点是否处于选中态（单选选中 或 多选集合内） */
function isSelected(id: string): boolean {
  return id === props.selectedId || props.selectedIds.includes(id)
}

/** 该节点是否显示指定位置的落点指示线 */
function showIndicator(id: string, pos: 'before' | 'after'): boolean {
  return dropTargetId.value === id && dropPos.value === pos
}

/** 子卡片应显示的落点（未命中该子卡片时为 null） */
function childDropPos(id: string): 'before' | 'after' | 'inside' | null {
  return dropTargetId.value === id ? dropPos.value : null
}

// ════════════════════════════════════════
// tabs/collapse/steps 容器：槽位渲染辅助
// ════════════════════════════════════════

function gridColSpan(node: DesignerNode, child: DesignerNode): number {
  const columns = Math.max(1, node.containerConfig?.columns ?? 2)
  const raw = Math.min(Math.max(1, child.span ?? 24), 24)
  return Math.max(1, Math.min(columns, Math.round((raw / 24) * columns)))
}

/** 找到 children 数组 === 目标数组的容器节点（面板字段拖到嵌套子字段上时，定位应插入的容器） */
function findContainerOfChildren(list: DesignerNode[], children: DesignerNode[]): DesignerNode | null {
  for (const n of list) {
    if (n.children === children) return n
    if (n.children?.length) {
      const found = findContainerOfChildren(n.children, children)
      if (found) return found
    }
  }
  return null
}

/** tabs 容器「+ 添加」：追加新标签页并激活（name 防重复） */
function addTabTo(node: DesignerNode): void {
  const tabs = tabSlots(node)
  let n = tabs.length + 1
  while (tabs.some((t) => t.name === 'tab' + n)) n++
  const name = 'tab' + n
  const next = [...tabs, { label: t('fb.tabN', { n }), name }]
  emit('updateContainer', node.id, { ...node.containerConfig, tabs: next })
  localActiveTab.value = { ...localActiveTab.value, [node.id]: name }
}

/** 从面板拖字段进容器的某槽位 */
function onSlotDropFromPanel(e: DragEvent, node: DesignerNode, slot: number): void {
  const type = e.dataTransfer?.getData('application/x-field-type') || e.dataTransfer?.getData('text/plain')
  if (!type) return
  e.preventDefault()
  e.stopPropagation()
  emit('insertIntoContainer', type as DesignerNodeType, node.id, -1, slot)
  resetDrag()
}

/** 已存在字段拖到容器的某槽位 → 改其 containerSlot */
function onSlotDropFromSort(e: DragEvent, _node: DesignerNode, slot: number): void {
  e.preventDefault()
  e.stopPropagation()
  const sourceId = sortDragId.value
  if (sourceId) emit('assignSlot', sourceId, slot)
  resetDrag()
}

/** 槽位体 drop 总入口（区分面板拖入 / 字段移动） */
function onSlotDrop(e: DragEvent, node: DesignerNode, slot: number): void {
  if (dragSource.value === 'sort' && sortDragId.value) {
    onSlotDropFromSort(e, node, slot)
  } else if (e.dataTransfer?.types.includes('application/x-field-type')) {
    onSlotDropFromPanel(e, node, slot)
  }
}

/** 槽位体 dragover（接受面板拖入 + 字段移动） */
function onSlotDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('application/x-field-type') || dragSource.value === 'sort') {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }
}

/** 预览用的假数据 */
const previewData = computed<Record<string, unknown>>(() => {
  const data: Record<string, unknown> = {}
  // 递归遍历所有节点（包括容器子节点）
  function walkAll(list: DesignerNode[]): void {
    for (const f of list) {
      if (isContainerNode(f)) {
        if (f.children?.length) walkAll(f.children)
        continue
      }
      const key = f.key ?? f.id
      if (f.type === 'text' || f.type === 'textarea') data[key] = f.placeholder ?? ''
      else if (f.type === 'number' || f.type === 'slider') data[key] = f.min ?? 0
      else if (f.type === 'select' || f.type === 'cascader') data[key] = null
      else if (f.type === 'radio') data[key] = f.options?.[0] ?? ''
      else if (f.type === 'checkbox') data[key] = (f.options?.length ?? 0) > 1 ? [f.options![0]] : []
      else if (f.type === 'switch') data[key] = false
      else if (f.type === 'rate') data[key] = Math.ceil((f.rateMax ?? 5) / 2)
      else if (f.type === 'date' || f.type === 'time') data[key] = null
      else if (f.type === 'upload') data[key] = []
      // v3 高级字段初始值
      else if (f.type === 'subform') data[key] = []
      else if (f.type === 'relate') data[key] = null
      else if (f.type === 'richtext') data[key] = ''
      else if (f.type === 'signature') data[key] = ''
      else if (f.type === 'address') data[key] = ''
      else if (f.type === 'idcard') data[key] = ''
      else if (f.type === 'matrix') data[key] = {}
      else if (f.type === 'serial') data[key] = null
      else data[key] = null
    }
  }
  walkAll(props.nodes)
  return data
})

// ════════════════════════════════════════
// 画布拖拽（从面板拖入）
// ════════════════════════════════════════

function onCanvasDragOver(e: DragEvent): void {
  if (e.dataTransfer?.types.includes('application/x-field-type')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    canvasDragOver.value = true
  }
}

function onCanvasDragLeave(e: DragEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) {
    canvasDragOver.value = false
    dropTargetId.value = null
    dropPos.value = null
    dragSource.value = null
  }
}

function onCanvasDrop(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  const type = e.dataTransfer?.getData('application/x-field-type') || e.dataTransfer?.getData('text/plain')
  if (type) {
    emit('insertAt', type as DesignerNodeType, -1)
  }
  resetDrag()
}

// ════════════════════════════════════════
// 节点间拖拽排序
// ════════════════════════════════════════

function onNodeDragStart(e: DragEvent, node: DesignerNode): void {
  dragSource.value = 'sort'
  sortDragId.value = node.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/sort', node.id)
  }
}

/** 根据鼠标纵向位置算出落点：容器 25/50/25 分三区，字段 50/50 分两区 */
function resolveDropPos(e: DragEvent, node: DesignerNode, sortDrag: boolean): 'before' | 'after' | 'inside' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0
  if (isContainerNode(node)) {
    // 面板拖入容器：一律放进容器内；排序拖拽才区分容器前后
    if (!sortDrag) return 'inside'
    if (ratio < 0.25) return 'before'
    if (ratio > 0.75) return 'after'
    return 'inside'
  }
  return ratio < 0.5 ? 'before' : 'after'
}

function onNodeDragOver(e: DragEvent, node: DesignerNode): void {
  if (dragSource.value === 'sort' && sortDragId.value !== node.id) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer!.dropEffect = 'move'
    dropTargetId.value = node.id
    dropPos.value = resolveDropPos(e, node, true)
  } else if (e.dataTransfer?.types.includes('application/x-field-type')) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    dropTargetId.value = node.id
    dropPos.value = resolveDropPos(e, node, false)
  }
}

function onNodeDrop(e: DragEvent, node: DesignerNode): void {
  e.preventDefault()
  e.stopPropagation()

  const pos = dropPos.value ?? resolveDropPos(e, node, dragSource.value === 'sort')

  if (dragSource.value === 'sort' && sortDragId.value && sortDragId.value !== node.id) {
    // 拖拽排序：容器区分 before/inside/after，字段区分 before/after
    if (isContainerNode(node)) {
      if (pos === 'inside') emit('sortNode', sortDragId.value, node.id, 'inside', activeSlotOf(node))
      else emit('sortNode', sortDragId.value, node.id, pos)
    } else {
      emit('sortNode', sortDragId.value, node.id, pos === 'after' ? 'after' : 'before')
    }
    // 保持选中拖拽的节点
    emit('select', sortDragId.value)
  } else {
    const type = e.dataTransfer?.getData('application/x-field-type') || e.dataTransfer?.getData('text/plain')
    if (type) {
      // 面板字段拖入：容器 → 插入容器内（落到当前激活槽位）；字段 → 按落点插到前/后
      if (isContainerNode(node)) {
        emit('insertIntoContainer', type as DesignerNodeType, node.id, -1, activeSlotOf(node))
      } else {
        const before = pos !== 'after'
        const loc = findParent(props.nodes, node.id)
        // 嵌套子字段：插到它所在容器内的相对位置；否则会落到根级末尾（扁平索引对嵌套节点无意义）
        const container = loc && loc.parent !== props.nodes ? findContainerOfChildren(props.nodes, loc.parent) : null
        if (container) {
          emit(
            'insertIntoContainer',
            type as DesignerNodeType,
            container.id,
            before ? loc!.index : loc!.index + 1,
            node.containerSlot,
          )
        } else {
          const index = props.nodes.findIndex((n) => n.id === node.id)
          emit('insertAt', type as DesignerNodeType, before ? index : index + 1)
        }
      }
    }
  }
  resetDrag()
}

function onNodeDragEnd(): void {
  resetDrag()
}

function resetDrag(): void {
  dragSource.value = null
  sortDragId.value = null
  dropTargetId.value = null
  dropPos.value = null
  canvasDragOver.value = false
}

// ════════════════════════════════════════
// 设备模式 class
// ════════════════════════════════════════

const deviceClass = computed(() => `device-${props.device}`)

// ════════════════════════════════════════
// 画布缩放（工具条按钮 / Ctrl·⌘ + 滚轮）
// ════════════════════════════════════════

const ZOOM_STORE_KEY = 'vcl-designer-zoom'
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.5
const ZOOM_STEP = 0.1

function clampZoom(v: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(v * 100) / 100))
}

function readStoredZoom(): number {
  // SSR 安全：无 window 环境下 localStorage 是未定义标识符，裸访问 ReferenceError
  if (typeof localStorage === 'undefined') return 1
  try {
    return clampZoom(Number(localStorage.getItem(ZOOM_STORE_KEY)) || 1)
  } catch {
    return 1
  }
}

const zoom = ref(readStoredZoom())
const zoomPercent = computed(() => Math.round(zoom.value * 100))
const zoomStyle = computed(() => ({ '--ldc-zoom': String(zoom.value) }))

function setZoom(v: number): void {
  zoom.value = clampZoom(v)
  try {
    localStorage.setItem(ZOOM_STORE_KEY, String(zoom.value))
  } catch {
    /* 隐私模式 / 存储不可用时忽略 */
  }
}
function zoomIn(): void {
  setZoom(zoom.value + ZOOM_STEP)
}
function zoomOut(): void {
  setZoom(zoom.value - ZOOM_STEP)
}
function resetZoom(): void {
  setZoom(1)
}

/** Ctrl/⌘ + 滚轮缩放；普通滚轮保持页面滚动 */
function onCanvasWheel(e: WheelEvent): void {
  if (!e.ctrlKey && !e.metaKey) return
  e.preventDefault()
  setZoom(zoom.value + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
}
</script>

<template>
  <main
    class="ldc-canvas"
    :class="{ 'drag-over': canvasDragOver }"
    @dragover="onCanvasDragOver"
    @dragleave="onCanvasDragLeave"
    @drop="onCanvasDrop"
  >
    <!-- 画布工具条 -->
    <div class="ldc-canvas-toolbar">
      <div class="ldc-crumb">
        <span class="ldc-crumb-item ldc-crumb-root">{{ t('fbt.canvasRoot') }}</span>
        <template v-for="(node, i) in breadcrumbPath" :key="node.id">
          <span class="ldc-crumb-sep">/</span>
          <span
            class="ldc-crumb-item"
            :class="{ 'ldc-crumb-active': i === breadcrumbPath.length - 1 }"
            @click="emit('select', node.id)"
            >{{ node.label }}</span
          >
        </template>
      </div>
      <span class="ldc-canvas-tip">{{ t('fbt.canvasTip') }}</span>
      <!-- 缩放控制 -->
      <div class="ldc-zoom">
        <button
          type="button"
          :title="t('fbt.zoomOut')"
          :aria-label="t('fbt.zoomOut')"
          :disabled="zoom <= ZOOM_MIN"
          @click="zoomOut"
        >
          <IconSvg type="zoom-out" size="xs" />
        </button>
        <button type="button" class="ldc-zoom-val" :title="t('fbt.zoomReset')" @click="resetZoom">
          {{ zoomPercent }}%
        </button>
        <button
          type="button"
          :title="t('fbt.zoomIn')"
          :aria-label="t('fbt.zoomIn')"
          :disabled="zoom >= ZOOM_MAX"
          @click="zoomIn"
        >
          <IconSvg type="zoom-in" size="xs" />
        </button>
      </div>
    </div>

    <!-- 画布内容区（缩放宿主：按 zoom 反算布局尺寸，视觉始终铺满，不产生横向滚动） -->
    <div class="ldc-zoom-host" :style="zoomStyle">
      <div class="ldc-canvas-content" :class="deviceClass" @wheel="onCanvasWheel">
        <!-- 表单头 -->
        <div v-if="nodes.length" class="ldc-form-head">
          <h3>{{ formTitle }}</h3>
          <p>{{ formDescription }}</p>
        </div>

        <!-- 空状态 -->
        <div v-if="!nodes.length" class="ldc-empty">
          <div class="ldc-empty-icon">
            <IconSvg type="mouse-pointer-click" size="xl" />
          </div>
          <p class="ldc-empty-title">{{ t('fbt.emptyTitle') }}</p>
          <p class="ldc-empty-hint">{{ t('fbt.emptyHint') }}</p>
        </div>

        <!-- 节点列表 -->
        <div v-else class="ldc-fields">
          <div v-for="node in nodes" :key="node.id" class="ldc-node-wrapper">
            <!-- 落点指示线（插入到该节点之前） -->
            <div v-if="showIndicator(node.id, 'before')" class="ldc-drop-indicator is-before" />

            <!-- ═══ 容器节点 ═══ -->
            <div
              v-if="isContainerNode(node)"
              class="ldc-container"
              :class="{
                selected: isSelected(node.id),
                'drop-target': dropTargetId === node.id && dropPos === 'inside',
                // card 容器对齐运行时卡片视觉（分组标题/圆角/内边距）
                'ldc-container--card': node.type === 'card',
              }"
              @click="emit('select', node.id, $event.ctrlKey || $event.metaKey)"
              @dragover="onNodeDragOver($event, node)"
              @drop="onNodeDrop($event, node)"
            >
              <!-- 容器头部 -->
              <div class="ldc-container-head">
                <IconSvg :type="getTypeIcon(node.type)" size="xs" />
                <span class="ldc-container-label">{{ node.label }}</span>
                <span class="ldc-container-badge">{{ getTypeLabel(node.type) }}</span>
                <span class="ldc-container-actions" @click.stop>
                  <button :title="t('fbt.moveUp')" @click="emit('move', node.id, -1)">
                    <IconSvg type="chevron-up" size="xs" />
                  </button>
                  <button :title="t('fbt.moveDown')" @click="emit('move', node.id, 1)">
                    <IconSvg type="chevron-down" size="xs" />
                  </button>
                  <button :title="t('common.copy')" @click="emit('duplicate', node.id)">
                    <IconSvg type="copy" size="xs" />
                  </button>
                  <button class="ldc-del" :title="t('common.delete')" @click="emit('remove', node.id)">
                    <IconSvg type="trash-2" size="xs" />
                  </button>
                </span>
              </div>
              <!-- 容器体 -->
              <div class="ldc-container-body">
                <!-- tabs 容器特殊渲染：点击标签页真实切换，仅显示当前页 -->
                <template v-if="node.type === 'tabs'">
                  <div class="ldc-tabs-head" role="tablist">
                    <div
                      v-for="(tab, ti) in tabSlots(node)"
                      :key="ti"
                      class="ldc-tab"
                      :class="{ active: activeTabName(node) === tab.name }"
                      role="tab"
                      :aria-selected="activeTabName(node) === tab.name"
                      tabindex="0"
                      @click="setActiveTab(node, tab.name)"
                      @keydown.enter.prevent="setActiveTab(node, tab.name)"
                      @keydown.space.prevent="setActiveTab(node, tab.name)"
                    >
                      {{ tab.label }}
                      <span
                        class="ldc-tab-count"
                        :title="t('fbd.fieldsCount', { n: childrenInSlot(node, ti).length })"
                        >{{ childrenInSlot(node, ti).length }}</span
                      >
                    </div>
                    <div
                      class="ldc-tab ldc-tab-add"
                      role="button"
                      tabindex="0"
                      :title="t('fbt.addTabTitle')"
                      @click="addTabTo(node)"
                      @keydown.enter.prevent="addTabTo(node)"
                    >
                      {{ t('fbt.addBtn') }}
                    </div>
                  </div>
                  <div class="ldc-tabs-body">
                    <div
                      v-if="tabSlots(node).length"
                      class="ldc-slot-body"
                      @dragover="onSlotDragOver"
                      @drop="onSlotDrop($event, node, activeTabIndex(node))"
                    >
                      <div class="ldc-slot-label">{{ tabSlots(node)[activeTabIndex(node)]?.label }}</div>
                      <template v-if="childrenInSlot(node, activeTabIndex(node)).length">
                        <div
                          v-for="child in childrenInSlot(node, activeTabIndex(node))"
                          :key="child.id"
                          class="ldc-card-wrapper"
                        >
                          <DesignerChildCard
                            :child="child"
                            :preview-data="previewData"
                            :find-field="findFieldByKey"
                            :selected="isSelected(child.id)"
                            @select="(id, additive) => emit('select', id, additive)"
                          />
                        </div>
                      </template>
                      <div v-else class="ldc-container-empty">{{ t('fbt.dropToTab') }}</div>
                    </div>
                    <div v-else class="ldc-container-empty">{{ t('fbt.configTabsFirst') }}</div>
                  </div>
                </template>

                <!-- collapse 容器特殊渲染：点击折叠项标题真实折叠/展开 -->
                <template v-else-if="node.type === 'collapse'">
                  <div class="ldc-collapse-list">
                    <div
                      v-for="(item, ci) in collapseSlots(node)"
                      :key="ci"
                      class="ldc-collapse-item"
                      :class="{ open: isCollapseOpen(node, ci) }"
                    >
                      <div
                        class="ldc-collapse-head"
                        role="button"
                        tabindex="0"
                        :aria-expanded="isCollapseOpen(node, ci)"
                        @click="toggleCollapse(node, ci)"
                        @keydown.enter.prevent="toggleCollapse(node, ci)"
                        @keydown.space.prevent="toggleCollapse(node, ci)"
                      >
                        <IconSvg
                          :type="isCollapseOpen(node, ci) ? 'chevron-down' : 'chevron-right'"
                          size="xs"
                          class="ldc-collapse-arrow"
                        />
                        <span class="ldc-collapse-title">{{ item.title }}</span>
                        <span
                          class="ldc-tab-count"
                          :title="t('fbd.fieldsCount', { n: childrenInSlot(node, ci).length })"
                          >{{ childrenInSlot(node, ci).length }}</span
                        >
                      </div>
                      <div
                        v-show="isCollapseOpen(node, ci)"
                        class="ldc-slot-body"
                        @dragover="onSlotDragOver"
                        @drop="onSlotDrop($event, node, ci)"
                      >
                        <template v-if="childrenInSlot(node, ci).length">
                          <div v-for="child in childrenInSlot(node, ci)" :key="child.id" class="ldc-card-wrapper">
                            <DesignerChildCard
                              :child="child"
                              :preview-data="previewData"
                              :find-field="findFieldByKey"
                              :selected="isSelected(child.id)"
                              @select="(id, additive) => emit('select', id, additive)"
                            />
                          </div>
                        </template>
                        <div v-else class="ldc-container-empty">{{ t('fbt.dropToCollapse') }}</div>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- steps 容器特殊渲染：点击步骤头/导航切换，仅显示当前步骤 -->
                <template v-else-if="node.type === 'steps'">
                  <div class="ldc-steps-list">
                    <div class="ldc-steps-head" role="tablist">
                      <div
                        v-for="(step, si) in stepSlots(node)"
                        :key="si"
                        class="ldc-step-btn"
                        :class="{ active: activeStepIndex(node) === si, done: si < activeStepIndex(node) }"
                        role="tab"
                        :aria-selected="activeStepIndex(node) === si"
                        tabindex="0"
                        @click="setActiveStep(node, si)"
                        @keydown.enter.prevent="setActiveStep(node, si)"
                        @keydown.space.prevent="setActiveStep(node, si)"
                      >
                        <span class="ldc-step-num">{{ si < activeStepIndex(node) ? '✓' : si + 1 }}</span>
                        <span class="ldc-step-btn-label">{{ step.title }}</span>
                        <span
                          class="ldc-tab-count"
                          :title="t('fbd.fieldsCount', { n: childrenInSlot(node, si).length })"
                          >{{ childrenInSlot(node, si).length }}</span
                        >
                      </div>
                    </div>
                    <!-- 步骤迷你导航（贴近运行时 FormBuilder 的上一步/下一步） -->
                    <div class="ldc-steps-nav">
                      <button
                        type="button"
                        :disabled="activeStepIndex(node) === 0"
                        @click="setActiveStep(node, activeStepIndex(node) - 1)"
                      >
                        <IconSvg type="chevron-left" size="xs" /> {{ t('formBuilder.prevStep') }}
                      </button>
                      <span class="ldc-steps-indicator"
                        >{{ activeStepIndex(node) + 1 }} / {{ stepSlots(node).length }}</span
                      >
                      <button
                        type="button"
                        :disabled="activeStepIndex(node) >= stepSlots(node).length - 1"
                        @click="setActiveStep(node, activeStepIndex(node) + 1)"
                      >
                        {{ t('formBuilder.nextStep') }} <IconSvg type="chevron-right" size="xs" />
                      </button>
                    </div>
                    <div
                      v-if="stepSlots(node).length"
                      class="ldc-slot-body"
                      @dragover="onSlotDragOver"
                      @drop="onSlotDrop($event, node, activeStepIndex(node))"
                    >
                      <div class="ldc-slot-label">{{ stepSlots(node)[activeStepIndex(node)]?.title }}</div>
                      <template v-if="childrenInSlot(node, activeStepIndex(node)).length">
                        <div
                          v-for="child in childrenInSlot(node, activeStepIndex(node))"
                          :key="child.id"
                          class="ldc-card-wrapper"
                        >
                          <DesignerChildCard
                            :child="child"
                            :preview-data="previewData"
                            :find-field="findFieldByKey"
                            :selected="isSelected(child.id)"
                            @select="(id, additive) => emit('select', id, additive)"
                          />
                        </div>
                      </template>
                      <div v-else class="ldc-container-empty">{{ t('fbt.dropToStep') }}</div>
                    </div>
                    <div v-else class="ldc-container-empty">{{ t('fbt.configStepsFirst') }}</div>
                  </div>
                </template>

                <!-- grid 容器特殊渲染 -->
                <template v-else-if="node.type === 'grid'">
                  <div class="ldc-grid-row" :style="{ '--grid-cols': node.containerConfig?.columns ?? 2 }">
                    <template v-if="node.children?.length">
                      <div
                        v-for="child in node.children"
                        :key="child.id"
                        class="ldc-grid-col"
                        :style="{ '--col-span': gridColSpan(node, child) }"
                      >
                        <DesignerChildCard
                          :child="child"
                          :preview-data="previewData"
                          :find-field="findFieldByKey"
                          :selected="isSelected(child.id)"
                          :dragging="sortDragId === child.id"
                          :drop-pos="childDropPos(child.id)"
                          sortable
                          @select="(id, additive) => emit('select', id, additive)"
                          @move="(id, dir) => emit('move', id, dir)"
                          @duplicate="(id) => emit('duplicate', id)"
                          @remove="(id) => emit('remove', id)"
                          @dragstart="onNodeDragStart"
                          @dragover="onNodeDragOver"
                          @drop="onNodeDrop"
                          @dragend="onNodeDragEnd"
                        />
                      </div>
                    </template>
                    <div v-else class="ldc-container-empty">{{ t('fbt.dropToGrid') }}</div>
                  </div>
                </template>

                <!-- flex 横排容器：子字段并排，按 span 折算占比（与运行时 .fb-flex 行为一致） -->
                <template v-else-if="node.type === 'flex'">
                  <div
                    class="ldc-flex-row"
                    :style="{
                      '--flex-gap': (node.containerConfig?.gap ?? 12) + 'px',
                      '--flex-wrap': node.containerConfig?.wrap === false ? 'nowrap' : 'wrap',
                      '--flex-justify':
                        node.containerConfig?.justify === 'center'
                          ? 'center'
                          : node.containerConfig?.justify === 'space-between'
                            ? 'space-between'
                            : 'flex-start',
                    }"
                  >
                    <template v-if="node.children?.length">
                      <div
                        v-for="child in node.children"
                        :key="child.id"
                        class="ldc-flex-col"
                        :style="{ '--flex-basis': (Math.min(Math.max(child.span ?? 24, 1), 24) / 24) * 100 + '%' }"
                      >
                        <DesignerChildCard
                          :child="child"
                          :preview-data="previewData"
                          :find-field="findFieldByKey"
                          :selected="isSelected(child.id)"
                          :dragging="sortDragId === child.id"
                          :drop-pos="childDropPos(child.id)"
                          sortable
                          @select="(id, additive) => emit('select', id, additive)"
                          @move="(id, dir) => emit('move', id, dir)"
                          @duplicate="(id) => emit('duplicate', id)"
                          @remove="(id) => emit('remove', id)"
                          @dragstart="onNodeDragStart"
                          @dragover="onNodeDragOver"
                          @drop="onNodeDrop"
                          @dragend="onNodeDragEnd"
                        />
                      </div>
                    </template>
                    <div v-else class="ldc-container-empty">{{ t('fbt.dropToFlex') }}</div>
                  </div>
                </template>

                <!-- card 容器：子节点平铺 -->
                <template v-else>
                  <template v-if="node.children?.length">
                    <div v-for="child in node.children" :key="child.id" class="ldc-card-wrapper">
                      <DesignerChildCard
                        :child="child"
                        :preview-data="previewData"
                        :find-field="findFieldByKey"
                        :selected="isSelected(child.id)"
                        :dragging="sortDragId === child.id"
                        :drop-pos="childDropPos(child.id)"
                        sortable
                        @select="(id, additive) => emit('select', id, additive)"
                        @move="(id, dir) => emit('move', id, dir)"
                        @duplicate="(id) => emit('duplicate', id)"
                        @remove="(id) => emit('remove', id)"
                        @dragstart="onNodeDragStart"
                        @dragover="onNodeDragOver"
                        @drop="onNodeDrop"
                        @dragend="onNodeDragEnd"
                      />
                    </div>
                  </template>
                  <div v-else class="ldc-container-empty">{{ t('fbt.dropToCard') }}</div>
                </template>
              </div>
            </div>

            <!-- ═══ 字段节点 ═══ -->
            <div
              v-else
              class="ldc-card"
              :class="{ selected: isSelected(node.id), dragging: sortDragId === node.id }"
              draggable="true"
              role="listitem"
              tabindex="0"
              :aria-label="t('fbt.fieldAria', { label: node.label })"
              @click="emit('select', node.id, $event.ctrlKey || $event.metaKey)"
              @keydown.enter.prevent="emit('select', node.id, $event.ctrlKey || $event.metaKey)"
              @keydown.space.prevent="emit('select', node.id, $event.ctrlKey || $event.metaKey)"
              @dragstart="onNodeDragStart($event, node)"
              @dragover="onNodeDragOver($event, node)"
              @drop="onNodeDrop($event, node)"
              @dragend="onNodeDragEnd"
            >
              <div class="ldc-card-head">
                <span class="ldc-drag-handle" :title="t('fbt.dragSort')">
                  <IconSvg type="grip-vertical" size="sm" />
                </span>
                <span class="ldc-card-type-badge">{{ getTypeLabel(node.type) }}</span>
                <span class="ldc-card-key">{{ node.key }}</span>
                <span class="ldc-card-actions" @click.stop>
                  <button :title="t('fbt.moveUp')" @click="emit('move', node.id, -1)">
                    <IconSvg type="chevron-up" size="xs" />
                  </button>
                  <button :title="t('fbt.moveDown')" @click="emit('move', node.id, 1)">
                    <IconSvg type="chevron-down" size="xs" />
                  </button>
                  <button :title="t('common.copy')" @click="emit('duplicate', node.id)">
                    <IconSvg type="copy" size="xs" />
                  </button>
                  <button class="ldc-del" :title="t('common.delete')" @click="emit('remove', node.id)">
                    <IconSvg type="trash-2" size="xs" />
                  </button>
                </span>
              </div>
              <div class="ldc-card-body">
                <FormRenderer
                  v-if="findFieldByKey(node.key ?? node.id)"
                  :field="findFieldByKey(node.key ?? node.id)!"
                  :model-value="previewData[node.key ?? node.id]"
                />
              </div>
            </div>

            <!-- 落点指示线（插入到该节点之后） -->
            <div v-if="showIndicator(node.id, 'after')" class="ldc-drop-indicator is-after" />
          </div>
        </div>
      </div>
    </div>
  </main>
</template>
