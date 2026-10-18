// toFormSchema：缺 key 的节点不得被静默丢弃
//
// 立案背景（2026-10-17 浏览器实测发现）：
//   在真实浏览器里打开一个「节点带正确 type 但没有 key」的分享码，表单只渲染出标题与
//   提交/重置按钮，**字段凭空消失且控制台零警告**。差分对照证明与 type 无关：
//     · 有 key + 未知 type → 正常渲染（走兜底控件）
//     · 无 key + 正确 type → 静默丢失
//   根因：`to-schema.ts` 的 `if (!f.key && !isLayout) continue` 让紧随其后的
//   `key: f.key ?? f.id` 兜底成了死代码。
//
// 这条对「要部署到服务器 / 接入宿主项目」的低代码平台尤其要紧：分享码与导入的 JSON
// 都来自外部，静默丢字段等于用户拿到一份空白表单却不知道发生了什么。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { toFormSchema } from '@/components/form-builder/designer/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function node(over: Partial<DesignerNode>): DesignerNode {
  return { id: 'n1', type: 'text', label: '字段', ...over } as DesignerNode
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('toFormSchema · 缺 key 的节点不再静默消失', () => {
  it('无 key 但有 id → 用 id 兜底成数据键，字段仍然渲染', () => {
    const schema = toFormSchema([node({ id: 'n1_abc', type: 'text', label: '姓名' })] as DesignerNode[], {})
    expect(schema.fields).toHaveLength(1)
    expect(schema.fields[0].key).toBe('n1_abc')
    expect(schema.fields[0].label).toBe('姓名')
  })

  it('无 key 时给出可观测的告警（不再无声）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    toFormSchema([node({ id: 'n2_xyz', type: 'text', label: '城市' })] as DesignerNode[], {})
    const said = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(said).toMatch(/缺 key|数据键/)
  })

  it('既无 key 也无 id 的畸形节点：跳过，但必须出声', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const broken = { type: 'text', label: '畸形' } as unknown as DesignerNode
    const schema = toFormSchema([broken], {})
    expect(schema.fields).toHaveLength(0)
    const said = warn.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(said).toMatch(/既无 key 也无 id|已跳过/)
  })

  it('布局元素（divider/title/paragraph）本来就不需要 key，不受影响', () => {
    const schema = toFormSchema(
      [node({ id: 'd1', type: 'divider', label: '' }), node({ id: 't1', type: 'title', label: '标题' })] as DesignerNode[],
      {},
    )
    expect(schema.fields).toHaveLength(2)
  })

  it('有 key 的节点行为不变（回归保护）', () => {
    const schema = toFormSchema([node({ id: 'n1', type: 'text', label: '正常', key: 'my_key' })] as DesignerNode[], {})
    expect(schema.fields).toHaveLength(1)
    expect(schema.fields[0].key).toBe('my_key')
  })
})
