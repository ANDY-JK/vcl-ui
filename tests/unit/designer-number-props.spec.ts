// 设计器数字属性 → schema 下发 & 清空语义锁定
// 背景：清空数字输入会落成 0，maxLength=0 下发成 maxlength="0" 直接锁死输入框。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { toFormSchema } from '@/components/form-builder/designer/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'
import PropsPanel from '@/components/form-builder/designer/PropsPanel.vue'

function node(extra: Partial<DesignerNode> = {}): DesignerNode {
  return { id: 'n1', type: 'text', label: '姓名', key: 'name', ...extra } as DesignerNode
}

describe('toFormSchema · maxLength', () => {
  it('maxLength = 0 不下发 maxlength（否则输入框锁死无法输入）', () => {
    const schema = toFormSchema([node({ maxLength: 0 })])
    expect(schema.fields[0].props?.maxlength).toBeUndefined()
  })

  it('maxLength > 0 正常下发', () => {
    const schema = toFormSchema([node({ maxLength: 10 })])
    expect(schema.fields[0].props?.maxlength).toBe(10)
  })

  it('maxLength 未设置不下发', () => {
    const schema = toFormSchema([node()])
    expect(schema.fields[0].props?.maxlength).toBeUndefined()
  })
})

describe('PropsPanel · 数字输入清空', () => {
  it('清空最大长度 → emit undefined（不再落成 0）', async () => {
    const w = mount(PropsPanel, { props: { node: node({ maxLength: 10 }) } })
    // text 节点下唯一的数字输入（inputmode=decimal）就是最大长度
    const input = w.find('input[inputmode="decimal"]')
    await input.setValue('')
    const patch = w.emitted('update')!.at(-1)![0] as Record<string, unknown>
    expect('maxLength' in patch).toBe(true)
    expect(patch.maxLength).toBeUndefined()
  })

  it('输入数字 → emit 数值', async () => {
    const w = mount(PropsPanel, { props: { node: node() } })
    const input = w.find('input[inputmode="decimal"]')
    await input.setValue('20')
    expect((w.emitted('update')!.at(-1)![0] as Record<string, unknown>).maxLength).toBe(20)
  })
})
