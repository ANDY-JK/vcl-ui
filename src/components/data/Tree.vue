<script setup lang="ts">
// ⛔ 保护 — 树形控件，禁止：clamp() → px，递归渲染结构
//    需我确认：TreeNode 接口扩展、勾选联动逻辑
import { ref, reactive, computed, inject, provide, watch, onMounted, nextTick } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useTreeFlatten } from '@/components/_internal/useTreeFlatten'

defineOptions({ name: 'Tree' })

interface TreeNode {
  key: string | number
  label: string
  children?: TreeNode[]
  disabled?: boolean
  checked?: boolean
  icon?: string
  /** 标记为叶子节点（lazy 模式下无 children 且 isLeaf=true 的节点不会触发 load） */
  isLeaf?: boolean
}

interface Props {
  data: TreeNode[]
  level?: number
  checkable?: boolean
  defaultExpandedKeys?: (string | number)[]
  expandAll?: boolean
  selectable?: boolean
  selectedKey?: string | number | null
  /** 懒加载：展开节点时若无 children 且 isLeaf 非 true，触发 load 事件 */
  lazy?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  level: 0,
  checkable: false,
  defaultExpandedKeys: () => [],
  expandAll: false,
  selectable: false,
  selectedKey: null,
  lazy: false,
})

const emit = defineEmits<{
  'node-click': [node: TreeNode]
  'check-change': [checkedKeys: (string | number)[], node: TreeNode]
  'update:selectedKey': [key: string | number | null]
  /** 懒加载：节点展开时触发，父组件加载子节点后回填到 data */
  load: [node: TreeNode]
}>()

const TREE_KEY = Symbol('tree-state')
interface TreeState {
  /** 判断节点是否展开（始终读取最新值） */
  isExpanded: (key: string | number) => boolean
  checkState: Map<string | number, boolean>
  indeterminateState: Set<string | number>
  checkable: boolean
  selectable: boolean
  selectedKeyRef: { value: string | number | null }
  /** 键盘导航焦点节点（roving tabindex） */
  focusKey: { value: string | number | null }
  toggleExpand: (key: string | number) => void
  toggleCheck: (node: TreeNode, checked: boolean) => void
  handleNodeClick: (node: TreeNode) => void
  handleKeydown: (e: KeyboardEvent, node: TreeNode) => void
}

const injected = inject<TreeState | null>(TREE_KEY, null)
const isRoot = injected === null
let state: TreeState

// ---- 使用 useTreeFlatten 管理展开/收起 ----
const treeFlatten = useTreeFlatten<TreeNode>({
  data: () => props.data,
  childrenKey: 'children',
  keyExtractor: (n) => n.key,
})

// roving tabindex 只改 tabindex 不搬焦点，键盘移动后必须手动把真实 DOM 焦点移到目标节点，
// 否则连续方向键始终从最初聚焦的节点算起，原地打转
const treeRootRef = ref<HTMLElement | null>(null)
function focusNode(key: string | number): void {
  nextTick(() => {
    const root = treeRootRef.value
    if (!root) return
    // treeitem 角色与 tabindex 在 v-for wrapper 上（role="tree" 的 required owned
    // elements 不能隔 generic div），故焦点目标查 wrapper。data-key 同步带在 wrapper 上。
    const target = Array.from(root.querySelectorAll<HTMLElement>('.tree-node-wrapper')).find(
      (el) => el.dataset.key === String(key),
    )
    target?.focus()
  })
}

