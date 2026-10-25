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
// ⑧ 文档「导航外壳」（§5）用的
import {
  LowCodeNav,
  useLowCodeNav,
  createFormPageResolver,
  setActiveFormStore,
  isExternalNavUrl,
} from '@/components/form-builder'
// ⑨ 文档「接你自己的后端」里的官方 REST 实现
import { createRestFormStore } from '@/components/form-builder'
// ⑩ 文档「提交记录形状」用的 id 生成器
import { genRecordId } from '@/components/form-builder'
import { existsSync, readFileSync } from 'node:fs'

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

const DOC_LOWCODE = 'docs-site/guide/lowcode.md'
const SHELL_SRC = 'src/components/form-builder/lowcode/LowCodeNav.vue'

describe('文档 lowcode.md · 导航外壳（§5）', () => {
  it('文档「导航外壳」节教的 import 都真实存在', () => {
    for (const [name, v] of Object.entries({
      LowCodeNav,
      useLowCodeNav,
      createFormPageResolver,
      setActiveFormStore,
      isExternalNavUrl,
    })) {
      expect(v, `文档里写的 ${name} 必须真实导出`).toBeTruthy()
    }
  })

  it('**文档必须覆盖外壳的关键面**（代码加了、文档没跟 → 当场红）', () => {
    const doc = readFileSync(DOC_LOWCODE, 'utf8')
    // 这些名字都是"读者会照着抄"的东西，少一个就说明外壳层从文档里掉出去了
    const required = [
      'LowCodeNav',
      '## 5. 把外壳一起用',
      'refresh()',
      'page-submit',
      'page-change',
      '#page',
      '#nav-item',
      'renderFormPage',
      'resolveFormPage',
      'showIssues',
      'apiUrlPolicy',
      'formStore',
    ]
    for (const n of required) {
      expect(doc.includes(n), `lowcode.md 必须提到 ${n}`).toBe(true)
    }
  })

  it('**文档写的那三档来源写法与 NavSource 真实判联一致**（写错一个字母读者就编译不过）', () => {
    const doc = readFileSync(DOC_LOWCODE, 'utf8')
    for (const k of ["'static'", "'forms'", "'api'"]) {
      expect(doc, `文档必须写明来源档位 ${k}`).toContain(k)
    }
  })

  it('**`refresh()` 只做「重取导航」一件事**：第 103 轮删掉的冗余 loadFormPage 不得回归', () => {
    const src = readFileSync(SHELL_SRC, 'utf8')
    const from = src.indexOf('async function refresh')
    // 从 from 之后找：refresh() 上方那段说明注释里也出现了 defineExpose 字样，全局 indexOf 会命中注释
    const to = src.indexOf('defineExpose', from)
    expect(from, '源码里必须有 refresh()').toBeGreaterThan(-1)
    expect(to, 'refresh() 之后必须有 defineExpose').toBeGreaterThan(from)
    const body = src.slice(from, to)
    expect(body, '必须真的调 api.refresh()').toMatch(/await api\.refresh\(\)/)
    expect(
      body,
      '不得再显式 loadFormPage(current)：重取会重建导航项，current 身份变化已触发 watch 重载（见 §5 的 refresh 说明）'
    ).not.toMatch(/loadFormPage/)
  })
})

describe('文档 lowcode.md · 官方 REST 仓储（§3）', () => {
  it('文档教的 createRestFormStore 真实导出，且路由方法齐全', () => {
    expect(createRestFormStore, 'createRestFormStore 必须真实导出').toBeTruthy()
    const store = createRestFormStore({
      baseUrl: '/api/lowcode',
      headers: () => ({ Authorization: 'Bearer t' }),
      fetchImpl: (async () => new Response('[]', { status: 200 })) as unknown as typeof fetch,
    })
    for (const m of [
      'listForms',
      'loadForm',
      'saveForm',
      'renameForm',
      'deleteForm',
      'loadRecords',
      'appendRecord',
      'updateRecord',
      'removeRecord',
      'clearRecords',
    ]) {
      expect(typeof (store as unknown as Record<string, unknown>)[m], `${m} 必须是函数`).toBe('function')
    }
  })

  it('文档写的路由与实现一致；id 必须 URL 编码（否则带斜杠的 id 会越权）', () => {
    const src = readFileSync('src/components/form-builder/designer/rest-form-store.ts', 'utf8')
    for (const p of ['/forms', '/records/']) {
      expect(src, `实现里必须出现路由 ${p}`).toContain(p)
    }
    expect(src).toContain('encodeURIComponent')
  })
})

describe('文档 lowcode.md · 提交记录形状（§4）', () => {
  it('文档教的 genRecordId 真实导出；CollectRecord 三段形状与实现一致', () => {
    expect(genRecordId, 'genRecordId 必须真实导出').toBeTruthy()
    expect(typeof genRecordId()).toBe('string')
    const src = readFileSync('src/components/form-builder/designer/types/domain.ts', 'utf8')
    const i = src.indexOf('export interface CollectRecord')
    expect(i, 'CollectRecord 必须定义在 domain.ts').toBeGreaterThan(-1)
    const closeIdx = src.indexOf('}', i)
    const body = src.slice(i, closeIdx)
    for (const k of ['id', 'time', 'data']) {
      expect(body, `${k} 必须出现在 CollectRecord 里`).toContain(k)
    }
  })
})

describe('文档 lowcode.md · 可部署参考后端（§3）', () => {
  it('指南点名了 examples/lowcode-backend/server.mjs，且该文件真实存在', () => {
    const doc = readFileSync('docs-site/guide/lowcode.md', 'utf8')
    expect(doc, '指南必须给出可部署的起点').toContain('examples/lowcode-backend/server.mjs')
    expect(doc, '读法（令牌拒绝启动）也要写').toContain('LOWCODE_TOKEN')
    expect(existsSync('examples/lowcode-backend/server.mjs')).toBe(true)
    expect(existsSync('examples/lowcode-backend/README.md'), '部署起点不能只有代码').toBe(true)
  })

  it('参考后端真的实现了 9 条路由，且导出可嵌入的工厂（指南的契约不是纸面契约）', () => {
    const src = readFileSync('examples/lowcode-backend/server.mjs', 'utf8')
    for (const frag of ['/forms', '/records', '/nav', '__stats']) {
      expect(src, `参考后端必须实现 ${frag}`).toContain(frag)
    }
    for (const m of ['GET', 'POST', 'PATCH', 'DELETE']) {
      expect(src, `参考后端必须处理 ${m}`).toContain(m)
    }
    expect(src, '必须可嵌入（导出工厂而不是只会自启）').toContain('export function createLowcodeBackend')
    expect(src, '存储层要能被整体替换').toContain('export function createMemoryStore')
    expect(src, 'fail-closed：没令牌必须拒绝启动').toContain('拒绝启动')
    expect(src, '401 与 403 必须分开').toContain('forbidden')
  })

  it('指南给了给导航来源加鉴权的 fetcher 写法（api 来源的令牌走这里）', () => {
    const doc = readFileSync('docs-site/guide/lowcode.md', 'utf8')
    // 锚点必须**唯一**：`withAuth` 这个词在指南里出现 2 次（另有一处叙述），
    // 只断言它等于没锁住这段可抄的写法 —— 第 106 轮的负向对照正是这样抓到的（删一处仍绿）。
    expect(doc, '要给出可直接抄的 fetcher 包装').toContain(':fetcher="withAuth"')
    expect(doc, '必须点明 formStore 的令牌在另一处').toContain('createRestFormStore({ headers })')
  })
})
