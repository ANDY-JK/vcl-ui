/**
 * useFormLinkage 联动引擎：级联映射 / 选项跟随 / 远程数据源 / 配置重扫
 *
 * ## 为什么补
 *
 * 已有 `linkage-eval.spec.ts` 只钉了一件事 —— **求值必须走安全求值器**（P0-5：不许
 * `new Function`），3 条用例全在 followValue/showHide 的「公式能算」上。
 * 而引擎真正复杂的地方一行没测：
 *   · **optionsFrom + optionsMap 级联**（省份变 → 城市选项换 → 已选脏值要清空）
 *   · **followOptions 的反直觉回退**（过滤不到任何选项时**回退全量**而不是清空）
 *   · **远程数据源**（URL 拼参、安全策略拒绝、缓存命中、四种 JSON 形状、字段映射）
 *   · **配置签名 watcher**（宿主运行时改 schema，联动列表要重扫）
 *
 * 这些都是「数据流对不对」的问题，错的表现是**用户看到错选项 / 提交脏值 / 白屏**，
 * 而不是抛异常 —— 所以必须逐条钉。`dynamicOptions` / `hiddenByLinkage` 都是公开返回，
 * 断言直接读它们，不需要挂组件。
 *
 * ## 已知坑
 *
 * `reportWarn` 会经 `tests/unit/setup.ts` 落进噪音棘轮（新增噪音类目会让第 16 步失败），
 * 所以本 spec **整体 mock 掉 runtime-observer 的 reportWarn**（spread 原模块保留其余导出），
 * 既断言了「该出声的地方出声」，又不污染噪音基线。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed, nextTick, type Ref } from 'vue'
import type { FormField, FormData } from '@/components/form-builder/types'
import type { Option } from '@/components/shared/types'

/* ═══════════ reportWarn 捕获（不落噪音棘轮） ═══════════ */

const warnCalls = vi.hoisted(() => [] as unknown[][])
vi.mock('@/components/_internal/runtime-observer', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, reportWarn: (...args: unknown[]) => void warnCalls.push(args) }
})

import { useFormLinkage } from '@/components/form-builder/useFormLinkage'

/* ═══════════ 构造工具 ═══════════ */

function f(over: Partial<FormField> & { key: string }): FormField {
  return { type: 'select', label: over.key, ...over } as FormField
}

function setup(
  fields: FormField[],
  data: FormData = {},
  policy?: Parameters<typeof useFormLinkage>[2],
): {
  api: ReturnType<typeof useFormLinkage>
  fields: Ref<FormField[]>
  formData: Ref<FormData>
} {
  const fieldsRef = ref<FormField[]>(fields)
  const formData = ref<FormData>(data)
  const api = useFormLinkage(computed(() => fieldsRef.value), formData, policy)
  return { api, fields: fieldsRef, formData }
}

/** 等一轮 watch + 微任务 */
async function tick(): Promise<void> {
  await nextTick()
  await Promise.resolve()
}

const opts = (...v: string[]): Option[] => v.map((x) => ({ label: x, value: x }))

