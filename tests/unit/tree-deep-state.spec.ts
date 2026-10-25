/**
 * Tree.vue 深水区 —— 勾选级联重建 / 懒加载 / 点击语义 / 键盘左右与 Enter / expandAll 监听 / 层级上限
 *
 * ## 为什么补（单文件口径 语句 74% / 分支 65.2% / 函数 86.7%，46/215 行未覆盖）
 *
 * 既有四个 spec 把「勾选级联（点击路径）」「方向键上下」「无障碍角色」「大纲树」测住了，
 * 未覆盖的恰好是**最容易被重构删掉的那些分支**：
 *
 * ① **`initCheckChild`（L155-157）**：父节点声明 `checked:true` 时整棵子树继承 —— 一行没测。
 * ② **`data` 的 deep watch 重建块（L174-188）**：`parentMap` 重建、**剪掉已删节点的勾选残留**
 *    （源码注释：防 Map 无限增长阻碍 GC）、异步到达的 `checked` 重新生效。整块零覆盖 ——
 *    而注释明确写着「此前仅 onMounted 执行一次，后到的 checked 永不生效」，说明这是修过的 bug。
 * ③ **懒加载 `emit('load')`（L222-228）**：`lazy && 未展开 && 无 children && !isLeaf` 四重条件。
 * ④ **`findNode`（L232-241）**：懒加载要找节点对象，整函数未覆盖。
 * ⑤ **点击三分支（L256-260）**：`disabled` 早退 / `selectable` 发选中 / 否则有子节点就展开。
 * ⑥ **键盘 ArrowRight/ArrowLeft/Enter/Space-else（L286-311）**：只有上下键被测过。
 *    左右键是「展开/收起」的唯一键盘入口，Enter 是「键盘等价于点鼠标」。
 * ⑦ **`expandAll` 与 `defaultExpandedKeys` 两个 watch（L335-352）**：动态改 prop 的路径。
 * ⑧ **递归深度上限 `props.level < 15`（L450）**：防栈溢出的闸门。
 * ⑨ **`updateNodeCheckState` 的三个分支（L190-206）**：全选→父勾、部分→半选、全不选→清除。
 *
 * ## harness
 *
 * 复用既有 spec 的挂载约定（`attachTo: document.body` + 手动 `KeyboardEvent`），
 * 因为 happy-dom 下 `trigger('keydown')` 与真实 `dispatchEvent` 在 `event.target` 语义上不同
 * —— L304 的「焦点在 checkbox 上就别重复切换」正需要真实 target/currentTarget 关系。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import Tree from '@/components/data/Tree.vue'

type AnyNode = Record<string, unknown>

const mounted: Array<{ unmount: () => void }> = []

function mountTree(props: Record<string, unknown> = {}) {
  const w = mount(Tree, {
    props: { data: [], ...props },
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

function wrappers(w: ReturnType<typeof mountTree>) {
  return w.findAll('.tree-node-wrapper')
}
function wrapperByKey(w: ReturnType<typeof mountTree>, key: string | number) {
  return wrappers(w).find((x) => (x.element as HTMLElement).dataset.key === String(key))!
}
function checkedInput(w: ReturnType<typeof mountTree>, key: string | number) {
  return wrapperByKey(w, key).find<HTMLInputElement>('.tree-check-input')
}

function keydown(el: Element, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

/** 两层树：p 有 c1/c2 两个子节点 */
function twoLevel(): AnyNode[] {
  return [
    {
      key: 'p',
      label: '父',
      children: [
        { key: 'c1', label: '子一' },
        { key: 'c2', label: '子二' },
      ],
    },
  ]
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

/* ═══════════ ① 勾选状态的初始化与级联重建 ═══════════ */

describe('勾选初始化', () => {
  it('**父节点声明 checked:true → 整棵子树继承**（initCheckChild）', async () => {
    const w = mountTree({
      checkable: true,
      expandAll: true,
      data: [{ key: 'p', label: '父', checked: true, children: [{ key: 'c1', label: 'a' }, { key: 'c2', label: 'b' }] }],
    })
    await nextTick()
    expect(checkedInput(w, 'p').element.checked, '父已勾').toBe(true)
    expect(checkedInput(w, 'c1').element.checked, '子一继承').toBe(true)
    expect(checkedInput(w, 'c2').element.checked, '子二继承').toBe(true)
  })

  it('**父节点声明 checked:false → 子树全部不勾**', async () => {
    const w = mountTree({
      checkable: true,
      expandAll: true,
      data: [{ key: 'p', label: '父', checked: false, children: [{ key: 'c1', label: 'a' }] }],
    })
    await nextTick()
    expect(checkedInput(w, 'p').element.checked).toBe(false)
    expect(checkedInput(w, 'c1').element.checked).toBe(false)
  })

  it('**未声明 checked 的树 → 全不勾、无半选**', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    expect(checkedInput(w, 'p').element.checked).toBe(false)
    expect(checkedInput(w, 'c1').element.checked).toBe(false)
    expect(checkedInput(w, 'p').element.indeterminate, '无半选').toBe(false)
  })

  it('**三层树：声明在中间层 → 只影响该层及其后代**', async () => {
    const data = [
      {
        key: 'r',
        label: '根',
        children: [
          {
            key: 'mid',
            label: '中',
            checked: true,
            children: [{ key: 'leaf', label: '叶' }],
          },
        ],
      },
    ]
    const w = mountTree({ checkable: true, expandAll: true, data })
    await nextTick()
    expect(checkedInput(w, 'leaf').element.checked, '后代继承').toBe(true)
    expect(checkedInput(w, 'r').element.checked, '祖先由子推导').toBe(true)
  })
})

