/**
 * page-resolver —— 「设计数据 → 渲染 schema」这条链的契约
 *
 * 这层最容易出的错**不报错**：`FormDesign`（设计器节点树，`nodes`）与 `FormSchema`
 * （渲染器 schema，`fields`）名字很像但不是一回事。漏掉 `toFormSchema` 转换而直接把
 * `nodes` 喂给 `FormBuilder`，表现是"画布上有的字段一个都不显示"的空表单 —— 所以本 spec
 * 的核心断言不是"没抛错"，而是 **`fields` 里确实出现了设计树里的那个 key**。
 *
 * 另外钉住三态语义：拿不到表单 = `missing`（正常业务态，空态 + 原因，不抛）；
 * 基础设施故障 = **抛出**（由外壳转成错误态并可重试）；形状不对 = `missing` + 说明原因
 * （不把可疑数据交给渲染器，否则错误会以"渲染器内部崩溃"的形式出现、怪不到配置头上）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createFormPageResolver,
  designToSchema,
  isRenderableSchema,
} from '@/components/form-builder/lowcode/page-resolver'
import { getActiveFormStore, setActiveFormStore, type FormStore } from '@/components/form-builder/designer/store'
import type { FormDesign } from '@/components/form-builder/designer/types'
import type { NavFormNode } from '@/components/form-builder/lowcode/nav-schema'

const node = (extra: Partial<NavFormNode> = {}): NavFormNode => ({
  key: 'p1',
  label: '表单页',
  kind: 'form',
  ...extra,
})

/** 一个"设计器里存过的表单"：一根 text 节点 */
const design = (nodes: unknown[], meta: Record<string, unknown> = { title: '客户台账' }) =>
  ({ meta, nodes }) as unknown as FormDesign

const textNode = { id: 'n1', type: 'text', key: 'name', label: '姓名' }

const storeWith = (loadForm: (id: string) => Promise<unknown>): FormStore =>
  ({
    listForms: vi.fn(async () => []),
    loadForm: vi.fn(loadForm),
    saveForm: vi.fn(async () => ''),
    removeForm: vi.fn(async () => undefined),
  }) as unknown as FormStore

afterEach(() => {
  vi.restoreAllMocks()
})

describe('page-resolver · isRenderableSchema', () => {
  it('**只认 fields 是数组的形状**（其余都判为不可渲染，不赌渲染器的容忍度）', () => {
    expect(isRenderableSchema({ fields: [] })).toBe(true)
    expect(isRenderableSchema({ fields: [{ key: 'a' }] })).toBe(true)
    expect(isRenderableSchema({ fields: 'x' })).toBe(false)
    expect(isRenderableSchema({})).toBe(false)
    expect(isRenderableSchema(null)).toBe(false)
    expect(isRenderableSchema('x')).toBe(false)
    expect(isRenderableSchema([])).toBe(false)
  })
})

describe('page-resolver · designToSchema', () => {
  it('**nodes → fields 真的转换了**（这是最容易静默出错的一步）', () => {
    const schema = designToSchema(design([textNode]))
    expect(schema.fields.map((f) => f.key)).toEqual(['name'])
    expect(schema.fields[0]!.label).toBe('姓名')
    expect(schema.title).toBe('客户台账')
  })

  it('**v2 legacy（只有 fields、没有 nodes）也能转换**（宿主后端可能还没迁移）', () => {
    const legacy = { meta: { title: '旧表' }, fields: [textNode] } as unknown as FormDesign
    const schema = designToSchema(legacy)
    expect(schema.fields.map((f) => f.key)).toEqual(['name'])
  })

  it('**nodes 为空数组时回落 legacy fields**（不是"空就完了"）', () => {
    const mixed = { meta: { title: '混' }, nodes: [], fields: [textNode] } as unknown as FormDesign
    expect(designToSchema(mixed).fields.map((f) => f.key)).toEqual(['name'])
  })
})