beforeEach(() => {
  warnCalls.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/* ═══════════ 初始化扫描与来源互斥 ═══════════ */

describe('init：字段分类与选项来源互斥检测', () => {
  it('**linkage 为 none 或无公式的字段不进联动列表**（否则每次数据变化都空转）', async () => {
    const { api, formData } = setup(
      [
        f({ key: 'a', linkage: { type: 'none', formula: '{{x}}', targetField: 't' } }),
        f({ key: 'b', linkage: { type: 'showHide' } }),
        f({ key: 'c', linkage: { type: 'showHide', formula: "{{x}} == 1", targetField: 't' } }),
      ],
      { x: 1 },
    )
    api.setupWatchers()
    await tick()
    // 只有 c 生效：条件 1==1 为真 → t 不隐藏
    expect(api.isHiddenByLinkage('t'), 'c 求值为真，不隐藏').toBe(false)

    formData.value.x = 2
    await tick()
    expect(api.isHiddenByLinkage('t'), 'c 求值假 → 隐藏').toBe(true)
  })

  it('**无公式的联动即使有 targetField 也不能生效**（半配置误伤：条件 undefined 恒假→误隐藏）', async () => {
    const { api, formData } = setup(
      [f({ key: 'sw', linkage: { type: 'showHide', targetField: 'detail' } })],
      { a: 1, detail: '保留' },
    )
    api.setupWatchers()
    await tick()
    expect(api.isHiddenByLinkage('detail'), '没有公式就不该隐藏任何字段').toBe(false)
    formData.value.a = 2
    await tick()
    expect(api.isHiddenByLinkage('detail'), '换值也不该隐藏').toBe(false)
  })

  it('**DEV 下三源同字段给告警**（按求值顺序覆盖，静默错就是最难查的错）', async () => {
    expect(import.meta.env.DEV, '前置：测试环境应为 DEV').toBe(true)
    const { api } = setup(
      [
        f({
          key: 'city',
          optionsFrom: 'province',
          optionsMap: { 浙江: ['杭州'] },
          linkage: { type: 'followOptions', formula: '{{province}}' },
          dataSource: { type: 'api', apiUrl: '/api/city' },
        }),
      ],
      { province: '浙江' },
    )
    api.init()
    expect(warnCalls.length, '应告警一次').toBe(1)
    const msg = String(warnCalls[0]![0])
    expect(msg).toContain('同时配置了多个选项来源')
    expect(msg, '应点名具体来源').toContain('optionsMap')
    expect(msg).toContain('followOptions')
    expect(msg).toContain('dataSource.api')
  })

  it('**只有单一来源时不告警**', async () => {
    const { api } = setup([f({ key: 'city', optionsFrom: 'p', optionsMap: { A: ['a'] } })], { p: 'A' })
    api.init()
    expect(warnCalls).toHaveLength(0)
  })
})

/* ═══════════ 级联选项映射 ═══════════ */

describe('optionsFrom + optionsMap：级联选项', () => {
  const cascadeField = (map: Record<string, (string | Option)[]>) =>
    f({ key: 'city', optionsFrom: 'province', optionsMap: map })

  it('**依赖命中 → 字符串选项补成 {value,label}**', async () => {
    const { api, formData } = setup([cascadeField({ 浙江: ['杭州', '宁波'] })], { province: '浙江' })
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city')).toEqual([
      { value: '杭州', label: '杭州' },
      { value: '宁波', label: '宁波' },
    ])
    expect(formData.value.province).toBe('浙江')
  })

  it('**映射值已是 Option 对象时原样保留**（自定义 label 不能被覆盖）', async () => {
    const { api } = setup([cascadeField({ A: [{ value: 1, label: '一' }] as Option[] })], { province: 'A' })
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city')).toEqual([{ value: 1, label: '一' }])
  })

  it('**依赖无值 → 选项清空**（不是回退全量，否则用户看到与已选省份无关的城市）', async () => {
    const { api } = setup([cascadeField({ 浙江: ['杭州'] })], { province: '' })
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city')).toEqual([])
  })

  it('**依赖值不在映射表 → 选项清空**', async () => {
    const { api } = setup([cascadeField({ 浙江: ['杭州'] })], { province: '江苏' })
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city')).toEqual([])
  })

  it('**依赖为 null / undefined 时按空串处理**（不拼成 "null" 去查表）', async () => {
    const { api, formData } = setup([cascadeField({ null: ['x'], undefined: ['y'] })], {
      province: null,
    })
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city'), '不应命中 "null" 键').toEqual([])
    formData.value.province = undefined
    await tick()
    expect(api.dynamicOptions.value.get('city'), '也不应命中 "undefined" 键').toEqual([])
  })

  it('**只有 optionsFrom 没有 optionsMap → 不参与级联也不崩**（半配置容忍）', async () => {
    const { api, formData } = setup([f({ key: 'city', optionsFrom: 'province' })], { province: '浙江' })
    expect(() => api.setupWatchers()).not.toThrow()
    await tick()
    expect(api.dynamicOptions.value.has('city'), '不该写入任何选项').toBe(false)
    expect(formData.value.city).toBeUndefined()
  })

  it('**已选值为 null 时不去比对**（null 被 String() 成 "null" 会误判为脏值清空）', async () => {
    const { api, formData } = setup([cascadeField({ 浙江: ['杭州'] })], { province: '浙江', city: null })
    api.setupWatchers()
    await tick()
    expect(formData.value.city, 'null 保持 null，不该被改写成空串').toBeNull()
  })

  it('**已选值不在新选项里 → 清空**（防提交脏值：省变了城市还是旧省的）', async () => {
    const { api, formData } = setup([cascadeField({ 浙江: ['杭州'], 江苏: ['南京'] })], {
      province: '浙江',
      city: '南京',
    })
    api.setupWatchers()
    await tick()
    expect(formData.value.city, '南京不属于浙江 → 清空').toBe('')
  })

  it('**已选值仍在新选项里 → 保留**', async () => {
    const { api, formData } = setup([cascadeField({ 浙江: ['杭州', '宁波'] })], {
      province: '浙江',
      city: '宁波',
    })
    api.setupWatchers()
    await tick()
    expect(formData.value.city).toBe('宁波')
  })

  it('**已选值为空串时不去比对**（避免把空串也当成「不在选项里」反复写）', async () => {
    const { api, formData } = setup([cascadeField({ 浙江: ['杭州'] })], { province: '浙江', city: '' })
    api.setupWatchers()
    await tick()
    expect(formData.value.city).toBe('')
  })

  it('**数字型已选值按字符串比对**（select 的 option value 可能是数字）', async () => {
    const { api, formData } = setup([cascadeField({ '1': [{ value: 1, label: '一' }] as Option[] })], {
      province: '1',
      city: '1',
    })
    api.setupWatchers()
    await tick()
    expect(formData.value.city, '数字 1 与已选 "1" 视为命中').toBe('1')
  })
})

