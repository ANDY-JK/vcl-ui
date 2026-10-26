// @vitest-environment happy-dom
/**
 * 「连接你自己的后端」状态机（第 114 轮）
 *
 * 它把**用户输入**的 baseUrl + 令牌变成可用的 FormStore / 导航来源，所以两件事必须钉死：
 *   ① **安全**：用户输入的地址不能绕过同源守卫（`javascript:` / 跨域绝对地址一律拒，且**不发请求**）
 *   ② **诚实**：连不上要说清是哪一种（401 令牌错 / 403 没权限 / 404 前缀错 / 网络），
 *      而不是笼统一句"连接失败"——这四种排障方向完全不同
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useBackendConnection } from '@/demos/lowcode/useBackendConnection'

type Call = { url: string; headers: Record<string, string> }

/** 假后端：按 status 回放，并记录请求 */
function fakeFetch(reply: { status: number; json?: unknown } | ((call: Call) => { status: number; json?: unknown })) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), headers: (init?.headers ?? {}) as Record<string, string> }
    calls.push(call)
    const r = typeof reply === 'function' ? reply(call) : reply
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json,
      // REST 仓储解析响应体走 res.text()（真实 fetch 两个方法都有），假后端也要给
      text: async () => (r.json === undefined ? '' : JSON.stringify(r.json)),
    } as unknown as Response
  }) as unknown as typeof fetch
  return { calls, fetchImpl: impl }
}

beforeEach(() => {
  localStorage.clear()
})

describe('useBackendConnection · 输入校验与安全守卫', () => {
  it('空地址 → 明确要求填写，且**不发请求**', async () => {
    const { calls, fetchImpl } = fakeFetch({ status: 200 })
    const conn = useBackendConnection({ fetchImpl })
    expect(await conn.connect()).toBe(false)
    expect(conn.status.value).toBe('error')
    expect(conn.error.value).toContain('请填写后端地址')
    expect(calls, '非法输入不该打扰后端').toHaveLength(0)
  })

  it('`javascript:` 伪协议被拒（不发请求）', async () => {
    const { calls, fetchImpl } = fakeFetch({ status: 200 })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: 'javascript:alert(1)' })
    expect(await conn.connect()).toBe(false)
    expect(conn.status.value).toBe('error')
    expect(conn.error.value).toMatch(/不被允许/)
    expect(calls).toHaveLength(0)
  })

  it('跨域绝对地址被拒（默认只允许同源 / 相对路径）', async () => {
    const { calls, fetchImpl } = fakeFetch({ status: 200 })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: 'https://evil.example.com/api/lowcode' })
    expect(await conn.connect()).toBe(false)
    expect(conn.error.value).toMatch(/不被允许/)
    expect(calls, '跨域不该发请求 —— 否则令牌就跟着牌子送出去了').toHaveLength(0)
  })
})

describe('useBackendConnection · 连通性探测', () => {
  it('同源地址 + 令牌 → 带 Bearer 读 __stats，成功后 status=connected 并带回两份数', async () => {
    const { calls, fetchImpl } = fakeFetch({ status: 200, json: { forms: 3, records: 7 } })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode', defaultToken: 'tk' })
    expect(await conn.connect()).toBe(true)

    expect(calls[0]!.url, '连的是自检路由').toBe('/api/lowcode/__stats')
    expect(calls[0]!.headers.Authorization).toBe('Bearer tk')
    expect(conn.status.value).toBe('connected')
    expect(conn.probe.value).toEqual({ forms: 3, records: 7 })
  })

  it('尾部斜杠被规整（`/api/lowcode/` 与 `/api/lowcode` 等价）', async () => {
    const { calls, fetchImpl } = fakeFetch({ status: 200, json: { forms: 0, records: 0 } })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode/' })
    await conn.connect()
    expect(calls[0]!.url).toBe('/api/lowcode/__stats')
  })

  it('401 → 直说"令牌无效"，与 403/404/网络分开', async () => {
    const cases: Array<[number, RegExp]> = [
      [401, /令牌无效/],
      [403, /没有权限/],
      [404, /没有参考后端的自检路由/],
      [500, /HTTP 500/],
    ]
    for (const [status, pattern] of cases) {
      const { fetchImpl } = fakeFetch({ status })
      const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode' })
      expect(await conn.connect()).toBe(false)
      expect(conn.status.value).toBe('error')
      expect(conn.error.value, `${status} 的文案要能指引排障`).toMatch(pattern)
    }
  })

  it('网络异常 → 提示"地址对吗/后端起了吗"，不让异常冒到界面外', async () => {
    const { fetchImpl } = fakeFetch(() => {
      throw new Error('ECONNREFUSED')
    })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode' })
    expect(await conn.connect()).toBe(false)
    expect(conn.error.value).toContain('ECONNREFUSED')
    expect(conn.error.value).toContain('后端起了吗')
  })
})

