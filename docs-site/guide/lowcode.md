# 低代码：从设计到数据落地

> 面向：想用本库搭「用户自己建表单、自己接数据」的宿主开发者。
> 读完你会知道：设计器怎么用、产出的 JSON 长什么样、怎么接到你自己的后端、以及哪些事**不要自己做**。

---

## 0. 一句话说清能力边界

本库提供的是**四件可组合的能力**，不是「一个能连数据库的低代码平台」：

| 能力 | 入口 | 它负责 | 它不负责 |
|---|---|---|---|
| 设计表单 | `FormDesigner` | 拖拽出字段树，产出 JSON | 存哪、谁能用 |
| 存储表单 | `FormStore` 接口（10 方法） | 定义契约 | **具体后端由你实现或选官方 local/cloud 实现** |
| 渲染表单 | `FormBuilder` | 按 schema 渲染 + 校验 + 收集数据 | 提交到哪 |
| 导航外壳 | `LowCodeNav` | 导航骨架 + 页面区装配 + 事件出口 | 数据从哪来、提交到哪（**仍然全由你决定**） |

**「对接自己的数据库」的正确姿势**：你的数据库 → 你自己的 HTTP 接口 → 本库调接口。
浏览器**无法**直连 MySQL / PostgreSQL（没有 TCP socket），所以任何声称"前端直连数据库"的方案都不成立。

---

## 1. 最快路径：设计器 → 拿到 JSON

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { FormDesigner } from 'vcl-ui/form-builder'
import type { DesignerNode, FormMeta } from 'vcl-ui/form-builder'

const nodes = ref<DesignerNode[]>([])
const meta = ref<FormMeta>({ title: '客户登记表' })
</script>

<template>
  <FormDesigner v-model:nodes="nodes" v-model:meta="meta" height="600px" />
  <!-- nodes + meta 就是你要存库的东西 -->
</template>
```

**产出形状**（`nodes` 是树，不是扁平数组）：

```json
{
  "meta": { "title": "客户登记表", "layout": "single" },
  "nodes": [
    {
      "id": "n_1",
      "type": "card",
      "label": "基本信息",
      "children": [
        { "id": "n_2", "key": "name", "type": "input", "label": "姓名", "required": true, "containerSlot": 0 }
      ]
    }
  ]
}
```

> ⚠️ **`containerSlot` 是容器归属**。设计器把「第几个 tab / 第几个折叠项」记在这里，
> 渲染时靠它还原分组。自己拼 JSON 时别漏。

---

## 2. 从 JSON 到可填表单：**用 `toFormSchema`，不要手写**

```ts
import { toFormSchema } from 'vcl-ui/form-builder'

const schema = toFormSchema(nodes, meta)   // → FormSchema，直接喂给 FormBuilder
```

### 为什么强调「不要手写」

我审查时在 demo 里手写过一个「挑出字段」的转换，看起来没问题，实际漏了三件事：

| 手写 `nodes.filter(n => n.key).map(...)` | `toFormSchema` |
|---|---|
| 扁平化 —— **容器里的字段全平铺到顶层**，分组/切页丢失 | 递归遍历，给每个字段带 `container` 归属 |
| 硬编码哪些 type 是「展示类」 | 查字段注册表 `isLayoutField()`，**新增展示类型不会漏** |
| 无 key 的节点**直接丢弃且不提示** | 退化用节点 `id` 并 `reportWarn` 出声 |

最后一条的实际表现是「导入外部 schema 后字段凭空消失」。这三条都有测试锁定（`tests/unit/lowcode-to-schema.spec.ts`）。

---

## 3. 接你自己的后端：`FormStore`

`FormStore` 是**接口**，你实现它即可接任意后端：

```ts
import type { FormStore, FormMetaItem, FormDesign } from 'vcl-ui/form-builder'

