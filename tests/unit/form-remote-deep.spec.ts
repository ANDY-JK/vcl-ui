/**
 * useFormRemote.ts — 表单远程数据链路（188 行）
 *
 * ## 为什么补（单文件口径 语句 49.4% / **分支 29.6%** / 函数 88.9%，36/83 行未覆盖）
 *
 * 这个 composable 是**低代码表单与用户后端之间唯一的通道**：拉数据、存草稿、提交。
 * 而它此前只有 `idempotency.spec.ts` 顺着提交路径顺带覆盖了一小段 ——
 * **分支覆盖率 29.6% 是全库最差之一**，意味着「被安全策略拦下怎么办」「服务端返回非 2xx
 * 怎么办」「断网怎么办」「防抖期间连点怎么办」这些**用户真会遇到的路径**全都靠肉眼。
 * 本轮四条链路逐条锁死：
 *
 * ① `loadRemoteData`：无 apiUrl / edit 模式跳过；params 拼 query 且**数字要 String 化**；
 *    **跨域被策略拒绝时不发请求只提示**（这是防止分享码把数据 POST 到攻击者域的那道闸）；
 *    非 2xx 抛错走兜底提示；`json.data` 解包与「无 data 键时用 json 本身」；
 *    json 不是对象时降级成空对象；**只回填 schema 里声明的字段**、null/undefined 跳过；
 *    有变更才写回（无变更不动引用）；无论有无变更都要 `emitLoaded`。
 * ② `scheduleAutoSave`：三个前置条件（mode=review / 有 saveUrl / reviewAutoSave≠0）；
 *    **默认 3000ms 防抖**与自定义值；连改只发一次；**版本号让过期回调失效**；
 *    成功静默、失败才提示；被策略拦下也要提示；POST body 要合并 params。
 * ③ `applyApiDefaults`：**只回填仍等于初始值的字段**（已被 submitConfig 回填或草稿改过的
 *    不动，优先级天然更低）；无差异时不重赋值。
 * ④ `submitRemote`：无 saveUrl 直接 resolve；被拒 throw；**幂等键「一次逻辑提交复用、
 *    成功后才换新」**（失败重试仍能去重）；网络层失败与服务端拒绝**分别**上报结构化事件。
 *
 * ## harness
 *
 * `fetch` 用 stub；`applyRemoteDefaults` 与 `reportEvent` 用 `vi.mock` 隔离（前者要能
 * 控制何时 resolve，后者要断言上报内容）；防抖用假时钟 `advanceTimersByTimeAsync`。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'

/* ═══════════ 依赖替身 ═══════════ */

const hs = vi.hoisted(() => ({
  remoteDefaults: vi.fn(async () => ({}) as Record<string, unknown>),
  reportEvent: vi.fn(),
}))

vi.mock('@/components/form-builder/useFormSchema', async (orig) => {
  const actual = await orig<Record<string, unknown>>()
  return { ...actual, applyRemoteDefaults: hs.remoteDefaults }
})
vi.mock('@/components/_internal/runtime-observer', async (orig) => {
  const actual = await orig<Record<string, unknown>>()
  return { ...actual, reportEvent: hs.reportEvent }
})

import { useFormRemote } from '@/components/form-builder/useFormRemote'
import type { FormSubmitConfig } from '@/components/form-builder/types'

/* ═══════════ 夹具 ═══════════ */

const showToast = vi.fn()
const emitLoaded = vi.fn()
const loadFailMsg = (e: string) => `加载失败: ${e}`

