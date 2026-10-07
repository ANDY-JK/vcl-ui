// useFormSchema 行为锁定测试（form-builder 核心 schema 处理）
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import {
  normalizeSchema,
  createInitialData,
  isFieldVisible,
  useFormSchema,
  SCHEMA_VERSION,
} from '@/components/form-builder/useFormSchema'
import type { FormSchema, FormField } from '@/components/form-builder/types'

function field(type: string, key: string, extra: Record<string, unknown> = {}): FormField {
  return { type, key, label: key, props: {}, ...extra } as FormField
}

describe('normalizeSchema', () => {
  it('填充默认值（layout/columns/submitText/版本）', () => {
    const n = normalizeSchema({ fields: [field('text', 'a')] })
    expect(n.layout).toBe('single')
    expect(n.columns).toBe(2)
    expect(n.submitText).toBe('提交')
    expect(n.schemaVersion).toBe(SCHEMA_VERSION)
    expect(n.hideActions).toBe(false)
  })

  it('fields 为空时归一化为空数组', () => {
    const n = normalizeSchema({ fields: [] } as FormSchema)
    expect(n.fields).toEqual([])
  })

  it('steps 归一化：过滤非法项，补 title/fields 默认', () => {
    const n = normalizeSchema({
      fields: [],
      steps: [{ title: 123, fields: ['a', 'b'] }, null, 'bad'],
    } as never)
    expect(n.steps).toEqual([{ title: '123', fields: ['a', 'b'] }])
  })

  it('空 steps 数组视为未设置（删除）', () => {
    const n = normalizeSchema({ fields: [], steps: [] } as never)
    expect(n.steps).toBeUndefined()
  })
})

describe('createInitialData', () => {
  it('有 default 用 default，无则用类型空值', () => {
    const data = createInitialData([
      field('text', 'name', { default: '张三' }),
      field('checkbox', 'tags'),
      field('switch', 'enabled'),
      field('rate', 'score'),
      field('date-range', 'range'),
      field('radio', 'gender'),
    ])
    expect(data.name).toBe('张三')
    expect(data.tags).toEqual([])
    expect(data.enabled).toBe(false)
    expect(data.score).toBe(0)
    expect(data.range).toEqual(['', ''])
    expect(data.gender).toBe('')
  })

  it('纯布局字段（divider/title）不参与数据', () => {
    const data = createInitialData([field('divider', 'd'), field('title', 't'), field('text', 'name')])
    expect(data.d).toBeUndefined()
    expect(data.t).toBeUndefined()
    expect(data.name).toBeDefined()
  })
})

describe('isFieldVisible', () => {
  it('无 visibleWhen 恒可见', () => {
    expect(isFieldVisible(field('text', 'a'), {})).toBe(true)
  })

  it('visibleWhen 匹配等于才可见', () => {
    const f = field('text', 'b', { visibleWhen: { field: 'type', equals: 'x' } })
    expect(isFieldVisible(f, { type: 'x' })).toBe(true)
    expect(isFieldVisible(f, { type: 'y' })).toBe(false)
  })

  it('not=true 取反', () => {
    const f = field('text', 'c', { visibleWhen: { field: 'type', equals: 'x', not: true } })
    expect(isFieldVisible(f, { type: 'x' })).toBe(false)
    expect(isFieldVisible(f, { type: 'y' })).toBe(true)
  })
})

describe('useFormSchema composable', () => {
  it('fieldMap / groupedFields / initialData / defaultSpan 派生正确', () => {
    const schema = ref<FormSchema>({
      fields: [field('text', 'name'), field('number', 'age', { group: '基础' }), field('divider', 'd')],
      layout: 'grid',
    })
    const s = useFormSchema(schema)
    expect(s.normalized.value.layout).toBe('grid')
    expect(s.fieldMap.value.get('name')?.type).toBe('text')
    expect([...s.groupedFields.value.keys()]).toEqual(['', '基础']) // 遍历顺序：无 group 先入
    expect(s.initialData.value.name).toBeDefined()
    expect(s.initialData.value.d).toBeUndefined()
    expect(s.defaultSpan.value).toBe(12) // grid → 12
  })

  it('schema 变化时派生值响应式更新', () => {
    const schema = ref<FormSchema>({ fields: [field('text', 'a')] })
    const s = useFormSchema(schema)
    expect(s.fieldMap.value.has('a')).toBe(true)
    schema.value = { fields: [field('text', 'b')] }
    expect(s.fieldMap.value.has('b')).toBe(true)
    expect(s.fieldMap.value.has('a')).toBe(false)
  })

  it('显式 undefined 键不覆盖默认值（toFormSchema 恒写 submitText/resetText，undefined 曾盖掉兜底）', () => {
    const baseline = normalizeSchema({ fields: [] })
    const n = normalizeSchema({
      fields: [],
      title: undefined,
      submitText: undefined,
      resetText: undefined,
      hideActions: undefined,
      validateOnChange: undefined,
    } as FormSchema)
    expect(n.submitText).toBe(baseline.submitText)
    expect(n.resetText).toBe(baseline.resetText)
    expect(n.hideActions).toBe(baseline.hideActions)
    expect(n.validateOnChange).toBe(baseline.validateOnChange)
  })

  it('显式非 undefined 值仍然覆盖默认值', () => {
    const n = normalizeSchema({ fields: [], submitText: '立即上报', resetText: '' } as FormSchema)
    expect(n.submitText).toBe('立即上报')
    expect(n.resetText).toBe('')
  })
})

describe('isFieldVisible 宽松匹配（设计器条件值所见即所配）', () => {
  it('数字字符串互通：条件值 "1" 命中字符串 "1" 与数字 1', () => {
    const f = field('text', 'b', { visibleWhen: { field: 'type', equals: '1' } })
    expect(isFieldVisible(f, { type: '1' })).toBe(true)
    expect(isFieldVisible(f, { type: 1 })).toBe(true)
    expect(isFieldVisible(f, { type: '2' })).toBe(false)
  })

  it('旧 schema 数字 equals 向后兼容：equals 1 命中字符串 "1"', () => {
    const f = field('text', 'b', { visibleWhen: { field: 'type', equals: 1 } })
    expect(isFieldVisible(f, { type: '1' })).toBe(true)
    expect(isFieldVisible(f, { type: 1 })).toBe(true)
  })

  it('布尔互通：equals true 命中 true 与 "true"；"false" 不命中', () => {
    const f = field('switch', 'b', { visibleWhen: { field: 'on', equals: true } })
    expect(isFieldVisible(f, { on: true })).toBe(true)
    expect(isFieldVisible(f, { on: 'true' })).toBe(true)
    expect(isFieldVisible(f, { on: false })).toBe(false)
    expect(isFieldVisible(f, { on: 'false' })).toBe(false)
  })

  it('空串条件不误配 undefined/null（与旧严格语义一致）', () => {
    const f = field('text', 'b', { visibleWhen: { field: 'type', equals: '' } })
    expect(isFieldVisible(f, { type: '' })).toBe(true)
    expect(isFieldVisible(f, {})).toBe(false)
    expect(isFieldVisible(f, { type: null })).toBe(false)
  })

  it('not 反向取反在宽松匹配下照常工作', () => {
    const f = field('text', 'b', { visibleWhen: { field: 'type', equals: '1', not: true } })
    expect(isFieldVisible(f, { type: '2' })).toBe(true)
    expect(isFieldVisible(f, { type: '1' })).toBe(false)
    expect(isFieldVisible(f, { type: 1 })).toBe(false)
  })
})
