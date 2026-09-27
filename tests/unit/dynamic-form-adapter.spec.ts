// dynamic-form-adapter 单测 — 旧版 DynamicForm 配置 → 新版 FormSchema 的兼容映射层（此前 0% 覆盖）
import { describe, it, expect } from 'vitest'
import { toDynamicFormSchema } from '@/components/form-builder/dynamic-form-adapter'

describe('toDynamicFormSchema：字段映射', () => {
  it('基础透传：key/label/type/required/default/placeholder/hint 原样进字段', () => {
    const schema = toDynamicFormSchema({
      fields: [
        {
          key: 'name',
          label: '门店名称',
          type: 'text',
          required: true,
          default: '默认店',
          placeholder: '请输入',
          hint: '提示',
        },
      ],
    })
    const f = schema.fields[0]
    expect(f).toMatchObject({
      key: 'name',
      label: '门店名称',
      type: 'text',
      required: true,
      default: '默认店',
      placeholder: '请输入',
      hint: '提示',
    })
  })

  it('span 缺省：普通字段 12（半行）、textarea 24（整行）；显式 span 优先', () => {
    const schema = toDynamicFormSchema({
      fields: [
        { key: 'a', label: 'A', type: 'text' },
        { key: 'b', label: 'B', type: 'textarea' },
        { key: 'c', label: 'C', type: 'text', span: 8 },
      ],
    })
    expect(schema.fields.map((f) => f.span)).toEqual([12, 24, 8])
  })

  it('options：string[] → Option[]（value=label），Option 对象原样保留', () => {
    const schema = toDynamicFormSchema({
      fields: [
        { key: 's', label: 'S', type: 'select', options: ['甲', '乙'] },
        { key: 'o', label: 'O', type: 'select', options: [{ value: 'v', label: '显示' }] },
      ],
    })
    expect(schema.fields[0].options).toEqual([
      { value: '甲', label: '甲' },
      { value: '乙', label: '乙' },
    ])
    expect(schema.fields[1].options).toEqual([{ value: 'v', label: '显示' }])
  })

  it('visibleWhen：旧版 {field,value} → 新版 {field,equals}', () => {
    const schema = toDynamicFormSchema({
      fields: [{ key: 'x', label: 'X', type: 'text', visibleWhen: { field: 'type', value: '项目店' } }],
    })
    expect(schema.fields[0].visibleWhen).toEqual({ field: 'type', equals: '项目店' })
  })

  it('级联选项 optionsFrom/optionsMap 原样透传；readonly → readonly', () => {
    const schema = toDynamicFormSchema({
      fields: [
        {
          key: 'city',
          label: '城市',
          type: 'select',
          readonly: true,
          optionsFrom: 'province',
          optionsMap: { 广东: ['广州', '深圳'] },
        },
      ],
    })
    const f = schema.fields[0]
    expect(f.optionsFrom).toBe('province')
    expect(f.optionsMap).toEqual({ 广东: ['广州', '深圳'] })
    expect(f.readonly).toBe(true)
  })

  it('group 分组与 props 透传', () => {
    const schema = toDynamicFormSchema({
      fields: [{ key: 'p', label: 'P', type: 'number', group: '基础信息', props: { min: 0 } }],
    })
    const f = schema.fields[0]
    expect(f.group).toBe('基础信息')
    expect(f.props).toEqual({ min: 0 })
  })
})

describe('toDynamicFormSchema：上传区映射（旧版 dropZones）', () => {
  it('dropZones → image-upload 字段：span 8 + card 变体 + 默认 accept/multiple/maxSize/compress', () => {
    const schema = toDynamicFormSchema({
      fields: [{ key: 'name', label: 'N', type: 'text' }],
      uploads: [{ key: 'door', label: '门头照', group: '照片' }],
    })
    expect(schema.fields).toHaveLength(2)
    const up = schema.fields[1]
    expect(up.type).toBe('image-upload')
    expect(up.group).toBe('照片')
    expect(up.span).toBe(8)
    expect(up.props).toMatchObject({
      variant: 'card',
      accept: 'image/*',
      multiple: true,
      maxSize: 10,
      mobileMenu: true,
      compress: true,
    })
    // maxFiles 未传时不落入 props（undefined 不展开）
    expect('maxFiles' in (up.props as Record<string, unknown>)).toBe(false)
  })

  it('maxFiles 显式传入时透传；accept 覆盖默认', () => {
    const schema = toDynamicFormSchema({
      fields: [],
      uploads: [{ key: 'doc', label: '附件', accept: 'application/pdf', multiple: false, maxFiles: 3 }],
    })
    expect(schema.fields[0].props).toMatchObject({
      accept: 'application/pdf',
      multiple: false,
      maxFiles: 3,
    })
  })
})

describe('toDynamicFormSchema：schema 级约定', () => {
  it('固定 grid/2 列/validateOnChange，title/description/submitText 透传', () => {
    const schema = toDynamicFormSchema({
      title: '门店提报',
      description: '描述',
      submitText: '提交提报',
      fields: [{ key: 'a', label: 'A', type: 'text' }],
    })
    expect(schema.layout).toBe('grid')
    expect(schema.columns).toBe(2)
    expect(schema.validateOnChange).toBe(true)
    expect(schema.title).toBe('门店提报')
    expect(schema.submitText).toBe('提交提报')
  })

  it('uploads 缺省不炸：仅 fields 映射', () => {
    const schema = toDynamicFormSchema({ fields: [{ key: 'a', label: 'A', type: 'text' }] })
    expect(schema.fields).toHaveLength(1)
  })
})