function make(
  rc: Partial<FormSubmitConfig> | undefined,
  opts: {
    data?: Record<string, unknown>
    fields?: Array<{ key: string }>
    policy?: { allowlist?: readonly string[]; allowCrossOrigin?: boolean }
  } = {},
) {
  const submitConfig = ref<FormSubmitConfig | undefined>(rc as FormSubmitConfig | undefined)
  const formData = ref<Record<string, unknown>>(opts.data ?? {})
  const api = useFormRemote(
    submitConfig,
    formData as never,
    () => opts.fields ?? [{ key: 'name' }, { key: 'age' }],
    emitLoaded,
    showToast,
    loadFailMsg,
    opts.policy ?? {},
  )
  return { api, formData, submitConfig }
}

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response
const badHttp = (status = 500) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  hs.remoteDefaults.mockReset()
  hs.remoteDefaults.mockResolvedValue({})
  hs.reportEvent.mockReset()
  showToast.mockReset()
  emitLoaded.mockReset()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/* ═══════════ ① loadRemoteData ═══════════ */

describe('loadRemoteData', () => {
  it('**无 apiUrl 时什么都不做**', async () => {
    const { api } = make({ saveUrl: '/api/save' })
    await api.loadRemoteData()
    expect(fetchMock, '不该发请求').not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
    expect(emitLoaded).not.toHaveBeenCalled()
  })

  it('**edit 模式跳过拉取**（不覆盖已回填的数据）', async () => {
    const { api, formData } = make({ apiUrl: '/api/data', mode: 'edit' }, { data: { name: '已有' } })
    await api.loadRemoteData()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(formData.value, '数据原样').toEqual({ name: '已有' })
  })

  it('**params 拼进 query，数字也要 String 化**', async () => {
    fetchMock.mockResolvedValue(okJson({ data: {} }))
    const { api } = make({ apiUrl: '/api/data', params: { id: 7, tag: 'a' } })
    await api.loadRemoteData()
    const called = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(called).toContain('/api/data')
    expect(called, 'id 要变成字符串').toContain('id=7')
    expect(called).toContain('tag=a')
  })

  it('**跨域被安全策略拒绝：不发请求、只提示原因**（这是防分享码投毒的那道闸）', async () => {
    const { api } = make({ apiUrl: 'https://evil.example.com/steal' })
    await api.loadRemoteData()
    expect(fetchMock, '绝不能发出请求').not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledTimes(1)
    const [msg, level, ms] = showToast.mock.calls[0] as [string, string, number]
    expect(msg, '提示里要带拒绝原因').toContain('evil.example.com')
    expect(level).toBe('error')
    expect(ms).toBe(3000)
  })

  it('**策略显式放行后同一个跨域地址可以请求**', async () => {
    fetchMock.mockResolvedValue(okJson({ data: { name: 'x' } }))
    const { api } = make(
      { apiUrl: 'https://api.example.com/data' },
      { policy: { allowCrossOrigin: true, allowlist: ['https://api.example.com'] } },
    )
    await api.loadRemoteData()
    expect(fetchMock, '放行后应发请求').toHaveBeenCalledTimes(1)
  })

  it('**非 2xx：抛错并被兜底提示接住**', async () => {
    fetchMock.mockResolvedValue(badHttp(503))
    const { api } = make({ apiUrl: '/api/data' })
    await api.loadRemoteData()
    expect(showToast).toHaveBeenCalledTimes(1)
    expect((showToast.mock.calls[0] as [string])[0]).toContain('HTTP 503')
    expect(emitLoaded, '失败不该 emit').not.toHaveBeenCalled()
  })

  it('**响应 {data:{...}} 要解包到 data 层**', async () => {
    fetchMock.mockResolvedValue(okJson({ data: { name: '张三', age: 30 } }))
    const { api, formData } = make({ apiUrl: '/api/data' })
    await api.loadRemoteData()
    expect(formData.value).toEqual({ name: '张三', age: 30 })
    expect(emitLoaded.mock.calls[0]![0], 'emitLoaded 收到的是解包后的对象').toEqual({ name: '张三', age: 30 })
  })

  it('**无 data 键时用整个 json**', async () => {
    fetchMock.mockResolvedValue(okJson({ name: '李四' }))
    const { api, formData } = make({ apiUrl: '/api/data' })
    await api.loadRemoteData()
    expect(formData.value).toEqual({ name: '李四' })
  })

  it('**json 是字符串/数字（非对象）时降级成空对象，不炸**', async () => {
    for (const body of ['plain', 42, true]) {
      showToast.mockReset()
      emitLoaded.mockReset()
      fetchMock.mockResolvedValue(okJson(body))
      const { api, formData } = make({ apiUrl: '/api/data' }, { data: { keep: 1 } })
      await api.loadRemoteData()
      expect(formData.value, `${JSON.stringify(body)} 不改值`).toEqual({ keep: 1 })
      expect(emitLoaded.mock.calls[0]![0], '降级成空对象').toEqual({})
      expect(showToast).not.toHaveBeenCalled()
    }
  })

  it('**json 是数组时原样作为 source**（数组也是 object，按 key 取不到值即不改）', async () => {
    fetchMock.mockResolvedValue(okJson({ data: [{ name: 'x' }] }))
    const { api, formData } = make({ apiUrl: '/api/data' }, { data: { keep: 1 } })
    await api.loadRemoteData()
    expect(formData.value, '数字下标取不到 name/age → 不改值').toEqual({ keep: 1 })
    expect(emitLoaded.mock.calls[0]![0], 'emitLoaded 收到数组本身').toEqual([{ name: 'x' }])
  })

  it('**只回填 schema 声明的字段，未声明的忽略**', async () => {
    fetchMock.mockResolvedValue(okJson({ data: { name: 'A', age: 1, secret: '不该进来' } }))
    const { api, formData } = make({ apiUrl: '/api/data' }, { fields: [{ key: 'name' }] })
    await api.loadRemoteData()
    expect(formData.value).toEqual({ name: 'A' })
    expect(formData.value).not.toHaveProperty('secret')
  })

  it('**null / undefined 字段跳过**（不能把已有值冲成空）', async () => {
    fetchMock.mockResolvedValue(okJson({ data: { name: null, age: undefined } }))
    const { api, formData } = make({ apiUrl: '/api/data' }, { data: { name: '原值', age: 9 } })
    await api.loadRemoteData()
    expect(formData.value).toEqual({ name: '原值', age: 9 })
  })

  it('**无任何字段变更时不重赋值**（保持引用，避免无谓重渲染）', async () => {
    fetchMock.mockResolvedValue(okJson({ data: { other: 1 } }))
    const { api, formData } = make({ apiUrl: '/api/data' }, { data: { name: '原值' } })
    const before = formData.value
    await api.loadRemoteData()
    expect(formData.value, '引用不变').toBe(before)
    expect(emitLoaded, '但仍要 emitLoaded').toHaveBeenCalledTimes(1)
  })

  it('**有变更时合并进原数据，不丢其它键**', async () => {
    fetchMock.mockResolvedValue(okJson({ data: { name: '新值' } }))
    const { api, formData } = make({ apiUrl: '/api/data' }, { data: { name: '旧', draft: 'd1' } })
    await api.loadRemoteData()
    expect(formData.value).toEqual({ name: '新值', draft: 'd1' })
  })

  it('**网络异常（Error）：提示里带 message**', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const { api } = make({ apiUrl: '/api/data' })
    await api.loadRemoteData()
    expect((showToast.mock.calls[0] as [string])[0]).toBe('加载失败: network down')
    expect((showToast.mock.calls[0] as [string, string, number])[2], '失败提示时长更短').toBe(2500)
  })

  it('**抛出非 Error（字符串/对象）也要能转成文案**', async () => {
    fetchMock.mockRejectedValue('boom')
    const { api } = make({ apiUrl: '/api/data' })
    await api.loadRemoteData()
    expect((showToast.mock.calls[0] as [string])[0]).toBe('加载失败: boom')
  })
})

