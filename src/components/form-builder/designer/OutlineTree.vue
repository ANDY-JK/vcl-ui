<script setup lang="ts">
/**
 * 大纲树面板 — 设计器左栏旁边 (v3)
 *
 * 功能：
 * 1. 树形展示表单结构（含容器嵌套层级）
 * 2. 点击节点选中 → 联动画布 + 属性面板
 * 3. 显示节点类型标签（TEXT/SELECT/CARD/GRID 等）
 * 4. hover 时显示操作按钮（删除）
 * 5. 容器节点支持展开/折叠
 * 6. 拖拽排序（简化版：仅支持同级排序）
 */
import { computed, ref, watch, type PropType } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { isContainerNode, type DesignerNode } from './types'

const props = defineProps({
  nodes: { type: Array as PropType<DesignerNode[]>, default: () => [] },
  selectedId: { type: String as PropType<string | null>, default: null },
})

const emit = defineEmits<{
  select: [id: string]
  remove: [id: string]
}>()

/** 搜索关键词 */
const searchQuery = ref('')

/** 展开状态 map：nodeId → boolean */
const expandedMap = ref<Record<string, boolean>>({})

/** 默认展开所有容器 */
watch(() => props.nodes, (newNodes) => {
  function setExpanded(list: DesignerNode[]): void {
    for (const n of list) {
      if (isContainerNode(n) && n.children?.length) {
        // 仅在未设置过时初始化为展开
        if (expandedMap.value[n.id] === undefined) {
          expandedMap.value[n.id] = true
        }
        setExpanded(n.children)
      }
    }
  }
  setExpanded(newNodes)
}, { immediate: true, deep: true })

/** 切换展开/折叠 */
function toggleExpand(id: string, e: Event): void {
  e.stopPropagation()
  expandedMap.value[id] = !expandedMap.value[id]
}

/** 树节点类型简称（中文） */
function typeShort(type: string): string {
  const map: Record<string, string> = {
    text: '文本', textarea: '多行', number: '数字',
    select: '下拉', radio: '单选', checkbox: '多选',
    cascader: '级联', switch: '开关', date: '日期', time: '时间',
    rate: '评分', slider: '滑块', upload: '上传',
    password: '密码', tel: '电话', email: '邮箱', url: '链接', search: '搜索',
    subform: '子表', relate: '关联', richtext: '富文本',
    signature: '签名', address: '地址', idcard: '证件',
    matrix: '矩阵', serial: '流水',
    divider: '分割', title: '标题',
    card: '卡片', grid: '栅格', tabs: '标签',
    collapse: '折叠', steps: '步骤',
  }
  return map[type] ?? type
}

/** 节点图标 */
function nodeIcon(type: string): string {
  const map: Record<string, string> = {
    text: 'square-pen', textarea: 'align-left', number: 'hash',
    select: 'chevron-down', radio: 'circle-check', checkbox: 'check-square',
    cascader: 'chevrons-down-up', switch: 'toggle-left', date: 'calendar',
    time: 'clock', rate: 'star', slider: 'sliders-horizontal', upload: 'upload',
    password: 'lock', tel: 'phone', email: 'mail', url: 'link', search: 'search',
    subform: 'table', relate: 'link', richtext: 'type',
    signature: 'pen-tool', address: 'map-pin', idcard: 'credit-card',
    matrix: 'grid-3x3', serial: 'bar-chart',
    divider: 'minus', title: 'type',
    card: 'layout-template', grid: 'grid-2x2', tabs: 'panel-top',
    collapse: 'chevron-down', steps: 'clock',
  }
  return map[type] ?? 'circle'
}

/** 递归渲染树节点 */
interface TreeNode {
  node: DesignerNode
  level: number
  hasChildren: boolean
  isExpanded: boolean
}

/** 扁平化树（含缩进层级），供 v-for 渲染；根据展开状态裁剪 */
const flatTree = computed<TreeNode[]>(() => {
  const result: TreeNode[] = []
  const q = searchQuery.value.trim().toLowerCase()

  // 搜索时强制展开所有容器
  const isSearching = q.length > 0

  function walk(list: DesignerNode[], level: number): void {
    for (const node of list) {
      // 搜索过滤
      if (isSearching) {
        const labelMatch = node.label.toLowerCase().includes(q)
        const typeMatch = node.type.toLowerCase().includes(q)
        const childMatch = isContainerNode(node) && node.children?.length && hasMatchInChildren(node.children, q)
        if (!labelMatch && !typeMatch && !childMatch) continue
      }

      const hasChildren = !!(node.children?.length && isContainerNode(node))
      const isExpanded = isSearching || expandedMap.value[node.id] !== false

      result.push({
        node,
        level,
        hasChildren,
        isExpanded,
      })

      // 有子节点且展开时，递归渲染子节点
      if (hasChildren && isExpanded) {
        walk(node.children!, level + 1)
      }
    }
  }

  walk(props.nodes, 0)
  return result
})

/** 检查子树中是否有匹配搜索的节点 */
function hasMatchInChildren(children: DesignerNode[], q: string): boolean {
  for (const child of children) {
    if (child.label.toLowerCase().includes(q) || child.type.toLowerCase().includes(q)) return true
    if (child.children?.length && hasMatchInChildren(child.children, q)) return true
  }
  return false
}
</script>

<template>
  <aside class="ldo-panel">
    <div class="ldo-header">
      <IconSvg type="list-tree" size="sm" />
      <span>表单大纲</span>
    </div>
    <!-- 搜索框 -->
    <div class="ldo-search">
      <IconSvg type="search" size="xs" />
      <input
        v-model="searchQuery"
        class="ldo-search-input"
        placeholder="搜索节点..."
      >
    </div>
    <!-- 树 -->
    <div class="ldo-tree">
      <div v-if="!flatTree.length" class="ldo-empty">
        <span>暂无节点</span>
      </div>
      <div
        v-for="item in flatTree"
        :key="item.node.id"
        class="ldo-node"
        :class="{
          selected: item.node.id === selectedId,
          container: isContainerNode(item.node),
        }"
        :style="{ 'padding-left': 8 + item.level * 16 + 'px' }"
        @click="emit('select', item.node.id)"
      >
        <!-- 展开/折叠箭头 -->
        <span
          v-if="item.hasChildren"
          class="ldo-expand-toggle"
          @click="toggleExpand(item.node.id, $event)"
        >
          <IconSvg
            :type="item.isExpanded ? 'chevron-down' : 'chevron-right'"
            size="xs"
          />
        </span>
        <!-- 无子节点时占位 -->
        <span v-else class="ldo-expand-placeholder" />

        <IconSvg :type="nodeIcon(item.node.type)" size="xs" class="ldo-tree-icon" />
        <span class="ldo-tree-label">{{ item.node.label }}</span>
        <span class="ldo-tree-type">{{ typeShort(item.node.type) }}</span>
        <span class="ldo-tree-actions" @click.stop>
          <button class="ldo-del-btn" @click="emit('remove', item.node.id)" title="删除">
            <IconSvg type="trash-2" size="xs" />
          </button>
        </span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* 展开/折叠箭头 */
.ldo-expand-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 3px;
  transition: background 0.15s;
}
.ldo-expand-toggle:hover {
  background: var(--color-bg-hover, rgba(0,0,0,0.06));
}
/* 无子节点时的占位（保持对齐） */
.ldo-expand-placeholder {
  display: inline-block;
  width: 16px;
  flex-shrink: 0;
}
</style>
