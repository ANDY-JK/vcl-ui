# ADR-005：低代码页面的数据接缝——三模式 `displaySource` 而非一个 `dataSource` 全包

- 状态：**已接受**（10-21 追记成文；实现早于此，见下方"现状"）
- 决策人：项目主 + AI 审查
- 关联：`src/components/form-builder/useFormNav.ts`、`designer/store`、`FormBuilder` 的 `displaySource`、闸口 `check:constants`（`lowcode` 域行数）

---

## 背景

### 产品意图（用户原话）

> 「我以后只会搭建一个导航框架和一个低代码的导航项，用户要完全自己创建其它导航项对接自己的数据库等等，完全动态自主的」

拆成三条可执行的事：

1. **宿主只搭框架**：一个导航外壳 + 一个低代码入口，其它导航项由用户自建
2. **用户自建导航项**：不写 Vue 代码
3. **对接用户自己的数据库**：数据来源由用户决定

### 现状（写这份 ADR 时先核了一遍，避免重造）

我一开始按"这些都不存在"设计，**核对后发现大部分已经建好了** —— 记录在此，供后来者不必再找：

| 能力 | 落点 | 行数 |
|---|---|---|
| 表单设计器（拖拽画布 / 属性面板 / 撤销栈 / 自动保存） | `form-builder/FormDesigner.vue` + `designer/` 12 个子模块 | 711 + ~2000 |
| 表单存储接缝（9 方法） | `designer/store.ts`：`createLocalFormStore` / `createCloudFormStore` / `createFormStore` / `setActiveFormStore` | — |
| 表单 → 导航项（只产数据不渲染 UI） | `useFormNav.ts`：`buildFormNavItems` / `useFormNav` | 150 |
| 分享码（配置进 URL） | `designer/share.ts`：`encodeShareCode` / `decodeShareCode` | — |
| 表单渲染（schema 驱动） | `FormBuilder.vue` | 801 |
| 导航渲染（接受外部 items） | `layout/AccordionNav.vue`（**不兜底 navTree**，下游不传就空态） | 151 |

**所以缺的不是"整条链路"，而是一个横向能力：同一份配置，三种数据来源的统一适配。**

---

## 决策

### D1. `displaySource` 收三模式，不是"一个 dataSource 全包"

```ts
type DisplaySource =
  | { type: 'static'; data: Row[] }          // 配置内置
  | { type: 'bound'; field: string }         // 从父级 context 取
  | { type: 'api'; url: string; method?: ... } // 用户后端
```

#### 为什么不是「一个 `dataSource` 字段，内部判断类型」

看起来更简单，但会付出三个代价：

1. **调用方无法静态检查**。一个 `any` 型 `dataSource`，配错了要到运行时才报错；联合类型让 TS 在写配置时就拦住"既没 data 又没 url"。
2. **默认行为说不清**。`{}` 该被理解成空数据还是空接口？三模式把"没配"明确成编译错误。
3. **安全默认无处安放**。`api` 模式必须过 `checkApiUrl`（拦 `javascript:` / 内网地址），`static` 不需要。混在一起时，这段防护容易被"反正 static 也走这里"绕过。

#### 为什么必须三模式都支持（不是只做 api）

实际场景三种并存：

- 演示 / 示例页 → `static`（配置自带数据，零依赖）
- 父级已取到数据、只想复用渲染 → `bound`（**避免重复请求**；列表页里嵌详情就是这种）
- 真实业务 → `api`

**只做 api 会强迫用户为"数据已经在前端"的场景也写一个接口** —— 这是为了统一而牺牲合理用法。

### D2. 不内置数据库驱动 —— 前端只调用户自己的接口

**浏览器里不可能直连 MySQL/PostgreSQL**（没有 TCP socket，驱动是 Node 侧的）。能做的只有三种：

