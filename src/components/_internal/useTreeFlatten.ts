/**
 * useTreeFlatten — 树形数据展平
 * 提供将树形结构展平为一维列表、展开/收起、关键词筛选等能力
 *
 * 用法：
 *   const { flatNodes, expandKeys, toggleExpand, isExpanded, expandAll, collapseAll, filterByKeyword } = useTreeFlatten({ data: () => treeData })
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'

export interface UseTreeFlattenOptions<T> {
  /** 树形数据源 */
  data: () => T[]
  /** 子节点字段名，默认 'children' */
  childrenKey?: string
  /** 节点唯一键字段名，默认 'key' */
  keyExtractor?: (node: T) => string | number
}

export interface FlattenNode<T> {
  /** 原始节点 */
  node: T
  /** 层级深度（0 = 根） */
  depth: number
  /** 父节点（根节点为 null） */
  parent: T | null
  /** 是否叶子节点 */
  isLeaf: boolean
  /** 从根到当前节点的路径（含自身） */
  path: T[]
}

export interface UseTreeFlattenReturn<T> {
  /** 展平后的可见节点列表（只含已展开的分支） */
  flatNodes: ComputedRef<FlattenNode<T>[]>
  /** 当前展开的节点 key 集合 */
  expandKeys: Ref<Set<string | number>>
  /** 切换节点展开/收起 */
  toggleExpand: (key: string | number) => void
  /** 判断节点是否展开 */
  isExpanded: (key: string | number) => boolean
  /** 展开所有节点 */
  expandAll: () => void
  /** 收起所有节点 */
  collapseAll: () => void
  /** 按关键词筛选节点（返回匹配的节点列表，含祖先路径） */
  filterByKeyword: (keyword: string, labelKey?: string) => FlattenNode<T>[]
}

/**
 * 从树中收集所有节点 key
 */
function collectAllKeys<T>(nodes: T[], childrenKey: string, keyFn: (node: T) => string | number): (string | number)[] {
  const keys: (string | number)[] = []
  for (const n of nodes) {
    keys.push(keyFn(n))
    const children = (n as Record<string, unknown>)[childrenKey] as T[] | undefined
    if (children?.length) {
      keys.push(...collectAllKeys(children, childrenKey, keyFn))
    }
  }
  return keys
}

/**
 * 展平树为一维列表（仅展开的分支）
 */
function flattenTree<T>(
  nodes: T[],
  childrenKey: string,
  keyFn: (node: T) => string | number,
  expandKeys: Set<string | number>,
  depth: number = 0,
  parent: T | null = null,
  parentPath: T[] = [],
): FlattenNode<T>[] {
  const result: FlattenNode<T>[] = []
  for (const node of nodes) {
    const children = (node as Record<string, unknown>)[childrenKey] as T[] | undefined
    const isLeaf = !children?.length
    const path = [...parentPath, node]
    result.push({ node, depth, parent, isLeaf, path })
    if (!isLeaf && expandKeys.has(keyFn(node))) {
      result.push(...flattenTree(children, childrenKey, keyFn, expandKeys, depth + 1, node, path))
    }
  }
  return result
}

export function useTreeFlatten<T>(options: UseTreeFlattenOptions<T>): UseTreeFlattenReturn<T> {
  const childrenKey = options.childrenKey ?? 'children'
  const keyFn = options.keyExtractor ?? ((n: T) => (n as Record<string, unknown>)['key'] as string | number)

  const expandKeys = ref<Set<string | number>>(new Set())

  const flatNodes = computed<FlattenNode<T>[]>(() =>
    flattenTree(options.data(), childrenKey, keyFn, expandKeys.value, 0, null, []),
  )

  function toggleExpand(key: string | number) {
    if (expandKeys.value.has(key)) {
      expandKeys.value.delete(key)
    } else {
      expandKeys.value.add(key)
    }
    // 触发响应式更新
    expandKeys.value = new Set(expandKeys.value)
  }

  function isExpanded(key: string | number): boolean {
    return expandKeys.value.has(key)
  }

  function expandAll() {
    expandKeys.value = new Set(collectAllKeys(options.data(), childrenKey, keyFn))
  }

  function collapseAll() {
    expandKeys.value = new Set()
  }

  function filterByKeyword(keyword: string, labelKey: string = 'label'): FlattenNode<T>[] {
    if (!keyword.trim()) return flatNodes.value
    const lower = keyword.toLowerCase()
    const source = options.data()
    const matched: FlattenNode<T>[] = []
    const matchedKeys = new Set<string | number>()

    function walk(nodes: T[], depth: number, parent: T | null, parentPath: T[]) {
      for (const node of nodes) {
        const children = (node as Record<string, unknown>)[childrenKey] as T[] | undefined
        const isLeaf = !children?.length
        const path = [...parentPath, node]
        const label = String((node as Record<string, unknown>)[labelKey] ?? '')
        if (label.toLowerCase().includes(lower)) {
          matched.push({ node, depth, parent, isLeaf, path })
          matchedKeys.add(keyFn(node))
          // 包含所有祖先
          for (const anc of parentPath) {
            const ancKey = keyFn(anc)
            if (!matchedKeys.has(ancKey)) {
              const ancChildren = (anc as Record<string, unknown>)[childrenKey] as T[] | undefined
              matched.push({
                node: anc,
                depth: 0,
                parent: null,
                isLeaf: !ancChildren?.length,
                path: [],
              })
              matchedKeys.add(ancKey)
            }
          }
        }
        if (children?.length) walk(children, depth + 1, node, path)
      }
    }

    walk(source, 0, null, [])
    return matched
  }

  return {
    flatNodes,
    expandKeys,
    toggleExpand,
    isExpanded,
    expandAll,
    collapseAll,
    filterByKeyword,
  }
}
