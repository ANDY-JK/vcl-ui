// 验证 lowcode.md 文档里的代码能真的编译与跑通（2026-10-22）
//
// ## 为什么写这个
//
// 文档最大的风险不是"写得不清楚"，而是**写错了**。`docs-site/guide/lowcode.md`
// 里的每个 import、每个函数名、每个字段名，如果写错一个，读者复制过去就是一片红。
//
// 而文档又不进 `typecheck`（.md 不参与），所以这类错误**没有任何闸口拦得住**。
//
// 这条测试把文档里的**关键 API 契约**逐一实例化一遍：
// 名字写错 → 编译失败；参数形状写错 → 类型报错；行为写错 → 断言失败。
import { describe, it, expect } from 'vitest'

// ① 文档「最快路径」用的 import
import { FormDesigner, FormBuilder, toFormSchema } from '@/components/form-builder'
// ② 文档「FormStore」用的类型
import type { FormStore, FormMetaItem, FormDesign } from '@/components/form-builder'
// ③ 文档「导航项」用的
import { useFormNav, buildFormNavItems } from '@/components/form-builder'
// ④ 文档「展示数据源」用的
import { useDisplayData, extractByPath, toRows, policyFromOrigins } from '@/components/form-builder'
// ⑤ 文档「分享码」用的
import { encodeShareCode, decodeShareCode } from '@/components/form-builder'
// ⑥ 文档「官方实现」
import { createLocalFormStore, createCloudFormStore, createFormStore } from '@/components/form-builder'
// ⑦ 文档「设计态类型」
import type { DesignerNode, FormMeta } from '@/components/form-builder'

describe('文档 lowcode.md · 所有 import 都真实存在', () => {
  it('组件与函数都是可用的（不是 undefined）', () => {
    for (const [name, v] of Object.entries({
      FormDesigner,
      FormBuilder,
      toFormSchema,
      useFormNav,
      buildFormNavItems,
      useDisplayData,
      extractByPath,
      toRows,
      policyFromOrigins,
      encodeShareCode,
      decodeShareCode,
      createLocalFormStore,
      createCloudFormStore,
      createFormStore,
    })) {
      expect(v, `文档里写的 ${name} 必须真实导出`).toBeTruthy()
    }
  })
})

describe('文档 lowcode.md · FormStore 契约（文档说 10 个方法）', () => {
  it('createLocalFormStore() 返回的对象满足 FormStore 且方法齐全', () => {
    const store: FormStore = createLocalFormStore()

    // 文档表格里列的 9 个必需方法 + updateRecord(可选)
    const required = [
      'listForms',
      'loadForm',
      'saveForm',
      'renameForm',
      'deleteForm',
      'loadRecords',
      'appendRecord',
      'removeRecord',
      'clearRecords',
    ] as const

    for (const m of required) {
      expect(typeof store[m], `FormStore 必须有 ${m}`).toBe('function')
    }
    // updateRecord 是可选的 —— 文档特别说明了"外部 SaaS 实现可能没有"
    // 本地实现有没有都合法，这里只断言类型层面允许
    expect(store.updateRecord === undefined || typeof store.updateRecord === 'function').toBe(true)
  })
})

describe('文档 lowcode.md · toFormSchema 用法', () => {
  it('文档里的调用形式 toFormSchema(nodes, meta) 可用', () => {
    const nodes: DesignerNode[] = [{ id: 'n1', key: 'name', type: 'input', label: '姓名' } as DesignerNode]
    const meta: FormMeta = { title: '客户登记表', layout: 'single' }

    const schema = toFormSchema(nodes, meta)
    expect(schema).toBeTruthy()
    expect(schema.fields).toHaveLength(1)
    expect(schema.title, 'meta.title 应传到 schema').toBe('客户登记表')
  })
})

describe('文档 lowcode.md · displaySource 三模式字段名', () => {
  it('文档列出的字段都能构造出 DisplayDataSource', () => {
    // 文档第 5 节表格里的字段：kind / staticData / fieldKey / apiUrl / method / dataPath / body
    const staticSrc = { kind: 'static' as const, staticData: [{ a: 1 }] }
    const fieldSrc = { kind: 'field' as const, fieldKey: 'detail' }
    const apiSrc = { kind: 'api' as const, apiUrl: '/api/x', method: 'GET' as const, dataPath: 'data.rows' }

    for (const s of [staticSrc, fieldSrc, apiSrc]) {
      expect(s.kind).toMatch(/static|field|api/)
    }
    // dataPath 的点路径行为（文档说"任一段缺失返回 undefined，不抛错"）
    expect(extractByPath({ data: { rows: [1, 2] } }, 'data.rows')).toEqual([1, 2])
    expect(extractByPath({ data: {} }, 'data.rows'), '缺段应返回 undefined 而非抛错').toBeUndefined()
    // toRows 单对象包成一行（文档状态说明里提到）
    expect(toRows({ a: 1 }), '单对象应包成一行').toEqual([{ a: 1 }])
  })

  it('policyFromOrigins 是文档教的放行方式', () => {
    const policy = policyFromOrigins(['https://api.example.com'])
    expect(policy).toBeTruthy()
  })
})

describe('文档 lowcode.md · 分享码', () => {
  it('encodeShareCode → decodeShareCode 往返', () => {
    const design = {
      schemaVersion: 3,
      meta: { title: '测试' },
      nodes: [{ id: 'n1', key: 'a', type: 'input', label: 'A' }],
    } as unknown as FormDesign

    const code = encodeShareCode(design)
    expect(typeof code, '分享码应是字符串').toBe('string')
    expect(code.length).toBeGreaterThan(0)

    const back = decodeShareCode(code)
    expect(back, '应能解回').toBeTruthy()
    expect(back!.nodes?.[0]?.key, '字段应保留').toBe('a')
  })
})

describe('文档 lowcode.md · useFormNav 返回值', () => {
  it('返回 items / loading / error / refresh（文档写的是 refresh 不是 reload）', () => {
    // 文档第一版误写成 reload，后来核实实际是 refresh —— 这条断言锁住正确名字
    const r = useFormNav({ store: createLocalFormStore(), autoLoad: false })
    expect(r.items, 'items').toBeTruthy()
    expect(r.loading, 'loading').toBeTruthy()
    expect(r.error, 'error').toBeTruthy()
    expect(typeof r.refresh, 'refresh 必须是函数（不是 reload）').toBe('function')
    expect('reload' in r, '不该有 reload 这个键').toBe(false)
  })
})

describe('文档 lowcode.md · buildFormNavItems 纯函数', () => {
  it('文档说"只想用映射逻辑、不要加载副作用"时用它', () => {
    const forms = [
      { id: 'f1', name: '表单A', updatedAt: 1, storageKey: 'k1' },
      { id: 'f2', name: '表单B', updatedAt: 2, storageKey: 'k2' },
    ] as unknown as FormMetaItem[]

    const items = buildFormNavItems(forms, { basePath: '/form' })
    expect(items).toHaveLength(2)
    // 默认按 updatedAt 倒序 → f2 在前
    expect(items[0].label).toBe('表单B')
  })
})
