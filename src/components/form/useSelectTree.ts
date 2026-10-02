/**
 * useSelectTree — Select 树形/级联（tree-select / cascader）区块逻辑
 * （自 Select.vue 下沉，M3 持续拆分；对齐 useSelectOption/useSelectFiltering 的依赖注入约定）
 *
 * 承接：treeFlatten（展平 + 展开态）、treeNodes / visibleTreeNodes（搜索过滤）、
 * treeSelectedPaths / treeDisplayText（已选路径与展示文本）、isTreeSelected（高亮判定）、
 * onTreeNodeClick（点选/展开）、hasTreeChildren。
 * 依赖面收窄：cascaderOptions/modelValue 取 getter 形态（宿主重渲染时读最新值，不快照过期）；
 * searchText 为组合块高频共读，由宿主注入；selectedValueKeys 供 isTreeSelected 查表，
 * 由宿主经 useSelectOption 取得后传入；emit 走注入。
 * 纯数据遍历（collectTreeMatches）与路径查找（findTreePath）独立为模块级函数。
 * 类型本地化（不反向 import Select.vue，避免循环依赖）。
 */
import { computed } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { useTreeFlatten, type FlattenNode } from '@/components/_internal/useTreeFlatten'
import type { CascaderOption } from '@/components/shared/types'

/** 树形多选提交值（SelectModelValue 的多选子集，不反向 import 主文件） */
type TreeModelValue = (string | number)[]

/** 按关键字收集全树匹配节点（含折叠分支），保留深度/父节点/路径元数据 */
function collectTreeMatches(nodes: CascaderOption[], kw: string): FlattenNode<CascaderOption>[] {
  const out: FlattenNode<CascaderOption>[] = []
  const walk = (ns: CascaderOption[], depth: number, path: CascaderOption[], parent: CascaderOption | null) => {
    for (const n of ns) {
      const p = [...path, n]
      if (String(n.label).toLowerCase().includes(kw)) {
        out.push({ node: n, depth, parent, path: p, isLeaf: !n.children || n.children.length === 0 })
      }
      if (n.children && n.children.length > 0) walk(n.children, depth + 1, p, n)
    }
  }
  walk(nodes, 0, [], null)
  return out
}

/** 从树根定位 value 的完整路径（value 缺失时返回 null） */
function findTreePath(nodes: CascaderOption[], value: string | number): CascaderOption[] | null {
  for (const node of nodes) {
    if (String(node.value) === String(value)) return [node]
    if (node.children) {
      const sub = findTreePath(node.children, value)
      if (sub) return [node, ...sub]
    }
  }
  return null
}

export function useSelectTree(o: {
  /** 级联选项（getter：宿主重渲染/更新时读最新 props.cascaderOptions） */
  cascaderOptions: () => CascaderOption[] | undefined
  /** 当前模型值（getter；tree 多选为 TreeModelValue） */
  modelValue: () => unknown
  /** 搜索文本（组合块高频共读同一 ref，由宿主注入） */
  searchText: Ref<string>
  /** 多选值索引（宿主经 useSelectOption 取得后传入，供 isTreeSelected 查表） */
  selectedValueKeys: ComputedRef<Set<string> | null>
  /** emit：树选提交（update:modelValue + change，载荷为 TreeModelValue） */
  emit: (event: 'update:modelValue' | 'change', value: TreeModelValue) => void
}) {
  const treeFlatten = useTreeFlatten<CascaderOption>({
    data: () => o.cascaderOptions() || [],
    childrenKey: 'children',
    keyExtractor: (n) => n.value,
  })
  const treeNodes = computed(() => treeFlatten.flatNodes.value)

  /** tree-select 搜索：searchText 非空时按 label 过滤（遍历全树含折叠分支），空时回落展开态扁平列表 */
  const visibleTreeNodes = computed(() => {
    const kw = o.searchText.value.trim().toLowerCase()
    if (!kw) return treeNodes.value
    return collectTreeMatches(o.cascaderOptions() || [], kw)
  })

  const treeSelectedPaths = computed((): CascaderOption[][] => {
    const vals = Array.isArray(o.modelValue()) ? (o.modelValue() as TreeModelValue) : []
    return vals
      .map((v) => findTreePath(o.cascaderOptions() || [], v))
      .filter((p): p is CascaderOption[] => !!p && p.length > 0)
  })

  const treeDisplayText = computed(() =>
    treeSelectedPaths.value.map((p) => p.map((n) => n.label).join(' / ')).join(', '),
  )

  function isTreeSelected(flatNode: (typeof visibleTreeNodes.value)[number]): boolean {
    if (!Array.isArray(o.modelValue())) return false
    return o.selectedValueKeys.value?.has(String(flatNode.node.value)) ?? false
  }

  function onTreeNodeClick(flatNode: (typeof visibleTreeNodes.value)[number]) {
    if (flatNode.node.disabled) return
    if (!flatNode.isLeaf) {
      treeFlatten.toggleExpand(flatNode.node.value)
      return
    }
    const vals = [...(Array.isArray(o.modelValue()) ? (o.modelValue() as TreeModelValue) : [])]
    const idx = vals.findIndex((v) => String(v) === String(flatNode.node.value))
    if (idx >= 0) vals.splice(idx, 1)
    else vals.push(flatNode.node.value)
    o.emit('update:modelValue', vals)
    o.emit('change', vals)
  }

  function hasTreeChildren(node: CascaderOption): boolean {
    return !!node.children && node.children.length > 0
  }

  return {
    treeFlatten,
    treeNodes,
    visibleTreeNodes,
    treeSelectedPaths,
    treeDisplayText,
    isTreeSelected,
    onTreeNodeClick,
    hasTreeChildren,
  }
}