/* ═══════════ ② scheduleAutoSave ═══════════ */

describe('scheduleAutoSave', () => {
  const reviewCfg = (over: Partial<FormSubmitConfig> = {}): Partial<FormSubmitConfig> => ({
    mode: 'review',
    saveUrl: '/api/save',
    ...over,
  })

  it('**三个前置条件任一不满足都不排程**', async () => {
    vi.useFakeTimers()
    for (const cfg of [
      { mode: 'create' as const, saveUrl: '/api/save' },
      { mode: 'review' as const },
      { mode: 'review' as const, saveUrl: '/api/save', reviewAutoSave: 0 },
    ]) {
      fetchMock.mockReset()
      showToast.mockReset()
      const { api } = make(cfg)
      api.scheduleAutoSave()
      await vi.advanceTimersByTimeAsync(10000)
      expect(fetchMock, `${JSON.stringify(cfg)} 不该发请求`).not.toHaveBeenCalled()
      // 也不能退化成「发了个空地址再提示被拦」——那样用户会看到莫名其妙的报错
      expect(showToast, `${JSON.stringify(cfg)} 也不该弹提示`).not.toHaveBeenCalled()
    }
  })

  it('**默认防抖 3000ms：2999 不发、3000 才发**', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(reviewCfg())
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(2999)
    expect(fetchMock, '未到点').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock, '到点发出').toHaveBeenCalledTimes(1)
  })

  it('**自定义 reviewAutoSave 生效**', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(reviewCfg({ reviewAutoSave: 500 }))
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(499)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('**连续调度只发最后一次**（防抖语义）', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(reviewCfg({ reviewAutoSave: 500 }))
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(200)
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(200)
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(499)
    expect(fetchMock, '仍在防抖窗口内').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock, '只发一次').toHaveBeenCalledTimes(1)
  })

  it('**POST body 合并 formData 与 params，并带 JSON Content-Type**', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(reviewCfg({ params: { tenant: 't1' } }), { data: { name: '草稿' } })
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(3000)
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(String(init.body))).toEqual({ name: '草稿', tenant: 't1' })
  })

  it('**成功静默**（每 3 秒弹一次提示会打断填写）', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(reviewCfg())
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(3000)
    expect(showToast, '成功不提示').not.toHaveBeenCalled()
  })

  it('**被安全策略拒绝：不发请求、提示原因**', async () => {
    vi.useFakeTimers()
    const { api } = make(reviewCfg({ saveUrl: 'https://evil.example.com/save' }))
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect((showToast.mock.calls[0] as [string])[0]).toContain('evil.example.com')
  })

  it('**HTTP 非 2xx：提示自动保存失败**', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(badHttp(500))
    const { api } = make(reviewCfg())
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(3000)
    expect(showToast).toHaveBeenCalledTimes(1)
    expect((showToast.mock.calls[0] as [string, string, number])[2]).toBe(2500)
  })

  it('**网络异常同样提示自动保存失败**', async () => {
    vi.useFakeTimers()
    fetchMock.mockRejectedValue(new Error('offline'))
    const { api } = make(reviewCfg())
    api.scheduleAutoSave()
    await vi.advanceTimersByTimeAsync(3000)
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('**旧请求失败不弹提示**（飞行中又有新调度 → 版本号变了，失败提示被丢弃）', async () => {
    vi.useFakeTimers()
    // 手动控制 fetch 的结算时刻：让第一个自动保存「卡在飞行中」
    let rejectFirst: ((e: unknown) => void) | null = null
    fetchMock.mockImplementation(
      () =>
        new Promise((_res, rej) => {
          rejectFirst = rej
        }),
    )
    const { api } = make({ mode: 'review', saveUrl: '/api/save', reviewAutoSave: 300 })
    api.scheduleAutoSave() // v1
    await vi.advanceTimersByTimeAsync(300) // v1 回调启动 → 卡在 fetch
    expect(fetchMock, '前置：v1 已发出').toHaveBeenCalledTimes(1)

    api.scheduleAutoSave() // v2：版本号 +1
    rejectFirst!(new Error('stale failure'))
    await vi.advanceTimersByTimeAsync(0)
    expect(showToast, 'v1 的失败要给用户静默掉（已不是最新状态）').not.toHaveBeenCalled()
    api.dispose()
  })

  it('**旧版本回调不覆盖新状态**（版本号守卫）', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(reviewCfg({ reviewAutoSave: 300 }))
    api.scheduleAutoSave() // v1
    await vi.advanceTimersByTimeAsync(200)
    api.scheduleAutoSave() // v2，v1 的回调被 clearTimeout 掉
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(hs.reportEvent, '自动保存失败不上报提交事件').not.toHaveBeenCalled()
  })
})

