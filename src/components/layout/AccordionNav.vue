<script setup lang="ts">
// 多级导航 — 基于递归组件 NavItem 实现无限层级嵌套
// 分组可独立展开/折叠，路由匹配时自动展开所在路径
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import { navLabel, isNodeActive, type NavNode } from './utils/navData'
import NavItem from './NavItem.vue'

const t = useT()

const props = defineProps<{ collapsed?: boolean; items?: NavNode[] }>()

const router = useRouter()
const route = useRoute()

// 不兜底 navTree：下游未传 items 时渲染空态，避免渲染指向宿主不存在路由的演示菜单
const tree = computed<NavNode[]>(() => props.items ?? [])

// 展开状态：按节点 label 存储，支持独立切换
const expandedGroups = ref<Set<string>>(new Set(tree.value.map((g) => g.label)))

/** 路由变化时把当前路由所在路径的父分组并入展开集合；
    不做整体替换 — 用户手动展开的其它分组保持原状 */
function syncExpand() {
  let changed = false
  const next = new Set(expandedGroups.value)
  for (const group of tree.value) {
    if (hasActiveChild(group) && !next.has(group.label)) {
      next.add(group.label)
      changed = true
    }
  }
  if (changed) expandedGroups.value = next
}
// 首次挂载仍以「仅展开活跃路径」初始化（初始集合本身就是全量展开）
watch(
  () => route.path,
  (path, oldPath) => {
    if (oldPath === undefined) {
      expandedGroups.value = new Set(tree.value.filter((g) => isNodeActive(g, path, router)).map((g) => g.label))
    } else {
      syncExpand()
    }
  },
  { immediate: true },
)

/** 递归检查节点子树中是否有匹配当前路由的叶子 */
function hasActiveChild(node: NavNode): boolean {
  return isNodeActive(node, route.path, router)
}

/** 切换分组展开/折叠 */
function toggleGroup(node: NavNode) {
  const next = new Set(expandedGroups.value)
  if (next.has(node.label)) {
    next.delete(node.label)
  } else {
    next.add(node.label)
  }
  expandedGroups.value = next
}

const activeRoute = computed(() => route.path)
</script>

<template>
  <nav class="accordion-nav" :class="{ collapsed }">
    <div v-if="!tree.length" class="nav-empty">{{ t('common.empty') }}</div>
    <template v-for="node in tree" :key="node.label">
      <!-- L1 根级叶子节点（无 children 的直接节点） -->
      <button
        v-if="!node.children"
        class="nav-leaf-root"
        :class="{ active: node.route && activeRoute === node.route }"
        :title="collapsed ? navLabel(node.label) : undefined"
        @click="node.route && $router.push(node.route)"
      >
        <IconSvg :type="node.icon || 'square'" size="sm" color="currentColor" />
        <span v-show="!collapsed" class="nav-leaf-label" :title="navLabel(node.label)">{{ navLabel(node.label) }}</span>
      </button>

      <!-- 递归渲染分组（有 children 的节点交给 NavItem 递归处理） -->
      <NavItem
        v-else
        :node="node"
        :level="1"
        :collapsed="collapsed"
        :expanded-set="expandedGroups"
        @toggle="toggleGroup"
      />
    </template>
  </nav>
</template>

<style scoped>
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
.nav-empty {
  padding: var(--space-4) var(--space-3);
  text-align: center;
  font-size: clamp(11px, 1.5vw, 15px);
  color: var(--color-sidebar-text);
  opacity: 0.6;
}

/* 根级叶子节点（无 children 的顶级导航项） */
.nav-leaf-root {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: calc(100% - var(--space-3) - var(--space-5));
  margin: 0 var(--space-5) 0 var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-sidebar-text);
  font-size: clamp(11px, 1.5vw, 15px);
  opacity: 0.85;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    opacity 120ms ease;
  position: relative;
  white-space: nowrap;
  line-height: 1.5;
}
.nav-leaf-root > :deep(svg) {
  flex-shrink: 0;
  opacity: 0.65;
}
.nav-leaf-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.nav-leaf-root:hover {
  background: var(--color-sidebar-hover);
  color: #fff;
  opacity: 1;
}
.nav-leaf-root:hover > :deep(svg) {
  opacity: 1;
}
.nav-leaf-root.active {
  background: var(--color-sidebar-active);
  color: var(--color-sidebar-text-active);
  font-weight: 500;
  opacity: 1;
}
.nav-leaf-root.active > :deep(svg) {
  opacity: 1;
}
.nav-leaf-root.active::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
}

/* 折叠态 */
.collapsed .nav-leaf-root {
  justify-content: center;
  width: calc(100% - var(--space-2) * 2);
  margin: 0 var(--space-2);
  padding: var(--space-2) 0;
}
.collapsed .nav-leaf-root.active::before {
  left: 4px;
  top: 3px;
  bottom: 3px;
  width: 1.5px;
}
</style>