const myStore: FormStore = {
  async listForms() { /* GET /api/forms → FormMetaItem[] */ },
  async loadForm(id) { /* GET /api/forms/:id → FormDesign | null */ },
  async saveForm(id, design, name) { /* POST/PUT */ },
  async renameForm(id, name) { /* PATCH */ },
  async deleteForm(id) { /* DELETE */ },
  async loadRecords(storageKey) { /* GET /api/records?form=... */ },
  async appendRecord(storageKey, record) { /* POST */ },
  async removeRecord(storageKey, recordId) { /* DELETE */ },
  async clearRecords(storageKey) { /* DELETE 全量 */ },
  // updateRecord 是**可选**方法：外部 SaaS 实现可能没有，
  // 调用方需做能力检测（`if (store.updateRecord) ...`）
}
```

注入方式：

```vue
<FormDesigner v-model:nodes="nodes" v-model:meta="meta" :store="myStore" />
```

> **注入 `store` 后，「存储方式」切换 UI 会自动隐藏** —— 因为存储已经由你接管，
> 再让用户选「本地/云端」是矛盾的。

### 官方现成实现

| 工厂 | 后端 |
|---|---|
| `createLocalFormStore()` | localStorage（零配置，适合单机/演示） |
| `createCloudFormStore(config)` | Supabase（需配置） |
| **`createRestFormStore(options)`** | **你自己的 REST 后端**（"对接自己数据库"的首选，见下） |
| `createFormStore(mode)` | 按 mode 选上面 local / cloud 之一 |

#### `createRestFormStore`：后端照这 9 条路由实现就行

```ts
import { createRestFormStore, setActiveFormStore } from 'vcl-ui/form-builder'

const store = createRestFormStore({
  baseUrl: '/api/lowcode',                       // 末尾斜杠会被规整掉
  // 令牌用**函数形态**：每次请求都取最新登录态（写成常量会一直带过期令牌）
  headers: () => ({ Authorization: `Bearer ${token}` }),
})

setActiveFormStore(store)   // 之后设计器、收集端、导航外壳全部走你的库
```

| 方法 | 路由与载荷（`baseUrl` 之后是相对段） |
|---|---|
| `listForms()` | `GET /forms` → **裸数组** `FormMetaItem[]` |
| `loadForm(id)` | `GET /forms/{id}` → `FormDesign`；**404 视为「表单不存在」返回 `null`** |
| `saveForm(id, design, name)` | `POST /forms`，body 是 `{ id: string 或 null, design, name? }` → `FormMetaItem` |
| `renameForm(id, name)` | `PATCH /forms/{id}`，body `{ name }` |
| `deleteForm(id)` | `DELETE /forms/{id}`（连同该表单的收集记录） |
| `loadRecords(key)` | `GET /records/{storageKey}` → 裸数组 `CollectRecord[]` |
| `appendRecord(key, record)` | `POST /records/{storageKey}`，body `{ record }` |
| `updateRecord(key, id, data)` | `PATCH /records/{storageKey}/{id}`，body `{ data }` |
| `removeRecord(key, id)` | `DELETE /records/{storageKey}/{id}` |
| `clearRecords(key)` | `DELETE /records/{storageKey}`（清空） |

> **响应是裸载荷，不要套 `{ data: … }` 信封**（我第一版后端就多包了一层，导航直接空掉）。
> 需要信封的后端，在自己那层打开即可 —— 但 `createRestFormStore` 期望的是解开的那个值。
>
> **失败语义**：非 2xx 一律抛错，**不静默返回空** —— 静默会让用户以为"数据没了"，
> 真实原因是后端 500。错误信息带状态码与路由，宿主日志里能直接定位。
>
> **安全边界**：`baseUrl` 属宿主可信配置（不是 schema 里来的），所以不再套 `api-url-guard`
> 的同源策略；但 `headers` 里可能有令牌，**宿主要自己保证它不写进分享码 / URL**。
>
> 真浏览器里跑通的版本：演示站 `#/lowcode-nav` 有「表单仓储」切换（内存 ↔ REST），
> 后端由 dev server 当"你自己的后端"——它**故意要求 `Authorization`**（缺了 401），
> 于是"令牌接没接对"是可观测的；提交后会重新读服务端计数，**数据真的落库才算过**。

---

## 4. 自动生成导航项：`useFormNav`

用户建了很多表单后，需要「表单列表 → 导航项」：

```ts
import { useFormNav } from 'vcl-ui/form-builder'

const { items, loading, error, refresh } = useFormNav({
  store: myStore,
  // 可选：basePath 决定链接前缀，默认 '/form'
  // 也支持 toPath / filter / sort / icon 自定义（见下方「导航项定制」）
})
```

```vue
<!-- 你自己选导航组件（本库的 AccordionNav 接受 items: NavNode[]） -->
<AccordionNav :items="items" />
```

### 两个要记住的语义

1. **`useFormNav` 只产数据、不渲染 UI** —— 用什么导航组件是你的选择（可以用本库的，也可以用自己的）
2. **加载失败时不把 `items` 清空** —— `error` 有值但 `items` 保留上一次结果。
   导航不该因为一次网络抖动整条消失。

### 提交记录长什么样（自己拼记录时照这个形状）

内置表单页提交后，外壳只 `emit`，**落库由你写**。记录就用官方的 `CollectRecord`：

