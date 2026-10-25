// @vitest-environment node
//
// 参考后端 ↔ 官方客户端 的**双向真 HTTP** 对照（第 106 轮）。
//
// 为什么必须真跑：`examples/lowcode-backend/server.mjs` 是给宿主"照着部署"的起点，
// 而它此前只被 Vite dev 中间件（demo 专用）以另一种实现覆盖过 ——
// 「宿主拿去部署的那份后端」与「库里的 createRestFormStore / useLowCodeNav」是否真的对得上，
// 只有把两边都跑起来才认。单测里 stub fetch 证明不了"契约一致"。
//
// 本文件用 node 环境（不是 happy-dom）：被测的就是一个真 node:http 服务，
// 用 undici 的 fetch 打真端口，避免 DOM 环境对 fetch 的任何包装带来的失真。
//
// ⚠️ 这里刻意**不用 barrel**（`@/components/form-builder`）而走深路径：
//   实测（第 106 轮）node 环境下 import barrel 会让 v8 覆盖把这些模块再登记一遍，
//   而那一次几乎不命中 → nav / **chart** 等**无关**域的函数覆盖被拉到地板以下，
//   闸口 check:coverage-domains 判红（现象："加一个测试，别处覆盖率反而掉"）。
//   深路径导入把这个连带面缩到最小。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { createRestFormStore } from '@/components/form-builder/designer/rest-form-store'
import { useLowCodeNav } from '@/components/form-builder/lowcode/useLowCodeNav'
import { policyFromOrigins } from '@/components/form-builder/api-url-guard'
import type { FormStore } from '@/components/form-builder/designer/store'
import type { NavNode } from '@/components/form-builder/lowcode/nav-schema'
import { createLowcodeBackend } from '../../examples/lowcode-backend/server.mjs'

const TOKEN = 'unit-token-r106'
const LIMITED = '{{SECRET_9rkd2vbn}}'
const AUTH = `Bearer ${TOKEN}`
const AUTH_LIMITED = `Bearer ${LIMITED}`

let server: { close: (cb?: () => void) => void; address: () => unknown }
let origin = ''
let base = ''

// 每个用例一份**全新的**后端实例：参考实现是内存存储，共享实例会让"空库起步"这类断言
// 依赖用例执行顺序（第 106 轮第一版就踩了：只读令牌那例看到的表单是上一例建的）。
beforeEach(async () => {
  const s = createLowcodeBackend({ token: TOKEN, limitedToken: LIMITED }) as unknown as {
    listen: (port: number, host: string, cb: () => void) => void
    address: () => { port: number }
    close: (cb?: () => void) => void
  }
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', done))
  const { port } = s.address()
  origin = `http://127.0.0.1:${port}`
  base = `${origin}/api/lowcode`
  server = s as unknown as typeof server
})

afterEach(async () => {
  await new Promise<void>((done) => server.close(done))
})

/** 2 个 nextTick + 宏任务：仅用于"不该发请求"的负向断言；正向断言一律 await refresh() ——
 *  真 HTTP 往返耗时不是几次 setTimeout(0) 能覆盖的（第 106 轮就先踩了这个时序坑） */
const flush = async () => {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

/** 在 effectScope 里起一个 api 来源的导航（等价于宿主挂 `<LowCodeNav>` 但不渲染 DOM） */
const navHost = (url: string, fetcher?: typeof fetch) => {
  const scope = effectScope()
  let api!: ReturnType<typeof useLowCodeNav>
  scope.run(() => {
    api = useLowCodeNav({
      source: { kind: 'api', url, dataPath: 'data.items' },
      ...(fetcher ? { fetcher } : {}),
      apiUrlPolicy: () => policyFromOrigins([origin]),
    })
  })
  return { api, stop: () => scope.stop() }
}

/** 宿主给请求带令牌的 fetcher（`headers` 的宿主侧写法） */
const authFetcher = (bearer: string): typeof fetch =>
  ((input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), Authorization: bearer },
    })) as typeof fetch

const store = (headers: Record<string, string> | (() => Record<string, string>)): FormStore =>
  createRestFormStore({ baseUrl: base, headers })

