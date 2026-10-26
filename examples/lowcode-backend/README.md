# 低代码后端 · 参考实现

给宿主的**可直接部署**的起点：实现 `vcl-ui` 的 `FormStore` 契约（9 条 REST 路由）与
「导航定义」契约（1 条路由）。**零依赖**，只用 Node 内置的 `node:http`。

> 为什么要有它：库里的文档给了路由表，`docs-site` 的演示又把同样的路由做了一遍 ——
> 但那两份都跑在 **Vite dev server 的中间件**里，**服务器上没法直接部署**。
> 这个目录就是「你自己的后端」的第一份可运行代码。

## 跑起来

```bash
# 令牌必须显式提供：没设就直接拒绝启动（参考实现不提供"无鉴权模式"）
LOWCODE_TOKEN=my-secret-token node examples/lowcode-backend/server.mjs

# 可选：端口与访问日志
PORT=8787 LOWCODE_LOG=1 LOWCODE_LIMITED_TOKEN=read-only-token \
  LOWCODE_TOKEN=my-secret-token node examples/lowcode-backend/server.mjs
```

启动后：`http://127.0.0.1:8787/api/lowcode/...`

前端接法（与文档 §3 一致）：

```ts
import { createRestFormStore, setActiveFormStore } from 'vcl-ui/form-builder'

setActiveFormStore(
  createRestFormStore({
    baseUrl: '/api/lowcode',
    // 函数形态：每次请求取最新登录态（常量会一直带着过期令牌）
    headers: () => ({ Authorization: `Bearer ${myToken}` }),
  }),
)
```

## 嵌进你自己的服务器（不必另起进程）

`server.mjs` 拆成两层：`createLowcodeHandler()` 是**请求处理器**（同一契约的唯一实现），
`createLowcodeBackend()` 只是把它包进 `http.createServer`。所以 Vite 中间件 / Express /
Serverless 适配器都能直接挂，路由与鉴权不用重写：

```js
import { createLowcodeHandler } from './server.mjs'

const handler = createLowcodeHandler({
  token: process.env.LOWCODE_TOKEN,
  prefix: '/api/lowcode-demo/store', // 默认 /api/lowcode；挂到别处就改它
  seed: async (store) => {           // 预置数据（首次请求前落地，无竞态）
    await store.saveForm('demo-1', { schemaVersion: 3, meta: { title: '演示' }, nodes: [] }, '演示')
  },
})

app.use((req, res, next) => {
  // ★ 前缀不匹配就交回外层：处理器只认自己的前缀，别吞掉宿主自己的路由
  if (!(req.url ?? '').startsWith('/api/lowcode-demo/store/')) return next()
  void handler(req, res)
})
```

> **演示站用的就是这份代码**：`docs-site` 的低代码演示页切到「REST（真 HTTP）」时，
> 后端就是本文件（`vite.config.ts` 只做两件事：把 `prefix` 指到 `/api/lowcode-demo/store`、
> 种一份"服务端才有的表单"）。也就是说 —— **你在演示站看到的行为，就是你部署后的行为**，
> 不再有"demo 一套、上线另一套"。

## 换成真数据库：零依赖 SQLite（`LOWCODE_DB`）

上面那份内存存储一重启就丢。要落到磁盘，设一个环境变量即可 —— **仍然零依赖**
（`node:sqlite` 是 Node 22.5+ 内置模块）：

```bash
LOWCODE_DB=./lowcode.db LOWCODE_TOKEN=your-secret node examples/lowcode-backend/server.mjs
# 启动行会显示「存储 SQLite ./lowcode.db」
```

表结构就两张（`examples/lowcode-backend/sqlite-store.mjs` 顶部有完整 DDL）：

```sql
forms   (id PK, name, updated_at, collect_key, design)        -- design 存 JSON
records (seq PK AUTOINCREMENT, collect_key, id, time, data)   -- data   存 JSON
```

**换成 MySQL / PostgreSQL / 云数据库**：把 `sqlite-store.mjs` 里那 11 个方法体换成你的方言
（SQL 语句 + 事务 + JSON 列），**HTTP 层、鉴权、错误语义一行都不用改**。
`store.raw` 也给你留着了 —— 低代码之外想按业务字段查（例如"这个客户还有几张待办"），
直接 `SELECT … json_extract(data, '$.customer') …` 即可，不必为每个查询再加 store 方法。