```ts
import type { CollectRecord } from 'vcl-ui/form-builder'

const record: CollectRecord = {
  id: genRecordId(),                        // 用官方的 id 生成器，别自己拼随机串
  time: new Date().toLocaleString('zh-CN', { hour12: false }),
  data: { ...submittedData },               // 表单值（键就是字段 key）
}
await myStore.appendRecord(storageKey, record)
```

> `storageKey` 由表单自己决定（官方收集端用的是 `fd_collect_<表单 id>`）；
> 换了 `FormStore` 实现后，**这一步完全不变** —— 变的只是 `appendRecord` 打到哪个后端。

### 导航项定制

```ts
useFormNav({
  store: myStore,
  basePath: '/form',                                  // 默认 '/form'
  toPath: (f) => `/form/${f.id}`,                     // 完全自定义路径（优先于 basePath）
  filter: (f) => f.name !== '归档',                    // 过滤；权限/分组在这里做
  sort: (a, b) => a.name.localeCompare(b.name),       // 默认按 updatedAt 倒序
  icon: 'file-text',                                  // 或 (f) => string | undefined
  autoLoad: true,                                     // 传 false 则自己调 refresh()
})
```

> 只想用映射逻辑、不要加载副作用？用纯函数 `buildFormNavItems(forms, options)`。

> 想**连骨架一起拿走**（"宿主只搭一个导航框架，其它导航项用户自建"）就用下一节的 `LowCodeNav`，它把「导航骨架 + 页面区装配 + 事件出口」做成一个组件。

---

## 5. 把外壳一起用：`LowCodeNav`（组件形态）

上一节的 `useFormNav` 只产数据、UI 由你选。想**连骨架一起拿走** —— "宿主只搭一个导航框架 + 一个低代码入口，其它导航项由用户自建" —— 就用 `LowCodeNav`：它把「导航骨架 + 页面区装配 + 事件出口」做成一个组件，而**数据从哪来、提交发给谁仍然全由你决定**。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { LowCodeNav } from 'vcl-ui/form-builder'
import type { FormStore } from 'vcl-ui/form-builder'

// 你自己的存储实现（见第 3 节）：对接自己后端的唯一接缝
const myStore: FormStore = createMyCloudStore()
const navRef = ref<{ refresh: () => Promise<void> } | null>(null)

/** 表单页校验通过后触发。外壳**不自动外发** —— 发给谁由你决定 */
async function onPageSubmit({ node, data }: { node: { formId?: string }; data: unknown }) {
  await fetch('/api/records', {
    method: 'POST',
    body: JSON.stringify({ form: node.formId, data }),
  })
}

/** 你在自己的界面里存完表单后再喊这一声：重取导航（不用整页重载） */
async function afterHostSaved() {
  await navRef.value?.refresh()
}
</script>

<template>
  <LowCodeNav
    ref="navRef"
    :source="{ kind: 'forms' }"
    :form-store="myStore"
    title="我的工作台"
    @page-submit="onPageSubmit"
  />
</template>
```

### 三种导航定义来源（`source`）

| `kind` | 字段 | 谁提供导航项 |
|---|---|---|
| `'static'` | `nodes` | 你写死的配置（"框架写死、页面动态"就是这一档） |
| `'forms'` | `icon?` | **用户自建的表单**自动成为导航项（数据来自 `form-store`） |
| `'api'` | `url` / `method?` / `dataPath?` / `body?` | 后端下发定义（默认**只允许同源**，跨域要显式放行） |

> `forms` 档**故意没有 `basePath`**：这一层只给 `key` / `formId`，路由约定属于宿主。
> 曾经收过这个参数，负向对照证明它配了等于没配（传与不传导航项逐字相同），于是删掉 —— 不留"配了等于没配"的选项。

### 页面区由优先级决定谁渲染

1. **`#page` 插槽** —— 存在就最高优先级，**连内置表单页都跳过**（此时 `renderFormPage` 不生效）
2. 没有可选项 → 空态（`data-state="no-page"`）
3. `kind: 'link'` → 站内链接**交给你的路由**（只有外链才真跳转）
4. `kind: 'form'` 且 `renderFormPage !== false` → 内置渲染（解析器默认取活动 `FormStore`，可用 `resolveFormPage` 换你自己的后端）
5. 其余 → **默认插槽**；连默认插槽也没给 → `data-state="slot-required"` 明确提示（不静默留白）

### 关键 props

