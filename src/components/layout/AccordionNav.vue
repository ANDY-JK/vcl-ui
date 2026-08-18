<script setup lang="ts">
// ⛔ 保护 — 手风琴导航，禁止：展开/折叠逻辑修改，navData 结构破坏
//    需我确认：导航节点类型扩展、高亮匹配规则
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import { navTree, type NavNode } from './utils/navData'

const props = defineProps<{ collapsed?: boolean; items?: NavNode[] }>()

const router = useRouter()
const route = useRoute()

const tree = computed(() => props.items || navTree)

const expandedGroups = ref<Set<string>>(new Set(tree.value.map((g) => g.label)))

function syncExpand() {
  const next = new Set<string>()
  for (const group of tree.value) {
    if (hasActiveChild(group)) next.add(group.label)
  }
  expandedGroups.value = next
}
watch(() => route.path, syncExpand, { immediate: true })

function isExpanded(group: NavNode) {
  return expandedGroups.value.has(group.label)
}
function toggleGroup(group: NavNode) {
  const next = new Set(expandedGroups.value)
  if (next.has(group.label)) {
    next.delete(group.label)
  } else {
    next.add(group.label)
  }
  expandedGroups.value = next
}

function hasActiveChild(node: NavNode): boolean {
  if (node.route) {
    const resolved = router.resolve(node.route)
    if (route.path === resolved.path) return true
  }
  if (node.children) return node.children.some((c) => hasActiveChild(c))
  return false
}

function onClick(node: NavNode) {
  if (node.children && node.children.length > 0) {
    toggleGroup(node)
  } else if (node.route) {
    router.push(node.route)
  }
}

const activeRoute = computed(() => route.path)
</script>

<template>
  <nav class="accordion-nav" :class="{ collapsed }">
    <template v-for="node in tree" :key="node.label">
      <!-- L1 一级：分组标题 -->
      <button
        v-if="node.children && node.children.length > 0"
        v-show="!collapsed"
        class="nav-l1"
        :class="{ expanded: isExpanded(node) }"
        @click="toggleGroup(node)"
      >
        <span class="nav-l1-label">{{ node.label }}</span>
        <span class="nav-arrow">▾</span>
      </button>

      <!-- 分组展开区 -->
      <template v-if="node.children && (collapsed || isExpanded(node))">
        <template v-for="child in node.children" :key="child.label">
          <!-- L2 二级：可折叠子分组标题 -->
          <button
            v-if="child.children && child.children.length > 0"
            v-show="!collapsed"
            class="nav-l2 is-group"
            :class="{ expanded: isExpanded(child) }"
            @click="toggleGroup(child)"
          >
            <span class="nav-l2-label">{{ child.label }}</span>
            <span class="nav-arrow">▾</span>
          </button>

          <!-- L2 二级：叶子节点 -->
          <button
            v-else
            class="nav-l2"
            :class="{ active: child.route && activeRoute === child.route }"
            :title="collapsed ? child.label : undefined"
            @click="onClick(child)"
          >
            <IconSvg :type="child.icon || 'square'" size="sm" color="currentColor" />
            <span v-show="!collapsed" class="nav-label">{{ child.label }}</span>
          </button>

          <!-- L3 三级子项 -->
          <template v-if="child.children && (collapsed || isExpanded(child))">
            <template v-for="sub in child.children" :key="sub.label">
              <button
                v-if="!sub.children"
                class="nav-l3"
                :class="{ active: sub.route && activeRoute === sub.route }"
                :title="collapsed ? sub.label : undefined"
                @click="onClick(sub)"
              >
                <IconSvg :type="sub.icon || 'square'" size="sm" color="currentColor" />
                <span v-show="!collapsed" class="nav-label">{{ sub.label }}</span>
              </button>

              <!-- L4 四级子项 -->
              <template v-if="sub.children && (collapsed || isExpanded(sub))">
                <button
                  v-for="deep in sub.children"
                  :key="deep.label"
                  class="nav-l4"
                  :class="{ active: deep.route && activeRoute === deep.route }"
                  :title="collapsed ? deep.label : undefined"
                  @click="onClick(deep)"
                >
                  <IconSvg :type="deep.icon || 'square'" size="sm" color="currentColor" />
                  <span v-show="!collapsed" class="nav-label">{{ deep.label }}</span>
                </button>
              </template>
            </template>
          </template>
        </template>
      </template>

      <!-- L2 根级叶子节点（无 children 的直接节点） -->
      <button
        v-if="!node.children"
        class="nav-l2"
        :class="{ active: node.route && activeRoute === node.route }"
        :title="collapsed ? node.label : undefined"
        @click="onClick(node)"
      >
        <IconSvg :type="node.icon || 'square'" size="sm" color="currentColor" />
        <span v-show="!collapsed" class="nav-label">{{ node.label }}</span>
      </button>
    </template>
  </nav>
