// createRestFormStore：用普通 REST 后端当表单仓储
//
// 这是「宿主对接自己的数据库」的参考实现 —— 把「实现 9 个方法的接口」降成「后端提供几条 REST 路由」。
// 覆盖：路由/方法逐条对账、404 与失败语义、以及**整链路**（REST 后端 → FormStore → 动态导航项）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRestFormStore } from '@/components/form-builder/designer/rest-form-store'
import { setActiveFormStore } from '@/components/form-builder/designer/store'
import { useFormNav } from '@/components/form-builder/useFormNav'
import type { FormMetaItem } from '@/components/form-builder/designer/store'
import type { FormDesign } from '@/components/form-builder/designer/types'

afterEach(() => {
  setActiveFormStore(null)
  vi.restoreAllMocks()
})

type Call = { url: string; method: string; body: unknown; headers: Record<string, string> }

/** 假后端：记录每次调用，按注册的响应返回 */
function backend(routes: Record<string, unknown | { status: number; body?: unknown }>) {
  const calls: Call[] = []
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    })
    const key = `${method} ${url}`
    const hit = routes[key]
    if (hit === undefined) return { ok: false, status: 404, text: async () => '' } as unknown as Response
    if (typeof hit === 'object' && hit !== null && 'status' in (hit as object)) {
      const spec = hit as { status: number; body?: unknown }
      return {
        ok: spec.status >= 200 && spec.status < 300,
        status: spec.status,
        text: async () => (spec.body === undefined ? '' : JSON.stringify(spec.body)),
      } as unknown as Response
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(hit) } as unknown as Response
  })
  return { calls, fetchImpl }
}

const META: FormMetaItem = { id: 'f1', name: '门店提报', updatedAt: '2026-10-01T00:00:00.000Z', collectKey: 'fd_collect_f1' }
const DESIGN = { schemaVersion: 3, meta: { title: '门店提报' }, nodes: [] } as unknown as FormDesign
const BASE = '/api/lowcode'