/* ═══════════ 联动类型剩余分支 ═══════════ */

describe('followValue：目标缺省为自身', () => {
  it('**无 targetField 时把结果写回自己**（文档承诺「否则是自身」）', async () => {
    const { api, formData } = setup(
      [f({ key: 'total', linkage: { type: 'followValue', formula: '{{price}} * 2' } })],
      { price: 5 },
    )
    api.setupWatchers()
    await tick()
    expect(formData.value.total, '写回自身').toBe(10)
    formData.value.price = 7
    await tick()
    expect(formData.value.total).toBe(14)
  })
})


describe('showHide / followOptions 的边界分支', () => {
  it('**showHide 无 targetField 时什么都不隐藏**（半配置不能误伤自己）', async () => {
    const fields = [f({ key: 'agree', linkage: { type: 'showHide', formula: '{{agree}} == 1' } })]
    const { api } = setup(fields, { agree: 2 })
    api.setupWatchers()
    await tick()
    expect([...api.hiddenByLinkage.value], '无目标就不隐藏任何字段').toEqual([])
  })

  it('**followOptions：显式 dependsOn 优先于公式提取**（公式里有两个字段时，取声明那个）', async () => {
    const { api } = setup(
      [
        f({
          key: 'city',
          options: [...opts('A1', 'B1')],
          linkage: { type: 'followOptions', formula: '{{province}} + {{other}}', dependsOn: ['other'] },
        }),
      ],
      { province: 'A', other: 'B1' },
    )
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city'), '按 other=B1 过滤').toEqual(opts('B1'))
  })

  it('**followOptions：无 dependsOn 时从公式提取依赖**', async () => {
    const { api } = setup(
      [
        f({
          key: 'city',
          options: [...opts('A1', 'B1')],
          linkage: { type: 'followOptions', formula: '{{province}}' },
        }),
      ],
      { province: 'A1' },
    )
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city')).toEqual(opts('A1'))
  })

  it('**followOptions：依赖无值时清空选项**', async () => {
    const { api, formData } = setup(
      [
        f({
          key: 'city',
          options: [...opts('A1')],
          linkage: { type: 'followOptions', formula: '{{province}}' },
        }),
      ],
      { province: 'A1' },
    )
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city')).toEqual(opts('A1'))
    formData.value.province = ''
    await tick()
    expect(api.dynamicOptions.value.get('city'), '依赖清空 → 选项清空').toEqual([])
  })

  it('**followOptions：过滤不到时回退全量**（与级联的「清空」语义相反，必须钉住）', async () => {
    const { api } = setup(
      [
        f({
          key: 'city',
          options: [...opts('A1', 'B1')],
          linkage: { type: 'followOptions', formula: '{{province}}' },
        }),
      ],
      { province: '不存在的值' },
    )
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city'), '不命中 → 回退原始全量').toEqual(opts('A1', 'B1'))
  })

  it('**followOptions：按 label 命中同样有效**（选项值与标签不一致；必须两个选项，否则「回退全量」会掩盖漏比 label）', async () => {
    const all = [
      { value: 'hz', label: '杭州' },
      { value: 'nb', label: '宁波' },
    ]
    const { api } = setup(
      [f({ key: 'city', options: all, linkage: { type: 'followOptions', formula: '{{province}}' } })],
      { province: '杭州' },
    )
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.get('city'), '只留杭州').toEqual([{ value: 'hz', label: '杭州' }])
  })

  it('**followOptions：公式无占位符且无 dependsOn → 直接跳过**（不动已有选项）', async () => {
    const { api } = setup(
      [
        f({
          key: 'city',
          options: [...opts('A1')],
          linkage: { type: 'followOptions', formula: '1 + 1' },
        }),
      ],
      {},
    )
    api.setupWatchers()
    await tick()
    expect(api.dynamicOptions.value.has('city'), '不该写入空数组').toBe(false)
  })

  it('**getFieldOptions：动态选项优先于静态 options**', async () => {
    const { api } = setup(
      [
        f({
          key: 'city',
          options: [...opts('静态')],
          linkage: { type: 'followOptions', formula: '{{p}}' },
        }),
      ],
      { p: '静态' },
    )
    api.setupWatchers()
    await tick()
    const field = api.hiddenByLinkage.value // 仅取一次引用，下面用静态对象
    void field
    expect(api.getFieldOptions(f({ key: 'city', options: [...opts('静态')] }))).toEqual(opts('静态'))
    expect(api.getFieldOptions(f({ key: 'city' }))?.length).toBe(1)
  })
})