| prop | 作用 |
|---|---|
| `source` | 三选一来源，或返回它的函数（`() => NavSource`） |
| `formStore` | `forms` 来源的数据源，也是表单页解析的默认来源 —— **对接自己后端的唯一接缝** |
| `fetcher` | 注入自己的 `fetch`（加鉴权头 / 走自己的请求层） |
| `apiUrlPolicy` | 外发 URL 策略；不传 = **只允许同源** |
| `filter` | 权限过滤（判定交给你） |
| `renderFormPage` | 关掉 = 只留骨架，页面区完全由 `#page` 接管 |
| `resolveFormPage` | 换成你自己后端的表单页解析器 |
| `showIssues` | 显示配置问题条（默认不显示；`#issues` 插槽随时可取全部问题） |
| `title` / `modelValue` / `autoLoad` / `autoSelect` | 侧栏标题 / 受控选中 / 挂载即加载 / 加载后自动选第一项 |

### 事件

| 事件 | 语义 |
|---|---|
| `select(node)` | 选中某项 —— **只通知，不替你路由** |
| `update:modelValue(key)` | 受控宿主回写；选项被删导致的**悬空选中**也会通知 |
| `page-submit({ node, data })` | 表单页校验通过后触发 —— **外壳不自动外发**，发不发、发给谁由你决定 |
| `page-change({ node, data })` | 表单数据变化（同一次变更只发一次，不透传渲染器的双事件） |

### 实例方法：`refresh()`

你在自己的界面里改完后端数据（例如刚存了一份新表单）后调用它重取导航 —— **不用整页重载**：

```ts
const navRef = ref<{ refresh: () => Promise<void> } | null>(null)
await navRef.value?.refresh()
```

> **别和上一节搞混**：`useFormNav()` 返回的 `refresh()` 与组件实例上的 `refresh()` 同名，
> 但一个是组合式函数的返回值、一个是外壳实例方法（走模板 `ref` 取）。

**插槽一览**（默认渲染都能被替换）：`#nav-item :node/:active/:select`、`#nav-group :node`、`#nav-empty`、`#icon :node`、`#issues :issues`、`#page :node/:issues`，以及默认插槽（页面区兜底）。

在线可跑版本见演示站 `#/lowcode-nav`：三种来源可切换、**脏数据被拒且原因可见**、提交**零外发**（请求计数断言）；"用户自建"那半在同一页用内置设计器演示 —— 建表单 → 保存 → 它自己成为导航项。

---

## 6. 展示类字段的数据源：`displaySource` 三模式

表格 / 图表 / 地图 / 结果态这类**展示类字段**（不参与提交），数据从哪来由 `displaySource` 决定：

```ts
type DisplayDataKind = 'static' | 'field' | 'api'

interface DisplayDataSource {
  kind: DisplayDataKind
  staticData?: unknown        // static：设计时写死
  fieldKey?: string           // field：绑定到某字段当前值
  apiUrl?: string             // api：请求地址
  method?: 'GET' | 'POST'
  dataPath?: string           // 从响应取数据的点路径，如 'data.rows'
  body?: unknown              // POST 请求体
}
```

### 为什么是三种模式，而不是一个 `dataSource` 全包

| 理由 | 展开 |
|---|---|
| **类型可静态检查** | 联合类型让「既没 `staticData` 又没 `apiUrl`」在写配置时就报错；`any` 要等运行时 |
| **默认行为明确** | `{}` 该理解成空数据还是空接口？三模式把"没配"变成编译错误 |
| **安全默认有处安放** | `api` 必须过 URL 校验（拦 `javascript:` / 内网地址），`static` 不需要；混在一起容易被绕过 |

**只做 `api` 会强迫用户为「数据已经在前端」的场景也写一个接口。**

### API 模式的安全默认

- 默认**只允许同源**
- 拒绝 `javascript:` / `data:` 等非 HTTP(S) 协议
- 失败**不静默吞错**：`error` 有值，展示区空白时必须能说清为什么

### 跨域放行：两个不同的开关，别搞混

这里容易混，因为两处都叫"允许来源"，但**作用对象不同**：

| 开关 | 在哪 | 管什么 |
|---|---|---|
| `apiAllowOrigins` | `FormBuilder` 的 prop | **表单内 API 类型字段**的外发地址 |
| `apiUrlPolicy` | `useDisplayData` 的 option | **展示类字段 `displaySource.kind='api'`** 的外发地址 |

```ts
// 展示类字段（表格/图表/地图）的跨域放行
import { useDisplayData } from 'vcl-ui/form-builder'
import { policyFromOrigins } from 'vcl-ui/form-builder'

const { rows, loading, error } = useDisplayData({
  source: () => displaySource,
  formData: () => formData,
  apiUrlPolicy: () => policyFromOrigins(['https://api.example.com']),
})
```

```vue
<!-- 表单内 API 字段的跨域放行 -->
<FormBuilder :schema="schema" :api-allow-origins="['https://api.example.com']" />
```