> **这个接缝是被测试证明过的，不是说法**：同一套契约测试（12 例）分别在**内存版**与**SQLite 版**
> 上各跑一遍（共 24 例全绿），另有 3 例专测 —— ① 关库重开数据还在；② 数据是**真表里的真列**
> （宿主可直接 `json_extract` 聚合）；③ 两版**行为一致**（同一批操作后表单/记录/统计相等，
> 含"删表单级联删记录"）。也就是说：**换实现只换那 11 个方法，语义由测试兜住。**
>
> ⚠️ `node:sqlite` 目前仍标 experimental（Node 会打一条 `ExperimentalWarning`），参考实现够用；
> 生产请按下面"上线前要补的五件事"补齐迁移体系与并发方案。

> **同源很关键**：库的 `api-url-guard` 默认只放行同源地址（跨域要宿主用 `apiUrlPolicy`
> 显式放行）。生产里最省事的做法是**反向代理**：让 `/api/lowcode` 与前端同域，
> 后端实际部署在哪都行（Nginx `location /api/lowcode { proxy_pass ... }`）。

## 路由契约

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/lowcode/forms` | `FormMetaItem[]`（**裸数组**） |
| GET | `/api/lowcode/forms/{id}` | `FormDesign`；**404 表示"表单不存在"**（客户端拿 `null`） |
| POST | `/api/lowcode/forms` | body `{ id, design, name? }` → `FormMetaItem`（**裸对象**） |
| PATCH | `/api/lowcode/forms/{id}` | body `{ name }` → 204 |
| DELETE | `/api/lowcode/forms/{id}` | 连同该表单的收集记录一起删 → 204；带 `?rev=N` 且库里已不是 N → **409** |
| GET | `/api/lowcode/records/{key}` | `CollectRecord[]`（**裸数组**） |
| POST | `/api/lowcode/records/{key}` | body `{ record }` → 204 |
| PATCH | `/api/lowcode/records/{key}/{id}` | body `{ data }` → 204 |
| DELETE | `/api/lowcode/records/{key}/{id}` | 204；带 `?rev=N` 且不符 → **409** |
| DELETE | `/api/lowcode/records/{key}` | 清空该表单的记录 → 204；带 `?count=N` 且条数不符 → **409** |
| GET | `/api/lowcode/nav` | `{ code, data: { items } }`（前端配 `dataPath: 'data.items'`） |
| GET | `/api/lowcode/__stats` | `{ forms, records }`（运维自检/演示用） |

**响应是裸载荷，不要套 `{ data: … }` 信封**（`nav` 除外，它本来就该有信封并由 `dataPath` 取值）——
多包一层会让导航直接空掉，而且不报错。这一条在库的单测里被锁住了
（`tests/unit/lowcode-backend-example.spec.ts`）。

## 鉴权与权限（示例，可换）

| 令牌 | scope | 结果 |
|---|---|---|
| `Authorization: Bearer <LOWCODE_TOKEN>` | `store:read` `store:write` `nav:internal` | 读写都行，`nav` 里能看到「内部」组 |
| `Authorization: Bearer <LOWCODE_LIMITED_TOKEN>` | `store:read` | 只读；写操作 **403**；`nav` 里**看不到**「内部」组 |
| 缺失 / 不认识 | — | **401** |

`401`（身份不明）与 `403`（身份明确但无权）分开，是为了让宿主日志里能一眼分辨
"令牌没带上"和"这个用户不该有权限"。真实项目里把 `scopesOf()` 换成"解析 JWT → 取 scopes"，
**HTTP 层不用动**。

## 换成你自己的数据库

只改一处：`createMemoryStore()` 的 11 个方法体（SQL / ORM / 云数据库随意）——
路由、鉴权、错误语义都不用动。也可以从外部注入：

```js
import { createLowcodeBackend } from './server.mjs'

createLowcodeBackend({ token: process.env.LOWCODE_TOKEN, store: mySqlBackedStore }).listen(8787)
```

## 并发：乐观锁 `rev`（"两个标签页同时改"不再是后写覆盖）

每条表单与记录都带一个 `rev`（版本号，新建从 1 起、每次写 +1）：

```bash
# 读：拿到 rev
GET /forms            # → [{ id, name, updatedAt, collectKey, rev: 3 }, …]

