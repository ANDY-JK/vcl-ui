// 合同收集模板结构规格（护栏先行）
// 资质字段由 store-profile 工厂提供——锁结构防再漂移。
// 历史背景：门店收集类模板曾各自复制同一段资质字段（含 name/storeName 键名漂移），2026-09-05 收编；
// 2026-09-10 模板收敛到「门店提报 + 合同收集」两个业务模板，本用例只锁合同收集。
import { describe, it, expect } from 'vitest'
import { contractCollectionSchema } from '@/components/form-builder'

const HEAD_KEYS = ['appleId', 'storeName', 'license', 'address', 'phone', 'startDate', 'category']
const PHOTO_PROPS = { variant: 'card', accept: 'image/*', maxSize: 10, mobileMenu: true, compress: true }

describe('合同收集模板（store-profile 共享资质字段）', () => {
  const schema = contractCollectionSchema()
  const head = schema.fields.slice(0, HEAD_KEYS.length)
  const tailKeys = schema.fields.slice(HEAD_KEYS.length).map((f) => f.key)

  it('资质头字段键序稳定（键名即收集记录的数据列名）', () => {
    expect(head.map((f) => f.key)).toEqual(HEAD_KEYS)
  })

  it('资质头字段规格正确', () => {
    expect(head[0]).toMatchObject({ key: 'appleId', type: 'number', required: true, props: { stepper: false } })
    expect(head[1]).toMatchObject({ key: 'storeName', type: 'text', required: true, span: 24 })
    expect(head[2]).toMatchObject({ key: 'license', type: 'text', required: true })
    expect(head[3]).toMatchObject({ key: 'address', type: 'textarea', required: true, span: 24 })
    expect(head[4]).toMatchObject({ key: 'phone', type: 'tel' })
    expect(head[4].rules?.length).toBeGreaterThan(0)
    expect(head[5]).toMatchObject({ key: 'startDate', type: 'date', props: { format: 'YYYY-MM-DD' } })
    expect(head[6]).toMatchObject({ key: 'category', type: 'select', required: true })
    expect(head[6].options).toEqual([
      { value: '示例客户甲', label: '示例客户甲' },
      { value: '示例客户乙', label: '示例客户乙' },
    ])
  })

  it('照片上传位使用公共 props（卡片/拍照/10MB/压缩）', () => {
    const upload = schema.fields.find((f) => f.key === 'contractPhoto')
    expect(upload?.type).toBe('image-upload')
    expect(upload?.required).toBe(true)
    expect(upload?.props).toMatchObject(PHOTO_PROPS)
  })

  it('业务字段：合同开关控制照片位条件显隐，备注收尾', () => {
    expect(tailKeys).toEqual(['hasContract', 'contractPhoto', 'remark'])
    expect(schema.fields.find((f) => f.key === 'contractPhoto')?.visibleWhen).toEqual({
      field: 'hasContract',
      equals: true,
    })
  })

  it('统一 validateOnChange / submitText / 单列布局', () => {
    expect(schema.layout).toBe('single')
    expect(schema.validateOnChange).toBe(true)
    expect(schema.submitText?.length).toBeGreaterThan(0)
  })
})
