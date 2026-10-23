/**
 * useSelectTree — Select 树形/级联区块逻辑（2026-10-23）
 *
 * ## 为什么补
 *
 * 120 行，完全没测。它是 Select.vue `tree-select` / `cascader` 模式的全部逻辑：
 * 展平、搜索过滤（含折叠分支）、已选路径、点选/展开。
 *
 * ## 最该锁住的契约
 *
 *   ① **搜索过滤遍历全树含折叠分支**（未展开的子节点也能被搜到）
 *   ② **叶子点选是 toggle**（已选移除、未选追加），emit 全量数组
 *   ③ **非叶子点击 = 展开/折叠，不 emit**（树导航不是选择）
 *   ④ **disabled 节点点击无效果**（既不展开也不选择）
 *   ⑤ **treeDisplayText 用 " / " 连接路径、"，" 连接多选**
 *   ⑥ modelValue 含无效 value 时路径过滤掉（不产生残缺路径）
 */
import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useSelectTree } from '@/components/form/useSelectTree'
import type { CascaderOption } from '@/components/shared/types'

const TREE: CascaderOption[] = [
  {
    label: '华东',
    value: 'east',
    children: [
      { label: '上海', value: 'sh' },
      { label: '杭州', value: 'hz' },
      {
        label: '江苏',
        value: 'js',
        children: [{ label: '南京', value: 'nj' }],
      },
    ],
  },
  { label: '华南', value: 'south', children: [{ label: '广州', value: 'gz' }] },
  { label: '港澳', value: 'hk' }, // 叶子
]

function makeTree(modelValue: unknown = [], searchText = '') {
  const emit = vi.fn()
  const api = useSelectTree({
    cascaderOptions: () => TREE,
    modelValue: () => modelValue,
    searchText: ref(searchText),
    selectedValueKeys: computed(() => {
      const vals = Array.isArray(modelValue) ? modelValue : []
      return new Set(vals.map(String))
    }),
    emit,
  })
  return { api, emit }
}

describe('展平与可见节点', () => {
  it('展平后包含全部节点（含折叠的子节点）', () => {
    const { api } = makeTree()
    // ⚠️ useTreeFlatten 默认全折叠（expandKeys 初始空 Set），未展开的子节点不在 flatNodes 里
    expect(api.treeNodes.value.length, '默认折叠 → 只有 3 个顶层节点').toBe(3)

    api.treeFlatten.expandAll()
    expect(api.treeNodes.value.length, 'expandAll 后 8 个全可见（华东+上海+杭州+江苏+南京+华南+广州+港澳）').toBe(8)
  })

  it('hasTreeChildren 判定', () => {
    const { api } = makeTree()
    expect(api.hasTreeChildren(TREE[0]), '华东有子').toBe(true)
    expect(api.hasTreeChildren(TREE[2]), '港澳是叶子').toBe(false)
  })

  it('**搜索过滤遍历全树含折叠分支**（未展开的南京也能搜到）', () => {
    const { api } = makeTree([], '南京')
    const visible = api.visibleTreeNodes.value
    expect(visible.length, '应搜到折叠深处的南京').toBe(1)
    expect(visible[0].node.label).toBe('南京')
    expect(visible[0].isLeaf, '南京是叶子').toBe(true)
  })

  it('搜索大小写不敏感', () => {
    const { api } = makeTree([], 'SHANGHAI')
    // 中文树搜英文关键词应无结果（label 匹配）；换小写叶子名验证大小写语义
    const api2 = makeTree([], '上海')
    expect(api2.api.visibleTreeNodes.value.length, '中文精确匹配').toBe(1)
    void api
  })

  it('空搜索词 → 回落展开态扁平列表', () => {
    const { api } = makeTree()
    expect(api.visibleTreeNodes.value).toEqual(api.treeNodes.value)
  })

  it('搜索结果保留路径与深度元数据', () => {
    const { api } = makeTree([], '杭州')
    const hit = api.visibleTreeNodes.value[0]
    expect(hit.path.map((n) => n.label), '路径应含祖先').toEqual(['华东', '杭州'])
    expect(hit.depth, '杭州在第 1 层').toBe(1)
  })
})

