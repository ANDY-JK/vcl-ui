// 设计器字段 key 唯一性护栏 + toFormSchema 条件值口径
// 锁定四件事：
//   1. key-utils 纯函数：collectFieldKeys 含容器子字段 / uniquifyFieldKey 追加 _2 递增
//   2. updateNode 统一闸口：重复 key 与空 key 拒绝（提示 + 其余属性照常），原值原样放行
//   3. 复制/粘贴/标签联动：cloneNode 子字段 key 一并去重、连贴不撞 key、
//      中文标签不再产出中文 key（\w+ 以外保持自动 key，联动公式 {{key}} 才不会断）
//   4. toFormSchema 条件值原样下发为字符串（强转数字曾致选项值 '1' × equals 1 永不匹配）
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useDesignerOps, type DesignerOpsHost } from '@/components/form-builder/designer/useDesignerOps'
import { collectFieldKeys, uniquifyFieldKey } from '@/components/form-builder/designer/key-utils'
import { createField, toFormSchema, type DesignerNode } from '@/components/form-builder/designer/types'

function makeHost(initial: DesignerNode[]) {
  let current = initial
  const tips: string[] = []
  const selectedId = ref<string | null>(null)
  const selectedIds = ref<Set<string>>(new Set())
  const host: DesignerOpsHost = {
    nodes: () => current,
    meta: () => ({}),
    patch: (list) => {
      current = list
    },
    patchAll: (list) => {
      current = list
    },
    selectedId,
    selectedIds,
    showTip: (m) => tips.push(m),
  }
  return { host, tips, keys: () => collectFieldKeys(current).values() }
}

describe('key-utils 纯函数', () => {
  it('collectFieldKeys 收集容器子字段 key', () => {
    const card = { ...createField('card', 1), children: [createField('text', 1), createField('text', 2)] }
    const used = collectFieldKeys([card])
    expect(used.has('field1')).toBe(true)
    expect(used.has('field2')).toBe(true)
  })

  it('uniquifyFieldKey：空闲原样、被占用追加 _2/_3 递增', () => {
    const used = new Set(['a', 'a_2', 'a_3'])
    expect(uniquifyFieldKey('b', used)).toBe('b')
    expect(uniquifyFieldKey('a', used)).toBe('a_4')
    expect(uniquifyFieldKey('', used)).toBe('')
  })
})

describe('useDesignerOps · key 唯一性闸口', () => {
  it('updateNode 重复 key：拒绝并提示，同补丁其余属性照常写入', () => {
    const a = createField('text', 1) // key=field1
    const b = createField('text', 2) // key=field2
    const { host, tips } = makeHost([a, b])
    const ops = useDesignerOps(host)
    ops.updateNode(b.id, { key: 'field1', placeholder: '冲突时的占位' })
    expect(tips.length).toBe(1)
    const tree = host.nodes()
    expect(tree[1]!.key).toBe('field2')
    expect(tree[1]!.placeholder).toBe('冲突时的占位')
  })

  it('updateNode 空 key：拒绝并提示', () => {
    const a = createField('text', 1)
    const { host, tips } = makeHost([a])
    const ops = useDesignerOps(host)
    ops.updateNode(a.id, { key: '   ' })
    expect(tips.length).toBe(1)
    expect(host.nodes()[0]!.key).toBe('field1')
  })

  it('updateNode 原值原样与全新 key：正常放行', () => {
    const a = createField('text', 1)
    const { host, tips } = makeHost([a])
    const ops = useDesignerOps(host)
    ops.updateNode(a.id, { key: 'field1' })
    expect(tips.length).toBe(0)
    ops.updateNode(a.id, { key: 'customer_name' })
    expect(tips.length).toBe(0)
    expect(host.nodes()[0]!.key).toBe('customer_name')
  })

  it('onLabelChange：ASCII 标签同步进 key，中文标签保持自动 key，冲突不抢', () => {
    const a = createField('text', 1)
    const b = createField('text', 2)
    const { host } = makeHost([a, b])
    const ops = useDesignerOps(host)
    // 中文标签：不再产出中文 key（联动公式 {{key}} 只认 \w+）
    ops.onLabelChange(a.id, '姓名')
    expect(host.nodes()[0]!.key).toBe('field1')
    expect(host.nodes()[0]!.label).toBe('姓名')
    // ASCII 标签：key 跟随标签
    ops.onLabelChange(a.id, 'name')
    expect(host.nodes()[0]!.key).toBe('name')
    // 与其它字段冲突：不抢，保持原 key
    ops.onLabelChange(a.id, 'field2')
    expect(host.nodes()[0]!.key).toBe('name')
  })

  it('duplicateNode 复制带子字段的容器：子字段 key 一并去重', () => {
    const card: DesignerNode = {
      ...createField('card', 1),
      children: [createField('text', 1), createField('text', 2)],
    }
    const { host } = makeHost([card])
    const ops = useDesignerOps(host)
    ops.duplicateNode(card.id)
    const tree = host.nodes()
    expect(tree.length).toBe(2)
    const copy = tree[1]!
    expect(copy.key).toBeUndefined() // 容器节点无 key（createField 只给字段节点分配）
    const copyChildKeys = (copy.children ?? []).map((c) => c.key)
    expect(copyChildKeys).toEqual(['field1_copy', 'field2_copy'])
    // 原树 key 未被污染
    expect(tree[0]!.key).toBeUndefined() // 容器节点无 key
    expect((tree[0]!.children ?? []).map((c) => c.key)).toEqual(['field1', 'field2'])
  })

  it('pasteNode 连贴两次：第二次不再产出相同 key', () => {
    const a = createField('text', 1)
    const { host } = makeHost([a])
    const ops = useDesignerOps(host)
    ops.copyNode(a.id)
    ops.pasteNode(a.id)
    ops.pasteNode(host.nodes()[host.nodes().length - 1]!.id)
    const keys = host.nodes().map((n) => n.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(['field1', 'field1_copy', 'field1_copy_2'])
  })
})

describe('toFormSchema · 条件值原样下发', () => {
  it('visibleWhenValue "1" 保持字符串（强转数字曾致选项值 "1" 永不匹配）', () => {
    const trigger = { ...createField('select', 1), options: ['1', '2'] }
    const target = { ...createField('text', 2), visibleWhenField: 'field1', visibleWhenValue: '1' }
    const schema = toFormSchema([trigger, target], {})
    const vf = schema.fields.find((f) => f.key === 'field2')!
    expect(vf.visibleWhen).toEqual({ field: 'field1', equals: '1' })
  })
})
