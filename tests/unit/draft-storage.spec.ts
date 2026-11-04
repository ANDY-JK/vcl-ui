// draft-storage：草稿持久化的可插拔适配层（H.1 第 2 项「草稿上云准备」）
//
// 要证明的三件事：
//   1. 默认仍是本地 IndexedDB（改造前行为逐字不变）；
//   2. 云适配器（HTTP 接缝）契约正确，失败**不静默**；
//   3. 换成云存储后，**容量上限与脏数据拒载这两道防护依然生效**——
//      这正是把「策略」与「存哪儿」分层的意义：换存储不该悄悄丢掉任何一道防护。
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createIndexedDbDraftStorage,
  createHttpDraftStorage,
  setActiveDraftStorage,
  getActiveDraftStorage,
} from '@/components/form-builder/designer/draft-storage'
import { useDesignerDraft } from '@/components/form-builder/designer/useDesignerDraft'
import { createField } from '@/components/form-builder/designer/types'
import { DRAFT_TTL } from '@/components/form-builder/draft-policy'

afterEach(() => {
  setActiveDraftStorage(null)
  vi.restoreAllMocks()
})

describe('默认实现与注册表', () => {
  it('未显式设置时默认为本地 IndexedDB', () => {
    expect(getActiveDraftStorage(DRAFT_TTL).name).toBe('indexeddb-local')
    expect(createIndexedDbDraftStorage(DRAFT_TTL).name).toBe('indexeddb-local')
  })

  it('可设置云端并复位', () => {
    const cloud = createHttpDraftStorage({ loadUrl: '/a', saveUrl: '/b', clearUrl: '/c', fetchImpl: vi.fn() as never })
    setActiveDraftStorage(cloud)
    expect(getActiveDraftStorage(DRAFT_TTL)).toBe(cloud)
    setActiveDraftStorage(null)
    expect(getActiveDraftStorage(DRAFT_TTL).name).toBe('indexeddb-local')
  })
})