describe('page-resolver · 内联 schema', () => {
  it('**形状正确 → ready，且不碰 FormStore**（内联就够，不该多一次存储访问）', async () => {
    const store = storeWith(async () => {
      throw new Error('不该被调用')
    })
    const out = await createFormPageResolver(store)(node({ schema: { fields: [{ key: 'a', label: 'A', type: 'text' }] } }))
    expect(out.status).toBe('ready')
    expect(store.loadForm).not.toHaveBeenCalled()
    if (out.status === 'ready') expect(out.schema.fields).toHaveLength(1)
  })

  it('**形状不对 → missing 且原因指向 fields**（可疑数据不进渲染器）', async () => {
    for (const schema of [{ nodes: [] }, { fields: 'x' }, {}]) {
      const out = await createFormPageResolver(storeWith(async () => null))(node({ schema: schema as never }))
      expect(out.status, JSON.stringify(schema)).toBe('missing')
      if (out.status === 'missing') expect(out.reason).toContain('fields')
    }
  })

  it('**形状对但没有字段 → missing**（否则外壳给出一个只有提交按钮的空页面，像"渲染成功"）', async () => {
    const out = await createFormPageResolver(storeWith(async () => null))(node({ schema: { fields: [] } }))
    expect(out.status).toBe('missing')
    if (out.status === 'missing') expect(out.reason).toContain('没有可渲染字段')
  })

  it('**同时给了 formId 与内联 schema → 内联优先**（不留"到底用哪个"的歧义）', async () => {
    const store = storeWith(async () => design([textNode]))
    const out = await createFormPageResolver(store)(
      node({ formId: 'f1', schema: { fields: [{ key: 'inline', label: '内联', type: 'text' }] } }),
    )
    expect(out.status).toBe('ready')
    if (out.status === 'ready') expect(out.schema.fields.map((f) => f.key)).toEqual(['inline'])
    expect(store.loadForm).not.toHaveBeenCalled()
  })
})

describe('page-resolver · formId → FormStore', () => {
  it('**loadForm 的设计树被转成渲染 schema**（不是把 nodes 直接扔过去）', async () => {
    const store = storeWith(async () => design([textNode]))
    const out = await createFormPageResolver(store)(node({ formId: 'f9' }))
    expect(store.loadForm).toHaveBeenCalledWith('f9')
    expect(out.status).toBe('ready')
    if (out.status === 'ready') {
      expect(out.schema.fields.map((f) => f.key)).toEqual(['name'])
      expect(out.schema.title).toBe('客户台账')
    }
  })

  it('**表单不存在（null）→ missing，原因里带 id**（删表单是正常业务态，不是错误态）', async () => {
    const out = await createFormPageResolver(storeWith(async () => null))(node({ formId: 'gone' }))
    expect(out.status).toBe('missing')
    if (out.status === 'missing') expect(out.reason).toContain('gone')
  })

  it('**设计存在但转出来没有字段 → missing 并说明是转换后为空**（不给出一个空表单假装成功）', async () => {
    const out = await createFormPageResolver(storeWith(async () => design([])))(node({ formId: 'empty' }))
    expect(out.status).toBe('missing')
    if (out.status === 'missing') expect(out.reason).toContain('empty')
  })

  it('**loadForm 抛错 → 原样抛出**（基础设施故障要走错误态 + 可重试，不吞成空态）', async () => {
    const store = storeWith(async () => {
      throw new Error('存储不可用')
    })
    await expect(createFormPageResolver(store)(node({ formId: 'f1' }))).rejects.toThrow('存储不可用')
  })

  it('**既无 formId 也无 schema → missing**（校验层已拦，解析层仍给得出原因）', async () => {
    const out = await createFormPageResolver(storeWith(async () => null))(node())
    expect(out.status).toBe('missing')
    if (out.status === 'missing') expect(out.reason).toContain('formId')
  })

  it('**不传 store → 使用宿主注入的活动 FormStore**（setActiveFormStore 那条线）', async () => {
    const prev = getActiveFormStore()
    const injected = storeWith(async () => design([textNode]))
    try {
      setActiveFormStore(injected)
      const out = await createFormPageResolver()(node({ formId: 'active' }))
      expect(injected.loadForm).toHaveBeenCalledWith('active')
      expect(out.status).toBe('ready')
    } finally {
      setActiveFormStore(prev)
    }
  })
})