</template>

<style scoped>
/*
  ================================================================
  层级比例系统 — 一个公式覆盖 L1~L6，新增层级只需按公式推算
  ================================================================
  字号:   15px × 0.8^(N-1)    (rounded)
  左缩进: 4px + 8px × (N-1)   (N=1 最靠左, N↑ 越往右)
  透明度: 1.0 - 0.15 × (N-1)  (N=1 最实, N↑ 越淡)
  图标:   sm(16px) 全层级统一
  指示条: L1 无, L2 2px, L3+ 1.5px

  L1: 15px  缩进  4px  1.00
  L2: 12px  缩进 12px  0.85
  L3: 10px  缩进 20px  0.70
  L4:  8px  缩进 28px  0.55
  L5:  7px  缩进 36px  0.45
  L6:  6px  缩进 44px  0.35
  ================================================================
*/

/* ---- 共享基础：2~6 级导航项通用 ---- */
.nav-l2,
.nav-l3,
.nav-l4,
.nav-l5,
.nav-l6 {
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
}
.nav-l2 > :deep(svg),
.nav-l3 > :deep(svg),
.nav-l4 > :deep(svg),
.nav-l5 > :deep(svg),
.nav-l6 > :deep(svg) {
  flex-shrink: 0;
}

.nav-l2 .nav-label,
.nav-l3 .nav-label,
.nav-l4 .nav-label,
.nav-l5 .nav-label,
.nav-l6 .nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-l2:hover,
.nav-l3:hover,
.nav-l4:hover,
.nav-l5:hover,
.nav-l6:hover {
  background: var(--color-sidebar-hover);
  color: #fff;
}
.nav-l2.active,
.nav-l3.active,
.nav-l4.active,
.nav-l5.active,
.nav-l6.active {
  background: var(--color-sidebar-active);
  color: var(--color-sidebar-text-active);
  font-weight: 500;
}

.accordion-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--space-2) 0 var(--space-5);
  scrollbar-width: none;
}
.accordion-nav::-webkit-scrollbar {
  display: none;
}

/* ---- L1 分组标题（独立样式，不参与导航项共享） ---- */
.nav-l1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% - var(--space-1) - var(--space-4));
  margin: var(--space-2) var(--space-4) 2px var(--space-1);
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #dde0e8;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: color var(--transition-fast);
}
.nav-l1:hover {
  color: #fff;
}

.nav-arrow {
  font-size: 10px;
  transition: transform var(--transition-normal);
  opacity: 0.4;
  flex-shrink: 0;
}
.nav-l1.expanded .nav-arrow,
.nav-l2.expanded .nav-arrow {
  transform: rotate(180deg);
}

/* ---- L2 (12px / 12px 缩进 / 0.85 透明度) ---- */
.nav-l2 {
  gap: var(--space-3);
  width: calc(100% - var(--space-3) - var(--space-5));
  margin: 0 var(--space-5) 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  font-size: 12px;
  opacity: 0.85;
}
.nav-l2 > :deep(svg) {
  opacity: 0.65;
}
.nav-l2:hover > :deep(svg),
.nav-l2.active > :deep(svg) {
  opacity: 1;
}
.nav-l2:hover,
.nav-l2.active {
  opacity: 1;
}

.nav-l2.is-group {
  justify-content: space-between;
  padding-left: calc(var(--space-3) + var(--space-4));
  font-weight: 500;
}
.nav-l2.is-group:hover {
  color: var(--color-sidebar-text-active);
}

.nav-l2.active::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: 2px;
  background: var(--color-primary);
}

