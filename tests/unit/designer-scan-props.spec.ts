// scan-code 设计器属性链路锁定
// 覆盖：注册 defaults（PropsPanel 按「key in defaults」显隐编辑行）→ 面板编辑 → toFormSchema 下发。
// 背景：scan-code 上线时 defaults 只有 span，设计器插得了字段却配不了 scanFormats/scanPrefix/scanLength。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropsPanel from '@/components/form-builder/designer/PropsPanel.vue'
import { getFieldDefaults } from '@/components/form-builder/fieldRegistry'
import { toFormSchema } from '@/components/form-builder/designer/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function scanNode(extra: Partial<DesignerNode> = {}): DesignerNode {
  return { id: 'n1', type: 'scan-code', label: '扫码', key: 'code', ...extra } as DesignerNode
}

describe('scan-code 注册 defaults', () => {
  it('含 scanFormats/scanPrefix/scanLength（决定 PropsPanel 编辑行显隐与新节点初值）', () => {
    const d = getFieldDefaults('scan-code')
    expect(d).toHaveProperty('span', 24)
    expect(d).toHaveProperty('scanFormats', 'all')
    expect(d).toHaveProperty('scanPrefix', '')
    expect(d).toHaveProperty('scanLength', undefined)
  })
})

describe('PropsPanel · 扫码属性行', () => {
  it('scanLength 数字输入双向绑定；清空 → update patch 落 undefined', async () => {
    const w = mount(PropsPanel, { props: { node: scanNode({ scanLength: 12 }) } })
    const input = w.find('input[inputmode="decimal"], input[type="number"]')
    expect(input.exists()).toBe(true)
    expect((input.element as HTMLInputElement).value).toBe('12')
    await input.setValue('')
    expect((w.emitted('update')!.at(-1)![0] as Record<string, unknown>).scanLength).toBeUndefined()
  })

  it('scanPrefix 按 node 值回显；编辑 → update patch', async () => {
    const w = mount(PropsPanel, { props: { node: scanNode({ scanPrefix: 'ABC-' }) } })
    const input = w.findAll('input').find((i) => (i.element as HTMLInputElement).value === 'ABC-')
    expect(input).toBeTruthy()
    await input!.setValue('XY-')
    expect((w.emitted('update')!.at(-1)![0] as Record<string, unknown>).scanPrefix).toBe('XY-')
  })
})

describe('toFormSchema · scan-code 下发', () => {
  it('前缀/长度/非 all 格式进 props', () => {
    const schema = toFormSchema([scanNode({ scanFormats: 'qr', scanPrefix: 'ABC-', scanLength: 12 })])
    expect(schema.fields[0].props).toMatchObject({ scanFormats: 'qr', scanPrefix: 'ABC-', scanLength: 12 })
  })

  it('默认值（all/空前缀/空长度）不下发，保持 schema 干净', () => {
    const schema = toFormSchema([scanNode()])
    const props = schema.fields[0].props ?? {}
    expect(props.scanFormats).toBeUndefined()
    expect(props.scanPrefix).toBeUndefined()
    expect(props.scanLength).toBeUndefined()
  })
})
