<script setup lang="ts">
// 递归导航节点 — 通过 defineOptions name 实现 self-reference
// 支持无限层级嵌套，每层自动计算缩进/字号/透明度/间距
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import { navLabel, type NavNode } from './utils/navData'

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
const isActive = computed(() => {
  if (!props.node.route) return false
  const resolved = router.resolve(props.node.route)
  return route.path === resolved.path
})

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
  // 所有层级统一按公式缩进，每级 +4px
  const marginLeft = `${indent}px`
  const marginRight = lv === 1 ? 'var(--space-4)' : 'var(--space-5)'
  return {
    '--nav-font-size': `${fontSize}px`,
    '--nav-indent': `${indent}px`,
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
  <button v-if="isGroup" v-show="!collapsed" :class="navItemClass" :style="levelStyle" @click="onClick">
    <span class="nav-level-label">{{ navLabel(node.label) }}</span>
    <span class="nav-arrow">▾</span>
  </button>

  <!-- 无子节点：渲染为叶子导航项 -->
  <button
    v-else
    :class="navItemClass"
    :style="levelStyle"
    :title="collapsed ? navLabel(node.label) : undefined"
    @click="onClick"
  >
    <IconSvg :type="node.icon || 'square'" size="sm" color="currentColor" />
    <span v-show="!collapsed" class="nav-level-text">{{ navLabel(node.label) }}</span>
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

<style scoped>
/* ================================================================
   共享基础：所有层级导航项通用
   ================================================================ */
.nav-level {
  display: flex;
  align-items: center;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-sidebar-text);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    opacity 120ms ease;
  position: relative;
  white-space: nowrap;
  line-height: 1.5;
  /* 间距：左右 margin 留白 + width 收窄，制造层次感 */
  width: calc(100% - var(--nav-ml) - var(--nav-mr));
  margin-left: var(--nav-ml);
  margin-right: var(--nav-mr);
  /* 上下 padding 提供呼吸感 */
  padding: var(--space-2) var(--space-3);
  /* 公式驱动：字号/透明度由 JS 计算 */
  font-size: var(--nav-font-size);
  opacity: var(--nav-opacity);
  gap: var(--space-2);
}

/* 图标 */
.nav-level > :deep(svg) {
  flex-shrink: 0;
  opacity: var(--nav-icon-opacity);
}

/* 文字溢出省略 */
.nav-level-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  flex: 1;
  min-width: 0;
}

/* ================================================================
   分组标题（有子节点的项）
   ================================================================ */
.nav-level.is-group {
  justify-content: space-between;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* ================================================================
   L1 分组标题 — 独立样式
   ================================================================ */
.nav-l1 {
  margin-top: var(--space-2);
  margin-bottom: 2px;
  border-radius: var(--radius-sm);
  font-weight: 700;
  color: #dde0e8;
}
.nav-l1:hover {
  color: #fff;
  background: transparent;
}

/* ================================================================
   L2 叶子导航项 — 加粗
   ================================================================ */
.nav-l2:not(.is-group) {
  font-weight: 600;
}

/* ================================================================
   箭头
   ================================================================ */
.nav-arrow {
  font-size: clamp(10px, 1.3vw, 13px);
  transition: transform var(--transition-normal);
  opacity: 0.4;
  flex-shrink: 0;
}
.nav-level.expanded .nav-arrow {
  transform: rotate(180deg);
}

/* ================================================================
   hover / active 状态
   ================================================================ */
.nav-level:hover {
  background: var(--color-sidebar-hover);
  color: #fff;
  opacity: 1;
}
.nav-level:hover > :deep(svg) {
  opacity: 1;
}

.nav-level.active {
  background: var(--color-sidebar-active);
  color: var(--color-sidebar-text-active);
  font-weight: 500;
  opacity: 1;
}
.nav-level.active > :deep(svg) {
  opacity: 1;
}

/* 激活指示条 — L1 无，L2+ 有 */
.nav-level.active::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
}
.nav-l1.active::before {
  display: none;
}

/* ================================================================
   折叠态
   ================================================================ */
.collapsed .nav-level {
  justify-content: center;
  width: calc(100% - var(--space-2) * 2);
  margin: 0 var(--space-2);
  padding: var(--space-2) 0;
}
.collapsed .nav-level.active::before {
  left: 4px;
  top: 3px;
  bottom: 3px;
  width: 1.5px;
}
</style>