/* ---- L3 (10px / 20px 缩进 / 0.70 透明度) ---- */
.nav-l3 {
  gap: var(--space-2);
  width: calc(100% - var(--space-4) - var(--space-5));
  margin: 0 var(--space-5) 0 var(--space-4);
  padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
  font-size: 10px;
  opacity: 0.7;
}
.nav-l3 > :deep(svg) {
  opacity: 0.55;
}
.nav-l3:hover > :deep(svg),
.nav-l3.active > :deep(svg) {
  opacity: 1;
}
.nav-l3:hover,
.nav-l3.active {
  opacity: 1;
}

.nav-l3.active::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 3px;
  bottom: 3px;
  width: 1.5px;
  border-radius: 2px;
  background: var(--color-primary);
  opacity: 0.5;
}

/* ---- L4 (8px / 28px 缩进 / 0.55 透明度) ---- */
.nav-l4 {
  gap: var(--space-2);
  width: calc(100% - var(--space-5) - var(--space-5));
  margin: 0 var(--space-5) 0 var(--space-5);
  padding: var(--space-1) var(--space-2) 2px var(--space-3);
  font-size: 8px;
  opacity: 0.55;
}
.nav-l4 > :deep(svg) {
  opacity: 0.45;
  width: 14px;
  height: 14px;
}
.nav-l4:hover > :deep(svg),
.nav-l4.active > :deep(svg) {
  opacity: 1;
}
.nav-l4:hover,
.nav-l4.active {
  opacity: 1;
}

.nav-l4.active::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 2px;
  bottom: 2px;
  width: 1.5px;
  border-radius: 1px 0 0 1px;
  background: var(--color-primary);
  opacity: 0.4;
}

/* ---- L5 (7px / 36px 缩进 / 0.45 透明度) ---- */
.nav-l5 {
  gap: 5px;
  width: calc(100% - var(--space-6) - var(--space-5));
  margin: 0 var(--space-5) 0 var(--space-6);
  padding: var(--space-1) var(--space-2) 2px var(--space-3);
  font-size: 7px;
  opacity: 0.45;
}
.nav-l5 > :deep(svg) {
  opacity: 0.4;
  width: 13px;
  height: 13px;
}
.nav-l5:hover > :deep(svg),
.nav-l5.active > :deep(svg) {
  opacity: 1;
}
.nav-l5:hover,
.nav-l5.active {
  opacity: 1;
}

.nav-l5.active::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 2px;
  bottom: 2px;
  width: 1px;
  border-radius: 1px 0 0 1px;
  background: var(--color-primary);
  opacity: 0.35;
}

/* ---- L6 (6px / 44px 缩进 / 0.35 透明度) ---- */
.nav-l6 {
  gap: var(--space-1);
  width: calc(100% - var(--space-6) - var(--space-6));
  margin: 0 var(--space-6) 0 var(--space-6);
  padding: 1px var(--space-2) 1px var(--space-3);
  font-size: 6px;
  opacity: 0.35;
}
.nav-l6 > :deep(svg) {
  opacity: 0.35;
  width: 12px;
  height: 12px;
}
.nav-l6:hover > :deep(svg),
.nav-l6.active > :deep(svg) {
  opacity: 1;
}
.nav-l6:hover,
.nav-l6.active {
  opacity: 1;
}

.nav-l6.active::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 1px;
  bottom: 1px;
  width: 1px;
  border-radius: 1px 0 0 1px;
  background: var(--color-primary);
  opacity: 0.3;
}

/* ---- 折叠态 ---- */
.collapsed .nav-l2,
.collapsed .nav-l3,
.collapsed .nav-l4,
.collapsed .nav-l5,
.collapsed .nav-l6 {
  justify-content: center;
  width: calc(100% - var(--space-2) * 2);
  margin: 0 var(--space-2);
  padding: var(--space-2) 0;
}
.collapsed .nav-l2.active::before,
.collapsed .nav-l3.active::before,
.collapsed .nav-l4.active::before,
.collapsed .nav-l5.active::before,
.collapsed .nav-l6.active::before {
  left: 6px;
  top: 3px;
  bottom: 3px;
  width: 1.5px;
}
</style>
