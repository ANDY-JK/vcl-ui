# Vue 通用组件库（vcl-ui）

> 一个面向企业级应用的 Vue 3 通用组件库，覆盖基础、数据展示、表单、反馈、导航、布局、图表、登录、存储、地图、路线规划与低代码表单平台。

[![Vue](https://img.shields.io/badge/Vue-3.4%2B-brightgreen)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-blue)](https://www.typescriptlang.org/)

## ✨ 特性

- **13 个组件域、60+ 组件**：从按钮到低代码表单设计器，开箱即用
- **TypeScript 优先**：全量类型定义，`vue-tsc` 零错误
- **国际化内置**：基于 vue-i18n，`zh-CN` / `en-US` 双语，`setLocale()` 一键切换
- **无障碍（a11y）**：焦点陷阱、ARIA 语义、标签关联，面向 WCAG 2.1/2.2 AA
- **按需导入**：支持全量或按域/按组件引入，ECharts 图表按需注册
- **主题与暗色模式**：CSS 变量 + `useTheme()` 运行时切换

## 📦 安装

```bash
npm install vcl-ui
```

**peer 依赖**（按需安装）：

| 包                  | 版本                 | 说明                                                        |
| ------------------- | -------------------- | ----------------------------------------------------------- |
| `vue`               | `^3.4.0`             | 必需。3.4 / 3.5 均可                                        |
| `echarts`           | `^5.0.0 \|\| ^6.0.0` | 可选 — 仅使用 `chart` 域时需要                              |
| `echarts-wordcloud` | `^2.1.0`             | 可选 — 仅使用词云图表（`wordCloud` 类型）时需要             |
| `vue-router`        | `^4.3.0`             | 可选 — 仅使用 `layout` / `login` / `route-planner` 域时需要 |

> 词汇说明：**peer 依赖**（专业词）= 不由本库自带、需要你的项目自己装的那类依赖；**可选** = 用不到对应功能就不用装。

**⚠ 必须引入样式**：组件样式打包成独立 CSS 文件，不会自动注入。不引这一句，页面上所有组件都是没样式的裸元素。

```ts
import 'vcl-ui/css' // ← 一次性引入，放在 main.ts 里
```

## 🚀 快速上手

### 全量引入

```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { i18n, setLocale } from 'vcl-ui'
import 'vcl-ui/css' // 样式：必须引入

const app = createApp(App)
app.use(i18n) // 注册国际化
setLocale('zh-CN') // 可选，默认中文

app.mount('#app')
```

### 按需引入

```ts
import 'vcl-ui/css' // 样式：必须引入（一次即可）
import { Button, Input, DataTable } from 'vcl-ui'
// 或按域引入 —— 每个域子路径是独立构建产物（Q3 多入口），
// 引 vcl-ui/basic 只会加载 basic + 共享 core chunk，不带其他域的代码
import { Button } from 'vcl-ui/basic'
import { Input, Select } from 'vcl-ui/form'
```

> 样式默认「一次引入全量 `vcl-ui.css`」即可。按域引入且有打包依赖时，也可引域自包含 CSS
> （= 共享令牌 + 该域样式）：`import 'vcl-ui/dist/css/data.css'`——13 个域各有对应文件，
> 引了域 CSS 就不必再引全量。注意：全量 CSS 产物按 chunk 碎片组装于 build 后
> （`scripts/emit-css.mjs`），改动构建配置时留意该脚本的映射守卫。

### 主题定制（令牌覆盖 → 产物 CSS）

主题 = 设计令牌（`src/components/tokens.css` 的 `:root` / `:root[data-theme='dark']` 双块）

- `useTheme()` 运行时切换。定制主题走「覆盖令牌」，不碰库 CSS：

```bash
# 1) 生成配置模板（light/dark 双块，示例注释说明主色 4 联动令牌）
node scripts/gen-theme.mjs --init        # → theme.config.json
# 2) 填入覆盖（令牌名必须 ∈ tokens.css 声明集，打错直接报错并给近似候选）
# 3) 生成产物
npm run gen:theme                         # → dist/theme.css
```

宿主引入顺序（产物追加在库 CSS 之后才覆盖得动）：

```ts
import 'vcl-ui/dist/vcl-ui.css'
import 'vcl-ui/dist/theme.css' // 或本地开发路径
```

- 配置分 `light` / `dark` 双块：暗色块漏写时，切暗色后定制值会被库的暗色令牌盖回——工具按暗色块**单独**出 `:root[data-theme='dark']` 段，避免只改亮色的隐形失效
- 空配置也生成占位产物（`/* 空主题 */`），宿主可无条件引入，定制与否不改变引入代码
- 值含 `;{}"` 注入字符、键非 `--kebab-case`、令牌未在 tokens.css 声明——一律报错不出产物（`check:css-tokens` 只查库内引用，宿主侧靠这道闸）

可视化配置层：demo 站点 `#/theme-editor`（顶栏月亮按钮直达）——分组令牌面板（颜色走原生取色器、断点/z-index 只读）+ 按当前主题记录覆盖 + 全站实时预览（动态 style）+ 一键导出 `theme.config.json` / `theme.css`（导出与 CLI 同一套校验，`scripts/theme-pure.mjs` 单一真源）。草稿存 localStorage。

### 基本使用

```vue
<template>
  <Button variant="primary" @click="handleClick">点击我</Button>
  <Input v-model="text" label="用户名" placeholder="请输入" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button, Input } from 'vcl-ui'

const text = ref('')
const handleClick = () => console.log('clicked')
</script>
```

## 🧩 组件域总览

| 域              | 主要组件                                                            | 说明                |
| --------------- | ------------------------------------------------------------------- | ------------------- |
| `basic`         | Button / IconSvg / Tag                                              | 基础组件            |
| `data`          | DataTable / Tree / Collapse / Image / ProgressBar / Skeleton …      | 数据展示            |
| `form`          | Input / Select / Group / IconPicker / Upload / CameraCapture        | 表单控件            |
| `feedback`      | Toast / Loading / Popover / Drawer / ConfirmModal / ErrorBoundary … | 反馈                |
| `nav`           | Tabs / Steps / Pagination / Breadcrumb / Menu                       | 导航                |
| `layout`        | AppLayout / ModalBox / Flex / AccordionNav                          | 布局                |
| `chart`         | Chart / BaseChart / ChartTable / ChartLegend（20+ 图表类型）        | 图表                |
| `login`         | LoginPage / RegisterPage / ForgotPasswordPage / PortalLogin         | 登录                |
| `storage`       | storage\*（localStorage）/ db\*（IndexedDB）/ createBackend         | 存储                |
| `amap`          | AmapWidget + setAmapKey 等工具                                      | 高德地图            |
| `route-planner` | RouteMap / RouteResult / StorePanel …                               | 路线规划            |
| `form-builder`  | FormDesigner / FormBuilder / FormCollect / FormRenderer             | 低代码表单          |
| `wc`            | vc-button / vc-input / vc-toast 等 15 个 Custom Elements            | Web Components 封装 |

> 组件用法与可运行示例都在 demo 站点里：`npm run dev` 后打开 http://localhost:3721 ，每个组件一页，含 Props 表与交互示例。

## 🌍 国际化

```ts
import { setLocale } from 'vcl-ui'

setLocale('en-US') // 切换到英文
setLocale('zh-CN') // 切换到中文
```

内置语言包按域组织，可通过 `useT()` / `useTm()` 在自定义组件中复用：

```ts
import { useT } from 'vcl-ui'
const t = useT()
t('common.confirm') // → '确认' / 'Confirm'
```

**新增文案键必须同时写进 `zh-CN` 与 `en-US` 的对应分块**（`src/components/_internal/locales/chunks/`）。
只补一边时运行时会回退成显示键名本身，类型检查和单测都发现不了，只有切到那门语言的用户看得到 ——
`npm run check:i18n` 逐分块比对键集，已接进 `quality-check` 与 CI。

### 与宿主应用自己的 i18n 共存

你的项目通常已经有一个 vue-i18n 实例。vcl-ui 与它并存的方式：

- **库组件不依赖全局安装**：组件库内部统一走 `useT()` 直读自己的实例，不读全局 `$t`。
  所以 `app.use(i18n)` 是**可选的**——只有当你想让**自己的代码**也复用这套内置文案时才需要装它
  （装了之后宿主里 `useI18n()` 拿到的是 vcl-ui 实例，注意与宿主实例区分）。
- **语言切换要手动同步**：宿主切换语言时，请同步调用 `setLocale(newLocale)`，两套实例不会自动联动。
  推荐在宿主封装一个统一入口：先切宿主实例，再 `setLocale`。
- **给库组件补/覆盖文案**：用 `registerMessages()`（见上），它合入的是 vcl-ui 实例，不影响宿主语言包。
- **反过来不成立**：不要用 vcl-ui 的 `i18n` 实例去承载宿主业务文案——它只对组件库文案负责，
  混用会让两套文案的升级与覆盖边界变得不可推演。

## 🧱 Web Components（跨框架）

```ts
import { registerWebComponents } from 'vcl-ui/wc'

registerWebComponents() // 注册全部支持的标签，如 <vc-button>、<vc-input>
```

```html
<vc-button type="primary">按钮</vc-button>
```

- **覆盖面**：当前注册 15 个组件（Button / Input / Tag / Switch / Toast / Loading / Pagination / Breadcrumb / Steps / Tabs / ProgressBar / Divider / Empty / Skeleton / Result），**不是全量 60+**；其余组件请按 Vue 组件方式使用
- **属性**：仅支持字符串 / 数字 / 布尔值，复杂对象用 JSON 字符串传递
- **事件**：用 `addEventListener('click', ...)`，不能用 `@click`
- **样式与浮层**：自定义元素默认开启 Shadow DOM，库的 CSS 需由宿主注入该 Shadow Root（或 `adoptedStyleSheets`）；`vc-toast` / `vc-loading` 的浮层默认 Teleport 到 `body`，Shadow DOM 宿主里可传 `teleport-to` 指向宿主自身容器

## 🧭 说明与验证

- **用法示例**：`src/demos/` — 每个组件一页 demo，`npm run dev` 直接看效果与 Props
- **API 入口**：`src/components/index.ts` — 全部导出与类型，IDE 里可直接跳转
- **质量门禁**：`npm run quality-check` — 类型检查 + lint + 常量来源自检 + 设计令牌断档自检 + 语言包对账 + 单测（全局覆盖率地板 + **按域覆盖地板**）+ 构建 + **发包自检** + **文档漂移自检** + **文档说明完整性自检** + 真实浏览器 e2e
- **常量来源自检**：`npm run check:constants` — 六项：断点令牌与 JS 常量同值、JS 里不出现视口断点字面量、`@media` 宽度值均已登记、`setTimeout/setInterval` 的延时不写字面量、截断类必须登记判定且用户数据类要绑 `title`、原生 `color` 输入的值必须经归一
- **语言包对账**：`npm run check:i18n` — zh-CN / en-US 分块与键集一一对应，缺哪边点哪个键
- **发包自检**：`npm run verify:pkg` — 拦四类静默失效：组件缺 `.d.ts`（下游拿到 `any`）、`exports` 指向不存在的文件、构建期密钥被打进 `dist/`、**声明对最低承诺版本（Vue 3.4）不兼容**（下游开 `skipLibCheck: false` 时会报 TS2707）
- **第三方许可闸口**：`npm run check:licenses` — 产物里真进了哪些第三方件（构建期由 rollup 记录到 `dist/third-party-modules.json`），逐条双向对账：漏报、虚报、许可文本缺失、copyleft 命中、外部件没在 `dependencies/peerDependencies` 声明、进包件不在运行期依赖闭包内——任一即红。清单正文随包发布：`vcl-ui/dist/THIRD-PARTY-LICENSES.md`
- **本库开发配置**：真实值只填根目录 `.env.local` 一个文件（已 gitignore，样例见 `.env.example`）。这些值只在开发模式生效，**不会被打进库产物**；生产环境请由你的项目在运行时调用 `setAmapKey()` 等接口注入

### 依赖选型记录（评估过的，不是没看）

- **`xlsx`（SheetJS）— 维持 CDN tarball，不迁 exceljs**（2026-09-20 实测，登记 Q6）：
  - 现状：SheetJS 自 2023 起停止向 npm registry 发布新版本（registry 停在 0.18.5），官方唯一新版本通道是 `cdn.sheetjs.com` 的 tarball，本库锁 0.20.3。
  - 代价如实记录：**CDN tarball 绕过 registry 审计**——`npm audit` 扫不到它（实测 audit 报告 0 条 xlsx 相关）；安装需能访问 `cdn.sheetjs.com`；供应链面比 registry 依赖宽。
  - 缓解：`package.json` 锁精确版本 tarball URL（不带 `^`），lockfile 同步；只动态 `import`（不进首屏 chunk，落 `vendor-heavy` 惰性块，受体积预算闸口管）。
  - 为何不迁 exceljs（PoC 实测）：① **exceljs 读不了 legacy `.xls`**（load 直接报 `Can't find end of central directory`），而 form-builder / route-planner 的导入面明确收 `.xls`（FormCollect 的 `accept=".json,.csv,.xlsx,.xls"`）——迁移 = 用户可见的能力损失；② exceljs 4.4.0（2024-12 最后发布）并非高频维护项；③ 读出口径要把 `sheet_to_json({ header: 1, raw: false })` 换成逐格 `cell.text` 遍历（写侧 `addRows`/`writeBuffer` 双向互通已验证可行）。
  - 结论：1.0 维持 xlsx；v2 若决定放弃 `.xls` 兼容再迁，读写两侧 API 映射已在本轮 PoC 跑通。
- **`html2canvas`（截图）— 维持，不迁 modern-screenshot**（2026-09-20 实测，登记 Q11）：
  - 现状：html2canvas 1.4.1（2023-07 后无发布），本库经 `_internal/useScreenshot.ts` 的 `captureElement` **动态** `import`（惰性，不进首屏 chunk）。该函数当前无库内调用方，能力随库保留。
  - modern-screenshot（4.7.0，2026-04 活跃维护，MIT，186KB）实测更快（同元素 27ms vs 4175ms，约 154 倍），亮色主题下与 html2canvas 渲染目视等价。
  - **阻断项：暗色主题渲染错误**。本库全套令牌走 CSS 自定义属性 + `:root[data-theme]` 切换，modern-screenshot 的 foreignObject 克隆丢失该上下文 —— 真实页面实测暗色截图 60.87% 像素偏差、卡片底/标题/按钮颜色全错（地面真相 `rgb(26,29,36)` 底 vs 截图白底）。html2canvas + 现有 `onclone` 复制自定义属性的方案渲染正确。
  - 结论：1.0 维持 html2canvas（+ 既有 onclone hack）；re-evaluate 条件：modern-screenshot 能正确捕获 `:root[data-theme]` 令牌主题（如经其 `style` 注入选项把解析后的变量写进克隆文档），或截图能力改为不再依赖变量令牌。

## 🛠 本地开发

```bash
npm install         # 安装依赖
npm run dev         # 启动开发服务器（http://localhost:3721）
npm run docs:dev    # 文档站（VitePress，http://localhost:5173）
npm run typecheck   # TypeScript 类型检查
npm run lint        # ESLint
npm run test:unit   # 单元测试 + 覆盖率
npm run build       # 构建产物到 dist/
```

文档站的组件 API 页由 `npm run gen:docs` 从源码自动生成（`docs-site/components/`，提交入库），
改 props/events 后必须重新生成——`check:docs` 闸口（已串入 quality-check 与 CI）会卡漂移。
API 表「说明」列不允许空缺（`check:doc-completeness` 闸口）：props/事件写 `/** */` JSDoc
（**内联单行 JSDoc TS 不建节点、提取不到，必须独占一行**），slot 写模板注释
`<!-- @slot name: 说明 -->`（无名槽写 default，同名取最近一条）。

## 📐 开发规范（改代码前先看）

### 常量与断点

1. **数值常量只有两个合法来源**：实测度量（`getBoundingClientRect`、行高、可视区高度这类真实量出来的数）或已声明的设计令牌。不接受"看着合理"的字面量。
2. **视口断点单源**：CSS 用 `tokens.css` 的 `--bp-sm/md/lg`；JS/TS 引 `src/components/_internal/breakpoints.ts` 的 `BP_SM/BP_MD/BP_LG`。两处必须同值，`check:constants` 会卡。
3. **CSS `@media` 走登记制**：`@media` 里不能用 `var()`，所以宽度值必须出现在 `scripts/check-constants.mjs` 的登记集合里并注明用途。加新断点前先确认既有断点不能复用。
4. **上限/阈值默认自适应**：容量类上限按真实度量动态算（上传并发取同源连接数的一半、虚拟化只在"窗口行数确实小于总行数"时启用），同时给调用方留覆写口（`maxConcurrent`、`pageVirtualMin`、`cardBreakpoint`）。
5. **同一哨兵值不抄两份**：跨文件复用的判定值收进共享常量或共享函数（如列拖拽顺序排序 `sortColumnsByOrder`），改一处全库生效。
6. **静默截断要能被发现**：按长度截断/省略的地方必须留下完整值（`title`、`aria-label`、导出原文、点击复制），不能让用户只看到被裁掉的那截。带 `text-overflow: ellipsis` 的类都要在 `scripts/check-constants.mjs` 的 `ELLIPSIS_VERDICTS` 里给一个判定（`title` / `covered` 说明已有兜底通道 / `not-user-data` 说明为什么不需要），新增截断类不登记就红。闸口只扫 `src/components`（demo 的展示文案由写 demo 的人当场判定）；`-webkit-line-clamp` 那类多行截断目前靠人判（现库内 2 处都在"点击即复制完整值"的按钮里）。
7. **延时要有名字和用途**：`setTimeout` / `setInterval` 的毫秒数写成带注释的 `*_MS` 常量，`check:constants` 拦住直接写数字的写法（`0` 表示让出一个任务，不算时长）。它只管调用里的延时位：三元表达式与默认参数里的时长（如 Toast 的 `duration` 缺省值）它不报，见到同样要命名。数值相同的两个延时不一定同一件事（如"失败退避重试"与"逐天请求的配额间隔"都是 800ms），确认同因才合并成共享常量。`src/demos/` 豁免：示例里 `模拟 1.5s 网络` 就是给读者看的字面值。
8. **喂给原生控件的值按控件的格式现交**：`<input type="color">` 只认 `#rrggbb`，绑 `var(--token)`、`red`、`#abc`、`transparent` 会被浏览器**静默**拒收——刷 `does not conform to the required format` 警告、取色块退成默认黑。库内统一走 `_internal/utils.ts` 的 `toNativeColorValue()`：`#abc` 简写展开，令牌与命名色挂离屏节点让真实 CSS 引擎算出实际色再转十六进制，算不出的（非法串、缺 `#` 的裸十六进制、`oklch()` 这类新记法）落黑而不是猜色。归一只发生在交给控件那一刻，`v-model` 与回传值仍是调用方原串。`check:constants` 扫 `src/components` 里每个 `<input type="color">`：值绑定没写 `toNativeColorValue(` 又没在 `COLOR_VALUE_VERDICTS` 登记"值从哪儿归一"就红。与第 6、7 条同口径只管库代码——demos 不引 `_internal`，示例页的取色器由写 demo 的人负责，真跑出问题由全站浏览器审查兜；`h()` 渲染函数或动态 `:type` 绑成 color 的写法闸口扫不到，新增取色器照现有 5 处的静态写法即可被拦。

9. **demo 的 Props 表必须与组件真实 `defineProps` 对账**：每张表是手抄一遍的属性清单，抄错、抄漏、组件早删了表还留着，浏览器一声不响——`AvatarDemo` 曾列过 `Avatar` 根本没有的 `color`，`StepsDemo` 给必填无默认的 `current` 写了默认值 `1`。`check:demo-props` 扫 `src/demos` 里表头含 `Prop`/`属性` 的表，按"该表的行被哪个组件覆盖 60% 以上且无并列"把整张表判给那个组件（不这么判，多列一个同 demo 顺手 import 的组件真有的名字就会溜过去），再卡两档谎报：① 表里列了该组件没有的 prop；② 组件里必填且无默认、表里却给了默认值。确实没有默认就写 `—`，需要点明可写 `—（必填）`。**闸口不管"漏写"**：组件有、表里没列只算文档欠账，不拦——32 张表一次性要求列全会变成没人维护的死表。**已知扫不到**：`Events`/`Slots`/`函数` 那类表头不是 Prop 的表不在判定内；一张表混写两个组件的 props 时归属退回并集宽判，此时"多列一个别组件真有的名字"会漏过；`v-bind` 展开或运行时拼出来的 prop 名扫不到。一条表行都没扫到时闸口直接报红，不允许因为正则没命中而假绿。

10. **CSS 设计令牌不许"无声明又无 fallback"**：`var(--x)` 引用一个全库从未声明的令牌时，浏览器会静默求值为继承/初始值——亮色下常因继承背景碰巧看着正常、切暗色才暴露。`check:css-tokens` 全仓收集两处「有主」信号：① 任何 `.css/.vue/.ts` 里出现的 `--name:` 声明（含 `:style` 内联键、`setProperty('name',…)` 字符串字面量）；② 引用带了 fallback（`var(--x, 默认)`）即视为显式降级、放行。两者都不满足才判红。新增局部变量照第 1 条走「同文件声明 + 引用兜底」即可，全局令牌加进 `tokens.css`。

11. **form-builder 域单文件 ≤800 行**：该域交互密度高，设计器/渲染器/收集端三块各自曾长到近千行。09-04 收官过一次（PropsPanel 五页签、useTableEdit 式拆分），09-20 复查发现 `FormDesigner 979 / DesignerCanvas 881` 已回潮——**靠人工守必然回潮**，所以 `check:constants` 第 [7] 项直接扫该目录（含子目录）的 `.ts/.vue` 行数，超限即红。正确拆法：纯函数归 `.ts`（如 `canvas-utils.ts`）、有状态逻辑归 composable（如 `useDesignerPanels`）、可独立交互的 UI 归子组件；能不拆就别拆——拆错地方比不拆更糟。

### defineExpose 公开契约（Q18，2026-09-20 盘点 · 2026-09-21 v2.0 收敛）

`defineExpose` 是组件实例的**公开**方法面（`ref.value.xxx()` 能调到即契约）。分两类，动以前先在这里对账：

**公开 API（消费方 ref 可调，只增不改语义）**：

| 组件                                                      | 暴露动词                                                                                                            | 用途                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Chart` / `BaseChart`                                     | `chart`(getter) / `getOption()` / `setOption(opt, opts?)`                                                           | ECharts 实例与 option 读写（setOption 自动注入 toolbox） |
| `AmapWidget`                                              | `getMap()` / `setZoomAndCenter()` / `clearMarkers()` / `renderMarkers()` / `openInfoWindow()` / `closeInfoWindow()` | 地图实例与标记/信息窗控制                                |
| `Toast`                                                   | `show(msg\|opts)` / `remove(id)`                                                                                    | 手动 toast（duration≤0 常驻需手动 remove）               |
| `Select`                                                  | `openMenu()`                                                                                                        | 程序化展开面板                                           |
| `Upload`                                                  | `retryFile()` / `triggerFileInput()`                                                                                | 重试失败上传 / 手动打开文件选择                          |
| `FormBuilder`                                             | `stopSubmit` / `setSubmitting` / `submitting` / `getFormData()` / `validate()` / `errors`                           | 表单提交与校验全家桶                                     |
| `login` / `portal_login` / `register` / `forgot-password` | `resetForm()`                                                                                                       | 清表单                                                   |

**内部区块 expose（⛔ 非公开 API，仅 DataTable 主文件经 ref 驱动，消费方勿依赖）**：
`DataTableBatchDialog`（`show` / `open` / `close`）、`DataTableColumnSettings`（`show` / `toggle` / `close` / `unfixFromMenu`）、`CaptureFallbackPanel`（`reset`）、`TimeColumns`（`scrollToValue`）。契约类型在 `data/composables/context.ts` 的 `*Expose` interface，随区块拆分演进。

**v2.0 已收敛项（原 v1 破坏性改名/删除，从 1.x 升级需对照）**：

1. ~~`FormBuilder` 的 `validate` / `validateForm` / `validateAndGet` 三个近义入口收敛为单一动词~~ —— ✅ 已删后两个，只留 `validate()`；要数据用 `getFormData()`、要错误明细用 `errors`。
2. ~~`login` 的 `notifyFailed` / `recordFailedAttempt` 是宿主回写钩子而非组件行为~~ —— ✅ 已删两个暴露方法，改 `authResult` prop（`{ ok, message? }`，watch 驱动同一套锁定计数）。
3. 审查报告 09-20 曾记「BatchDialog 六近义名 / ColumnSettings 八名」——那是扫描正则把 `show: _batchShow` 的键与源标识符重复计数所致，实际暴露面就是上表 3/4 个动词，以本条为准。

## ⬆️ 从 1.x 升级到 2.0（破坏性变更清单）

2.0 是一次「契约卫生」大版本：回调 prop 归位事件、多词事件名统一 kebab、expose 近义入口收敛。**模板里的 `@事件` 监听一律不用改**（Vue 编译期会把 `@row-click` 和 `@rowClick` 都归一成同一个处理器键，两种写法都收得到）；需要动的只有三类：传过被删 prop 的、用 JS/TS 直接调过被删方法的、以及在测试里按 camelCase 断言过事件名的。

**1. DataTable 宿主联动回调 prop 删了，改事件（Q5）**

| v1                        | v2                                                                       |
| ------------------------- | ------------------------------------------------------------------------ |
| `:on-export="fn"`         | `@export="fn"`（语义不变：挂了监听=服务端导出，内置 CSV/Excel 整个跳过） |
| `:on-toggle-sidebar="fn"` | `@toggle-sidebar="fn"`（没挂监听仍降级 `inject('toggleCollapse')`）      |

**2. 多词事件名统一 kebab-case（N8）** —— 模板监听无需改，仅文档/测试断言口径变化：

- `DataTable`：`rowClick`→`row-click`、`rowAction`→`row-action`、`rowContextAction`→`row-context-action`、`cellChange`→`cell-change`、`cellNote`→`cell-note`、`batchChange`→`batch-change`、`pageChange`→`page-change`、`selectionChange`→`selection-change`、`fullscreenChange`→`fullscreen-change`
- `Select`：`visibleChange`→`visible-change`；`ToggleList`：`itemClick`→`item-click`、`buttonClick`→`button-click`；`Drawer`：`afterOpen`/`afterClose`→`after-open`/`after-close`
- `StorePanel`（route-planner）：`toggleSkip`→`toggle-skip`、`skipCity`→`skip-city`、`removeCity`→`remove-city`
- form-builder 内部子组件（`DesignerCanvas` / `RichtextToolbar`，仅经 FormDesigner/RendererRichtext 消费）：`insertAt`→`insert-at`、`insertIntoContainer`→`insert-into-container`、`sortNode`→`sort-node`、`assignSlot`→`assign-slot`、`updateContainer`→`update-container`、`inlineCode`→`inline-code`、`togglePreview`→`toggle-preview`、`toggleFullscreen`→`toggle-fullscreen`

**3. expose 近义入口收敛（Q18）** —— `FormBuilder` 删 `validateForm()` / `validateAndGet()`（只留 `validate()`，数据用 `getFormData()`、错误用 `errors` 拼装）；`login` 删 `notifyFailed()` / `notifySuccess()`，改传 `:auth-result="{ ok, message? }"` prop。

## 🚀 发版（维护者）

发布交给 GitHub Actions（`.github/workflows/release.yml`），本地只需打标签：

```bash
git add -A && git commit -m "chore: 本次改动"   # 工作区干净才能打版本
npm run changelog                                # 从 conventional commits 重生成 CHANGELOG.md
git add CHANGELOG.md && git commit -m "docs: changelog for $(node -p "require('./package.json').version")"
npm version major                                # 或 minor / patch，会自动提交并打 v2.0.0 标签
git push --follow-tags
```

流水线会先跑类型检查、lint、构建、发包自检和「密钥是否被内联进产物」检查，全绿才发到 npm；**标签与 `package.json` 的 version 不一致会直接拒绝发布**。

> **CHANGELOG 是生成的，不是手写的**：`npm run changelog` 扫全部 conventional commits
> 按 Keep a Changelog 分组（Added/Changed/Fixed/…），审查过程记录（`docs(audit)`）折叠成
> 汇总行不逐条列——那些是内部流程而非消费方可见变更。`type(scope)!:` 带感叹号的提交另进
> **BREAKING CHANGES** 段（2.0 的破坏性清单就是这么来的）。有版本 tag 后可用
> `npm run changelog -- --since v2.0.0` 只生成增量段。不符合 conventional 格式的提交进
> Other 段（不静默丢弃），见到就去把那条提交信息补齐。

首次使用要做两件事（各一次）：

1. 仓库推到 GitHub —— 需要公开仓库（npm 来源证明 `--provenance` 要求）
2. 仓库 `Settings → Secrets and variables → Actions` 添加 `NPM_TOKEN`（npmjs.com → Access Tokens → 选 **Automation** 类型）

手动触发（`Actions → Release → Run workflow`）默认只做预演 `npm publish --dry-run`，不会真的上传。

**本地预演注意 npm 源**：本机 `npm config get registry` 多半指向 npmmirror（装依赖快），
但发布/预演必须显式指向官方源，否则 dry-run 也会打到镜像上去：

```bash
npm run release:dry-run    # = npm publish --dry-run --registry https://registry.npmjs.org
```

> 发布前置状态（2026-09-21）：本地仓库**尚未配置 git remote**，推送地址待维护者提供；
> 提供后 `git remote add origin <url> && git push -u origin main --follow-tags` 即可，
> 标签推送即触发 Release 流水线。检查清单见 `workspace/发布检查清单-2026-09-21.md`。

## 📄 License

本库本体：**MIT**（见 `LICENSE`）。

本库会把一部分第三方代码与图标几何数据**打进产物一起分发**，它们的许可不是 MIT，因此随包附一份声明清单：

- 人读：`dist/THIRD-PARTY-LICENSES.md`（含每件许可全文、进包模块数、上游地址）
- 机读：`dist/third-party-licenses.json`（SBOM 片段：包名/版本/SPDX/许可文件/模块清单）
- 构建期证据：`dist/third-party-modules.json`（rollup 记录的产物模块归属）

要点（清单里逐条有出处）：

| 随包分发 | 许可 | 备注 |
| --- | --- | --- |
| `xlsx` | Apache-2.0 | 按 §4 保留许可全文；上游发布物无 NOTICE 文件，故无额外 NOTICE 义务 |
| `jszip` | **MIT**（择优） | 上游是 `(MIT OR GPL-3.0-or-later)` 双许可，本库明确按 MIT 条款分发，不用 GPLv3 |
| `vue-i18n` + `@intlify/*` + `@vue/devtools-api` | MIT | 语言包能力，打进 core chunk |
| `@vuemap/vue-amap` 系 + `lodash-es` | MIT | 高德地图组件；JS SDK 本体仍由浏览器运行时从 CDN 取，不在包里 |
| `qrcode` + `dijkstrajs` | MIT | 二维码生成 |
| Solar 图标几何数据 | CC BY 4.0 | 集合作者 **480 Design**，本库取 `linear` 变体子集未改图形；许可页 <https://creativecommons.org/licenses/by/4.0/> |
| Lucide 图标几何与名录数据 | ISC | 经 `@lucide/vue` 的 `__iconNode` 导出抽取 |

`vue` / `vue-router` / `echarts` / `echarts-wordcloud` / `@lucide/vue` / `@iconify/vue` / `morphicons` / `zxing-wasm`
在产物里保持裸 `import`，**代码不进本包**，由宿主安装，许可义务归宿主。

> **`zxing-wasm` 的一条运行期外发**：它的解码 wasm 二进制不在 npm 包的 JS 里，`zxing-wasm@3.1.4` 的默认 `locateFile`
> 会在**首次识别时**向 `https://fastly.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/reader/zxing_reader.wasm` 发一次请求（约 950KB）。
> 因此扫码能力依赖宿主能访问该 CDN：取不到时本库在 20s 内按「本次未识别」结算（界面恢复可操作，不会一直转圈），
> 但**不会**退化成离线可用。本库当前**没有**把 wasm 地址做成可配项（`locateFile` 未透出），要让解码完全自持需按
> §9.7 的 B 方案先加宿主侧注入口——在那之前，请勿按「离线可用」评估扫码能力。