/* ═══════════ 远程数据源 ═══════════ */

describe('loadRemoteOptions：请求构造与 JSON 形状', () => {
  function jsonResponse(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response
  }

  it('**非 api 类型 / 无 apiUrl → 不发请求**', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([])
    await api.loadRemoteOptions(f({ key: 'a', dataSource: { type: 'static' } }))
    await api.loadRemoteOptions(f({ key: 'a', dataSource: { type: 'api' } }))
    await api.loadRemoteOptions(f({ key: 'a', dataSource: { type: 'none' } }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(warnCalls, '非 api 类型不该走到安全校验去告警').toHaveLength(0)
  })

  it('**无 ? 时用 ? 拼联动参数**', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([])
    await api.loadRemoteOptions(f({ key: 'city', dataSource: { type: 'api', apiUrl: '/api/city', linkageField: 'p' } }), '浙江')
    const url = String(fetchMock.mock.calls[0]![0])
    expect(url).toContain('/api/city?p=')
    expect(decodeURIComponent(url)).toContain('浙江')
  })

  it('**已有 ? 时用 & 拼**', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([])
    await api.loadRemoteOptions(
      f({ key: 'city', dataSource: { type: 'api', apiUrl: '/api/city?x=1', linkageField: 'p' } }),
      'Z',
    )
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/city?x=1&p=Z')
  })

  it('**联动值为空 → 不拼参数**', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([])
    await api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: '/api/c', linkageField: 'p' } }), '')
    expect(String(fetchMock.mock.calls[0]![0])).not.toContain('p=')
  })

  it('**跨域地址被安全策略拒绝 → 不发请求且出声**（apiUrl 来自 schema，可经分享码流入）', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([])
    await api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: 'https://evil.example/x' } }))
    expect(fetchMock, '不该发出去').not.toHaveBeenCalled()
    expect(String(warnCalls.flat().join(' '))).toContain('安全策略拒绝')
  })

  it('**策略放行后跨域可以请求**', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ label: 'L', value: 'v' }]))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([], {}, { allowCrossOrigin: true, allowlist: ['https://cdn.example'] })
    await api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: 'https://cdn.example/x' } }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(api.dynamicOptions.value.get('c')).toEqual([{ label: 'L', value: 'v' }])
  })

  it('**resp.ok=false → 不改动选项**', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([], false)))
    const { api } = setup([])
    await api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x' } }))
    expect(api.dynamicOptions.value.has('c')).toBe(false)
  })

  it('**四种 JSON 形状都能取到列表**（裸数组 / data / list / options）', async () => {
    for (const body of [
      [{ label: 'A', value: 'a' }],
      { data: [{ label: 'A', value: 'a' }] },
      { list: [{ label: 'A', value: 'a' }] },
      { options: [{ label: 'A', value: 'a' }] },
    ]) {
      vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(body)))
      const { api } = setup([])
      await api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x' } }))
      expect(api.dynamicOptions.value.get('c'), JSON.stringify(body)).toEqual([{ label: 'A', value: 'a' }])
    }
  })

  it('**无法识别的 JSON 形状 → 空选项**（不能把整个对象当列表）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ foo: 1 })))
    const { api } = setup([])
    await api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x' } }))
    expect(api.dynamicOptions.value.get('c')).toEqual([])
  })

  it('**自定义 labelField / valueField 生效**', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ name: '甲', id: 7 }])))
    const { api } = setup([])
    await api.loadRemoteOptions(
      f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x', labelField: 'name', valueField: 'id' } }),
    )
    expect(api.dynamicOptions.value.get('c')).toEqual([{ label: '甲', value: 7 }])
  })

  it('**value 缺失时回退 label**（后端只给名字的常见情形）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ label: '甲' }])))
    const { api } = setup([])
    await api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x' } }))
    expect(api.dynamicOptions.value.get('c')).toEqual([{ label: '甲', value: '甲' }])
  })

  it('**cacheData 命中后不再请求**（同一 URL 第二次走缓存）', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ label: 'A', value: 'a' }]))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([])
    const field = f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x', cacheData: true } })
    await api.loadRemoteOptions(field)
    await api.loadRemoteOptions(field)
    expect(fetchMock, '只请求一次').toHaveBeenCalledTimes(1)
  })

  it('**未开 cacheData 时每次都请求**', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([])
    const field = f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x' } })
    await api.loadRemoteOptions(field)
    await api.loadRemoteOptions(field)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('**fetch 抛错 → 静默保持静态选项**（远程挂了不能让表单崩）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const { api } = setup([])
    await expect(
      api.loadRemoteOptions(f({ key: 'c', dataSource: { type: 'api', apiUrl: '/x' } })),
    ).resolves.toBeUndefined()
    expect(api.dynamicOptions.value.has('c')).toBe(false)
  })
})