describe('createHttpDraftStorage（云接缝）', () => {
  const json = (body: unknown, status = 200) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response
  const empty = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) }) as unknown as Response

  it('load：200 取草稿；204/404 视为无草稿', async () => {
    const fetchImpl = vi.fn(async () => json({ nodes: [], meta: {} }))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    expect(await s.load()).toEqual({ nodes: [], meta: {} })

    fetchImpl.mockResolvedValueOnce(empty(204))
    expect(await s.load()).toBeNull()
    fetchImpl.mockResolvedValueOnce(empty(404))
    expect(await s.load()).toBeNull()
  })

  it('load：其它非 2xx 抛错（不把故障当"无草稿"）', async () => {
    const fetchImpl = vi.fn(async () => empty(500))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    await expect(s.load()).rejects.toThrow(/HTTP 500/)
  })

  it('save：POST 且 body 为 { draft }', async () => {
    const fetchImpl = vi.fn(async () => empty(200))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    await s.save({ nodes: [], meta: {}, savedAt: 'x' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/s')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ draft: { nodes: [], meta: {}, savedAt: 'x' } })
  })

  it('save/clear 非 2xx 抛错', async () => {
    const fetchImpl = vi.fn(async () => empty(403))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    await expect(s.save({})).rejects.toThrow(/HTTP 403/)
    await expect(s.clear()).rejects.toThrow(/HTTP 403/)
  })

  it('clear：DELETE', async () => {
    const fetchImpl = vi.fn(async () => empty(204))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    await s.clear()
    expect((fetchImpl.mock.calls[0] as [string, RequestInit])[1].method).toBe('DELETE')
  })

  /* ── 404 的语义差别（#421）──────────────────────────────────────────
   * DELETE 是幂等语义：「草稿本来就不存在」与「已经删掉了」对调用方是同一件事。
   * 此前 404 会抛错 → useDesignerDraft.clearDraft 记成「清除失败」并 reportWarn，
   * 于是新建的空设计器（清空画布 / 表单已保存后丢弃草稿）每次白打一条失败告警。
   * 但 404 只对 clear 豁免，save 的 404 仍然是真失败（下面第 4 条钉住这点）。 */
  it('**clear：404 视为成功**（幂等删除，不该报警）', async () => {
    const fetchImpl = vi.fn(async () => empty(404))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    await expect(s.clear()).resolves.toBeUndefined()
  })

  it('clear：5xx 仍必须抛错（别把"真故障"也一起放过）', async () => {
    const fetchImpl = vi.fn(async () => empty(500))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    await expect(s.clear()).rejects.toThrow(/HTTP 500/)
  })

  it('**save：404 照旧抛错**（豁免只属于 clear，别顺手把写失败也吞掉）', async () => {
    const fetchImpl = vi.fn(async () => empty(404))
    const s = createHttpDraftStorage({ loadUrl: '/d', saveUrl: '/s', clearUrl: '/c', fetchImpl: fetchImpl as never })
    await expect(s.save({})).rejects.toThrow(/HTTP 404/)
  })

  it('headers 支持函数形态（每次请求取最新，便于带租户/令牌）', async () => {
    let token = 't1'
    const fetchImpl = vi.fn(async () => empty(200))
    const s = createHttpDraftStorage({
      loadUrl: '/d',
      saveUrl: '/s',
      clearUrl: '/c',
      headers: () => ({ Authorization: `Bearer ${token}` }),
      fetchImpl: fetchImpl as never,
    })
    await s.save({})
    token = 't2'
    await s.load()
    const h1 = (fetchImpl.mock.calls[0] as [string, RequestInit])[1].headers as Record<string, string>
    const h2 = (fetchImpl.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>
    expect(h1.Authorization).toBe('Bearer t1')
    expect(h2.Authorization).toBe('Bearer t2')
  })
})

describe('换成云存储后：策略防护不丢（分层的意义）', () => {
  /** 假"云"：把草稿存在这个 Map 里，模拟后端 */
  function fakeCloud() {
    const cloud = new Map<string, unknown>()
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET') {
        if (!cloud.has('draft')) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
        return { ok: true, status: 200, json: async () => cloud.get('draft') } as unknown as Response
      }
      if (method === 'POST') {
        cloud.set('draft', JSON.parse(String(init?.body)).draft)
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response
      }
      cloud.delete('draft')
      return { ok: true, status: 204, json: async () => ({}) } as unknown as Response
    })
    setActiveDraftStorage(
      createHttpDraftStorage({
        loadUrl: '/draft',
        saveUrl: '/draft',
        clearUrl: '/draft',
        fetchImpl: fetchImpl as never,
      }),
    )
    return { cloud, fetchImpl }
  }

  it('存取回路走云：A 端保存 → B 端（新实例）能取回，实现跨设备续填', async () => {
    const { cloud } = fakeCloud()
    const deviceA = useDesignerDraft()
    await deviceA.saveDraft([createField('text', 1)], { title: '云端草稿' })

    // 模拟另一台设备：全新 composable 实例，本地无任何数据，只能从"云"取
    const deviceB = useDesignerDraft()
    const draft = await deviceB.loadDraft()
    expect(draft?.meta.title).toBe('云端草稿')
    expect(draft?.nodes).toHaveLength(1)
    expect(cloud.has('draft')).toBe(true)
  })

  it('云路径下：超 2MB 仍然拒绝写入', async () => {
    const { cloud, fetchImpl } = fakeCloud()
    const d = useDesignerDraft()
    const bigMeta = { title: 'x'.repeat(2 * 1024 * 1024 + 1) } as never
    await d.saveDraft([], bigMeta)
    expect(cloud.has('draft'), '超限草稿不得上传到云端').toBe(false)
    expect(fetchImpl.mock.calls.filter((c) => (c[1] as RequestInit)?.method === 'POST')).toHaveLength(0)
  })

  it('云路径下：脏数据仍然拒载并清除', async () => {
    const { cloud } = fakeCloud()
    cloud.set('draft', [1, 2, 3]) // 后端返回了脏数据
    const d = useDesignerDraft()
    await expect(d.loadDraft()).resolves.toBeNull()
    expect(cloud.has('draft'), '脏数据应被清除').toBe(false)
  })

  it('云路径下：clear 生效，之后 load 为 null', async () => {
    fakeCloud()
    const d = useDesignerDraft()
    await d.saveDraft([createField('text', 1)], { title: 't' })
    await d.clearDraft()
    await expect(d.loadDraft()).resolves.toBeNull()
  })
})
