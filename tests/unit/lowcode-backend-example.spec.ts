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
import { createServer } from 'node:http'
import { createRestFormStore, RestStoreConflictError } from '@/components/form-builder/designer/rest-form-store'
import { useLowCodeNav } from '@/components/form-builder/lowcode/useLowCodeNav'
import { policyFromOrigins } from '@/components/form-builder/api-url-guard'
import type { FormStore } from '@/components/form-builder/designer/store'
import type { NavNode } from '@/components/form-builder/lowcode/nav-schema'
import { createLowcodeBackend, createLowcodeHandler } from '../../examples/lowcode-backend/server.mjs'
import { createSqliteStore } from '../../examples/lowcode-backend/sqlite-store.mjs'

const TOKEN = 'unit-token-r106'
const LIMITED = '{{SECRET_9rkd2vbn}}'
const AUTH = `Bearer ${TOKEN}`
const AUTH_LIMITED = `Bearer ${LIMITED}`

/**
 * **同一套用例跑两种存储**：内存版与真 SQLite 版。
 *
 * 这是本轮的核心主张的**证据形态**：README 里写"换数据库只改 11 个方法"是一句**说法**；
 * 只有"同一批断言在两份实现上都绿"才叫**证明**——它也顺带锁住了两版的语义对齐
 * （记录后写的在前、删表单级联删记录、JSON 字段的 null/缺省口径）。
 */
const STORES: Array<[label: string, make: () => { store?: unknown; close?: () => void }]> = [
  ['内存', () => ({})],
  [
    'SQLite',
    () => {
      const store = createSqliteStore(':memory:') as unknown as { close: () => void }
      return { store, close: () => store.close() }
    },
  ],
]

let server: { close: (cb?: () => void) => void; address: () => unknown }
let origin = ''
let base = ''
let closeStore: (() => void) | undefined

/** 每个用例一份**全新的**后端实例（含全新的库）：共享实例会让"空库起步"这类断言
 *  依赖用例执行顺序（第 106 轮第一版就踩了：只读令牌那例看到的表单是上一例建的）。 */
async function bootServer(store?: unknown) {
  const s = createLowcodeBackend({
    token: TOKEN,
    limitedToken: LIMITED,
    ...(store ? { store: store as never } : {}),
  }) as unknown as {
    listen: (port: number, host: string, cb: () => void) => void
    address: () => { port: number }
    close: (cb?: () => void) => void
  }
  await new Promise<void>((done) => s.listen(0, '127.0.0.1', done))
  const { port } = s.address()
  origin = `http://127.0.0.1:${port}`
  base = `${origin}/api/lowcode`
  server = s as unknown as typeof server
}