describe('路由与方法逐条对账', () => {
  it('listForms → GET /forms', async () => {
    const { calls, fetchImpl } = backend({ [`GET ${BASE}/forms`]: [META] })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    expect(await store.listForms()).toEqual([META])
    expect(calls[0]).toMatchObject({ url: `${BASE}/forms`, method: 'GET' })
  })

  it('loadForm → GET /forms/{id}；404 视为「表单不存在」返回 null', async () => {
    const { fetchImpl } = backend({ [`GET ${BASE}/forms/f1`]: DESIGN })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    expect(await store.loadForm('f1')).toEqual(DESIGN)

    const miss = backend({})
    const store2 = createRestFormStore({ baseUrl: BASE, fetchImpl: miss.fetchImpl as never })
    await expect(store2.loadForm('nope')).resolves.toBeNull()
  })

  it('saveForm → POST /forms，body 带 id/design/name', async () => {
    const { calls, fetchImpl } = backend({ [`POST ${BASE}/forms`]: META })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    const saved = await store.saveForm(null, DESIGN, '门店提报')
    expect(saved).toEqual(META)
    expect(calls[0].body).toEqual({ id: null, design: DESIGN, name: '门店提报' })
  })

  it('renameForm / deleteForm → PATCH、DELETE /forms/{id}', async () => {
    const { calls, fetchImpl } = backend({
      [`PATCH ${BASE}/forms/f1`]: { status: 204 },
      [`DELETE ${BASE}/forms/f1`]: { status: 204 },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    await store.renameForm('f1', '新名字')
    await store.deleteForm('f1')
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: `${BASE}/forms/f1`, body: { name: '新名字' } })
    expect(calls[1]).toMatchObject({ method: 'DELETE', url: `${BASE}/forms/f1` })
  })

  it('收集记录五法：GET / POST / PATCH / DELETE(单条) / DELETE(清空)', async () => {
    const KEY = 'fd_collect_f1'
    const { calls, fetchImpl } = backend({
      [`GET ${BASE}/records/${KEY}`]: [{ id: 'r1' }],
      [`POST ${BASE}/records/${KEY}`]: { status: 204 },
      [`PATCH ${BASE}/records/${KEY}/r1`]: { status: 204 },
      [`DELETE ${BASE}/records/${KEY}/r1`]: { status: 204 },
      [`DELETE ${BASE}/records/${KEY}`]: { status: 204 },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    expect(await store.loadRecords(KEY)).toEqual([{ id: 'r1' }])
    await store.appendRecord(KEY, { id: 'r1' } as never)
    await store.updateRecord!(KEY, 'r1', { a: 1 })
    await store.removeRecord(KEY, 'r1')
    await store.clearRecords(KEY)

    expect(calls.map((c) => `${c.method} ${c.url.replace(BASE, '')}`)).toEqual([
      `GET /records/${KEY}`,
      `POST /records/${KEY}`,
      `PATCH /records/${KEY}/r1`,
      `DELETE /records/${KEY}/r1`,
      `DELETE /records/${KEY}`,
    ])
    expect(calls[1].body).toEqual({ record: { id: 'r1' } })
    expect(calls[2].body).toEqual({ data: { a: 1 } })
  })

  it('id 会被 URL 编码（后端 id 里出现斜杠也不会越权到别的路由）', async () => {
    const { calls, fetchImpl } = backend({ [`GET ${BASE}/forms/a%2Fb`]: DESIGN })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    await store.loadForm('a/b')
    expect(calls[0].url).toBe(`${BASE}/forms/a%2Fb`)
  })
})

describe('失败语义：不静默', () => {
  it('非 2xx 抛错，且错误里带状态码与路由', async () => {
    const { fetchImpl } = backend({ [`GET ${BASE}/forms`]: { status: 500 } })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    await expect(store.listForms()).rejects.toThrow(/HTTP 500/)
    await expect(store.listForms()).rejects.toThrow(/\/forms/)
  })

  it('saveForm 后端没返回元信息 → 抛错（不允许静默当成功）', async () => {
    const noBody = vi.fn(async () => ({ ok: true, status: 204, text: async () => '' }) as unknown as Response)
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: noBody as never })
    await expect(store.saveForm(null, DESIGN)).rejects.toThrow(/未返回表单元信息/)
  })

  it('headers 支持函数形态（每次请求取最新令牌）', async () => {
    let token = 't1'
    const { calls, fetchImpl } = backend({ [`GET ${BASE}/forms`]: [META] })
    const store = createRestFormStore({
      baseUrl: BASE,
      headers: () => ({ Authorization: `Bearer ${token}` }),
      fetchImpl: fetchImpl as never,
    })
    await store.listForms()
    token = 't2'
    await store.listForms()
    expect(calls[0].headers.Authorization).toBe('Bearer t1')
    expect(calls[1].headers.Authorization).toBe('Bearer t2')
  })

  it('baseUrl 末尾斜杠被规整（不会拼出 //forms）', async () => {
    const { calls, fetchImpl } = backend({ [`GET ${BASE}/forms`]: [META] })
    const store = createRestFormStore({ baseUrl: `${BASE}/`, fetchImpl: fetchImpl as never })
    await store.listForms()
    expect(calls[0].url).toBe(`${BASE}/forms`)
  })
})

describe('整链路：宿主自己的 REST 后端 → FormStore → 动态导航项', () => {
  it('把 createRestFormStore 装成 activeFormStore 后，useFormNav 直接产出导航项', async () => {
    const { fetchImpl } = backend({
      [`GET ${BASE}/forms`]: [META, { id: 'f2', name: '合同收集', updatedAt: '2026-10-05T00:00:00.000Z', collectKey: 'fd_collect_f2' }],
    })
    // 宿主只做这两行：指向自己的后端、装进去
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl: fetchImpl as never })
    setActiveFormStore(store)

    // 外壳侧：一行拿到导航项，无需知道数据从哪来
    const nav = useFormNav({ autoLoad: false })
    const items = await nav.refresh()

    expect(items.map((i) => i.label)).toEqual(['合同收集', '门店提报'])
    expect(items[0].path).toBe('/form/f2')
    expect(items[0].collectKey).toBe('fd_collect_f2')
    expect(nav.error.value).toBeNull()
  })
})
