// PropsDisplaySource：展示类字段的数据源配置面板（业务方：三种模式都要，且要在界面上可配）
//
// 在此之前 `displaySource` 只能改 schema JSON——**普通用户配不了**，等于能力不可用。
// 本文件锁三件事：模式切换、三模式各自的提交、以及两条容易写坏的交互约束。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropsDisplaySource from '@/components/form-builder/designer/PropsDisplaySource.vue'
import PropsDataPage from '@/components/form-builder/designer/PropsDataPage.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

const node = (over: Partial<DesignerNode> = {}): DesignerNode =>
  ({ id: 'n1', type: 'data-table', label: '明细', span: 24, ...over }) as DesignerNode

function mountPanel(over: Partial<DesignerNode> = {}, fieldOptions = [{ label: '明细行', value: 'lines' }]) {
  const w = mount(PropsDisplaySource, { props: { node: node(over), fieldOptions } })
  /** 取最后一次 update 的 displaySource 补丁 */
  const lastPatch = () => {
    const evs = w.emitted('update') as unknown[][] | undefined
    return evs?.length ? (evs[evs.length - 1][0] as { displaySource?: Record<string, unknown> }).displaySource : undefined
  }
  return { w, lastPatch }
}

describe('配置面板 · 挂载条件', () => {
  it('数据源配置只出现在「支持 displaySource 的类型」上（看注册表 defaults）', () => {
    // data-table 的 defaults 里有 displaySource → 面板出现
    const withSource = mount(PropsDataPage, {
      props: { node: node({ type: 'data-table' }), fieldOptions: [] },
    })
    expect(withSource.text()).toContain('数据来源')

    // 普通输入框没有 → 不出现（否则每个字段都多一块无意义的配置区）
    const plain = mount(PropsDataPage, {
      props: { node: node({ type: 'text' }), fieldOptions: [] },
    })
    expect(plain.text()).not.toContain('数据来源')
  })
})

describe('模式切换', () => {
  it('三种模式都在下拉里（静态 / 绑定字段 / 接口）', async () => {
    const { w } = mountPanel()
    const select = w.findComponent({ name: 'Select' })
    const labels = (select.props('options') as { label: string }[]).map((o) => o.label)
    expect(labels).toEqual(['静态配置', '绑定字段', '接口拉取'])
  })

  it('切到「绑定字段」时带上 kind=field，且不残留 api 的字段', async () => {
    const { w, lastPatch } = mountPanel({
      displaySource: { kind: 'api', apiUrl: '/x', dataPath: 'a.b' },
    })
    await w.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'field')
    const patch = lastPatch()
    expect(patch?.kind).toBe('field')
    expect(patch?.apiUrl, '换模式要清掉上一模式的字段，别在 schema 里留半截配置').toBeUndefined()
  })

  it('切到「接口拉取」时带上 kind=api 与默认 GET', async () => {
    const { w, lastPatch } = mountPanel({ displaySource: { kind: 'static', staticData: [] } })
    await w.findComponent({ name: 'Select' }).vm.$emit('update:modelValue', 'api')
    expect(lastPatch()).toMatchObject({ kind: 'api', method: 'GET' })
  })
})

describe('静态模式 · JSON 文本框', () => {
  const textarea = (w: ReturnType<typeof mountPanel>['w']) => w.find('textarea')

  it('合法 JSON → 提交解析后的值', async () => {
    const { w, lastPatch } = mountPanel({ displaySource: { kind: 'static', staticData: [] } })
    await textarea(w).setValue('[{"name":"甲","qty":1}]')
    expect(lastPatch()?.staticData).toEqual([{ name: '甲', qty: 1 }])
  })

  it('非法 JSON → **不提交**并就地提示（否则半截 JSON 会被写进 schema、画布直接白掉）', async () => {
    const { w, lastPatch } = mountPanel({ displaySource: { kind: 'static', staticData: [] } })
    await textarea(w).setValue('[{"name":') // 打到一半
    expect(lastPatch(), '非法输入不得写进 schema').toBeUndefined()
    expect(w.text()).toContain('JSON 格式有误')
  })

  it('清空 → 提交空数组（允许用户清掉数据）', async () => {
    const { w, lastPatch } = mountPanel({ displaySource: { kind: 'static', staticData: [{ a: 1 }] } })
    await textarea(w).setValue('')
    expect(lastPatch()?.staticData).toEqual([])
  })

  it('进入面板时回显当前配置的 JSON', () => {
    const { w } = mountPanel({ displaySource: { kind: 'static', staticData: [{ a: 1 }] } })
    expect(textarea(w).element.value).toContain('"a"')
  })
})

describe('绑定字段模式', () => {
  it('选字段 → 提交 fieldKey', async () => {
    const { w, lastPatch } = mountPanel({ displaySource: { kind: 'field', fieldKey: '' } })
    // 第 0 个 Select 是「数据来源」模式选择器；字段选择器是第 1 个
    await w.findAllComponents({ name: 'Select' })[1].vm.$emit('update:modelValue', 'lines')
    expect(lastPatch()?.fieldKey).toBe('lines')
  })

  it('候选来自传入的 fieldOptions（父级算好的可绑定字段）', () => {
    const { w } = mountPanel({ displaySource: { kind: 'field', fieldKey: '' } }, [
      { label: '明细行', value: 'lines' },
      { label: '备注', value: 'memo' },
    ])
    const opt = w.findAllComponents({ name: 'Select' })[1].props('options') as unknown[]
    expect(opt).toHaveLength(2)
  })
})

describe('接口模式', () => {
  it('地址 / 方法 / 取数路径三项都能改', async () => {
    const { w, lastPatch } = mountPanel({
      displaySource: { kind: 'api', apiUrl: '', method: 'GET', dataPath: '' },
    })
    const inputs = w.findAllComponents({ name: 'Input' })
    await inputs[0].vm.$emit('update:modelValue', '/api/rows')
    expect(lastPatch()?.apiUrl).toBe('/api/rows')

    const selects = w.findAllComponents({ name: 'Select' })
    await selects[1].vm.$emit('update:modelValue', 'POST')
    expect(lastPatch()?.method).toBe('POST')

    await inputs[1].vm.$emit('update:modelValue', 'data.rows')
    expect(lastPatch()?.dataPath).toBe('data.rows')
  })

  it('常驻安全提示（默认同源；跨域需宿主放行）——提前说清比事后让人困惑好', () => {
    const { w } = mountPanel({ displaySource: { kind: 'api', apiUrl: '/x' } })
    expect(w.text()).toContain('同源')
  })
})