if (isRoot) {
  function collectAllKeys(nodes: TreeNode[]): (string | number)[] {
    const keys: (string | number)[] = []
    for (const n of nodes) {
      keys.push(n.key)
      if (n.children) keys.push(...collectAllKeys(n.children))
    }
    return keys
  }

  // ---- O(1) 父节点查找：预构建 key → parent Map ----
  // 替代原 findParent 的 O(n) 遍历，在 updateNodeCheckState 递归场景下从 O(n²) 降到 O(n)
  const parentMap = new Map<string | number, TreeNode | null>()
  function buildParentMap(nodes: TreeNode[], parent: TreeNode | null = null) {
    for (const n of nodes) {
      parentMap.set(n.key, parent)
      if (n.children) buildParentMap(n.children, n)
    }
  }
  function findParent(childKey: string | number): TreeNode | null {
    return parentMap.get(childKey) ?? null
  }
  // 初始构建
  buildParentMap(props.data)

  // 初始化 expandedKeys
  const initialKeys = props.expandAll ? collectAllKeys(props.data) : props.defaultExpandedKeys
  for (const k of initialKeys) {
    treeFlatten.expandKeys.value.add(k)
  }

  const checkState = reactive<Map<string | number, boolean>>(new Map())
  const indeterminateState = reactive<Set<string | number>>(new Set())

  function initCheckState(nodes: TreeNode[]) {
    for (const n of nodes) {
      if (n.checked !== undefined) {
        checkState.set(n.key, n.checked)
        if (n.children) for (const c of n.children) initCheckChild(c, n.checked)
      } else if (n.children) initCheckState(n.children)
    }
  }
  function initCheckChild(n: TreeNode, checked: boolean) {
    checkState.set(n.key, checked)
    if (n.children) for (const c of n.children) initCheckChild(c, checked)
  }
  function refreshParentStates(nodes: TreeNode[]) {
    for (const n of nodes) {
      if (n.children) {
        refreshParentStates(n.children)
        updateNodeCheckState(n)
      }
    }
  }
  onMounted(() => {
    initCheckState(props.data)
    refreshParentStates(props.data)
  })

  // data 深层变化（lazy 回填/节点编辑）单一重建入口：
  // 此前 parentMap 与勾选状态各挂一个 deep watcher，任意深层编辑触发两遍全树遍历
  watch(
    () => props.data,
    () => {
      parentMap.clear()
      buildParentMap(props.data)
      // 剪掉已不存在节点的勾选残留，防止 Map 无限增长阻碍节点对象 GC
      const alive = new Set(collectAllKeys(props.data))
      for (const k of [...checkState.keys()]) if (!alive.has(k)) checkState.delete(k)
      for (const k of [...indeterminateState]) if (!alive.has(k)) indeterminateState.delete(k)
      // data 异步到达 / lazy 回填时重建勾选状态（此前仅 onMounted 执行一次，后到的 checked 永不生效）
      initCheckState(props.data)
      refreshParentStates(props.data)
    },
    { deep: true },
  )

  function updateNodeCheckState(node: TreeNode) {
    if (!node.children?.length) return
    const checkedCount = node.children.filter((c) => checkState.get(c.key) === true).length
    const someInd = node.children.some((c) => indeterminateState.has(c.key))
    if (checkedCount === node.children.length) {
      checkState.set(node.key, true)
      indeterminateState.delete(node.key)
    } else if (checkedCount === 0 && !someInd) {
      checkState.delete(node.key)
      indeterminateState.delete(node.key)
    } else {
      checkState.set(node.key, false)
      indeterminateState.add(node.key)
    }
    const parent = findParent(node.key)
    if (parent) updateNodeCheckState(parent)
  }

  function getAllCheckedKeys(): (string | number)[] {
    const r: (string | number)[] = []
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (checkState.get(n.key) === true) r.push(n.key)
        if (n.children) walk(n.children)
      }
    }
    walk(props.data)
    return r
  }

  // 使用 composable 的 toggleExpand
  function toggleExpand(key: string | number) {
    // 懒加载：展开时若无 children 且非 isLeaf，触发 load 事件
    if (props.lazy && !treeFlatten.isExpanded(key)) {
      const node = findNode(props.data, key)
      if (node && !node.children?.length && !node.isLeaf) {
        emit('load', node)
      }
    }
    treeFlatten.toggleExpand(key)
  }

  function findNode(nodes: TreeNode[], key: string | number): TreeNode | null {
    for (const n of nodes) {
      if (n.key === key) return n
      if (n.children) {
        const f = findNode(n.children, key)
        if (f) return f
      }
    }
    return null
  }

  function toggleCheck(node: TreeNode, checked: boolean) {
    if (node.disabled) return
    function setDescendants(n: TreeNode, val: boolean) {
      checkState.set(n.key, val)
      indeterminateState.delete(n.key)
      if (n.children) for (const c of n.children) setDescendants(c, val)
    }
    setDescendants(node, checked)
    const parent = findParent(node.key)
    if (parent) updateNodeCheckState(parent)
    emit('check-change', getAllCheckedKeys(), node)
  }

  function handleNodeClick(node: TreeNode) {
    if (node.disabled) return
    if (props.selectable) emit('update:selectedKey', node.key)
    else if (node.children?.length) toggleExpand(node.key)
    emit('node-click', node)
  }

  // ---- 键盘导航（WAI-ARIA tree 模式：roving tabindex + 方向键） ----
  const focusKey = ref<string | number | null>(props.selectedKey ?? props.data[0]?.key ?? null)
  function handleKeydown(e: KeyboardEvent, node: TreeNode): void {
    const visible = treeFlatten.flatNodes.value
    const idx = visible.findIndex((n) => n.node.key === node.key)
    const move = (delta: number): void => {
      e.preventDefault()
      const next = visible[idx + delta]
      if (next) {
        focusKey.value = next.node.key
        // 可选中模式：键盘移动即改变选中（与点击语义一致）
        if (state.selectable) emit('update:selectedKey', next.node.key)
        emit('node-click', next.node)
        focusNode(next.node.key)
      }
    }
    switch (e.key) {
      case 'ArrowDown':
        move(1)
        break
      case 'ArrowUp':
        move(-1)
        break
      case 'ArrowRight':
        if (node.children?.length) {
          e.preventDefault()
          if (!treeFlatten.expandKeys.value.has(node.key)) toggleExpand(node.key)
        }
        break
      case 'ArrowLeft':
        if (node.children?.length && treeFlatten.expandKeys.value.has(node.key)) {
          e.preventDefault()
          treeFlatten.toggleExpand(node.key)
        }
        break
      case 'Enter':
        e.preventDefault()
        handleNodeClick(node)
        break
      case ' ':
        // 焦点在勾选框上时交给原生 checkbox，避免与这里重复切换
        if (e.target !== e.currentTarget) break
        e.preventDefault()
        if (state.checkable && !node.disabled) {
          state.toggleCheck(node, state.checkState.get(node.key) !== true)
        } else {
          handleNodeClick(node)
        }
        break
    }
  }

  const selectedKeyRef = computed(() => props.selectedKey ?? null)

  state = {
    // 使用函数始终读取 treeFlatten.expandKeys.value 的最新值，
    // 避免 toggleExpand 重新赋值新 Set 后旧引用看到过期状态
    isExpanded: (key: string | number) => treeFlatten.expandKeys.value.has(key),
    checkState,
    indeterminateState,
    checkable: props.checkable,
    selectable: props.selectable,
    selectedKeyRef,
    focusKey,
    toggleExpand,
    toggleCheck,
    handleNodeClick,
    handleKeydown,
  }

  provide(TREE_KEY, state)

  watch(
    () => props.expandAll,
    (v) => {
      if (v) {
        treeFlatten.expandAll()
      } else {
        treeFlatten.collapseAll()
      }
    },
  )
  watch(
    () => props.defaultExpandedKeys,
    (keys) => {
      if (!props.expandAll) {
        treeFlatten.expandKeys.value = new Set(keys)
      }
    },
  )
} else {
  state = injected!
}

