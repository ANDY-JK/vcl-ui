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
  toFormSchema, getTypeLabel, isContainerNode,
  type DesignerNode, type DesignerNodeType, type FormMeta,
} from './types'

const props = defineProps({
  nodes: { type: Array as PropType<DesignerNode[]>, default: () => [] },
  selectedId: { type: String as PropType<string | null>, default: null },
  /** 设备模式 */
  device: { type: String as PropType<'desktop' | 'tablet' | 'mobile'>, default: 'desktop' },
  /** 表单标题 */
  formTitle: { type: String, default: '表单标题' },
  /** 表单描述 */
  formDescription: { type: String, default: '表单描述' },
  /** 面包屑路径（从根到选中节点） */
  breadcrumbPath: { type: Array as PropType<DesignerNode[]>, default: () => [] },
})

const emit = defineEmits<{
  select: [id: string]
  add: [type: DesignerNodeType]
  move: [id: string, dir: -1 | 1]
  duplicate: [id: string]
  remove: [id: string]
  reorder: [from: number, to: number]
  insertAt: [type: DesignerNodeType, index: number]
  /** 插入到容器内（slot = tabs/collapse/steps 容器第几个槽位，普通容器省略） */
  insertIntoContainer: [type: DesignerNodeType, containerId: string, index: number, slot?: number]
  /** 拖拽排序：将源节点移动到目标节点之前/之后（跨容器） */
  sortNode: [sourceId: string, targetId: string, position: 'before' | 'after' | 'inside']
  /** 把字段移动到 tabs/collapse/steps 容器的指定槽位 */
  assignSlot: [sourceId: string, slot: number]
}>()

// ════════════════════════════════════════
// 拖拽状态
// ════════════════════════════════════════

const dragSource = ref<'panel' | 'sort' | null>(null)
const sortDragId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
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
  return previewSchema.value.fields.find(f => f.key === key)
}

// ════════════════════════════════════════
// tabs/collapse/steps 容器：槽位渲染辅助
// ════════════════════════════════════════

/** 取 tabs 容器槽位列表（label/name），缺省回退 */
function tabSlots(node: DesignerNode): { label: string; name: string }[] {
  return node.containerConfig?.tabs?.length
    ? node.containerConfig.tabs
    : [{ label: node.label || '标签页 1', name: 'tab1' }]
}

/** 取 collapse 容器槽位列表 */
function collapseSlots(node: DesignerNode): { title: string; expanded: boolean }[] {
  return node.containerConfig?.collapseItems?.length
    ? node.containerConfig.collapseItems
    : [{ title: node.label || '折叠项 1', expanded: true }]
}

/** 取 steps 容器槽位列表 */
function stepSlots(node: DesignerNode): { title: string }[] {
  return node.containerConfig?.steps?.length
    ? node.containerConfig.steps
    : [{ title: node.label || '步骤 1' }]
}

/** 取容器某槽位下的子字段（按 containerSlot 匹配，缺省按 0） */
function childrenInSlot(node: DesignerNode, slot: number): DesignerNode[] {
  return (node.children ?? []).filter((c) => (c.containerSlot ?? 0) === slot)
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

function onNodeDragOver(e: DragEvent, node: DesignerNode): void {
  if (dragSource.value === 'sort' && sortDragId.value !== node.id) {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    dropTargetId.value = node.id
  } else if (e.dataTransfer?.types.includes('application/x-field-type')) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    dropTargetId.value = node.id
  }
}