/* ═══════════ ③ applyApiDefaults ═══════════ */

describe('applyApiDefaults', () => {
  const flush = async () => {
    await nextTick()
    await Promise.resolve()
    await Promise.resolve()
  }

  it('**只回填仍等于初始值的字段**（被回填/草稿改过的不动）', async () => {
    hs.remoteDefaults.mockResolvedValue({ name: '接口给的', age: 99 })
    // 判据是「当前值 === 初始占位值」：name 仍是 ''（没人改过）→ 回填；
    // age 已被用户改成 20、初始占位是 10 → 不等于初始值 → 跳过（优先级更低）
    const { api, formData } = make({}, { data: { name: '', age: 20 } })
    const initial = { name: '', age: 10 }
    api.applyApiDefaults(() => [{ key: 'name' }, { key: 'age' }] as never, () => initial)
    await flush()
    expect(formData.value.name, '仍是初始空值 → 被回填').toBe('接口给的')
    expect(formData.value.age, '已改成 20、不等于初始 10 → 不覆盖').toBe(20)
  })

  it('**接口值与当前值相同也会重赋值**（判据是「等于初始值」而非「有差异」，P3 轻微多余渲染）', async () => {
    hs.remoteDefaults.mockResolvedValue({ name: '同值' })
    const { api, formData } = make({}, { data: { name: '同值' } })
    const initial = { name: '同值' } // 当前值 === 初始值 → 判据成立 → 会打补丁
    const before = formData.value
    api.applyApiDefaults(() => [{ key: 'name' }] as never, () => initial)
    await flush()
    expect(formData.value, '引用被换掉').not.toBe(before)
    expect(formData.value, '值不变').toEqual({ name: '同值' })
  })

  it('**接口返回空对象时不改值**', async () => {
    hs.remoteDefaults.mockResolvedValue({})
    const { api, formData } = make({}, { data: { name: '' } })
    const before = formData.value
    api.applyApiDefaults(() => [{ key: 'name' }] as never, () => ({ name: '' }))
    await flush()
    expect(formData.value).toBe(before)
  })

  it('**把策略透传给 applyRemoteDefaults**（跨域白名单要一路传下去）', async () => {
    hs.remoteDefaults.mockResolvedValue({})
    const policy = { allowCrossOrigin: true, allowlist: ['https://api.x.com'] }
    const { api } = make({}, { policy })
    api.applyApiDefaults(() => [] as never, () => ({}))
    await flush()
    expect(hs.remoteDefaults.mock.calls[0]![1], '策略透传').toEqual({ apiUrlPolicy: policy })
  })
})