function isChecked(key: string | number) {
  return state.checkState.get(key) === true
}
function isIndeterminate(key: string | number) {
  return state.indeterminateState.has(key)
}
function isExpanded(key: string | number) {
  return state.isExpanded(key)
}

// 层级深度系统（对齐 AccordionNav 的视觉层次）
// 字号: 14px × 0.85^(level)，下限 10px  透明度: 1 - 0.12 × level，下限 0.4
const levelStyle = computed(() => {
  const fontSize = `${Math.max(10, 14 * Math.pow(0.85, props.level))}px`
  const opacity = Math.max(0.4, 1 - 0.12 * props.level)
  const paddingLeft = `calc(${props.level} * var(--space-4))`
  return { fontSize, opacity, paddingLeft }
})
</script>

<template>
  <div v-if="data.length" ref="treeRootRef" class="tree" role="tree">
    <!--
      role="none"：v-for 的包裹层对无障碍树不可见。role="tree" 的 required children 是
      treeitem / group，若这层 div 保持默认 generic 角色，axe 判 aria-required-children。
      加 role="none" 后 tree 直接看见内部的 treeitem（包一层只是布局需要）。
    -->
    <!--
      role="treeitem" 放在 v-for 的外层 wrapper 上：role="tree" 的 required owned elements
      是 treeitem / group，若中间隔着一层 generic div，axe 判 aria-required-children
      （role="none" 的包装层并不能让 axe 满意）。wrapper 本就要包 Transition，
      由它承担 treeitem 角色正好零额外 DOM；内层 .tree-node 改 role="none" 纯布局。
    -->
    <div
      v-for="node in data"
      :key="node.key"
      class="tree-node-wrapper"
      role="treeitem"
      :data-key="node.key"
      :aria-expanded="node.children?.length ? state.isExpanded(node.key) : undefined"
      :aria-selected="state.selectable ? state.selectedKeyRef.value === node.key : undefined"
      :aria-checked="
        state.checkable
          ? isChecked(node.key)
            ? 'true'
            : isIndeterminate(node.key)
              ? 'mixed'
              : 'false'
          : undefined
      "
      :aria-label="node.label"
      :tabindex="state.focusKey.value === node.key ? 0 : -1"
      @click="state.handleNodeClick(node)"
      @keydown="state.handleKeydown($event, node)"
    >
      <div
        class="tree-node"
        :class="{
          'tree-node--selected': state.selectable && state.selectedKeyRef.value === node.key,
          'tree-node--disabled': node.disabled,
          'tree-node--has-children': node.children?.length,
        }"
        :style="levelStyle"
        role="none"
      >
        <!-- 展开箭头（对齐 AccordionNav: 右指→下转） -->
        <span
          v-if="node.children?.length"
          class="tree-arrow"
          :class="{ 'tree-arrow--expanded': isExpanded(node.key) }"
          @click.stop="state.toggleExpand(node.key)"
          ><IconSvg type="chevron-right" size="sm"
        /></span>
        <span v-else class="tree-arrow tree-arrow--spacer" />

        <!-- 勾选框 -->
        <label v-if="state.checkable" class="tree-check" :aria-label="node.label" @click.stop>
          <input
            type="checkbox"
            class="tree-check-input"
            :class="{ 'tree-check-input--indeterminate': isIndeterminate(node.key) }"
            :checked="isChecked(node.key)"
            :indeterminate="isIndeterminate(node.key)"
            :disabled="node.disabled"
            @change="state.toggleCheck(node, ($event.target as HTMLInputElement).checked)"
          /><span class="tree-check-box" />
        </label>

        <!-- 图标 -->
        <IconSvg v-if="node.icon" :type="node.icon" size="sm" class="tree-node-icon" />

        <!-- 标签 -->
        <span class="tree-node-label" :title="node.label">{{ node.label }}</span>
      </div>

      <!-- 子级（v-if 按需渲染 + 过渡动画），最大递归深度 15 防止栈溢出 -->
      <Transition name="tree-slide">
        <div
          v-if="node.children?.length && isExpanded(node.key) && props.level < 15"
          class="tree-children"
          role="group"
        >
          <Tree :data="node.children" :level="props.level + 1" />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.tree-node-wrapper {
  overflow: hidden;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
  min-height: clamp(28px, 4.5vw, 34px);
  user-select: none;
  position: relative;
}
.tree-node:hover {
  background: var(--color-bg-alt);
}
.tree-node--selected {
  background: var(--color-primary-light);
  color: var(--color-primary);
}
.tree-node--selected:hover {
  background: var(--color-primary-light);
}
.tree-node--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 激活指示条（对齐 AccordionNav 的 ::before 左色条） */
.tree-node--selected::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
}

