<script setup lang="ts">
/**
 * 字段面板 — 设计器左栏 (v3)
 *
 * v3 变化：
 * - 新增"高级字段"分组：子表单、关联选择、富文本、电子签名、地址选择、证件号码、评分矩阵、流水号
 * - 新增"布局容器"分组：分组卡片、栅格行、标签页、折叠面板、步骤条
 * - 容器类型拖拽时需要特殊标记（dataTransfer 携带 isContainer）
 *
 * 功能：
 * 1. 拖拽源：拖拽字段/容器到画布
 * 2. 点击添加：单击即可添加到画布末尾（移动端友好）
 * 3. 搜索过滤
 */
import { computed, ref } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { FIELD_TYPES, type DesignerNodeType, type FieldTypeMeta } from './types'

const emit = defineEmits<{
  add: [type: DesignerNodeType]
}>()

/** 搜索关键词 */
const searchQuery = ref('')

/** 按分组归类（带搜索过滤） */
const groups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const filtered = q
    ? FIELD_TYPES.filter(t => t.label.toLowerCase().includes(q) || t.type.toLowerCase().includes(q))
    : FIELD_TYPES
  const g: { group: string; items: FieldTypeMeta[] }[] = []
  for (const item of filtered) {
    let cur = g.find(x => x.group === item.group)
    if (!cur) {
      cur = { group: item.group, items: [] }
      g.push(cur)
    }
    cur.items.push(item)
  }
  return g
})

/** 拖拽开始：设置 dataTransfer 携带字段类型 */
function onDragStart(e: DragEvent, type: DesignerNodeType): void {
  if (e.dataTransfer) {
    e.dataTransfer.setData('application/x-field-type', type)
    e.dataTransfer.setData('text/plain', type)
    e.dataTransfer.effectAllowed = 'copy'
  }
}
</script>

<template>
  <aside class="ldp-panel">
    <div class="ldp-panel-header">
      <IconSvg type="layers" size="sm" />
      <span>字段组件</span>
    </div>
    <!-- 搜索框 -->
    <div class="ldp-search">
      <IconSvg type="search" size="xs" />
      <input
        v-model="searchQuery"
        class="ldp-search-input"
        placeholder="搜索字段..."
      >
      <button v-if="searchQuery" class="ldp-search-clear" @click="searchQuery = ''">
        <IconSvg type="x" size="xs" />
      </button>
    </div>
    <!-- 空搜索结果 -->
    <div v-if="!groups.length" class="ldp-search-empty">
      <span>未找到匹配的字段类型</span>
    </div>
    <div
      v-for="g in groups"
      :key="g.group"
      class="ldp-group"
    >
      <div class="ldp-group-title">
        {{ g.group }}
        <span v-if="g.group === '布局容器'" class="ldp-group-cnt">{{ g.items.length }}</span>
      </div>
      <button
        v-for="item in g.items"
        :key="item.type"
        class="ldp-field-item"
        :class="{ 'ldp-field-item-container': item.isContainer }"
        draggable="true"
        @dragstart="onDragStart($event, item.type)"
        @click="emit('add', item.type)"
      >
        <span class="ldp-field-icon" :class="{ 'ldp-field-icon-container': item.isContainer }">
          <IconSvg :type="item.icon" size="sm" />
        </span>
        <span class="ldp-field-label">{{ item.label }}</span>
        <span class="ldp-add" title="点击添加">
          <IconSvg type="plus" size="xs" />
        </span>
      </button>
    </div>
  </aside>
</template>