/* ═══════════ initDataSources 与 watchers ═══════════ */

describe('initDataSources / watchers', () => {
  function jsonResponse(body: unknown): Response {
    return { ok: true, json: async () => body } as unknown as Response
  }

  it('**无联动条件的字段在初始化时预加载**', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ label: 'A', value: 'a' }]))
    vi.stubGlobal('fetch', fetchMock)
    const { api } = setup([
      f({ key: 'c1', dataSource: { type: 'api', apiUrl: '/a' } }),
      f({ key: 'c2', dataSource: { type: 'api', apiUrl: '/b', linkageField: 'p' } }),
    ])
    api.setupWatchers()
    await api.initDataSources()
    expect(fetchMock, '只预加载无联动条件的 c1').toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/a')
  })

  it('**formData 变化触发联动重算**（deep watch）', async () => {
    const { api, formData } = setup(
      [f({ key: 'total', linkage: { type: 'followValue', formula: '{{a}} + {{b}}', targetField: 'total' } })],
      { a: 1, b: 2 },
    )
    api.setupWatchers()
    await tick()
    expect(formData.value.total).toBe(3)
    formData.value.a = 10
    await tick()
    expect(formData.value.total, '深监听要能捕获嵌套字段变化').toBe(12)
  })

  it('**schema 配置变化后重扫联动字段**（宿主运行时改 fields）', async () => {
    const { api, fields, formData } = setup([f({ key: 'x' })], { a: 1, target: 'keep' })
    api.setupWatchers()
    await tick()
    expect(formData.value.target).toBe('keep')

    // 新增一条「a==999 时隐藏 target」的联动（当前 a=1 → 条件为假 → 应隐藏）
    fields.value = [
      f({ key: 'x' }),
      f({ key: 'sw', linkage: { type: 'showHide', formula: '{{a}} == 999', targetField: 'target' } }),
    ]
    await tick()
    await tick()
    expect(api.isHiddenByLinkage('target'), '新加的联动应立刻生效').toBe(true)
  })

  it('**数据源联动 watcher：依赖值变化 → 按新值请求**', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ label: 'A', value: 'a' }]))
    vi.stubGlobal('fetch', fetchMock)
    const { api, formData } = setup([
      f({ key: 'city', dataSource: { type: 'api', apiUrl: '/city', linkageField: 'province' } }),
    ])
    api.setupWatchers()
    await tick()
    expect(fetchMock, '有联动条件 → 初始化不请求').not.toHaveBeenCalled()

    formData.value.province = '浙江'
    await tick()
    await tick()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(decodeURIComponent(String(fetchMock.mock.calls[0]![0]))).toContain('浙江')
  })

  it('**数据源联动依赖被清空 → 删除动态选项**（回到静态选项）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([{ label: 'A', value: 'a' }])))
    const { api, formData } = setup([
      f({ key: 'city', options: [{ label: '静态', value: 's' }], dataSource: { type: 'api', apiUrl: '/c', linkageField: 'province' } }),
    ])
    api.setupWatchers()
    formData.value.province = '浙江'
    await tick()
    expect(api.dynamicOptions.value.get('city')).toEqual([{ label: 'A', value: 'a' }])

    formData.value.province = ''
    await tick()
    expect(api.dynamicOptions.value.has('city'), '清空后应删掉动态选项').toBe(false)
  })
})

