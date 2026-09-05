// 门店收集类模板结构规格（护栏先行）
// 四个模板（合同/返利函/陈列/门店收集）共享 store-profile 资质字段工厂——锁结构防再漂移。
// 历史背景：四个 preset 曾各自复制同一段资质字段（含 name/storeName 键名漂移），2026-09-05 收编。
import { describe, it, expect } from 'vitest'
import {
  contractCollectionSchema,
  rebateLetterSchema,
  shelfCollectionSchema,
  storeCollectionSchema,
} from '@/components/form-builder'

const HEAD_KEYS = ['appleId', 'storeName', 'license', 'address', 'phone', 'startDate', 'category']
const PHOTO_PROPS = { variant: 'card', accept: 'image/*', maxSize: 10, mobileMenu: true, compress: true }

function headFields(schema: ReturnType<typeof contractCollectionSchema>) {
  return schema.fields.slice(0, HEAD_KEYS.length)
}
function tailKeys(schema: ReturnType<typeof contractCollectionSchema>) {
  return schema.fields.slice(HEAD_KEYS.length).map((f) => f.key)
}

describe('门店收集类模板共享资质字段工厂', () => {
  const schemas = {
    contract: contractCollectionSchema(),
    rebate: rebateLetterSchema(),
    shelf: shelfCollectionSchema(),
    store: storeCollectionSchema(),
  }

  it('四个模板的资质头字段键序完全一致', () => {
    for (const [name, s] of Object.entries(schemas)) {
      expect(headFields(s).map((f) => f.key), name).toEqual(HEAD_KEYS)
    }
  })

  it('资质头逐字段深比较全等（类型/必填/占位/布局；validator 闭包按次新建，归一为 fn 比较）', () => {
    const normalize = (schema: ReturnType<typeof contractCollectionSchema>) =>
      JSON.parse(JSON.stringify(headFields(schema), (_k, v) => (typeof v === 'function' ? 'fn' : v)))
    const first = normalize(schemas.contract)
    for (const [name, s] of Object.entries(schemas)) {
      expect(normalize(s), name).toEqual(first)
    }
  })

  it('资质头字段规格正确', () => {
    const head = headFields(schemas.contract)
    expect(head[0]).toMatchObject({ key: 'appleId', type: 'number', required: true, props: { stepper: false } })
    expect(head[1]).toMatchObject({ key: 'storeName', type: 'text', required: true, span: 24 })
    expect(head[2]).toMatchObject({ key: 'license', type: 'text', required: true })
    expect(head[3]).toMatchObject({ key: 'address', type: 'textarea', required: true, span: 24 })
    expect(head[4]).toMatchObject({ key: 'phone', type: 'tel' })
    expect(head[4].rules?.length).toBeGreaterThan(0)
    expect(head[5]).toMatchObject({ key: 'startDate', type: 'date', props: { format: 'YYYY-MM-DD' } })
    expect(head[6]).toMatchObject({ key: 'category', type: 'select', required: true })
    expect(head[6].options).toEqual([
      { value: '汇荣达', label: '汇荣达' },
      { value: '立炎卓', label: '立炎卓' },
    ])
  })

  it('所有照片上传位共用同一组 props（卡片/拍照/10MB/压缩）', () => {
    const uploads = [
      schemas.contract.fields.find((f) => f.key === 'contractPhoto'),
      schemas.rebate.fields.find((f) => f.key === 'rebatePhoto'),
      schemas.shelf.fields.find((f) => f.key === 'frontPhoto'),
      schemas.shelf.fields.find((f) => f.key === 'backPhoto'),
      schemas.store.fields.find((f) => f.key === 'photo'),
    ]
    for (const [i, u] of uploads.entries()) {
      expect(u?.type, `upload#${i}`).toBe('image-upload')
      expect(u?.required, `upload#${i}`).toBe(true)
      expect(u?.props, `upload#${i}`).toMatchObject(PHOTO_PROPS)
    }
  })

  it('业务尾字段差异正确（合同条件显隐 / 陈列双位）', () => {
    expect(tailKeys(schemas.contract)).toEqual(['hasContract', 'contractPhoto', 'remark'])
    expect(schemas.contract.fields.find((f) => f.key === 'contractPhoto')?.visibleWhen).toEqual({
      field: 'hasContract',
      equals: true,
    })
    expect(tailKeys(schemas.rebate)).toEqual(['rebatePhoto', 'remark'])
    expect(tailKeys(schemas.shelf)).toEqual(['frontPhoto', 'backPhoto', 'remark'])
    expect(tailKeys(schemas.store)).toEqual(['photo', 'remark'])
  })

  it('四模板统一 validateOnChange / submitText / 单列布局', () => {
    for (const [name, s] of Object.entries(schemas)) {
      expect(s.layout, name).toBe('single')
      expect(s.validateOnChange, name).toBe(true)
      expect(s.submitText?.length, name).toBeGreaterThan(0)
    }
  })
})
