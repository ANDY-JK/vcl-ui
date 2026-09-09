<script setup lang="ts">
/**
 * 设计器画布内「容器子字段」卡片 — 复用片段
 * 用于 tabs/collapse/steps 按槽位分组的子字段，以及 grid/flex/card 容器内的子字段。
 * sortable=true 时启用拖拽排序与操作按钮（与顶层字段卡片保持一致）。
 */
import IconSvg from '@/components/basic/IconSvg.vue'
import FormRenderer from '../FormRenderer.vue'
import { useT } from '@/components/_internal/i18n'
import { getTypeLabel } from './types'
import type { DesignerNode } from './types'

const t = useT()

withDefaults(
  defineProps<{
    child: DesignerNode
    previewData: Record<string, unknown>
    findField: (key: string) => import('../types').FormField | undefined
    /** 选中态高亮 */
    selected?: boolean
    /** 启用拖拽排序 + 上移/下移/复制/删除按钮（grid/flex/card 容器内子字段） */
    sortable?: boolean
    /** 正在被拖拽（降低不透明度） */
    dragging?: boolean
    /** 落点指示：before/after 时在卡片上/下缘显示指示线 */
    dropPos?: 'before' | 'after' | 'inside' | null
  }>(),
  { selected: false, sortable: false, dragging: false, dropPos: null },
)

const emit = defineEmits<{
  select: [id: string, additive?: boolean]
  move: [id: string, dir: -1 | 1]
  duplicate: [id: string]
  remove: [id: string]
  dragstart: [e: DragEvent, child: DesignerNode]
  dragover: [e: DragEvent, child: DesignerNode]
  drop: [e: DragEvent, child: DesignerNode]
  dragend: []
}>()
</script>

<template>
  <div
    class="ldc-card"
    :class="{ selected, dragging }"
    :draggable="sortable"
    @click.stop="emit('select', child.id, $event.ctrlKey || $event.metaKey)"
    @dragstart="sortable && emit('dragstart', $event, child)"
    @dragover="sortable && emit('dragover', $event, child)"
    @drop="sortable && emit('drop', $event, child)"
    @dragend="sortable && emit('dragend')"
  >
    <div v-if="dropPos === 'before'" class="ldc-drop-indicator is-before" />
    <div class="ldc-card-head">
      <span v-if="sortable" class="ldc-drag-handle" :title="t('fbt.dragSort')">
        <IconSvg type="grip-vertical" size="sm" />
      </span>
      <span class="ldc-card-type-badge">{{ getTypeLabel(child.type) }}</span>
      <span class="ldc-card-key">{{ child.key }}</span>
      <span v-if="sortable" class="ldc-card-actions" @click.stop>
        <button :title="t('fbt.moveUp')" @click="emit('move', child.id, -1)">
          <IconSvg type="chevron-up" size="xs" />
        </button>
        <button :title="t('fbt.moveDown')" @click="emit('move', child.id, 1)">
          <IconSvg type="chevron-down" size="xs" />
        </button>
        <button :title="t('common.copy')" @click="emit('duplicate', child.id)">
          <IconSvg type="copy" size="xs" />
        </button>
        <button class="ldc-del" :title="t('common.delete')" @click="emit('remove', child.id)">
          <IconSvg type="trash-2" size="xs" />
        </button>
      </span>
    </div>
    <div class="ldc-card-body">
      <FormRenderer
        v-if="findField(child.key ?? child.id)"
        :field="findField(child.key ?? child.id)!"
        :model-value="previewData[child.key ?? child.id]"
      />
    </div>
    <div v-if="dropPos === 'after'" class="ldc-drop-indicator is-after" />
  </div>
</template>
