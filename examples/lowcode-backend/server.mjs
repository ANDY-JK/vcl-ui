/**
 * 低代码后端的**参考实现**（可直接部署，零依赖：只用 node:http）。
 *
 * 为什么需要它：`vcl-ui` 定义了 `FormStore` 契约（9 条 REST 路由）与导航定义契约，
 * 但宿主拿到的是"一张路由表 + 一个跑在 Vite dev server 里的演示中间件"——
 * **服务器上没法直接用**。这个文件就是「你自己的后端」的起点：把存储层换成你的数据库即可。
 *
 * ## 运行
 *
 *   LOWCODE_TOKEN=<你的令牌> node examples/lowcode-backend/server.mjs
 *   # 可选：PORT=8787 LOWCODE_LOG=1
 *
 * 令牌**必须显式提供**：没设 `LOWCODE_TOKEN` 直接拒绝启动（fail-closed）——
 * 参考实现被随手部署成"无鉴权的公网接口"是真实事故，默认值不该帮这种忙。
 *
 * ## 路由（与文档 §3 的表一一对应）
 *
 *   GET    /api/lowcode/forms                 → 200 FormMetaItem[]（**裸数组**）
 *   GET    /api/lowcode/forms/{id}            → 200 FormDesign ｜ 404
 *   POST   /api/lowcode/forms                 body { id, design, name? } → 201 FormMetaItem（**裸对象**）
 *   PATCH  /api/lowcode/forms/{id}            body { name } → 204
 *   DELETE /api/lowcode/forms/{id}            （连同其收集记录）→ 204
 *   GET    /api/lowcode/records/{key}         → 200 CollectRecord[]（**裸数组**）
 *   POST   /api/lowcode/records/{key}         body { record } → 204
 *   PATCH  /api/lowcode/records/{key}/{id}    body { data } → 204
 *   DELETE /api/lowcode/records/{key}/{id}    → 204
 *   DELETE /api/lowcode/records/{key}         （清空）→ 204
 *
 *   GET    /api/lowcode/nav                   → 200 { code, data: { items } }（配 dataPath: 'data.items'）
 *   GET    /api/lowcode/__stats               → 200 { forms, records }（运维自检/演示用）
 *
 * 鉴权：以上全部要求 `Authorization: Bearer <LOWCODE_TOKEN>`。缺失/不匹配 → **401**；
 * 令牌有效但 scope 不够（例如只读令牌去写、或去读受限导航组）→ **403**（`{ error, need }`）。
 * 所有非 2xx 都是**显式错误**（`{ error, hint? }`）；只有 `GET /forms/{id}` 的 404 有契约含义
 * （"表单不存在" → 客户端拿 null），其余 404 表示路由不存在。
 *
 * 权限模型是**示例但可换**：`FULL_SCOPES` / `LIMITED_SCOPES` 两档（`store:read` / `store:write` /
 * `nav:internal`）。真实项目里把它换成"解析 JWT → 取 scopes"即可，HTTP 层不用动。
 *
 * ## 换你自己的数据库
 *
 * 只需要替换下面 `createMemoryStore()` 的 11 个方法体（SQL/ORM/云数据库都行）——
 * **HTTP 层与鉴权层不用动**。也可以 `createLowcodeBackend({ store: 你自己的实现 })` 从外部注入。
 */
import { createServer as createHttpServer } from 'node:http'
import { randomUUID } from 'node:crypto'

/** 请求体上限：参考实现也要有护栏，别让一个超大 body 把进程撑爆 */
const MAX_BODY = 2 * 1024 * 1024

/**
 * 存储接口（**这是你要改的地方**）。
 *
 * 与 `FormStore` 同名同义，但**故意不 import 库里的类型**：后端项目里不会装 vcl-ui，
 * 靠这份注释对齐契约即可（改错了会被库的契约测试与前端一起抓出来）。
 */
export function createMemoryStore() {
  /** id → { id, name, updatedAt, collectKey, design } */
  const forms = new Map()
  /** storageKey → CollectRecord[] */
  const records = new Map()
  const meta = (f) => ({ id: f.id, name: f.name, updatedAt: f.updatedAt, collectKey: f.collectKey })

  return {
    async listForms() {
      return [...forms.values()].map(meta)
    },
    async loadForm(id) {
      const f = forms.get(id)
      return f ? f.design : null
    },
    async saveForm(id, design, name) {
      const key = id || `form_${randomUUID()}`
      const prev = forms.get(key)
      const rec = {
        id: key,
        name: name || design?.meta?.title || prev?.name || key,
        updatedAt: new Date().toISOString(),
        collectKey: prev?.collectKey || `fd_collect_${key}`,
        design,
      }
      forms.set(key, rec)
      return meta(rec)
    },
    async renameForm(id, name) {
      const f = forms.get(id)
      if (!f) return
      f.name = name
      f.updatedAt = new Date().toISOString()
    },
    async deleteForm(id) {
      const f = forms.get(id)
      if (!f) return
      records.delete(f.collectKey)
      forms.delete(id)
    },
    async loadRecords(storageKey) {
      return records.get(storageKey) ?? []
    },
    async appendRecord(storageKey, record) {
      const list = records.get(storageKey) ?? []
      list.unshift(record)
      records.set(storageKey, list)
    },
    async updateRecord(storageKey, recordId, data) {
      const list = records.get(storageKey) ?? []
      const i = list.findIndex((r) => r && r.id === recordId)
      if (i >= 0) list[i] = { ...list[i], data }
      records.set(storageKey, list)
    },
    async removeRecord(storageKey, recordId) {
      records.set(
        storageKey,
        (records.get(storageKey) ?? []).filter((r) => !r || r.id !== recordId),
      )
    },
    async clearRecords(storageKey) {
      records.set(storageKey, [])
    },
    async stats() {
      return { forms: forms.size, records: [...records.values()].reduce((n, l) => n + l.length, 0) }
    },
  }
}