const design = (title: string) => ({
  schemaVersion: 3,
  meta: { title },
  nodes: [{ id: 'n1', type: 'text' as const, label: `${title}·名称`, key: 'name' }],
})

describe('参考后端（examples/lowcode-backend）× 官方客户端 · 真 HTTP', () => {
  it('FormStore 全链往返：设计、改名、收集记录五法、删除连记录一起删（每步用服务端 __stats 对账）', async () => {
    const s = store({ Authorization: AUTH })
    const stats = async () => {
      const res = await fetch(`${base}/__stats`, { headers: { Authorization: AUTH } })
      return (await res.json()) as { forms: number; records: number }
    }

    // 空库起步：参考实现不预置数据（宿主拿去部署时也是空的）
    expect(await s.listForms()).toEqual([])
    expect(await stats()).toEqual({ forms: 0, records: 0 })

    const a = await s.saveForm(null, design('甲表') as never, '甲表')
    expect(a.id, '后端必须回一个 id').toBeTruthy()
    expect(a.collectKey).toBe(`fd_collect_${a.id}`)
    const b = await s.saveForm(null, design('乙表') as never, '乙表')

    expect((await s.listForms()).map((f) => f.name).sort()).toEqual(['乙表', '甲表'])
    expect((await stats()).forms, '保存必须真的落到服务端').toBe(2)

    // 设计取回：字段级一致（不是"能取到就算过"）
    const loaded = (await s.loadForm(a.id)) as { meta: { title: string }; nodes: { label: string }[] }
    expect(loaded.meta.title).toBe('甲表')
    expect(loaded.nodes[0].label).toBe('甲表·名称')

    await s.renameForm(a.id, '甲表 v2')
    expect((await s.listForms()).find((f) => f.id === a.id)?.name).toBe('甲表 v2')

    // 收集记录：追加 → 改 → 删单条 → 清空
    await s.appendRecord(a.collectKey, { id: 'r1', time: '2026-10-26 09:00', data: { name: '客户甲' } })
    await s.appendRecord(a.collectKey, { id: 'r2', time: '2026-10-26 09:05', data: { name: '客户乙' } })
    await s.appendRecord(b.collectKey, { id: 'r3', time: '2026-10-26 09:10', data: { name: '客户丙' } })
    expect((await stats()).records).toBe(3)
    expect((await s.loadRecords(a.collectKey)).map((r) => r.id)).toEqual(['r2', 'r1'])

    await s.updateRecord?.(a.collectKey, 'r1', { name: '客户甲（改）' })
    expect((await s.loadRecords(a.collectKey)).find((r) => r.id === 'r1')?.data.name).toBe('客户甲（改）')

    await s.removeRecord(a.collectKey, 'r2')
    expect((await s.loadRecords(a.collectKey)).map((r) => r.id)).toEqual(['r1'])
    expect((await stats()).records).toBe(2)

    await s.clearRecords(a.collectKey)
    expect(await s.loadRecords(a.collectKey)).toEqual([])
    expect((await stats()).records, '清空只清这一张表的记录').toBe(1)

    // 删表单：连同它的记录一起删，别的表不受影响
    await s.deleteForm(a.id)
    expect((await s.listForms()).map((f) => f.name)).toEqual(['乙表'])
    expect((await stats()).records, '被删表单的记录也要消失').toBe(1)
  })

  it('鉴权是真的在拦：无令牌/错令牌一律 401（且错误信息能定位到路由与状态码）', async () => {
    const noToken = store({})
    await expect(noToken.listForms()).rejects.toThrow(/HTTP 401/)
    await expect(store({ Authorization: 'Bearer wrong' }).listForms()).rejects.toThrow(/HTTP 401/)
    await expect(store({ Authorization: TOKEN }).listForms(), '缺 Bearer 前缀也算错令牌').rejects.toThrow(/HTTP 401/)

    // 401 是**服务端**给的，而不是客户端自己短路
    const res = await fetch(`${base}/forms`)
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('响应是裸载荷（不是 { data: … } 信封）—— 多包一层会让导航直接空掉，锁住它', async () => {
    const res = await fetch(`${base}/forms`, { headers: { Authorization: AUTH } })
    const body: unknown = await res.json()
    expect(Array.isArray(body), 'GET /forms 必须是裸数组').toBe(true)

    const s = store({ Authorization: AUTH })
    const created = await s.saveForm(null, design('形状校验') as never, '形状校验')
    const one = await fetch(`${base}/forms/${created.id}`, { headers: { Authorization: AUTH } })
    const designBody = (await one.json()) as Record<string, unknown>
    expect(designBody, 'GET /forms/{id} 必须是裸 FormDesign').toHaveProperty('nodes')
    expect(designBody).not.toHaveProperty('data')
  })

  it('坏 JSON 是 400（客户端错误）而不是 500 —— 否则宿主日志里全是假的服务端故障', async () => {
    const res = await fetch(`${base}/forms`, {
      method: 'POST',
      headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
      body: '{oops',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'bad_json' })
  })

  it('宿主自建导航项：用 fetcher 带鉴权拉后端定义 → 受限分组才下发（权限语义可观测）', async () => {
    const host = navHost(`${base}/nav`, authFetcher(AUTH))
    await host.api.refresh()

    expect(host.api.error.value, '带令牌不该报错').toBeNull()
    const labels = host.api.nodes.value.map((n) => n.label)
    expect(labels).toContain('常用')
    expect(labels, '全权令牌能看到受限组').toContain('内部（需权限）')
    const internal = host.api.nodes.value.find((n) => n.label === '内部（需权限）') as
      | { children?: NavNode[] }
      | undefined
    expect(internal?.children?.map((c) => c.label)).toEqual(['审计日志'])
    host.stop()
  })

  it('只读令牌：导航照常但**看不到受限组**（不是"有令牌就给全量"）', async () => {
    const host = navHost(`${base}/nav`, authFetcher(AUTH_LIMITED))
    await host.api.refresh()

    expect(host.api.error.value).toBeNull()
    const labels = host.api.nodes.value.map((n) => n.label)
    expect(labels).toContain('常用')
    expect(labels, '受限组不该下发给只读令牌').not.toContain('内部（需权限）')
    host.stop()
  })

  it('身份明确但无权 → 403（而不是 401，也不是静默成功）：只读令牌写表单被拒', async () => {
    const readOnly = store({ Authorization: AUTH_LIMITED })
    // 读得到
    expect(await readOnly.listForms()).toEqual([])
    // 写不了：403（与"令牌不认识"的 401 区分开，宿主日志里能一眼分辨）
    await expect(readOnly.saveForm(null, design('越权') as never, '越权')).rejects.toThrow(/HTTP 403/)
    const res = await fetch(`${base}/forms`, {
      method: 'POST',
      headers: { Authorization: AUTH_LIMITED, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: null, design: design('越权'), name: '越权' }),
    })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'forbidden', need: 'store:write' })
  })

  it('导航来源不带令牌：**报错而不是静默空**（静默会让用户以为"后端没配导航"）', async () => {
    const host = navHost(`${base}/nav`)
    await host.api.refresh()

    expect(host.api.nodes.value, '拿不到就不该假装有导航').toEqual([])
    expect(host.api.error.value, '必须把原因暴露给宿主').toMatch(/401/)
    host.stop()
  })

  it('地址被安全策略拒绝时**不发请求**（默认只允许同源；跨域须宿主显式放行）', async () => {
    let called = 0
    const spy = ((input: RequestInfo | URL, init?: RequestInit) => {
      called += 1
      return fetch(input, init)
    }) as typeof fetch
    const scope = effectScope()
    let api!: ReturnType<typeof useLowCodeNav>
    scope.run(() => {
      api = useLowCodeNav({
        source: { kind: 'api', url: 'https://evil.example.net/nav', dataPath: 'data.items' },
        fetcher: spy,
        apiUrlPolicy: () => policyFromOrigins([origin]),
      })
    })
    await api.refresh()
    await flush()
    expect(called, '策略拒绝后不该发请求').toBe(0)
    expect(api.error.value).toMatch(/安全策略/)
    scope.stop()
  })
})