describe('updateNodeCheckState 三分支', () => {
  it('**全部子勾选 → 父变已勾**', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    await checkedInput(w, 'c2').setValue(true)
    expect(checkedInput(w, 'p').element.checked, '父被推导为已勾').toBe(true)
    expect(wrapperByKey(w, 'p').find('.tree-check-input').attributes('indeterminate'), '不再是半选').toBeUndefined()
  })

  it('**部分勾选 → 父半选（mixed）**', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    expect(checkedInput(w, 'p').element.checked, '父未全勾').toBe(false)
    // ⚠️ indeterminate 是 DOM **property**，happy-dom 不把它反射成 attribute
    // （attributes('indeterminate') 恒 null），必须读 .indeterminate
    expect(checkedInput(w, 'p').element.indeterminate, '父半选').toBe(true)
    expect(wrapperByKey(w, 'p').attributes('aria-checked'), '无障碍侧也同步').toBe('mixed')
  })

  it('**勾满后再取消一个 → 父回到半选**', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    await checkedInput(w, 'c2').setValue(true)
    await checkedInput(w, 'c2').setValue(false)
    expect(checkedInput(w, 'p').element.indeterminate, '回到半选').toBe(true)
  })

  it('**全部取消 → 父状态被清除（既非勾选也非半选）**', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    await checkedInput(w, 'c1').setValue(false)
    expect(checkedInput(w, 'p').element.checked).toBe(false)
    expect(checkedInput(w, 'p').element.indeterminate, '半选也清掉').toBe(false)
  })
})

