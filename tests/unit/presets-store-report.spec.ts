// storeReportSchema 单测 — 门店提报预置模板（presets-store-templates.spec 只盖了 store-profile，本文件补 store-report）
import { describe, it, expect } from 'vitest'
import { storeReportSchema } from '@/components/form-builder/presets/store-report'

describe('storeReportSchema：门店提报模板结构', () => {
  const schema = storeReportSchema()
  const keys = schema.fields.map((f) => f.key)

  it('schema 级约定：grid 布局 + 校验开关', () => {
    expect(schema.layout).toBe('grid')
    expect(schema.title).toBeTruthy()
  })

  it('字段键序稳定（键名即收集记录的数据列名）：基础字段在前、证照字段必填', () => {
    expect(keys[0]).toBe('division')
    expect(keys).toContain('is_report')
    expect(keys).toContain('store_license_name')
    expect(keys).toContain('amap_store_name')
    // 键无重复
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('项目店条件显隐：品牌类字段挂 is_report=项目店 的 visibleWhen', () => {
    const conditional = schema.fields.filter((f) => f.visibleWhen)
    expect(conditional.length).toBeGreaterThan(0)
    for (const f of conditional) {
      expect(f.visibleWhen).toEqual({ field: 'is_report', equals: '项目店' })
    }
  })

  it('上传位全部走公共 props（卡片变体/图片类型/10MB/移动端菜单/压缩）', () => {
    const uploads = schema.fields.filter((f) => f.type === 'image-upload')
    expect(uploads.length).toBeGreaterThan(0)
    for (const u of uploads) {
      expect(u.props).toMatchObject({
        variant: 'card',
        accept: 'image/*',
        maxSize: 10,
        mobileMenu: true,
        compress: true,
      })
    }
  })

  it('每个字段都有 key 与 label（渲染与数据列名的最低要求）', () => {
    for (const f of schema.fields) {
      expect(f.key).toBeTruthy()
      expect(f.label).toBeTruthy()
    }
  })
})