/* 展开箭头：右指 → 展开时下转（对齐 AccordionNav 语义） */
.tree-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(18px, 3vw, 24px);
  height: clamp(18px, 3vw, 24px);
  color: var(--color-text-muted);
  transition: transform var(--transition-normal);
  flex-shrink: 0;
}
.tree-arrow--expanded {
  transform: rotate(90deg);
}
.tree-arrow--spacer {
  visibility: hidden;
}

/* 勾选框（圆角对齐项目 --radius-sm） */
.tree-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(18px, 3vw, 24px);
  height: clamp(18px, 3vw, 24px);
  flex-shrink: 0;
  cursor: pointer;
}
.tree-check-input {
  /* 视觉隐藏但保留可聚焦（display:none 会让勾选框彻底退出 Tab 序，键盘用户无法勾选） */
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.tree-check-input:focus-visible + .tree-check-box {
  outline: 2px solid var(--color-primary);
  outline-offset: 1px;
}
.tree-check-box {
  width: clamp(14px, 2.2vw, 16px);
  height: clamp(14px, 2.2vw, 16px);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  position: relative;
}
.tree-check-input:checked + .tree-check-box {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.tree-check-input:checked + .tree-check-box::after {
  content: '';
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg) translate(-1px, -1px);
  position: absolute;
  top: 50%;
  left: 50%;
  margin-left: -3px;
  margin-top: -4px;
}
.tree-check-input--indeterminate + .tree-check-box {
  background: var(--color-primary);
  border-color: var(--color-primary);
}
.tree-check-input--indeterminate + .tree-check-box::after {
  content: '';
  width: 8px;
  height: 2px;
  background: #fff;
  border-radius: 1px;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.tree-check-input:disabled + .tree-check-box {
  opacity: 0.4;
  cursor: not-allowed;
}

.tree-node-icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
  width: clamp(16px, 2.5vw, 20px);
  height: clamp(16px, 2.5vw, 20px);
}
.tree-node-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 子级展开收起 */
.tree-children {
  overflow: hidden;
}
.tree-slide-enter-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
  transform-origin: top;
}
.tree-slide-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
  transform-origin: top;
}
.tree-slide-enter-from {
  opacity: 0;
  transform: scaleY(0.95);
}
.tree-slide-leave-to {
  opacity: 0;
  transform: scaleY(0.95);
}
</style>