describe('data 深层变化重建', () => {
  it('**异步到达的 checked 会重新生效**（此前只在 onMounted 跑一次）', async () => {
    const data = reactive<AnyNode[]>([{ key: 'x', label: '待加载' }])
    const w = mountTree({ checkable: true, expandAll: true, data })
    await nextTick()
    expect(checkedInput(w, 'x').element.checked).toBe(false)

    data[0] = { key: 'x', label: '待加载', checked: true }
    await nextTick()
    expect(checkedInput(w, 'x').element.checked, '后到的 checked 生效').toBe(true)
  })

  it('**节点被删除后其勾选残留被剪掉**（防 Map 无限增长 + 不污染 check-change 载荷）', async () => {
    const data = reactive<AnyNode[]>([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ])
    const w = mountTree({ checkable: true, data })
    await nextTick()
    await checkedInput(w, 'a').setValue(true)
    // 删掉 a，再勾 b —— 载荷里不应再出现已不存在的 a
    data.splice(0, 1)
    await nextTick()
    await checkedInput(w, 'b').setValue(true)
    const payload = w.emitted('check-change')!.at(-1)![0] as Array<string | number>
    expect(payload, '不含已删除节点').toEqual(['b'])
  })

  it('**替换成新树后 parentMap 重建，勾选仍能级联到新父**', async () => {
    const w = mountTree({ checkable: true, data: [{ key: 'old', label: '旧' }] })
    await nextTick()
    // expandAll 的 watch 只在 prop 自身变化时触发，换 data 不会重跑 ——
    // 真实用法就是「换数据源 + 同时给 defaultExpandedKeys」
    await w.setProps({
      data: [
        {
          key: 'n',
          label: '新',
          children: [{ key: 'n1', label: '子1' }, { key: 'n2', label: '子2' }],
        },
      ],
      defaultExpandedKeys: ['n'],
    })
    await nextTick()
    await nextTick()
    await checkedInput(w, 'n1').setValue(true)
    await checkedInput(w, 'n2').setValue(true)
    expect(checkedInput(w, 'n').element.checked, '新父被推导').toBe(true)
  })
})

/* ═══════════ ② 懒加载 ═══════════ */