/* ═══════════ 综合可见性 ═══════════ */

describe('isFieldVisibleWithLinkage：联动隐藏优先于 visibleWhen', () => {
  it('**被联动隐藏时即使 visibleWhen 满足也不可见**', async () => {
    const fields = [
      f({ key: 'sw', linkage: { type: 'showHide', formula: '{{a}} == 1', targetField: 'detail' } }),
      f({ key: 'detail', visibleWhen: { field: 'a', equals: 2 } }),
    ]
    const { api } = setup(fields, { a: 2 })
    api.setupWatchers()
    await tick()
    const detail = fields[1]!
    expect(api.isFieldVisibleWithLinkage(detail, { a: 2 }), '联动说隐藏 → 不可见').toBe(false)
  })

  it('**未被联动隐藏时按 visibleWhen 判定**', async () => {
    const detail = f({ key: 'detail', visibleWhen: { field: 'a', equals: 2 } })
    const { api } = setup([detail], { a: 2 })
    api.setupWatchers()
    await tick()
    expect(api.isFieldVisibleWithLinkage(detail, { a: 2 }), '条件满足 → 可见').toBe(true)
    expect(api.isFieldVisibleWithLinkage(detail, { a: 9 }), '条件不满足 → 不可见').toBe(false)
  })
})
