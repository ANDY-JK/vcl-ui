// #482：`navData` 按数组引用缓存扁平结果 —— 数组原地变了，缓存不会知道
//
// 症状：`getFlat` 用 `WeakMap<NavNode[], NavNode[]>` 缓存 `flattenNodes(nodes)`。
// 缓存键是**数组引用**，而键里装的是一份"某一刻的扁平快照"。宿主把 navItems 存在
// store 里、用 `push/splice` 原地增删菜单项（这是响应式数组最常见的用法），
// 之后：
//   · `getCurrentLabel('/new-page')` → `''`（面包屑标题消失）
//   · `getPrevNext('/new-page')` → 当自己"不在导航里"，下一页指回第一项
//   · 删掉某项后它仍在扁平列表里 → 上一页/下一页跳到已删除的路由
// 组件是 computed 重算的，值本身没变（引用相同），所以只有缓存内容错。
//
// 结论：默认 `navTree` 是模块常量，缓存它有意义；**外部传入的数组不该按引用缓存**
// （几十个节点的扁平化比重建一份带失效协议的缓存便宜得多）。
import { describe, it, expect } from 'vitest'
import {
  flattenNodes,
  getCategory,
  getCurrentLabel,
  getPrevNext,
  isNodeActive,
  navTree,
  type NavNode,
} from '@/components/layout/utils/navData'

function customTree(): NavNode[] {
  return [
    {
      label: '组一',
      children: [
        { label: '页一', route: '/p1' },
        { label: '页二', route: '/p2' },
      ],
    },
  ]
}

describe('navData · 外部数组原地变更后不能返回陈旧结果（#482）', () => {
  it('原地 push 新节点 → getCurrentLabel 能看到它', () => {
    const nodes = customTree()
    expect(getCurrentLabel('/p1', nodes)).toBe('页一')

    nodes[0].children!.push({ label: '页三', route: '/p3' })
    expect(getCurrentLabel('/p3', nodes), '新加的节点也要能取到标题').toBe('页三')
  })

  it('原地 push 新节点 → getPrevNext 把它排进序列（不是"不在导航里"）', () => {
    const nodes = customTree()
    const before = getPrevNext('/p2', nodes)
    expect(before.next, '末项没有下一页').toBeNull()

    nodes[0].children!.push({ label: '页三', route: '/p3' })
    const nav = getPrevNext('/p2', nodes)
    expect(nav.current?.route).toBe('/p2')
    expect(nav.next?.route, 'p2 的下一页应是新加的 p3').toBe('/p3')
  })

  it('原地 splice 删掉节点 → 它不能再出现在 getPrevNext 的相邻项里', () => {
    const nodes = customTree()
    expect(getPrevNext('/p2', nodes).current?.route).toBe('/p2')

    nodes[0].children!.splice(1, 1) // 删掉 /p2
    const nav = getPrevNext('/p2', nodes)
    expect(nav.current, '已删除的路由不该还认得').toBe(null)
    expect(nav.next?.route, '此时 idx=-1 → 下一页回第一项（既有语义）').toBe('/p1')
  })

  it('原地改 label → 分类名跟着变（同一对象引用）', () => {
    const nodes = customTree()
    expect(getCategory('/p1', nodes)).toBe('组一')
    nodes[0].label = '组一（改名）'
    expect(getCategory('/p1', nodes)).toBe('组一（改名）')
  })

  it('默认 navTree 仍走预计算，结果与 flattenNodes 一致（缓存不能省掉语义）', () => {
    const flat = flattenNodes(navTree)
    expect(flat.length).toBeGreaterThan(0)
    expect(getCurrentLabel(flat[0].route ?? '', navTree)).toBeTruthy()
    expect(getPrevNext(flat[0].route ?? '', navTree).current?.route).toBe(flat[0].route)
  })

  it('两份内容相同但引用不同的数组互不影响（没有跨数组串味）', () => {
    const a = customTree()
    const b = customTree()
    a[0].children!.push({ label: '只在 A', route: '/only-a' })
    expect(getCurrentLabel('/only-a', a)).toBe('只在 A')
    expect(getCurrentLabel('/only-a', b)).toBe('')
  })
})

describe('navData · 分类名与命中判定的深层语义', () => {
  const deepTree = (): NavNode[] => [
    {
      label: '组一',
      children: [
        { label: '页一', route: '/p1' },
        { label: '子组', children: [{ label: '孙页', route: '/g1' }] },
      ],
    },
    {
      label: '组二',
      children: [{ label: '子组二', children: [{ label: '孙页二', route: '/g2' }] }],
    },
  ]

  it('孙层节点：分类名是它的直接父级（不是顶层组）', () => {
    expect(getCategory('/g1', deepTree())).toBe('子组')
  })

  it('孙层节点在第二个顶层组下也能找到（不能只扫第一组）', () => {
    expect(getCategory('/g2', deepTree())).toBe('子组二')
  })

  it('路由既不在导航里 → 分类名空串', () => {
    expect(getCategory('/nope', deepTree())).toBe('')
  })

  it('isNodeActive：叶子按解析后的 path 比、分组任一子级命中即命中、都没有则 false', () => {
    const router = { resolve: (r: string) => ({ path: r }) } as unknown as Parameters<
      typeof isNodeActive
    >[2]
    const [g1, g2] = deepTree()
    expect(isNodeActive(g1.children![0], '/p1', router)).toBe(true)
    expect(isNodeActive(g1.children![0], '/p2', router)).toBe(false)
    expect(isNodeActive(g1, '/g1', router), '分组：孙级命中即命中').toBe(true)
    expect(isNodeActive(g2, '/g1', router)).toBe(false)
    // 无 route 又无 children 的节点 → false（不是抛错）
    expect(isNodeActive({ label: '空节点' }, '/p1', router)).toBe(false)
  })

  it('分组节点自带 route 时按自己的 route 判定（不被子级覆盖）', () => {
    const router = { resolve: (r: string) => ({ path: r }) } as unknown as Parameters<
      typeof isNodeActive
    >[2]
    const node: NavNode = { label: '组', route: '/group', children: [{ label: '页', route: '/p' }] }
    expect(isNodeActive(node, '/group', router)).toBe(true)
    expect(isNodeActive(node, '/p', router), 'route 优先，子级不再参与').toBe(false)
  })
})