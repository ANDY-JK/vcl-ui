// 动态默认值（defaultMeta）— 行为锁定
// 背景：P1-5 默认值动态化——设计器 dataConfig.defaultType(currentTime/currentUser/formula) 运行时求值
import { describe, it, expect } from 'vitest'
import { createInitialData } from '@/components/form-builder/useFormSchema'
import { toFormSchema } from '@/components/form-builder/designer/types'
import type { FormField } from '@/components/form-builder/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function field(over: Partial<FormField>): FormField {
  return { key: 'f1', label: '字段', type: 'text', ...over }
}

describe('createInitialData · 动态默认值', () => {
  it('currentTime 填当前时间字符串（YYYY-MM-DD HH:mm）', () => {
    const data = createInitialData([field({ defaultMeta: { type: 'currentTime' } })])
    expect(typeof data.f1).toBe('string')
    expect(data.f1).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('currentUser 用 userContext.name（未注入时占位 currentUser）', () => {
    expect(
      createInitialData([field({ defaultMeta: { type: 'currentUser' } })], { userContext: { name: '张三' } }).f1,
    ).toBe('张三')
    expect(createInitialData([field({ defaultMeta: { type: 'currentUser' } })]).f1).toBe('currentUser')
  })

  it('formula 用 evaluateFormula 求值（{{field}} 引用前序字段）', () => {
    const data = createInitialData([
      field({ key: 'a', label: 'A', type: 'number', defaultMeta: { type: 'formula', formula: '1+2' } }),
    ])
    expect(data.a).toBe(3)
  })

  it('静态 default 优先于 defaultMeta 不生效（default 存在时不求值）', () => {
    const data = createInitialData([
      field({ key: 'f1', label: 'F', type: 'text', default: '静态', defaultMeta: { type: 'currentTime' } }),
    ])
    expect(data.f1).toBe('静态')
  })

  it('api 型不参与同步初始化（先落空占位值，由 applyRemoteDefaults 异步回填）', () => {
    const data = createInitialData([field({ defaultMeta: { type: 'api', apiUrl: 'https://x/api' } })])
    expect(data.f1).toBeNull()
  })

  it('纯布局字段不参与', () => {
    const data = createInitialData([
      { key: '', label: '分隔', type: 'divider' } as FormField,
      field({ defaultMeta: { type: 'currentTime' } }),
    ])
    expect(data.f1).toBeDefined()
  })
})

describe('toFormSchema · dataConfig → defaultMeta 映射', () => {
  it('defaultType=currentTime → defaultMeta', () => {
    const nodes: DesignerNode[] = [
      { id: 'n1', type: 'text', label: '时间', key: 't', dataConfig: { defaultType: 'currentTime' } } as DesignerNode,
    ]
    const schema = toFormSchema(nodes)
    expect(schema.fields[0].defaultMeta).toEqual({ type: 'currentTime' })
  })

  it('defaultType=formula + defaultFormula → defaultMeta.formula', () => {
    const nodes: DesignerNode[] = [
      {
        id: 'n1',
        type: 'number',
        label: '合计',
        key: 'sum',
        dataConfig: { defaultType: 'formula', defaultFormula: '{{a}}+{{b}}' },
      } as DesignerNode,
    ]
    const schema = toFormSchema(nodes)
    expect(schema.fields[0].defaultMeta).toEqual({ type: 'formula', formula: '{{a}}+{{b}}' })
  })

  it('defaultType=api + defaultApiUrl → defaultMeta（apiUrl/dataPath 映射）', () => {
    const nodes: DesignerNode[] = [
      {
        id: 'n1',
        type: 'text',
        label: '编号',
        key: 'no',
        dataConfig: { defaultType: 'api', defaultApiUrl: 'https://x/next-no', defaultApiDataPath: 'data.no' },
      } as DesignerNode,
    ]
    const schema = toFormSchema(nodes)
    expect(schema.fields[0].defaultMeta).toEqual({ type: 'api', apiUrl: 'https://x/next-no', dataPath: 'data.no' })
  })

  it('defaultType=api 但未填 apiUrl → 不映射（避免空请求）', () => {
    const nodes: DesignerNode[] = [
      { id: 'n1', type: 'text', label: 'A', key: 'a', dataConfig: { defaultType: 'api' } } as DesignerNode,
    ]
    const schema = toFormSchema(nodes)
    expect(schema.fields[0].defaultMeta).toBeUndefined()
  })

  it('defaultType=none/fixed 不映射 defaultMeta', () => {
    const nodes: DesignerNode[] = [
      { id: 'n1', type: 'text', label: 'A', key: 'a', dataConfig: { defaultType: 'none' } } as DesignerNode,
      {
        id: 'n2',
        type: 'text',
        label: 'B',
        key: 'b',
        defaultValue: 'x',
        dataConfig: { defaultType: 'fixed' },
      } as DesignerNode,
    ]
    const schema = toFormSchema(nodes)
    expect(schema.fields[0].defaultMeta).toBeUndefined()
    expect(schema.fields[1].defaultMeta).toBeUndefined()
    expect(schema.fields[1].default).toBe('x')
  })
})