> **不要为了省事全局放开** —— 这两个默认都是"只允许同源"，是防 SSRF 的第一道闸。

---

## 7. 分享：把表单编码进 URL

```ts
import { encodeShareCode, decodeShareCode } from 'vcl-ui/form-builder'

const code = encodeShareCode(design)     // 生成分享码
const design = decodeShareCode(code)     // 还原
```

发布链接形如 `#/form/<分享码>`，填写端不需要登录、不依赖你的表单列表接口。

> 分享码是**配置编码**，不是加密。别把密钥之类的东西放进表单配置。

---

## 8. 常见误解

### ❌「低代码能直连我的 MySQL」

不能。浏览器没有 TCP socket，数据库驱动是 Node 侧的东西。正确做法是把数据库包一层 HTTP 接口。

### ❌「`FormStore` 是内置数据库」

它是**接口**。官方只提供 localStorage 与 Supabase 两个实现，其余要你自己写（通常几十行）。

### ❌「设计器产出的 JSON 能直接存进数据库表」

能存（是 JSON），但**结构会随版本演进**（当前 `FORM_DESIGN_VERSION`）。建议整条 JSON 存一个 `json`/`text` 列，
不要拆成关系表 —— 否则版本迁移会很痛。

### ❌「`displaySource` 的 `apiUrl` 可以指向任意地址」

默认只允许同源。跨域要显式放行，这是防 SSRF 的默认值，不要为了方便全局放开。

---

## 9. 完整最小示例

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { FormDesigner, FormBuilder, toFormSchema, createLocalFormStore } from 'vcl-ui/form-builder'
import type { DesignerNode, FormMeta } from 'vcl-ui/form-builder'

// 用本地存储做表单库（换 createCloudFormStore / 自己的实现即可上生产）
const store = createLocalFormStore()

const nodes = ref<DesignerNode[]>([])
const meta = ref<FormMeta>({ title: '未命名表单' })

// 设计态 → 渲染态（用官方转换）
const schema = computed(() => toFormSchema(nodes.value, meta.value))

const formData = ref<Record<string, unknown>>({})

async function save() {
  await store.saveForm(null, { nodes: nodes.value, meta: meta.value }, meta.value.title)
}
</script>

<template>
  <FormDesigner v-model:nodes="nodes" v-model:meta="meta" :store="store" height="560px" />

  <button @click="save">保存表单</button>

  <h2>预览</h2>
  <FormBuilder v-model="formData" :schema="schema" />
</template>
```

在线可跑版本见演示站 `#/form-designer`。

---

## 10. 相关文件与测试

| 关注点 | 落点 |
|---|---|
| 设计器 | `src/components/form-builder/FormDesigner.vue` + `designer/` |
| 设计态 → 渲染态 | `designer/types/to-schema.ts`（`toFormSchema`） |
| 存储契约 | `designer/store.ts`（`FormStore` + local/cloud 实现） |
| 导航项生成 | `useFormNav.ts` |
| 展示数据源 | `display-data-source.ts` |
| 分享码 | `designer/share.ts` |
| 转换正确性测试 | `tests/unit/lowcode-to-schema.spec.ts` |
| 导航外壳 | `lowcode/LowCodeNav.vue`（props/slots/事件/`refresh()`） |
| 外壳的数据与编排 | `lowcode/useLowCodeNav.ts`（三种来源）+ `lowcode/page-resolver.ts`（表单页解析） |
| 外发 URL 策略 | `lowcode/api-url-guard.ts`（默认同源） |
| 外壳测试 | `tests/unit/lowcode-nav-shell.spec.ts` / `lowcode-page-resolver.spec.ts` / `use-lowcode-nav.spec.ts` |
| 外壳真数据闭环测试 | `tests/unit/lowcode-nav-realdata.spec.ts`（零桩）+ `tests/e2e/lowcode-nav-shell.spec.ts`（真浏览器） |
| 宿主接入示例页 | `src/demos/lowcode/LowCodeNavDemo.vue`（演示站 `#/lowcode-nav`） |
| 文档契约测试 | `tests/unit/lowcode-doc-contract.spec.ts` |
| 决策记录 | `docs/adr/005-lowcode-display-source.md`（仓库内，不在本站） |

> 为什么这里不写 Markdown 链接：`docs/adr/` 不在 VitePress 站点根目录内，
> 用 `../adr/...` 会被 `docs:build` 判为死链并**直接构建失败**（我第一版就是这样，
> 闸口当场拦下）。ADR 是给仓库贡献者看的，站点读者看本页即可。
