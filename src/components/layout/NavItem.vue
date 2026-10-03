<script setup lang="ts">
// 递归导航节点 — 通过 defineOptions name 实现 self-reference
// 支持无限层级嵌套，每层自动计算缩进/字号/透明度/间距
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import { navLabel, isNodeActive, type NavNode } from './utils/navData'

defineOptions({ name: 'NavItem' })

const props = defineProps<{
  node: NavNode
  level: number // 当前层级，从 1 开始
  collapsed?: boolean
  expandedSet: Set<string>
}>()

const emit = defineEmits<{
  (e: 'toggle', node: NavNode): void
}>()

const router = useRouter()
const route = useRoute()

const isGroup = computed(() => props.node.children && props.node.children.length > 0)
const isExpanded = computed(() => props.expandedSet.has(props.node.label))
const isActive = computed(() => isNodeActive(props.node, route.path, router))

function onClick() {
  if (isGroup.value) {
    emit('toggle', props.node)
  } else if (props.node.route) {
    router.push(props.node.route)
  }
}

/*
  层级比例系统 — 公式覆盖所有层级，新增层级自动推算
  ================================================================
  字号:     15px * 0.8^(N-1)            下限 6px
  左缩进:   4px + 4px * (N-1)          每级 +4px
  透明度:   max(0.3, 1.0 - 0.15*(N-1))
  图标透明: max(0.3, 0.65 - 0.1*(N-1))
  指示条宽: N=1 无, N=2 2px, N>=3 1.5px
  ================================================================
  L1: 15px  缩进  4px  1.00  粗体
  L2: 12px  缩进  8px  0.85
  L3: 10px  缩进 12px  0.70
  L4:  8px  缩进 16px  0.55
  L5:  7px  缩进 20px  0.45
  L6:  6px  缩进 24px  0.35
  ================================================================
*/
const levelStyle = computed(() => {
  const lv = props.level
  const fontSize = Math.max(6, Math.round(15 * Math.pow(0.8, lv - 1)))
  const indent = 4 + 4 * (lv - 1)
  const opacity = Math.max(0.3, 1.0 - 0.15 * (lv - 1))
  const iconOpacity = Math.max(0.3, 0.65 - 0.1 * (lv - 1))
  // 层级字号/缩进是设计尺寸，必须与全站同尺——否则侧栏缩放时深层文字恒定，
  // 与父级行高错位（字大行小）。层级公式本身不变，只把 px 换算进缩放曲线。
  const marginLeft = `calc(${indent}px * var(--vcl-scale))`
  const marginRight = lv === 1 ? 'var(--vcl-space-4)' : 'var(--vcl-space-5)'
  return {
    '--nav-font-size': `calc(${fontSize}px * var(--vcl-scale))`,
    '--nav-indent': `calc(${indent}px * var(--vcl-scale))`,
    '--nav-opacity': String(opacity),
    '--nav-icon-opacity': String(iconOpacity),
    '--nav-ml': marginLeft,
    '--nav-mr': marginRight,
  }
})

const navItemClass = computed(() => {
  const base = `nav-level nav-l${props.level}`
  const mods = []
  if (isGroup.value) mods.push('is-group')
  if (isExpanded.value) mods.push('expanded')
  if (isActive.value) mods.push('active')
  return [base, ...mods]
})
</script>

<template>
  <!-- 有子节点：渲染为可折叠分组 -->
  <button
    v-if="isGroup"
    v-show="!collapsed"
    :class="navItemClass"
    :style="levelStyle"
    :aria-expanded="isExpanded"
    @click="onClick"
  >
    <span class="nav-level-label">{{ navLabel(node.label) }}</span>
    <span class="nav-arrow">▾</span>
  </button>

  <!-- 无子节点：渲染为叶子导航项 -->
  <button
    v-else
    :class="navItemClass"
    :style="levelStyle"
    :aria-current="isActive ? 'page' : undefined"
    :title="collapsed ? navLabel(node.label) : undefined"
    @click="onClick"
  >
    <IconSvg :type="node.icon || 'square'" size="sm" color="currentColor" />
    <span v-show="!collapsed" class="nav-level-text" :title="navLabel(node.label)">{{ navLabel(node.label) }}</span>
  </button>

  <!-- 递归渲染子节点 -->
  <template v-if="isGroup && (collapsed || isExpanded)">
    <NavItem
      v-for="child in node.children"
      :key="child.label"
      :node="child"
      :level="level + 1"
      :collapsed="collapsed"
      :expanded-set="expandedSet"
      @toggle="(n: NavNode) => emit('toggle', n)"
    />
  </template>
</template>

<style src="./nav-item-scoped.css" scoped></style>