/**
 * 导航定义：一组通用项 + 一组**需要权限才下发**的受限项。
 *
 * 「用户看得到哪些导航项」是低代码落到生产后第一个要解决的问题（按角色/租户/部门下发），
 * 所以参考实现里保留这一层：`includeInternal` 由令牌的 scope 决定，而不是"有令牌就给全量"。
 */
function navPayload(includeInternal) {
  const items = [
    {
      key: 'group-common',
      label: '常用',
      kind: 'group',
      children: [
        { key: 'link-home', label: '首页', kind: 'link', url: '/' },
        { key: 'link-help', label: '帮助', kind: 'link', url: 'https://example.com/help' },
      ],
    },
  ]
  if (includeInternal) {
    items.push({
      key: 'group-internal',
      label: '内部（需权限）',
      kind: 'group',
      children: [{ key: 'link-audit', label: '审计日志', kind: 'link', url: '/audit' }],
    })
  }
  return { code: 0, data: { items } }
}

/** 权限模型（示例）：按令牌给 scope 集合。真实项目里换成你的用户体系（JWT → scopes） */
const FULL_SCOPES = ['store:read', 'store:write', 'nav:internal']
const LIMITED_SCOPES = ['store:read']

const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('body_too_large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

/**
 * **请求处理器**：同一份契约的**唯一实现**。
 *
 * 它既能被 `createLowcodeBackend()` 包成一个独立 HTTP 服务（部署形态），
 * 也能被**直接挂进别的服务器**（Vite dev 中间件、Express、Serverless 适配器都行）——
 * 仓库里的演示站就是这么接的：`vite.config.ts` 不再自己写一遍路由，而是 import 本文件。
 * （第 106 轮之前，`vite.config.ts` 里有一份 170 行的**平行实现**：同一契约两份代码，
 * 而 e2e 验的是中间件那份、**不是要交付的那份** —— 这种"验证与交付脱节"迟早会漂移。）
 *
 * @param {{
 *   token: string,
 *   limitedToken?: string,
 *   store?: ReturnType<typeof createMemoryStore>,
 *   log?: boolean,
 *   prefix?: string,
 *   seed?: (store: ReturnType<typeof createMemoryStore>) => Promise<void> | void,
 * }} options
 *   - `token`：全权令牌（可读可写、可见受限导航组）
 *   - `limitedToken`：只读令牌（读得到表单/记录；写操作 **403**，且看不到受限导航组）
 *   - `prefix`：挂载前缀，默认 `/api/lowcode`。挂到别处（如 `/api/lowcode-demo/store`）时改它
 *   - `seed`：预置数据。**首次请求前落地**（处理器内部 `await ready`），不存在"第一个请求看不见种子"的竞态
 *
 * 两种令牌是为了把"**能读到什么**"与"**能不能写**"分开演示：生产里这两件事常由不同 scope 决定，
 * 而"有令牌就给全部"是最常见的越权来源。
 */
export function createLowcodeHandler(options) {
  const token = options?.token
  if (!token) throw new Error('createLowcodeHandler: 必须提供 token（参考实现不提供无鉴权模式）')
  const limitedToken = options.limitedToken
  const store = options.store ?? createMemoryStore()
  const log = options.log === true
  const PREFIX = options.prefix ?? '/api/lowcode'

  /** 令牌 → scope 集合；未知令牌返回 null（→ 401） */
  const scopesOf = (auth) => {
    if (auth === `Bearer ${token}`) return FULL_SCOPES
    if (limitedToken && auth === `Bearer ${limitedToken}`) return LIMITED_SCOPES
    return null
  }
  const WRITE_METHODS = ['POST', 'PATCH', 'DELETE']

  /** 预置数据的落地结果：null = 成功；Error = 失败（此后每个请求都如实 500，不假装没事） */
  const ready = Promise.resolve()
    .then(() => options.seed?.(store))
    .then(
      () => null,
      (err) => (err instanceof Error ? err : new Error(String(err))),
    )

  return async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = url.pathname
    const method = (req.method ?? 'GET').toUpperCase()
    if (log) console.log(`${method} ${path}`)

    if (!path.startsWith(PREFIX + '/')) {
      json(res, 404, { error: 'no_route', path })
      return
    }

    // 鉴权：先于一切业务分支（包括 404），避免"用 404/401 的差异探测路由是否存在"
    const scopes = scopesOf(req.headers.authorization)
    if (!scopes) {
      json(res, 401, { error: 'unauthorized', hint: 'Authorization: Bearer <LOWCODE_TOKEN>' })
      return
    }
    // 授权：**能读写**与**能看到哪些导航项**是两件事，分开判（401=身份不明，403=身份明确但无权）
    const need = WRITE_METHODS.includes(method) ? 'store:write' : 'store:read'
    if (!scopes.includes(need)) {
      json(res, 403, { error: 'forbidden', need })
      return
    }

    const seedErr = await ready
    if (seedErr) {
      json(res, 500, { error: 'seed_failed', message: seedErr.message })
      return
    }

    const segs = path
      .slice(PREFIX.length + 1)
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent)

    try {
      if (segs[0] === '__stats' && method === 'GET') {
        json(res, 200, await store.stats())
        return
      }

      if (segs[0] === 'nav' && method === 'GET') {
        json(res, 200, navPayload(scopes.includes('nav:internal')))
        return
      }

      if (segs[0] === 'forms' && segs.length === 1) {
        if (method === 'GET') {
          json(res, 200, await store.listForms())
          return
        }
        if (method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          const saved = await store.saveForm(body.id ?? null, body.design, body.name)
          json(res, 201, saved)
          return
        }
      }

      if (segs[0] === 'forms' && segs.length === 2) {
        const id = segs[1]
        if (method === 'GET') {
          const design = await store.loadForm(id)
          if (design === null || design === undefined) {
            json(res, 404, { error: 'form_not_found', id })
            return
          }
          json(res, 200, design)
          return
        }
        if (method === 'PATCH') {
          const body = JSON.parse((await readBody(req)) || '{}')
          await store.renameForm(id, body.name)
          json(res, 204)
          return
        }
        if (method === 'DELETE') {
          await store.deleteForm(id)
          json(res, 204)
          return
        }
      }

      if (segs[0] === 'records' && segs.length === 2) {
        const key = segs[1]
        if (method === 'GET') {
          json(res, 200, await store.loadRecords(key))
          return
        }
        if (method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}')
          await store.appendRecord(key, body.record)
          json(res, 204)
          return
        }
        if (method === 'DELETE') {
          await store.clearRecords(key)
          json(res, 204)
          return
        }
      }

      if (segs[0] === 'records' && segs.length === 3) {
        const key = segs[1]
        const id = segs[2]
        if (method === 'PATCH') {
          const body = JSON.parse((await readBody(req)) || '{}')
          await store.updateRecord(key, id, body.data)
          json(res, 204)
          return
        }
        if (method === 'DELETE') {
          await store.removeRecord(key, id)
          json(res, 204)
          return
        }
      }

      json(res, 404, { error: 'no_route', path, method })
    } catch (err) {
      // JSON 解析失败是**客户端错误**（400），不要混进 500 —— 否则宿主日志里全是假的服务端故障
      if (err instanceof SyntaxError) {
        json(res, 400, { error: 'bad_json' })
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      if (message === 'body_too_large') {
        json(res, 413, { error: 'body_too_large', limit: MAX_BODY })
        return
      }
      json(res, 500, { error: 'server_error', message })
    }
  }
}

/**
 * 建**独立服务**但不监听（测试与 CLI 都这样用）：`server.listen(0)` 后读 `server.address().port`。
 * 参数与 `createLowcodeHandler` 完全一致（它就是把处理器包进 `http.createServer`）。
 */
export function createLowcodeBackend(options) {
  return createHttpServer(createLowcodeHandler(options))
}

/** CLI：只有被直接运行时才监听（被 import 时不占端口） */
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll('\\', '/')}`).href
if (isMain) {
  const token = process.env.LOWCODE_TOKEN
  if (!token) {
    console.error('[lowcode-backend] 拒绝启动：请设置 LOWCODE_TOKEN（参考实现不提供无鉴权模式）')
    process.exit(1)
  }
  const port = Number(process.env.PORT ?? 8787)
  const server = createLowcodeBackend({
    token,
    ...(process.env.LOWCODE_LIMITED_TOKEN ? { limitedToken: process.env.LOWCODE_LIMITED_TOKEN } : {}),
    log: process.env.LOWCODE_LOG === '1',
  })
  server.listen(port, () => {
    console.log(`[lowcode-backend] http://127.0.0.1:${port}/api/lowcode  (token 来自 LOWCODE_TOKEN)`)
  })
}