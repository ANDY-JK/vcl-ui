# Vue 通用组件库（vcl-ui）

> 一个面向企业级应用的 Vue 3 通用组件库，覆盖基础、数据展示、表单、反馈、导航、布局、图表、登录、存储、地图、路线规划与低代码表单平台。

[![Vue](https://img.shields.io/badge/Vue-3.4%2B-brightgreen)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4%2B-blue)](https://www.typescriptlang.org/)

## ✨ 特性

- **14 个组件域、60+ 组件**：从按钮到低代码表单设计器，开箱即用
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

| 包                    | 版本                 | 说明                                                        |
| --------------------- | -------------------- | ----------------------------------------------------------- |
| `vue`                 | `^3.4.0`             | 必需。3.4 / 3.5 均可                                        |
| `echarts`             | `^5.0.0 \|\| ^6.0.0` | 可选 — 仅使用 `chart` 域时需要                              |
| `echarts-wordcloud`   | `^2.1.0`             | 可选 — 仅使用词云图表（`wordCloud` 类型）时需要            |
| `vue-router`          | `^4.3.0`             | 可选 — 仅使用 `layout` / `login` / `route-planner` 域时需要 |

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
// 或按域引入
import { Button } from 'vcl-ui/basic'
import { Input, Select } from 'vcl-ui/form'
```

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

| 域              | 主要组件                                                            | 说明       |
| --------------- | ------------------------------------------------------------------- | ---------- |
| `basic`         | Button / IconSvg / Tag                                              | 基础组件   |
| `data`          | DataTable / Tree / Collapse / Image / ProgressBar / Skeleton …      | 数据展示   |
| `form`          | Input / Select / Group / IconPicker / Upload / CameraCapture        | 表单控件   |
| `feedback`      | Toast / Loading / Popover / Drawer / ConfirmModal / ErrorBoundary … | 反馈       |
| `nav`           | Tabs / Steps / Pagination / Breadcrumb / Menu                       | 导航       |
| `layout`        | AppLayout / ModalBox / Flex / AccordionNav                          | 布局       |
| `chart`         | Chart / BaseChart / ChartTable / ChartLegend（20+ 图表类型）        | 图表       |
| `login`         | LoginPage / RegisterPage / ForgotPasswordPage / PortalLogin         | 登录       |
| `storage`       | storage\*（localStorage）/ db\*（IndexedDB）/ createBackend         | 存储       |
| `amap`          | AmapWidget + setAmapKey 等工具                                      | 高德地图   |
| `route-planner` | RouteMap / RouteResult / StorePanel …                               | 路线规划   |
| `form-builder`  | FormDesigner / FormBuilder / FormCollect / FormRenderer             | 低代码表单 |

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
- **质量门禁**：`npm run quality-check` — 类型检查 + lint + 常量来源自检 + 设计令牌断档自检 + 语言包对账 + 单测（含覆盖率地板）+ 构建 + **发包自检** + 真实浏览器 e2e
- **常量来源自检**：`npm run check:constants` — 六项：断点令牌与 JS 常量同值、JS 里不出现视口断点字面量、`@media` 宽度值均已登记、`setTimeout/setInterval` 的延时不写字面量、截断类必须登记判定且用户数据类要绑 `title`、原生 `color` 输入的值必须经归一
- **语言包对账**：`npm run check:i18n` — zh-CN / en-US 分块与键集一一对应，缺哪边点哪个键
- **发包自检**：`npm run verify:pkg` — 拦四类静默失效：组件缺 `.d.ts`（下游拿到 `any`）、`exports` 指向不存在的文件、构建期密钥被打进 `dist/`、**声明对最低承诺版本（Vue 3.4）不兼容**（下游开 `skipLibCheck: false` 时会报 TS2707）
- **本库开发配置**：真实值只填根目录 `.env.local` 一个文件（已 gitignore，样例见 `.env.example`）。这些值只在开发模式生效，**不会被打进库产物**；生产环境请由你的项目在运行时调用 `setAmapKey()` 等接口注入

## 🛠 本地开发

```bash
npm install         # 安装依赖
npm run dev         # 启动开发服务器（http://localhost:3721）
npm run typecheck   # TypeScript 类型检查
npm run lint        # ESLint
npm run test:unit   # 单元测试 + 覆盖率
npm run build       # 构建产物到 dist/
```

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

## 🚀 发版（维护者）

发布交给 GitHub Actions（`.github/workflows/release.yml`），本地只需打标签：

```bash
git add -A && git commit -m "chore: 本次改动"   # 工作区干净才能打版本
npm version patch                              # 或 minor / major，会自动提交并打 v1.0.1 标签
git push --follow-tags
```

流水线会先跑类型检查、lint、构建、发包自检和「密钥是否被内联进产物」检查，全绿才发到 npm；**标签与 `package.json` 的 version 不一致会直接拒绝发布**。

首次使用要做两件事（各一次）：

1. 仓库推到 GitHub —— 需要公开仓库（npm 来源证明 `--provenance` 要求）
2. 仓库 `Settings → Secrets and variables → Actions` 添加 `NPM_TOKEN`（npmjs.com → Access Tokens → 选 **Automation** 类型）

手动触发（`Actions → Release → Run workflow`）默认只做预演 `npm publish --dry-run`，不会真的上传。

## 📄 License

MIT