/* ═══════════ ④ submitRemote ═══════════ */

describe('submitRemote', () => {
  const cfg = (over: Partial<FormSubmitConfig> = {}): Partial<FormSubmitConfig> => ({
    saveUrl: '/api/save',
    ...over,
  })

  it('**无 saveUrl：直接 resolve，不发请求**', async () => {
    const { api } = make({})
    await expect(api.submitRemote({ name: 'a' })).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('**被安全策略拒绝：throw 且不发请求**', async () => {
    const { api } = make(cfg({ saveUrl: 'https://evil.example.com/save' }))
    await expect(api.submitRemote({ name: 'a' })).rejects.toThrow(/安全策略拒绝/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('**成功：不带幂等键残留，下次换新键**', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(cfg())
    await api.submitRemote({ name: 'a' })
    expect(api.currentIdempotencyKey(), '成功后清空').toBeNull()
    await api.submitRemote({ name: 'b' })
    const k1 = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    const k2 = (fetchMock.mock.calls[1] as unknown[])[1] as RequestInit
    const h1 = (k1.headers as Record<string, string>)['Idempotency-Key']
    const h2 = (k2.headers as Record<string, string>)['Idempotency-Key']
    expect(h1).toBeTruthy()
    expect(h2, '两次提交不能同键').not.toBe(h1)
  })

  it('**失败后重试复用同一键**（服务端才能识别为同一次提交）', async () => {
    fetchMock.mockResolvedValue(badHttp(500))
    const { api } = make(cfg())
    await expect(api.submitRemote({ name: 'a' })).rejects.toThrow('HTTP 500')
    const pending = api.currentIdempotencyKey()
    expect(pending, '失败要保留键').toBeTruthy()

    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    await api.submitRemote({ name: 'a' })
    const retry = (fetchMock.mock.calls[1] as unknown[])[1] as RequestInit
    expect((retry.headers as Record<string, string>)['Idempotency-Key'], '重试同键').toBe(pending)
    expect(api.currentIdempotencyKey(), '成功后才换新').toBeNull()
  })

  it('**body 合并 data 与 params**', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(cfg({ params: { app: 'x' } }))
    await api.submitRemote({ name: 'n', age: 3 })
    const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({ name: 'n', age: 3, app: 'x' })
  })

  it('**网络层失败：上报结构化事件并 rethrow 原始错误**', async () => {
    const boom = new Error('ECONNREFUSED')
    fetchMock.mockRejectedValue(boom)
    const { api } = make(cfg())
    await expect(api.submitRemote({ name: 'a' })).rejects.toBe(boom)
    expect(hs.reportEvent).toHaveBeenCalledTimes(1)
    const [code, msg, detail, level] = hs.reportEvent.mock.calls[0] as [string, string, Record<string, unknown>, string]
    expect(code).toBe('form-builder/submit-failed')
    expect(msg).toContain('网络层')
    expect(detail.fieldCount, '上报字段数').toBe(1)
    expect(String(detail.reason), '带上底层原因').toContain('ECONNREFUSED')
    expect(level).toBe('error')
  })

  it('**服务端拒绝：上报带 status 的事件并 throw HTTP 码**', async () => {
    fetchMock.mockResolvedValue(badHttp(422))
    const { api } = make(cfg())
    await expect(api.submitRemote({ name: 'a' })).rejects.toThrow('HTTP 422')
    const detail = hs.reportEvent.mock.calls[0]![2] as Record<string, unknown>
    expect(detail.status).toBe(422)
    expect(String(hs.reportEvent.mock.calls[0]![1])).toContain('服务端拒绝')
  })

  it('**成功不上报失败事件**', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make(cfg())
    await api.submitRemote({ name: 'a' })
    expect(hs.reportEvent).not.toHaveBeenCalled()
  })
})

/* ═══════════ ⑤ dispose ═══════════ */

describe('dispose', () => {
  it('**卸载时清掉待发的自动保存**（否则组件销毁后仍会发请求）', async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as unknown as Response)
    const { api } = make({ mode: 'review', saveUrl: '/api/save', reviewAutoSave: 1000 })
    api.scheduleAutoSave()
    api.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchMock, '卸载后不该再发').not.toHaveBeenCalled()
  })

  it('**没有待发任务时 dispose 不报错**', () => {
    const { api } = make({})
    expect(() => api.dispose()).not.toThrow()
  })
})