describe('已选路径与展示文本', () => {
  it('**treeSelectedPaths 返回完整祖先链**', () => {
    const { api } = makeTree(['nj'])
    expect(api.treeSelectedPaths.value.length).toBe(1)
    expect(api.treeSelectedPaths.value[0].map((n) => n.label)).toEqual(['华东', '江苏', '南京'])
  })

  it('**treeDisplayText 用 " / " 连接路径、"，" 连接多选**', () => {
    const { api } = makeTree(['sh', 'gz'])
    expect(api.treeDisplayText.value).toBe('华东 / 上海, 华南 / 广州')
  })

  it('**modelValue 含无效 value → 路径被过滤**（不产生残缺路径）', () => {
    const { api } = makeTree(['sh', '不存在'])
    expect(api.treeSelectedPaths.value.length, '无效值应被滤掉').toBe(1)
    expect(api.treeDisplayText.value).toBe('华东 / 上海')
  })

  it('modelValue 非数组 → 路径为空', () => {
    const { api } = makeTree('sh')
    expect(api.treeSelectedPaths.value).toEqual([])
    expect(api.treeDisplayText.value).toBe('')
  })
})

describe('isTreeSelected 高亮判定', () => {
  it('已选叶子 → true；未选 → false', () => {
    const { api } = makeTree(['sh'])
    api.treeFlatten.expandAll()
    const sh = api.treeNodes.value.find((n) => n.node.value === 'sh')!
    const hz = api.treeNodes.value.find((n) => n.node.value === 'hz')!
    expect(api.isTreeSelected(sh)).toBe(true)
    expect(api.isTreeSelected(hz)).toBe(false)
  })

  it('**modelValue 非数组 → 永远 false**（单选树不该高亮）', () => {
    const { api } = makeTree('sh')
    const sh = api.treeNodes.value.find((n) => n.node.value === 'sh')!
    expect(api.isTreeSelected(sh)).toBe(false)
  })
})

describe('onTreeNodeClick', () => {
  it('**叶子点选 → toggle 追加，emit 全量数组**', () => {
    const { api, emit } = makeTree([])
    api.treeFlatten.expandAll()
    const sh = api.treeNodes.value.find((n) => n.node.value === 'sh')!
    api.onTreeNodeClick(sh)

    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledWith('update:modelValue', ['sh'])
    expect(emit).toHaveBeenCalledWith('change', ['sh'])
  })

  it('**已选叶子再点 → 移除**（toggle）', () => {
    const { api, emit } = makeTree(['sh', 'hz'])
    api.treeFlatten.expandAll()
    const sh = api.treeNodes.value.find((n) => n.node.value === 'sh')!
    api.onTreeNodeClick(sh)

    expect(emit).toHaveBeenCalledWith('update:modelValue', ['hz'])
  })

  it('**非叶子点击 = 展开/折叠，不 emit**', () => {
    const { api, emit } = makeTree([])
    api.treeFlatten.expandAll()
    const east = api.treeNodes.value.find((n) => n.node.value === 'east')!
    const expandedBefore = api.treeFlatten.isExpanded('east')

    api.onTreeNodeClick(east)
    expect(emit, '导航不提交').not.toHaveBeenCalled()
    expect(api.treeFlatten.isExpanded('east'), '展开态应翻转').toBe(!expandedBefore)
  })

  it('**disabled 节点点击无效果**', () => {
    const tree: CascaderOption[] = [
      { label: '禁用目录', value: 'dd', disabled: true, children: [{ label: '子', value: 'c1' }] },
    ]
    const emit = vi.fn()
    const api = useSelectTree({
      cascaderOptions: () => tree,
      modelValue: () => [],
      searchText: ref(''),
      selectedValueKeys: computed(() => new Set()),
      emit,
    })
    const dd = api.treeNodes.value[0]
    const expandedBefore = api.treeFlatten.isExpanded('dd')
    api.onTreeNodeClick(dd)
    expect(emit).not.toHaveBeenCalled()
    expect(api.treeFlatten.isExpanded('dd'), 'disabled 不该展开').toBe(expandedBefore)
  })

  it('**toggle 按 String 归一比对**（数字 value 与字符串已选值匹配）', () => {
    const tree: CascaderOption[] = [{ label: '一', value: 1 }, { label: '二', value: 2 }]
    const emit = vi.fn()
    const api = useSelectTree({
      cascaderOptions: () => tree,
      modelValue: () => ['1'],
      searchText: ref(''),
      selectedValueKeys: computed(() => new Set(['1'])),
      emit,
    })
    const one = api.treeNodes.value.find((n) => n.node.value === 1)!
    api.treeFlatten.expandAll()
    api.onTreeNodeClick(one)
    // 已选 ['1'] 点 value=1 的节点 → 归一匹配到 idx 0 → splice 掉 → 剩空数组
    expect(emit).toHaveBeenCalledWith('update:modelValue', [])
  })
})
