// 验证 toFormSchema 与"手写 map"的差异（2026-10-21）
//
// ## 为什么要专门测这个
//
// 我在 FormDesignerDemo 里第一版**手写了一遍设计态→渲染态转换**：
// `nodes.filter(n => n.key).map(...)`。看着"就是挑字段"，实际漏了三件事。
// 后来发现库里早就有公开的 `toFormSchema`。
//
// 这条测试把它钉死：**容器里的字段必须带 container 归属，不能被扁平化**。
// 这样以后谁再手写一遍 map，跑测试就会红。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { toFormSchema } from '@/components/form-builder/designer/types/to-schema'
import type { DesignerNode } from '@/components/form-builder/designer/types'

// 「缺 key 兜底」这条用例**故意**构造了会触发 reportWarn 的节点，
// 而 reportWarn 会打 console.warn —— 那会被 console-noise 棘轮判成"出现新类别告警"
// （实测整链第 16 步因此红过）。这里静默掉，因为该告警正是被测行为本身。
let warnSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warnSpy.mockRestore()
})

describe('toFormSchema · 容器结构不能丢', () => {
  it('card 容器里的字段带 container 归属（手写扁平 map 会丢掉它）', () => {
    const nodes = [
      {
        id: 'card1',
        type: 'card',
        label: '客户信息',
        children: [{ id: 'f1', key: 'name', type: 'input', label: '姓名', containerSlot: 0 }],
      },
    ] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, { title: '测试' })

    expect(schema.fields, '应转换出 1 个字段').toHaveLength(1)
    expect(schema.fields![0].key, '字段 key 保留').toBe('name')
    // 关键：容器归属必须在。手写的 `nodes.filter(...).map(...)` 是扁平的，
    // 拿不到 children，这个断言会直接失败
    expect(schema.fields![0].container, 'container 归属不能丢').toBeTruthy()
  })

  it('tabs 容器的多槽位字段各自带正确 slot', () => {
    const nodes = [
      {
        id: 'tabs1',
        type: 'tabs',
        label: '分页',
        children: [
          { id: 'f1', key: 'a', type: 'input', label: 'A', containerSlot: 0 },
          { id: 'f2', key: 'b', type: 'input', label: 'B', containerSlot: 1 },
        ],
      },
    ] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    expect(schema.fields, '两个槽位应各出一个字段').toHaveLength(2)
    const slots = schema.fields!.map((f) => f.container?.slot).sort()
    expect(slots, 'slot 应分别为 0 / 1').toEqual([0, 1])
  })
})

describe('toFormSchema · 缺 key 的兜底', () => {
  it('节点缺 key 但有 id → 退化用 id，不丢字段', () => {
    // 手写 filter(n => n.key) 会把这种节点**直接丢掉且不提示**，
    // 表现为"导入外部 schema 后字段凭空消失"
    const nodes = [{ id: 'node-x', type: 'input', label: '无 key 字段' }] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    expect(schema.fields, '缺 key 不该丢字段').toHaveLength(1)
    expect(schema.fields![0].key, '应退化用 id').toBe('node-x')
  })
})

describe('toFormSchema · 展示类节点', () => {
  it('divider 仍保留在 fields 里（供渲染），但不要求 key', () => {
    // ⚠️ 我第一版断言"divider 不该出现在 fields 里"——**错了**。
    // `isLayoutField` 的用途是「跳过 '非布局节点必须有无 key' 的校验」，
    // 不是「把布局节点排除出 fields」。divider/title 要渲染出来，必须在 fields 里。
    // 它们不进提交数据是由 `FormBuilder` 收集可见数据时按类型过滤的，不是这里删掉。
    const nodes = [
      { id: 'd1', type: 'divider', label: '' },
      { id: 'f1', key: 'name', type: 'input', label: '姓名' },
    ] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    expect(schema.fields, 'divider 与 input 都应在 fields 里').toHaveLength(2)

    const divider = schema.fields!.find((f) => f.type === 'divider')
    expect(divider, 'divider 应保留').toBeTruthy()
    // 关键：divider 没有 key 也不该被丢弃（isLayout 免除了 key 校验）
    expect(divider!.key, 'divider 无 key 也不该被跳过').toBeTruthy()

    const input = schema.fields!.find((f) => f.key === 'name')
    expect(input, '真实输入字段应在').toBeTruthy()
  })
})