afterEach(async () => {
  await new Promise<void>((done) => server.close(done))
  closeStore?.()
  closeStore = undefined
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

describe.each(STORES)('参考后端（examples/lowcode-backend）× 官方客户端 · 真 HTTP｜存储：%s', (_label, make) => {
  beforeEach(async () => {
    const made = make()
    closeStore = made.close
    await bootServer(made.store)
  })

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
it('嵌进别人的服务器：前缀可换，且**不匹配的路径交回外层**（演示站就是这么挂的）', async () => {
    // 这一例复刻 vite.config.ts 的挂法：**同一份处理器** + 外层先判前缀、不匹配则 next/自己处理。
    // 它锁住的是"demo 与独立部署共用一份实现"这件事本身（不是再加一份平行实现）。
    const handler = createLowcodeHandler({
      token: TOKEN,
      prefix: '/api/custom/store',
      seed: async (store) => {
        await store.saveForm('demo-form', design('服务端表') as never, '服务端表')
      },
    })
    const outer = createServer((req, res) => {
      if (!(req.url ?? '').startsWith('/api/custom/store/')) {
        res.writeHead(418, { 'Content-Type': 'text/plain' })
        res.end('outer')
        return
      }
      void handler(req, res)
    })
    await new Promise<void>((done) => outer.listen(0, '127.0.0.1', done))
    const { port } = outer.address() as { port: number }
    try {
      const s = createRestFormStore({
        baseUrl: `http://127.0.0.1:${port}/api/custom/store`,
        headers: { Authorization: AUTH },
      })
      expect((await s.listForms()).map((f) => f.name), '换前缀后照样能用').toEqual(['服务端表'])

      const other = await fetch(`http://127.0.0.1:${port}/api/other/store/forms`, {
        headers: { Authorization: AUTH },
      })
      expect(other.status, '前缀不匹配的路径必须交回外层（否则会吞掉宿主自己的路由）').toBe(418)
      expect(await other.text()).toBe('outer')
    } finally {
      await new Promise<void>((done) => outer.close(done))
    }
  })

  it('预置数据 seed：**首次请求前**就落地（没有"第一个请求看不见种子"的竞态）', async () => {
    const seeded = createLowcodeBackend({
      token: TOKEN,
      seed: async (store) => {
        await store.saveForm('seed-1', design('种子表') as never, '种子表')
        await store.appendRecord('fd_collect_seed-1', {
          id: 'r1',
          time: '2026-01-01 00:00',
          data: { note: '种子记录' },
        })
      },
    })
    await new Promise<void>((done) => seeded.listen(0, '127.0.0.1', done))
    const { port } = seeded.address() as { port: number }
    const seededOrigin = `http://127.0.0.1:${port}`
    try {
      // **第一个**请求就要看得见种子里那张表 —— 不 await ready 的实现这里会是空的
      const forms = await (
        await fetch(`${seededOrigin}/api/lowcode/forms`, { headers: { Authorization: AUTH } })
      ).json()
      expect((forms as { name: string }[]).map((f) => f.name)).toEqual(['种子表'])
      const records = await (
        await fetch(`${seededOrigin}/api/lowcode/records/fd_collect_seed-1`, {
          headers: { Authorization: AUTH },
        })
      ).json()
      expect((records as { id: string }[]).map((r) => r.id)).toEqual(['r1'])
    } finally {
      await new Promise<void>((done) => seeded.close(done))
    }
  })

  it('seed 自己失败时**如实 500**（不假装没事、也不静默返回空），且鉴权仍然先判', async () => {
    const broken = createLowcodeBackend({
      token: TOKEN,
      seed: async () => {
        throw new Error('数据库连不上')
      },
    })
    await new Promise<void>((done) => broken.listen(0, '127.0.0.1', done))
    const { port } = broken.address() as { port: number }
    const brokenOrigin = `http://127.0.0.1:${port}`
    try {
      const res = await fetch(`${brokenOrigin}/api/lowcode/forms`, { headers: { Authorization: AUTH } })
      expect(res.status).toBe(500)
      expect(await res.json()).toMatchObject({ error: 'seed_failed' })

      // 未授权方不该从"运维故障"里得到任何信息：401 先于 seed_failed
      const unauth = await fetch(`${brokenOrigin}/api/lowcode/forms`)
      expect(unauth.status).toBe(401)
    } finally {
      await new Promise<void>((done) => broken.close(done))
    }
  })

  it('**乐观锁**：带 rev 写成功、用旧 rev 再写 → 409 且带 currentRev；不带 rev 仍 204（老客户端不受影响）', async () => {
    const send = (url: string, body: unknown, method = 'POST') =>
      fetch(url, {
        method,
        headers: { Authorization: AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

    // ① 建表单：新实体的 rev 从 1 起
    const created = await send(`${base}/forms`, { design: design('并发表'), name: '并发表' })
    expect(created.status).toBe(201)
    const saved = (await created.json()) as { id: string; collectKey: string; rev: number }
    expect(saved.rev, '新建表单 rev 从 1 起').toBe(1)

    // ② 写一条记录：同样从 1 起
    const key = saved.collectKey
    expect(
      (await send(`${base}/records/${key}`, { record: { id: 'r1', time: '2026-10-26 10:00', data: { name: '张三' } } }))
        .status,
    ).toBe(204)
    const readRev = async () =>
      (
        (await (await fetch(`${base}/records/${key}`, { headers: { Authorization: AUTH } })).json()) as Array<{
          rev: number
        }>
      )[0].rev
    expect(await readRev(), '新记录 rev 从 1 起').toBe(1)

    const patchRec = (body: unknown) => send(`${base}/records/${key}/r1`, body, 'PATCH')

    // ③ 带"我读到的版本"写 → 成功，且版本递增
    expect((await patchRec({ data: { name: '甲先改' }, rev: 1 })).status).toBe(204)
    expect(await readRev(), '写成功要 +1').toBe(2)

    // ④ 另一个标签页也读到 rev=1，随后提交 → 必须 409，**不能**把甲改的悄悄盖掉
    const conflict = await patchRec({ data: { name: '乙后到' }, rev: 1 })
    expect(conflict.status, '别人改过了要给 409，而不是静默覆盖').toBe(409)
    const conflictBody = (await conflict.json()) as { error: string; currentRev: number; message: string }
    expect(conflictBody.error).toBe('conflict')
    expect(conflictBody.currentRev, '把当前版本带回去，客户端才能重读后重试').toBe(2)
    expect(conflictBody.message, '错误信息要说人话（含双方版本号）').toMatch(/rev=2/)

    // ⑤ 不带 rev → 老的"最后一次写入赢"，仍 204（既有客户端与演示站 e2e 靠这个）
    expect((await patchRec({ data: { name: '无版本号写入' } })).status).toBe(204)
    expect(await readRev(), '不带 rev 的写入照样 +1').toBe(3)

    // ⑥ 表单侧同理：第一次带 rev=1 改名成功，第二次带同一个旧 rev → 409
    expect((await send(`${base}/forms/${saved.id}`, { name: '并发表（甲改）', rev: 1 }, 'PATCH')).status).toBe(204)
    expect(
      (await send(`${base}/forms/${saved.id}`, { name: '并发表（乙改）', rev: 1 }, 'PATCH')).status,
      '表单被别人改过 → 409',
    ).toBe(409)
  })

  it('**官方客户端真的用上了 rev**：两个「标签页」改同一条记录 → 后者收到冲突且不覆盖前者；retry 策略可自动重读', async () => {
    const a = store({ Authorization: AUTH })
    const saved = await a.saveForm(null, design('并发客户端'), '并发客户端')
    const key = saved.collectKey
    await a.appendRecord(key, { id: 'r1', time: '2026-10-26 10:00', data: { v: '初始' } })

    // 两个独立客户端 = 两个浏览器标签页：各自读到 rev=1
    const b = store({ Authorization: AUTH })
    await a.loadRecords(key)
    const [seenByB] = await b.loadRecords(key)
    expect(seenByB.rev, '读接口把版本号带给客户端').toBe(1)

    // A 先写 → 服务端 rev=2
    await a.updateRecord(key, 'r1', { v: 'A 改的' })

    // B 手上还是 rev=1 → 必须收到冲突，而不是把 A 的改动盖掉
    const err = await b.updateRecord(key, 'r1', { v: 'B 改的' }).catch((e: unknown) => e)
    expect(err, '客户端会带上本地 rev，服务端据此判冲突').toBeInstanceOf(RestStoreConflictError)
    expect((err as RestStoreConflictError).currentRev, '冲突响应里的当前版本透传给宿主').toBe(2)
    expect((await a.loadRecords(key))[0].data, 'A 的改动没有被静默覆盖').toEqual({ v: 'A 改的' })

    // `onConflict: 'retry'`：读到旧版本 → 冲突 → 自动重读 → 重试成功（"我的改动就是要覆盖"的场景）
    const retryClient = createRestFormStore({
      baseUrl: base,
      headers: { Authorization: AUTH },
      onConflict: 'retry',
    })
    await retryClient.loadRecords(key) // 拿到 rev=2
    await a.updateRecord(key, 'r1', { v: 'A 又改' }) // A 插一脚 → rev=3
    await retryClient.updateRecord(key, 'r1', { v: 'B 重试成功' }) // 自动重读成 rev=3 再写
    expect((await a.loadRecords(key))[0].data, '重试策略下后写的按预期生效').toEqual({ v: 'B 重试成功' })
  })
})