# 写：把"我读到的是第几版"带上
PATCH /records/{key}/{id}   body { data: {...}, rev: 3 }   → 204
PATCH /records/{key}/{id}   body { data: {...}, rev: 2 }   → 409 { error: "conflict", currentRev: 3 }
```

**不带 `rev` 仍是老语义（最后一次写入赢）** —— 已有客户端与演示站不受影响；
**带 `rev` 就是"我知道我在改第几版"**，库里已经不是那一版 → `409` 并回当前版本，
客户端重读后重试即可。

> 为什么值得用：低代码表单常常是"两个人同时开着同一张表"，后写覆盖会让先改的人**无声地丢掉工作**。
> 409 至少把这件事变成可见的冲突，而不是"我明明改了怎么没了"。

**删除也接同一套乐观锁**（第 118 轮补）：`DELETE /forms/{id}?rev=N`、`DELETE /records/{key}/{id}?rev=N`。
删除是最不可逆的一步 —— 甲刚改完、乙拿着旧版本号一删，甲的工作就没了，而且**两边的界面都显示成功**。
整表清空（`DELETE /records/{key}`）没有"单条版本"可比，改用**条数**当护栏：`?count=N` 与库中不符 → 409。
官方客户端 `deleteForm` / `removeRecord` 会自动带上读到的版本号，但**故意不自动重试**：
重试会先刷新 `rev` 再重发，那等于"把别人刚改的那一版删掉"，与乐观锁的本意正好相反 —— 冲突直接抛给宿主
（`RestStoreConflictError` 带 `currentRev`），由人来决定。

## 迁移：`schema_version` + 只增的迁移列表

`schema_version` 表记录已应用到第几版；打开数据库时自动把**旧库**升到最新：

```js
export const MIGRATIONS = [
  { version: 1, sql: `CREATE TABLE forms (…)  …  CREATE TABLE records (…)` },
  { version: 2, sql: `ALTER TABLE forms ADD COLUMN rev INTEGER NOT NULL DEFAULT 1; …` },
]
```

规矩（`sqlite-store.mjs` 顶部也有）：**只增不改**、每条只做加法、版本号连续、每版一个事务。
所以"线上已经跑了 v1 的库"升级时数据不丢 —— 这正是**迁移**与"删库重建"的区别；
`tests/unit/lowcode-sqlite-store.spec.ts` 里有一条用例专门造一个 v1 老库来验这件事。

## 上线前要补的（示例没替你做的）

- **持久化**：默认是内存 `Map`（重启即丢）；设 `LOWCODE_DB=./lowcode.db` 走 SQLite，
  或照 `LowcodeStore` 的 11 个方法换成你的数据库。
- **真实鉴权**：接你的用户体系；令牌别写死，也别放进前端包或分享链接。
- **限流与体积**：示例有 2 MB body 上限与 400/413 区分，但没有限流（按你的网关补）。
- **审计**：谁在什么时候改了哪张表单/哪条记录 —— 低代码平台几乎一定会被问到
  （`rev` 只能告诉你"被改过几次"，**谁**改的要你自己记）。
- **多实例写协调**：`rev` 解决"同一行的并发覆盖"；多进程/多机同时写同一 SQLite 文件仍需串行化
  （SQLite 用文件锁，吞吐有限）—— 上多实例就换 PG/MySQL 并给写入加事务。
- **连接池与备份**：示例每次调用直接用同一个句柄；生产要有池与定期备份。

## 验证

```bash
npx vitest run tests/unit/lowcode-backend-example.spec.ts
```

`lowcode-backend-example.spec.ts`：同一批用例**在内存版与 SQLite 版各跑一遍** —— 全链往返（含服务端 `__stats` 对账）、401/403 区分、
裸载荷形状、坏 JSON → 400、`fetcher` 带鉴权拉导航、受限组按 scope 下发、
无令牌**报错而不静默**、地址被安全策略拒绝时**不发请求**、**乐观锁 409 与向后兼容**。
`lowcode-sqlite-store.spec.ts`：真落库/真进程重启、真表真列可查（`json_extract`）、两版行为一致、
**迁移幂等 + v1 老库升级后数据不丢**。