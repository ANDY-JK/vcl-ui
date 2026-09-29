// 目标收集表：表格只放得下前几列，但"看不见的列"不能变成"导出不上的列"。
// 这里锁三件事：导出取全量字段并集、没显示的列数在表上方明说、显示出来的单元格带完整值提示。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormTargetCollect from '@/components/form-builder/FormTargetCollect.vue'
import type { FormSchema } from '@/components/form-builder/types'

const targets = [
  {
    id: 1,
    name: '东街口店',
    license: '91350100MA0',
    addr: '福州市鼓楼区东街口 12 号',
    phone: '0591-1234',
    town: '东街',
  },
  { id: 2, name: '西湖店', license: '91350100MB11', addr: '福州市鼓楼区湖滨路 8 号', phone: '0591-5678', town: '西湖' },
]

function mountPanel() {
  return mount(FormTargetCollect, {
    props: { schema: { fields: [] } as unknown as FormSchema, targets },
    global: { stubs: { teleport: true } },
  })
}

describe('FormTargetCollect · 列可发现性与导出口径', () => {
  it('表格只渲染前 3 个展示列（ID 另算）', () => {
    const head = mountPanel().findAll('thead th')
    expect(head.map((th) => th.text())).toEqual(['ID', 'name', 'license', 'addr', '状态'])
  })

  it('未显示的列数在表上方明说', () => {
    const hint = mountPanel().find('.ftc-fields-more')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('2')
    expect(hint.text()).toContain('导出')
  })

  it('导出取全量字段并集，不跟着表格的 3 列一起少', () => {
    const w = mountPanel()
    // script setup 的绑定在 dev 模式下可经 vm 读取（测试专用口径，不是公开 API）
    expect((w.vm as unknown as { exportKeys: string[] }).exportKeys).toEqual([
      'name',
      'license',
      'addr',
      'phone',
      'town',
    ])
  })

  it('被裁掉的单元格用 title 留完整值', () => {
    const cells = mountPanel().findAll('.ftc-td-val')
    expect(cells[2].attributes('title')).toBe('福州市鼓楼区东街口 12 号')
  })

  it('字段不超过 3 个时不多余提示', () => {
    const w = mount(FormTargetCollect, {
      props: { schema: { fields: [] } as unknown as FormSchema, targets: [{ id: 1, name: 'a', license: 'b' }] },
      global: { stubs: { teleport: true } },
    })
    expect(w.find('.ftc-fields-more').exists()).toBe(false)
  })
})