describe('懒加载 load 事件', () => {
  it('**lazy + 无 children：箭头是 spacer，点击/键盘都到不了 toggleExpand**（load 不可达）', async () => {
    const w = mountTree({ lazy: true, data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    // 无 children → 模板渲染 .tree-arrow--spacer，没有任何点击处理器
    const arrow = wrapperByKey(w, 'a').find('.tree-arrow')
    expect(arrow.classes(), '是占位箭头').toContain('tree-arrow--spacer')
    await arrow.trigger('click')
    keydown(wrapperByKey(w, 'a').element, 'ArrowRight')
    await nextTick()
    expect(w.emitted('load'), '两条入口都在 children 判断处被挡下').toBeFalsy()
    expect(wrapperByKey(w, 'a').attributes('aria-expanded'), '无 children 不暴露展开态').toBeUndefined()
  })

  it('**isLeaf:true 的节点不触发 load**', async () => {
    const w = mountTree({ lazy: true, data: [{ key: 'a', label: 'A', isLeaf: true }] })
    await nextTick()
    // 叶子没有箭头，直接对 wrapper 触发键盘/点击也不该 load
    await wrapperByKey(w, 'a').trigger('click')
    expect(w.emitted('load')).toBeFalsy()
  })

  it('**已有 children 的节点展开不触发 load**（本地数据够用）', async () => {
    const w = mountTree({ lazy: true, data: twoLevel() })
    await nextTick()
    await wrapperByKey(w, 'p').find('.tree-arrow').trigger('click')
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '确实展开了').toBe('true')
    expect(w.emitted('load'), '本地已有子节点，无需远程加载').toBeFalsy()
  })

  it('**未开启 lazy → 不触发 load**', async () => {
    const w = mountTree({ data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    await wrapperByKey(w, 'a').trigger('click')
    expect(w.emitted('load')).toBeFalsy()
  })

  it('**已展开的有 children 节点：再点箭头是收起，不触发 load**', async () => {
    const w = mountTree({ lazy: true, defaultExpandedKeys: ['p'], data: twoLevel() })
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '初始已展开').toBe('true')
    await wrapperByKey(w, 'p').find('.tree-arrow').trigger('click')
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '已收起').toBe('false')
    expect(w.emitted('load'), '收起不该请求数据').toBeFalsy()
  })
})

/* ═══════════ ③ 点击语义三分支 ═══════════ */

describe('点击语义', () => {
  it('**disabled 节点点击：不发任何事件**', async () => {
    const w = mountTree({ selectable: true, data: [{ key: 'a', label: 'A', disabled: true }] })
    await nextTick()
    await wrapperByKey(w, 'a').trigger('click')
    expect(w.emitted('node-click'), '禁用节点不响应').toBeFalsy()
    expect(w.emitted('update:selectedKey')).toBeFalsy()
  })

  it('**selectable 模式：点击发 update:selectedKey + node-click**', async () => {
    const w = mountTree({ selectable: true, data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    await wrapperByKey(w, 'a').trigger('click')
    expect(w.emitted('update:selectedKey')![0]![0]).toBe('a')
    expect((w.emitted('node-click')![0]![0] as AnyNode).key).toBe('a')
  })

  it('**非 selectable 且有子节点：点击即展开**（不是选中）', async () => {
    const w = mountTree({ data: twoLevel() })
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '初始收起').toBe('false')
    await wrapperByKey(w, 'p').trigger('click')
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '点击后展开').toBe('true')
    expect(w.emitted('update:selectedKey'), '非 selectable 不发选中').toBeFalsy()
    expect(w.emitted('node-click'), '但仍发 node-click').toBeTruthy()
  })

  it('**selectable 与 children 同时存在：点击只选中，不展开**（选中优先于展开）', async () => {
    const w = mountTree({ selectable: true, data: twoLevel() })
    await nextTick()
    await wrapperByKey(w, 'p').trigger('click')
    await nextTick()
    expect(w.emitted('update:selectedKey')![0]![0], '发选中').toBe('p')
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '不展开').toBe('false')
  })

  it('**非 selectable 的叶子节点：只发 node-click，不展开**', async () => {
    const w = mountTree({ data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    await wrapperByKey(w, 'a').trigger('click')
    expect(w.emitted('node-click')).toBeTruthy()
    expect(wrapperByKey(w, 'a').attributes('aria-expanded'), '叶子没有展开态').toBeUndefined()
  })
})

/* ═══════════ ④ 键盘：左右 / Enter / Space-else ═══════════ */

describe('键盘左右与 Enter', () => {
  it('**ArrowRight 展开有子节点的节点**', async () => {
    const w = mountTree({ data: twoLevel() })
    await nextTick()
    keydown(wrapperByKey(w, 'p').element, 'ArrowRight')
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded')).toBe('true')
  })

  it('**ArrowRight 对已展开节点幂等**（不重复展开、不抛）', async () => {
    const w = mountTree({ expandAll: true, data: twoLevel() })
    await nextTick()
    expect(() => keydown(wrapperByKey(w, 'p').element, 'ArrowRight')).not.toThrow()
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded')).toBe('true')
  })

  it('**ArrowLeft 收起已展开节点**', async () => {
    const w = mountTree({ expandAll: true, data: twoLevel() })
    await nextTick()
    keydown(wrapperByKey(w, 'p').element, 'ArrowLeft')
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded')).toBe('false')
  })

  it('**ArrowLeft 对已收起节点无副作用**', async () => {
    const w = mountTree({ data: twoLevel() })
    await nextTick()
    keydown(wrapperByKey(w, 'p').element, 'ArrowLeft')
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded')).toBe('false')
  })

  it('**叶子节点 ArrowRight/ArrowLeft 不动**（没有可展开的东西）', async () => {
    const w = mountTree({ data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    keydown(wrapperByKey(w, 'a').element, 'ArrowRight')
    keydown(wrapperByKey(w, 'a').element, 'ArrowLeft')
    await nextTick()
    expect(wrapperByKey(w, 'a').attributes('aria-expanded')).toBeUndefined()
  })

  it('**Enter 等价于点击**（键盘用户可选中）', async () => {
    const w = mountTree({ selectable: true, data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    keydown(wrapperByKey(w, 'a').element, 'Enter')
    await nextTick()
    expect(w.emitted('update:selectedKey')![0]![0]).toBe('a')
    expect(w.emitted('node-click')).toBeTruthy()
  })

  it('**Space 在非勾选模式等价于点击**', async () => {
    const w = mountTree({ selectable: true, data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    keydown(wrapperByKey(w, 'a').element, ' ')
    await nextTick()
    expect(w.emitted('update:selectedKey')![0]![0]).toBe('a')
  })

  it('**Space 在勾选模式切换勾选并上报 check-change**', async () => {
    const w = mountTree({ checkable: true, data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    keydown(wrapperByKey(w, 'a').element, ' ')
    await nextTick()
    expect(checkedInput(w, 'a').element.checked, '被勾上').toBe(true)
    expect(w.emitted('check-change')![0]![0]).toEqual(['a'])
  })

  it('**焦点在 checkbox 上按 Space：交给原生，不重复切换**', async () => {
    const w = mountTree({ checkable: true, data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    const input = checkedInput(w, 'a')
    // target = input、currentTarget = wrapper → 树不应插手
    keydown(input.element, ' ')
    await nextTick()
    expect(w.emitted('check-change'), '未代原生处理').toBeFalsy()
    expect(input.element.checked, '也没被树改').toBe(false)
  })

  it('**可选中模式下方向键移动同时改变选中**（与点击语义一致）', async () => {
    const w = mountTree({
      selectable: true,
      data: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    })
    await nextTick()
    keydown(wrapperByKey(w, 'a').element, 'ArrowDown')
    await nextTick()
    expect(w.emitted('update:selectedKey')!.at(-1)![0]).toBe('b')
  })
})

/* ═══════════ ⑤ expandAll / defaultExpandedKeys 两个 watch ═══════════ */

describe('展开状态的 prop 监听', () => {
  it('**expandAll 由 false 改 true → 全部展开**', async () => {
    const w = mountTree({ data: twoLevel() })
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '初始收起').toBe('false')
    await w.setProps({ expandAll: true })
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '改为全展开').toBe('true')
  })

  it('**expandAll 由 true 改 false → 全部收起**', async () => {
    const w = mountTree({ expandAll: true, data: twoLevel() })
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded')).toBe('true')
    await w.setProps({ expandAll: false })
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '改为全收起').toBe('false')
  })

  it('**defaultExpandedKeys 变化 → 按新集合展开**', async () => {
    const w = mountTree({ data: twoLevel() })
    await nextTick()
    await w.setProps({ defaultExpandedKeys: ['p'] })
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded')).toBe('true')
  })

  it('**expandAll 为 true 时 defaultExpandedKeys 变化被忽略**（否则两个 prop 打架）', async () => {
    const w = mountTree({ expandAll: true, data: twoLevel() })
    await nextTick()
    // 先手动收起（expandAll 仍是 true，但内部已收起）
    await wrapperByKey(w, 'p').find('.tree-arrow').trigger('click')
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '已手动收起').toBe('false')
    await w.setProps({ defaultExpandedKeys: [] })
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '不该因 defaultExpandedKeys 被重新展开').toBe('false')
  })
})

/* ═══════════ ⑥ 递归深度上限 ═══════════ */

describe('递归深度上限', () => {
  it('**level 达到 15 → 不再渲染子级**（防栈溢出）', async () => {
    const w = mountTree({
      level: 15,
      expandAll: true,
      data: [{ key: 'p', label: 'P', children: [{ key: 'c', label: 'C' }] }],
    })
    await nextTick()
    expect(wrappers(w).some((x) => (x.element as HTMLElement).dataset.key === 'p'), '本层渲染').toBe(true)
    expect(wrappers(w).some((x) => (x.element as HTMLElement).dataset.key === 'c'), '子级被截断').toBe(false)
  })

  it('**level 14 仍渲染子级**（边界不算超限）', async () => {
    const w = mountTree({
      level: 14,
      expandAll: true,
      data: [{ key: 'p', label: 'P', children: [{ key: 'c', label: 'C' }] }],
    })
    await nextTick()
    expect(wrappers(w).some((x) => (x.element as HTMLElement).dataset.key === 'c'), '子级正常渲染').toBe(true)
  })

  it('**深层级节点不透明度递减且有 0.4 下限**（levelStyle 的 opacity 分支）', () => {
    const w0 = mountTree({ level: 0, data: [{ key: 'a', label: 'A' }] })
    const w20 = mountTree({ level: 20, data: [{ key: 'a', label: 'A' }] })
    const style0 = (w0.find('.tree-node').element as HTMLElement).getAttribute('style') ?? ''
    const style20 = (w20.find('.tree-node').element as HTMLElement).getAttribute('style') ?? ''
    // ⚠️ happy-dom 不做 calc()/var() 求值，fontSize 与 paddingLeft 在 style 里解析失败被丢弃，
    // 只有不透明度的纯数值能读出来 —— 所以这里只断言 opacity 边界（字号公式只能靠只读推导）
    expect(style0, 'level 0 不透明度 1').toContain('opacity: 1')
    expect(style20, 'level 20 触底 0.4').toContain('opacity: 0.4')
  })
})

/* ═══════════ ⑦ 深层勾选继承 / 剪枝 / 焦点 / 边界 ═══════════ */

describe('深层继承与剪枝', () => {
  it('**三层树：父 checked:true 要一路继承到孙节点**（initCheckChild 的递归）', async () => {
    const w = mountTree({
      checkable: true,
      expandAll: true,
      data: [
        {
          key: 'p',
          label: '父',
          checked: true,
          children: [
            {
              key: 'c',
              label: '子',
              children: [{ key: 'g', label: '孙' }],
            },
          ],
        },
      ],
    })
    await nextTick()
    expect(checkedInput(w, 'c').element.checked, '子继承').toBe(true)
    expect(checkedInput(w, 'g').element.checked, '孙也继承（递归到位）').toBe(true)
  })

  it('**半选残留被剪掉**：删掉造成半选的那个子节点后再触发一次 data 变化', async () => {
    const data = reactive<AnyNode[]>([
      {
        key: 'p',
        label: '父',
        children: [
          { key: 'c1', label: '一' },
          { key: 'c2', label: '二' },
        ],
      },
    ])
    const w = mountTree({ checkable: true, expandAll: true, data })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    expect(checkedInput(w, 'p').element.indeterminate, '父此刻半选').toBe(true)

    // 把已勾的 c1 删掉 → p 不再半选；indeterminateState 里的 'p' 必须被剪掉
    ;(data[0].children as AnyNode[]).splice(0, 1)
    await nextTick()
    await nextTick()
    expect(checkedInput(w, 'p').element.indeterminate, '半选残留已清除').toBe(false)
    expect(wrapperByKey(w, 'p').attributes('aria-checked'), '无障碍侧一致').toBe('false')
  })

  it('**删掉被勾选的子节点后：父不再半选**（否则旧 key 让 refreshParentStates 算出 someInd）', async () => {
    const data = reactive<AnyNode[]>([
      {
        key: 'p',
        label: '父',
        children: [
          { key: 'c1', label: '一' },
          { key: 'c2', label: '二' },
        ],
      },
      { key: 'solo', label: '独立' },
    ])
    const w = mountTree({ checkable: true, expandAll: true, data })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    await checkedInput(w, 'solo').setValue(true)
    expect(checkedInput(w, 'p').element.indeterminate, '前置：父半选').toBe(true)

    // 删掉被勾的 c1 —— 若不剪 checkState，'c1' 残留会让 someInd 为真 → 父仍是半选
    ;(data[0].children as AnyNode[]).splice(0, 1)
    await nextTick()
    await nextTick()
    expect(checkedInput(w, 'p').element.indeterminate, '父不再是半选').toBe(false)
    expect(wrapperByKey(w, 'p').attributes('aria-checked'), '无障碍侧同步').not.toBe('mixed')
    // 独立节点仍保持已勾（剪枝只删已消失的键，不能误伤活着的）
    expect(checkedInput(w, 'solo').element.checked, '活节点勾选未被误伤').toBe(true)
  })
})

describe('焦点与边界', () => {
  it('**键盘移动时节点对象被移除 → 不抛错**（focusNode 内查 DOM 可空）', async () => {
    const data = reactive<AnyNode[]>([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
    ])
    const w = mountTree({ selectable: true, data })
    await nextTick()
    // 先让 b 成为焦点，再删掉 b，然后从 a 按 ArrowDown（目标已被移除）
    ;(w.findAll('.tree-node-wrapper')[1].element as HTMLElement).focus()
    data.splice(1, 1)
    await nextTick()
    expect(() => keydown(wrapperByKey(w, 'a').element, 'ArrowDown')).not.toThrow()
    await nextTick()
    expect(w.emitted('node-click'), '没有下一个节点就不发').toBeFalsy()
  })

  it('**最后一个节点按 ArrowDown / 第一个按 ArrowUp：不越界不发事件**', async () => {
    const w = mountTree({
      selectable: true,
      data: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    })
    await nextTick()
    keydown(wrapperByKey(w, 'b').element, 'ArrowDown')
    await nextTick()
    expect(w.emitted('node-click'), '已到末尾').toBeFalsy()
    keydown(wrapperByKey(w, 'a').element, 'ArrowUp')
    await nextTick()
    expect(w.emitted('node-click'), '已到开头').toBeFalsy()
  })

  it('**数据为空数组时不渲染 tree 根**（v-if="data.length"）', () => {
    const w = mountTree({ data: [] })
    expect(w.find('.tree').exists(), '空数据无根节点').toBe(false)
    expect(w.findAll('.tree-node-wrapper')).toHaveLength(0)
  })

  it('**节点带 icon 渲染图标，不带则不渲染**', async () => {
    const w = mountTree({
      data: [
        { key: 'a', label: '有图标', icon: 'folder' },
        { key: 'b', label: '无图标' },
      ],
    })
    await nextTick()
    expect(wrapperByKey(w, 'a').find('.tree-node-icon').exists(), '有 icon').toBe(true)
    expect(wrapperByKey(w, 'b').find('.tree-node-icon').exists(), '无 icon').toBe(false)
  })

  it('**selectedKey 传 null 时焦点落在第一个节点**（roving tabindex 初值）', async () => {
    const w = mountTree({
      data: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    })
    await nextTick()
    expect(wrapperByKey(w, 'a').attributes('tabindex'), '首个可 Tab 进入').toBe('0')
    expect(wrapperByKey(w, 'b').attributes('tabindex')).toBe('-1')
  })

  it('**selectedKey 指定时焦点落在该节点**', async () => {
    const w = mountTree({
      selectedKey: 'b',
      data: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    })
    await nextTick()
    expect(wrapperByKey(w, 'b').attributes('tabindex')).toBe('0')
    expect(wrapperByKey(w, 'a').attributes('tabindex')).toBe('-1')
  })

  it('**树里只有一个节点时上下键都不动**', async () => {
    const w = mountTree({ selectable: true, data: [{ key: 'a', label: 'A' }] })
    await nextTick()
    keydown(wrapperByKey(w, 'a').element, 'ArrowDown')
    keydown(wrapperByKey(w, 'a').element, 'ArrowUp')
    await nextTick()
    expect(w.emitted('node-click')).toBeFalsy()
  })
})

describe('负向对照挖出的加固点', () => {
  it('**checked:false 也要继承给后代**（判据是 !== undefined，不是 === true）', async () => {
    const w = mountTree({
      checkable: true,
      expandAll: true,
      data: [
        {
          key: 'p',
          label: '父',
          checked: false,
          children: [{ key: 'c1', label: '一', checked: true }, { key: 'c2', label: '二' }],
        },
      ],
    })
    await nextTick()
    // 子节点原本 checked:true，但父声明 false 必须把它压成 false
    expect(checkedInput(w, 'c1').element.checked, '父 false 覆盖子 true').toBe(false)
    expect(checkedInput(w, 'c2').element.checked).toBe(false)
  })

  it('**三层：勾满两个孙节点 → 中间层与根都被推导为已勾**（向上递归两跳）', async () => {
    const w = mountTree({
      checkable: true,
      expandAll: true,
      data: [
        {
          key: 'root',
          label: '根',
          children: [
            {
              key: 'mid',
              label: '中',
              children: [{ key: 'g1', label: '孙1' }, { key: 'g2', label: '孙2' }],
            },
          ],
        },
      ],
    })
    await nextTick()
    await checkedInput(w, 'g1').setValue(true)
    await checkedInput(w, 'g2').setValue(true)
    expect(checkedInput(w, 'mid').element.checked, '中间层被推导').toBe(true)
    expect(checkedInput(w, 'root').element.checked, '根也被推导（递归两跳）').toBe(true)
  })

  it('**勾父节点 → 全部后代被级联勾上**（toggleCheck 的 setDescendants）', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    await checkedInput(w, 'p').setValue(true)
    expect(checkedInput(w, 'c1').element.checked, '子一被级联').toBe(true)
    expect(checkedInput(w, 'c2').element.checked, '子二被级联').toBe(true)
  })

  it('**取消父节点 → 后代全部取消，且半选残留清掉**', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    expect(checkedInput(w, 'p').element.indeterminate, '前置：父半选').toBe(true)
    await checkedInput(w, 'p').setValue(true)
    await checkedInput(w, 'p').setValue(false)
    expect(checkedInput(w, 'c1').element.checked, '子一被取消').toBe(false)
    expect(checkedInput(w, 'c2').element.checked).toBe(false)
    expect(checkedInput(w, 'p').element.indeterminate, '半选也清掉').toBe(false)
  })

  it('**check-change 载荷是全量已勾键，不是单个键**', async () => {
    const w = mountTree({ checkable: true, expandAll: true, data: twoLevel() })
    await nextTick()
    await checkedInput(w, 'c1').setValue(true)
    await checkedInput(w, 'c2').setValue(true)
    const payload = w.emitted('check-change')!.at(-1)![0] as Array<string | number>
    expect([...payload].sort(), '含父与两个子').toEqual(['c1', 'c2', 'p'])
  })

  it('**disabled 的勾选框被程序改值 → 树拒绝变更**（toggleCheck 的 disabled 早退）', async () => {
    const w = mountTree({
      checkable: true,
      data: [{ key: 'a', label: 'A', disabled: true }],
    })
    await nextTick()
    const input = checkedInput(w, 'a')
    // happy-dom 不拦程序化赋值 + 手动派发 change（真浏览器里 disabled 元素根本点不动），
    // 这正好是驱动 L244 早退的唯一路径
    input.element.checked = true
    input.element.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(w.emitted('check-change'), '禁用节点不产生勾选事件').toBeFalsy()
    expect(wrapperByKey(w, 'a').attributes('aria-checked'), '内部状态未变').toBe('false')
    expect(w.find('.tree-node').classes(), '渲染 disabled 类').toContain('tree-node--disabled')
  })

  it('**方向键移动后真实 DOM 焦点跟着走**（不是只改 tabindex）', async () => {
    const w = mountTree({
      data: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    })
    await nextTick()
    const first = wrapperByKey(w, 'a').element as HTMLElement
    first.focus()
    expect(document.activeElement, '前置：焦点在 a').toBe(first)
    keydown(first, 'ArrowDown')
    await nextTick()
    await nextTick()
    expect(document.activeElement, '焦点已移到 b').toBe(wrapperByKey(w, 'b').element)
    expect(wrapperByKey(w, 'b').attributes('tabindex'), 'roving tabindex 同步').toBe('0')
  })

  it('**方向键移动会发 node-click**（携带下一个节点）', async () => {
    const w = mountTree({
      data: [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
    })
    await nextTick()
    keydown(wrapperByKey(w, 'a').element, 'ArrowDown')
    await nextTick()
    expect((w.emitted('node-click')![0]![0] as AnyNode).key).toBe('b')
  })

  it('**expandAll 为 true 时手动收起，改 defaultExpandedKeys 也不能把它重新展开**', async () => {
    const w = mountTree({ expandAll: true, data: twoLevel() })
    await nextTick()
    await wrapperByKey(w, 'p').find('.tree-arrow').trigger('click')
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '前置：已收起').toBe('false')
    await w.setProps({ defaultExpandedKeys: ['p'] })
    await nextTick()
    expect(wrapperByKey(w, 'p').attributes('aria-expanded'), '受 expandAll 保护').toBe('false')
  })
})