function onNodeDrop(e: DragEvent, node: DesignerNode): void {
  e.preventDefault()
  e.stopPropagation()

  if (dragSource.value === 'sort' && sortDragId.value && sortDragId.value !== node.id) {
    // 拖拽排序：根据鼠标位置判断插入到 before/after/inside
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const offsetY = e.clientY - rect.top
    const height = rect.height

    if (isContainerNode(node)) {
      // 拖到容器上：上半区 = before（同级），下半区 = inside（插入容器内）
      if (offsetY < height * 0.3) {
        emit('sortNode', sortDragId.value, node.id, 'before')
      } else {
        emit('sortNode', sortDragId.value, node.id, 'inside')
      }
    } else {
      // 拖到字段上：上半区 = before，下半区 = after
      if (offsetY < height * 0.5) {
        emit('sortNode', sortDragId.value, node.id, 'before')
      } else {
        emit('sortNode', sortDragId.value, node.id, 'after')
      }
    }
    // 保持选中拖拽的节点
    emit('select', sortDragId.value)
  } else {
    const type = e.dataTransfer?.getData('application/x-field-type') || e.dataTransfer?.getData('text/plain')
    if (type) {
      // 如果拖到容器上，插入到容器内
      if (isContainerNode(node)) {
        emit('insertIntoContainer', type as DesignerNodeType, node.id, -1)
      } else {
        emit('insertAt', type as DesignerNodeType, -1)
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
  canvasDragOver.value = false
}

// ════════════════════════════════════════
// 设备模式 class
// ════════════════════════════════════════

const deviceClass = computed(() => `device-${props.device}`)
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
        <span class="ldc-crumb-item ldc-crumb-root">表单根</span>
        <template v-for="(node, i) in breadcrumbPath" :key="node.id">
          <span class="ldc-crumb-sep">/</span>
          <span
            class="ldc-crumb-item"
            :class="{ 'ldc-crumb-active': i === breadcrumbPath.length - 1 }"
            @click="emit('select', node.id)"
          >{{ node.label }}</span>
        </template>
      </div>
      <span class="ldc-canvas-tip">提示：拖拽组件到画布或容器内</span>
    </div>

    <!-- 画布内容区 -->
    <div class="ldc-canvas-content" :class="deviceClass">
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
        <p class="ldc-empty-title">从左侧点击或拖拽添加字段</p>
        <p class="ldc-empty-hint">支持布局容器嵌套，所见即所得</p>
      </div>

      <!-- 节点列表 -->
      <div v-else class="ldc-fields">
        <div
          v-for="node in nodes"
          :key="node.id"
          class="ldc-node-wrapper"
        >
          <!-- ═══ 容器节点 ═══ -->
          <div
            v-if="isContainerNode(node)"
            class="ldc-container"
            :class="{ selected: node.id === selectedId, 'drop-target': dropTargetId === node.id }"
            @click="emit('select', node.id)"
            @dragover="onNodeDragOver($event, node)"
            @drop="onNodeDrop($event, node)"
          >
            <!-- 容器头部 -->
            <div class="ldc-container-head">
              <IconSvg :type="node.type === 'card' ? 'layout-template' : node.type === 'grid' ? 'grid-2x2' : node.type === 'tabs' ? 'panel-top' : node.type === 'collapse' ? 'chevron-down' : 'clock'" size="xs" />
              <span class="ldc-container-label">{{ node.label }}</span>
              <span class="ldc-container-badge">{{ getTypeLabel(node.type) }}</span>
              <span class="ldc-container-actions" @click.stop>
                <button @click="emit('move', node.id, -1)" title="上移">
                  <IconSvg type="chevron-up" size="xs" />
                </button>
                <button @click="emit('move', node.id, 1)" title="下移">
                  <IconSvg type="chevron-down" size="xs" />
                </button>
                <button @click="emit('duplicate', node.id)" title="复制">
                  <IconSvg type="copy" size="xs" />
                </button>
                <button class="ldc-del" @click="emit('remove', node.id)" title="删除">
                  <IconSvg type="trash-2" size="xs" />
                </button>
              </span>
            </div>
            <!-- 容器体 -->
            <div class="ldc-container-body">
              <!-- tabs 容器特殊渲染：按标签页槽位分组 -->
              <template v-if="node.type === 'tabs'">
                <div class="ldc-tabs-head">
                  <div
                    v-for="(tab, ti) in tabSlots(node)"
                    :key="ti"
                    class="ldc-tab"
                    :class="{ active: (node.containerConfig?.activeTab ?? tabSlots(node)[0]?.name) === tab.name }"
                  >
                    {{ tab.label }}
                  </div>
                  <div class="ldc-tab ldc-tab-add">+ 添加</div>
                </div>
                <div class="ldc-tabs-body">
                  <template v-if="tabSlots(node).length">
                    <div
                      v-for="(tab, ti) in tabSlots(node)"
                      :key="ti"
                      class="ldc-slot-body"
                      @dragover="onSlotDragOver"
                      @drop="onSlotDrop($event, node, ti)"
                    >
                      <div class="ldc-slot-label">{{ tab.label }}</div>
                      <template v-if="childrenInSlot(node, ti).length">
                        <div
                          v-for="child in childrenInSlot(node, ti)"
                          :key="child.id"
                          class="ldc-card-wrapper"
                        >
                          <DesignerChildCard :child="child" :preview-data="previewData" :find-field="findFieldByKey" @select="emit('select', $event)" />
                        </div>
                      </template>
                      <div v-else class="ldc-container-empty">拖拽字段到此标签页</div>
                    </div>
                  </template>
                  <div v-else class="ldc-container-empty">先在上方配置标签页</div>
                </div>
              </template>

              <!-- collapse 容器特殊渲染：按折叠项槽位分组 -->
              <template v-else-if="node.type === 'collapse'">
                <div class="ldc-collapse-list">
                  <div
                    v-for="(item, ci) in collapseSlots(node)"
                    :key="ci"
                    class="ldc-slot-body"
                    @dragover="onSlotDragOver"
                    @drop="onSlotDrop($event, node, ci)"
                  >
                    <div class="ldc-slot-label">{{ item.title }}</div>
                    <template v-if="childrenInSlot(node, ci).length">
                      <div
                        v-for="child in childrenInSlot(node, ci)"
                        :key="child.id"
                        class="ldc-card-wrapper"
                      >
                        <DesignerChildCard :child="child" :preview-data="previewData" :find-field="findFieldByKey" @select="emit('select', $event)" />
                      </div>
                    </template>
                    <div v-else class="ldc-container-empty">拖拽字段到此折叠项</div>
                  </div>
                </div>
              </template>

              <!-- steps 容器特殊渲染：按步骤槽位分组 -->
              <template v-else-if="node.type === 'steps'">
                <div class="ldc-steps-list">
                  <div
                    v-for="(step, si) in stepSlots(node)"
                    :key="si"
                    class="ldc-slot-body"
                    @dragover="onSlotDragOver"
                    @drop="onSlotDrop($event, node, si)"
                  >
                    <div class="ldc-slot-label">{{ step.title }}</div>
                    <template v-if="childrenInSlot(node, si).length">
                      <div
                        v-for="child in childrenInSlot(node, si)"
                        :key="child.id"
                        class="ldc-card-wrapper"
                      >
                        <DesignerChildCard :child="child" :preview-data="previewData" :find-field="findFieldByKey" @select="emit('select', $event)" />
                      </div>
                    </template>
                    <div v-else class="ldc-container-empty">拖拽字段到此步骤</div>
                  </div>
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
                    >
                      <div
                        class="ldc-card"
                        :class="{ selected: child.id === selectedId }"
                        @click="emit('select', child.id)"
                      >
                        <div class="ldc-card-head">
                          <span class="ldc-drag-handle"><IconSvg type="grip-vertical" size="sm" /></span>
                          <span class="ldc-card-label">{{ child.label }}</span>
                          <span v-if="child.required" class="ldc-required-mark">*</span>
                          <span class="ldc-card-type-badge">{{ getTypeLabel(child.type) }}</span>
                        </div>
                        <div class="ldc-card-body">
                          <FormRenderer
                            v-if="findFieldByKey(child.key ?? child.id)"
                            :field="findFieldByKey(child.key ?? child.id)!"
                            :model-value="previewData[child.key ?? child.id]"
                            disabled
                          />
                        </div>
                      </div>
                    </div>
                  </template>
                  <div v-else class="ldc-container-empty">拖拽字段到此栅格</div>
                </div>
              </template>

              <!-- card 容器：子节点平铺 -->
              <template v-else>
                <template v-if="node.children?.length">
                  <div
                    v-for="child in node.children"
                    :key="child.id"
                    class="ldc-card-wrapper"
                  >
                    <div
                      class="ldc-card"
                      :class="{ selected: child.id === selectedId }"
                      :draggable="true"
                      @click="emit('select', child.id)"
                      @dragstart="onNodeDragStart($event, child)"
                      @dragover="onNodeDragOver($event, child)"
                      @drop="onNodeDrop($event, child)"
                      @dragend="onNodeDragEnd"
                    >
                      <div class="ldc-card-head">
                        <span class="ldc-drag-handle"><IconSvg type="grip-vertical" size="sm" /></span>
                        <span class="ldc-card-label">{{ child.label }}</span>
                        <span v-if="child.required" class="ldc-required-mark">*</span>
                        <span class="ldc-card-type-badge">{{ getTypeLabel(child.type) }}</span>
                        <span class="ldc-card-key">{{ child.key }}</span>
                        <span class="ldc-card-actions" @click.stop>
                          <button @click="emit('move', child.id, -1)" title="上移"><IconSvg type="chevron-up" size="xs" /></button>
                          <button @click="emit('move', child.id, 1)" title="下移"><IconSvg type="chevron-down" size="xs" /></button>
                          <button @click="emit('duplicate', child.id)" title="复制"><IconSvg type="copy" size="xs" /></button>
                          <button class="ldc-del" @click="emit('remove', child.id)" title="删除"><IconSvg type="trash-2" size="xs" /></button>
                        </span>
                      </div>
                      <div class="ldc-card-body">
                        <FormRenderer
                          v-if="findFieldByKey(child.key ?? child.id)"
                          :field="findFieldByKey(child.key ?? child.id)!"
                          :model-value="previewData[child.key ?? child.id]"
                          disabled
                        />
                      </div>
                    </div>
                  </div>
                </template>
                <div v-else class="ldc-container-empty">拖拽字段到此容器</div>
              </template>
            </div>
          </div>

          <!-- ═══ 字段节点 ═══ -->
          <div
            v-else
            class="ldc-card"
            :class="{ selected: node.id === selectedId, dragging: sortDragId === node.id }"
            draggable="true"
            role="listitem"
            :aria-label="`字段 ${node.label}（可拖拽排序）`"
            @click="emit('select', node.id)"
            @dragstart="onNodeDragStart($event, node)"
            @dragover="onNodeDragOver($event, node)"
            @drop="onNodeDrop($event, node)"
            @dragend="onNodeDragEnd"
          >
            <div class="ldc-card-head">
              <span class="ldc-drag-handle" title="拖拽排序">
                <IconSvg type="grip-vertical" size="sm" />
              </span>
              <span class="ldc-card-label">{{ node.label }}</span>
              <span v-if="node.required" class="ldc-required-mark">*</span>
              <span class="ldc-card-type-badge">{{ getTypeLabel(node.type) }}</span>
              <span class="ldc-card-key">{{ node.key }}</span>
              <span class="ldc-card-actions" @click.stop>
                <button @click="emit('move', node.id, -1)" title="上移">
                  <IconSvg type="chevron-up" size="xs" />
                </button>
                <button @click="emit('move', node.id, 1)" title="下移">
                  <IconSvg type="chevron-down" size="xs" />
                </button>
                <button @click="emit('duplicate', node.id)" title="复制">
                  <IconSvg type="copy" size="xs" />
                </button>
                <button class="ldc-del" @click="emit('remove', node.id)" title="删除">
                  <IconSvg type="trash-2" size="xs" />
                </button>
              </span>
            </div>
            <div class="ldc-card-body">
              <FormRenderer
                v-if="findFieldByKey(node.key ?? node.id)"
                :field="findFieldByKey(node.key ?? node.id)!"
                :model-value="previewData[node.key ?? node.id]"
                disabled
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>