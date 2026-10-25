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
| DELETE | `/api/lowcode/forms/{id}` | 连同该表单的收集记录一起删 → 204 |
| GET | `/api/lowcode/records/{key}` | `CollectRecord[]`（**裸数组**） |
| POST | `/api/lowcode/records/{key}` | body `{ record }` → 204 |
| PATCH | `/api/lowcode/records/{key}/{id}` | body `{ data }` → 204 |
| DELETE | `/api/lowcode/records/{key}/{id}` | 204 |
| DELETE | `/api/lowcode/records/{key}` | 清空该表单的记录 → 204 |
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

## 上线前要补的（示例没替你做的）

- **持久化**：这里用 `Map`（重启即丢）。换数据库，并给 `design` / `record` 加约束与索引。
- **真实鉴权**：接你的用户体系；令牌别写死，也别放进前端包或分享链接。
- **限流与体积**：示例有 2 MB body 上限与 400/413 区分，但没有限流（按你的网关补）。
- **审计**：谁在什么时候改了哪张表单/哪条记录 —— 低代码平台几乎一定会被问到。
- **并发**：示例是"后写覆盖"。多端同时编辑同一表单时，建议加版本号做乐观锁
  （`FormDesign` 已有 `schemaVersion`，但那是**结构版本**不是**记录版本**）。

## 验证

```bash
npx vitest run tests/unit/lowcode-backend-example.spec.ts
```

9 个用例：`createRestFormStore` 全链往返（含服务端 `__stats` 对账）、401/403 区分、
裸载荷形状、坏 JSON → 400、`fetcher` 带鉴权拉导航、受限组按 scope 下发、
无令牌**报错而不静默**、地址被安全策略拒绝时**不发请求**。