describe('useBackendConnection · 连上之后的产物', () => {
  it('未连接时 store()/navSource() 为 null（调用方据此回退）', () => {
    const conn = useBackendConnection({ defaultBaseUrl: '/api/lowcode' })
    expect(conn.store()).toBeNull()
    expect(conn.navSource()).toBeNull()
  })

  it('连接成功后 store() 打到同一地址、带同一令牌；navSource() 指向 /nav', async () => {
    const { calls, fetchImpl } = fakeFetch((call) =>
      call.url.endsWith('/__stats') ? { status: 200, json: { forms: 1, records: 2 } } : { status: 200, json: [] },
    )
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode', defaultToken: 'tk' })
    await conn.connect()

    const store = conn.store()
    expect(store, '连接后要有可用的仓储').toBeTruthy()
    await store!.listForms()
    expect(calls.at(-1)!.url, '仓储的请求也打同一前缀').toBe('/api/lowcode/forms')
    expect(calls.at(-1)!.headers.Authorization, '每次请求都带最新令牌').toBe('Bearer tk')

    expect(conn.navSource()).toMatchObject({ kind: 'api', url: '/api/lowcode/nav', dataPath: 'data.items' })
  })

  it('断开后回到 idle（输入保留，方便再连）', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, json: { forms: 0, records: 0 } })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode', defaultToken: 'tk' })
    await conn.connect()
    conn.disconnect()
    expect(conn.status.value).toBe('idle')
    expect(conn.probe.value).toBeNull()
    expect(conn.baseUrl.value, '地址要留着').toBe('/api/lowcode')
    expect(conn.store()).toBeNull()
  })
})

describe('useBackendConnection · 持久化边界（令牌默认不落盘）', () => {
  it('默认只存地址，**令牌不落盘**（localStorage 是 XSS 可读的）', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, json: { forms: 0, records: 0 } })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode', defaultToken: 'secret-tk' })
    await conn.connect()

    expect(localStorage.getItem('vcl.lowcode.backend.url')).toBe('/api/lowcode')
    expect(localStorage.getItem('vcl.lowcode.backend.token'), '没勾"记住令牌"就不该存').toBeNull()
    expect(localStorage.getItem('vcl.lowcode.backend.remember')).toBeNull()
  })

  it('勾了"记住令牌"才落盘，并在下次启动时恢复', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, json: { forms: 0, records: 0 } })
    const first = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode', defaultToken: 'secret-tk' })
    first.rememberToken.value = true
    await first.connect()

    expect(localStorage.getItem('vcl.lowcode.backend.token')).toBe('secret-tk')
    const second = useBackendConnection({ fetchImpl })
    expect(second.baseUrl.value, '地址自动恢复').toBe('/api/lowcode')
    expect(second.token.value, '令牌按勾选恢复').toBe('secret-tk')
    expect(second.rememberToken.value).toBe(true)
    expect(second.status.value, '恢复不等于已连接：连没连上要重新验一次').toBe('idle')
  })

  it('取消勾选会清掉已存的令牌（"取消记住"必须真的删除）', async () => {
    const { fetchImpl } = fakeFetch({ status: 200, json: { forms: 0, records: 0 } })
    const conn = useBackendConnection({ fetchImpl, defaultBaseUrl: '/api/lowcode', defaultToken: 'secret-tk' })
    conn.rememberToken.value = true
    await conn.connect()
    expect(localStorage.getItem('vcl.lowcode.backend.token')).toBe('secret-tk')

    conn.rememberToken.value = false
    await conn.connect()
    expect(localStorage.getItem('vcl.lowcode.backend.token'), '取消记住要清掉').toBeNull()
    expect(localStorage.getItem('vcl.lowcode.backend.remember')).toBeNull()
  })
})