| 方案 | 可行性 |
|---|---|
| 浏览器直连数据库 | ❌ 技术上不成立 |
| 库内打包一个 BFF | ❌ 那是另一个项目（服务端 + 部署 + 运维），不是组件库能力 |
| 前端调用户自己的 REST/GraphQL | ✅ 唯一成立 |

所以"对接自己数据库"的正确形态：**用户把数据库包成他自己的一层 HTTP 接口，前端调它。**

这一点必须在文档里说清，否则用户会以为"低代码能连库"而失望。

### D3. 写操作默认 emit 出去，不偷偷改数据

`DynamicPage` 类组件默认 `@submit` / `@row-action` 抛事件，宿主决定调哪个接口。

**理由**：低代码配置可能来自后端下发或用户编辑，**它本身是不可信输入**。一个会自己发 PUT/DELETE 的组件，等于把"改数据"的能力交给了一份可被篡改的 JSON。

显式配了 `submitUrl` 才自动提交，且仍走 `checkApiUrl`。

### D4. 自定义渲染默认关闭

`columns[].cell`（自定义单元格渲染函数）默认**不生效**，需显式 `allowCustomCellRender`。

理由同上：配置不可信 → 不能让它注入任意渲染逻辑。

### D5. 渲染层零改动

`FormBuilder`（801 行）与 `DataTable`（2686 行）**一行不改**，适配层只做字段转换。

理由：这两个组件被 28+ 测试锁定；适配层薄一点，比改它们安全得多。

---

## 后果

### 正面

- 三种数据来源各有明确类型，配错在编译期就报
- 安全默认（URL 校验 / 自定义渲染关闭 / 写操作 emit）不依赖用户记得
- 复用已有的设计器 + `FormStore` + `useFormNav`，不重造
- 渲染层零改动 → 不破坏现有 2100+ 测试

### 负面（必须记住的代价）

- **三模式 = 三套测试面**。每种数据源都要测加载/错误/空态/竞态，测试量比单模式多约 2 倍。
- **`bound` 模式的 `field` 是字符串路径**，拼错了运行时才报错（TS 无法校验父级 context 的形状）。
- **不做可视化编排器**：用户仍需用 `FormDesigner` 设计表单，或手写 JSON 配置。真正的"完全自主"若要包括"自己搭页面布局"，那是另一个量级（画布 + 布局引擎）。
- **前端直连数据库的期待会落空**。文档必须反复说清"调你自己的接口"，否则会反复被问。

### 明确不做（划线，避免范围蔓延）

| 不做 | 理由 |
|---|---|
| 可视化页面搭建器（布局级） | 与表单设计器是两个东西；用户没提，且是独立大工程 |
| 内置 BFF / 数据库驱动 | 见 D2 |
| 权限系统 | `NavNode.requiredPermission` 已挂钩，交给宿主 |
| 字段级联 | `FormBuilder` 已有 `linkage`，透传不重造 |

---

## 验证方式

每条决策都要能验：

| 决策 | 怎么验 |
|---|---|
| D1 三模式 | 三种配置各渲染一次，断言行数；配错类型 → `vue-tsc` 报错 |
| D2 不内置 DB | 依赖树里不出现任何 DB 驱动包（`check:deps` 可查） |
| D3 写操作 emit | 配了 `submitUrl` 才发请求；不配时只 emit |
| D4 自定义渲染默认关 | 配了 `cell` 但没开开关 → 断言 `cell` 未被调用（负向对照） |
| D5 渲染层零改动 | 适配层提交的 diff 里 `FormBuilder.vue` / `DataTable.vue` 为 0 行 |

---

## 与台账的关系

按 `docs/adr/README.md` 的分工：「ADR 说决定，台账说这个决定的代价」。

本 ADR 的代价已登记为：

- 三模式的测试面翻倍 → 覆盖率地板按域抬升时要考虑（`form-builder` 域）
- `bound` 的 `field` 是字符串路径 → 无类型保护，属已知取舍
