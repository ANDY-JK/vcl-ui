<script setup lang="ts">
// 多级导航 — 基于递归组件 NavItem 实现无限层级嵌套
// 分组可独立展开/折叠，路由匹配时自动展开所在路径；顶部即时搜索按文案/路由/i18n key 过滤
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

// 展开状态：按节点 label 存储，支持独立切换。
// 初始即「仅活跃分组」——不要图省事先全展开再靠 watch 收（那样首帧前的中间态是个坑，
// 读代码的人也会被误导成"默认全展开"）
const expandedGroups = ref<Set<string>>(
  new Set(tree.value.filter((g) => isNodeActive(g, route.path, router)).map((g) => g.label)),
)

/** 路由变化时把当前路由所在路径的父分组并入展开集合；
    不做整体替换 — 用户手动展开的其它分组保持原状；同时清掉搜索词，
    否则跳转后侧栏还停在过滤态，看不出已到新页面 */
watch(
  () => route.path,
  (path, oldPath) => {
    if (oldPath !== undefined) {
      query.value = ''
      let changed = false
      const next = new Set(expandedGroups.value)
      for (const group of tree.value) {
        if (isNodeActive(group, path, router) && !next.has(group.label)) {
          next.add(group.label)
          changed = true
        }
      }
      if (changed) expandedGroups.value = next
    }
  },
)

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

// ==================== 即时搜索 ====================
const query = ref('')

/** 过滤树：叶子按「展示文案 / i18n key / 路由」三路匹配（大小写不敏感）；
    分组自身命中 → 整组保留（用户按分类名找），仅子孙命中 → 只留命中的子孙 */
const filteredTree = computed<NavNode[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return tree.value
  const hit = (n: NavNode) =>
    navLabel(n.label).toLowerCase().includes(q) ||
    n.label.toLowerCase().includes(q) ||
    (n.route?.toLowerCase().includes(q) ?? false)
  const walk = (nodes: NavNode[]): NavNode[] =>
    nodes
      .map((n) => {
        if (!n.children?.length) return hit(n) ? n : null
        const kids = walk(n.children)
        if (kids.length) return { ...n, children: kids }
        return hit(n) ? n : null
      })
      .filter((n): n is NavNode => n !== null)
  return walk(tree.value)
})

/** 过滤期间命中的分组强制展开——只改渲染视图，不动用户手里的展开集合 */
const effectiveExpanded = computed(() => {
  if (!query.value.trim()) return expandedGroups.value
  const next = new Set(expandedGroups.value)
  for (const g of filteredTree.value) if (g.children?.length) next.add(g.label)
  return next
})
</script>

<template>
  <div class="accordion-nav-wrap">
    <!-- 即时搜索：折叠态（只剩图标）与空树时不渲染 -->
    <div v-if="!collapsed && tree.length" class="nav-search">
      <IconSvg type="search" size="sm" color="currentColor" class="nav-search-icon" />
      <input
        v-model="query"
        class="nav-search-input"
        type="text"
        :placeholder="t('appLayout.searchPlaceholder')"
        :aria-label="t('appLayout.searchPlaceholder')"
        @keydown.esc="query = ''"
      />
      <button
        v-if="query"
        class="nav-search-clear"
        :aria-label="t('appLayout.searchClear')"
        @click="query = ''"
      >
        <IconSvg type="x" size="sm" color="currentColor" />
      </button>
    </div>
    <nav class="accordion-nav" :class="{ collapsed }">
      <div v-if="!filteredTree.length" class="nav-empty">
        {{ query ? t('appLayout.searchEmpty') : t('common.empty') }}
      </div>
      <template v-for="node in filteredTree" :key="node.label">
        <!-- L1 根级叶子节点（无 children 的直接节点） -->
        <button
          v-if="!node.children"
          class="nav-leaf-root"
          :class="{ active: node.route && activeRoute === node.route }"
          :aria-current="node.route && activeRoute === node.route ? 'page' : undefined"
          :title="collapsed ? navLabel(node.label) : undefined"
          @click="node.route && $router.push(node.route)"
        >
          <IconSvg :type="node.icon || 'square'" size="sm" color="currentColor" />
          <span v-show="!collapsed" class="nav-leaf-label" :title="navLabel(node.label)">{{
            navLabel(node.label)
          }}</span>
        </button>

        <!-- 递归渲染分组（有 children 的节点交给 NavItem 递归处理） -->
        <NavItem
          v-else
          :node="node"
          :level="1"
          :collapsed="collapsed"
          :expanded-set="effectiveExpanded"
          @toggle="toggleGroup"
        />
      </template>
    </nav>
  </div>
</template>

<style scoped>
/* 外层容器：搜索框固定高度 + 导航区吃掉剩余空间并内部滚动 */
.accordion-nav-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.accordion-nav {
  flex: 1;
  min-height: 0;
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

/* ================================================================
   即时搜索框
   ================================================================ */
.nav-search {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-3) var(--space-3) var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-sidebar-hover);
  color: var(--color-sidebar-text);
}
.nav-search-icon {
  flex-shrink: 0;
  opacity: 0.65;
}
.nav-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-sidebar-text);
  font-size: clamp(11px, 1.5vw, 15px);
  line-height: 1.5;
}
.nav-search-input::placeholder {
  color: var(--color-sidebar-text);
  opacity: 0.55;
}
.nav-search-clear {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 2px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-sidebar-text);
  opacity: 0.6;
  cursor: pointer;
}
.nav-search-clear:hover {
  opacity: 1;
  background: var(--color-sidebar-active);
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
