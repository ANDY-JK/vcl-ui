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

| 包 | 版本 | 说明 |
|----|------|------|
| `vue` | `^3.4.0` | 必需。3.4 / 3.5 均可 |
| `echarts` | `^5.0.0 \|\| ^6.0.0` | 可选 — 仅使用 `chart` 域时需要 |
| `vue-router` | `^4.3.0` | 可选 — 仅使用 `layout` / `login` / `route-planner` 域时需要 |

> 词汇说明：**peer 依赖**（专业词）= 不由本库自带、需要你的项目自己装的那类依赖；**可选** = 用不到对应功能就不用装。

**⚠ 必须引入样式**：组件样式打包成独立 CSS 文件，不会自动注入。不引这一句，页面上所有组件都是没样式的裸元素。

```ts
import 'vcl-ui/css'   // ← 一次性引入，放在 main.ts 里
```

## 🚀 快速上手

### 全量引入

```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { i18n, setLocale } from 'vcl-ui'
import 'vcl-ui/css'             // 样式：必须引入

const app = createApp(App)
app.use(i18n)          // 注册国际化
setLocale('zh-CN')     // 可选，默认中文

app.mount('#app')
```

### 按需引入

```ts
import 'vcl-ui/css'                                 // 样式：必须引入（一次即可）
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

| 域 | 主要组件 | 说明 |
|----|---------|------|
| `basic` | Button / IconSvg / Tag | 基础组件 |
| `data` | DataTable / Tree / Collapse / Image / ProgressBar / Skeleton … | 数据展示 |
| `form` | Input / Select / Group / IconPicker / Upload / CameraCapture | 表单控件 |
| `feedback` | Toast / Loading / Popover / Drawer / ConfirmModal / ErrorBoundary … | 反馈 |
| `nav` | Tabs / Steps / Pagination / Breadcrumb / Menu | 导航 |
| `layout` | AppLayout / ModalBox / Flex / AccordionNav | 布局 |
| `chart` | Chart / BaseChart / ChartTable / ChartLegend（20+ 图表类型） | 图表 |
| `login` | LoginPage / RegisterPage / ForgotPasswordPage / PortalLogin | 登录 |
| `storage` | storage\*（localStorage）/ db\*（IndexedDB）/ createBackend | 存储 |
| `amap` | AmapWidget + setAmapKey 等工具 | 高德地图 |
| `route-planner` | RouteMap / RouteResult / StorePanel … | 路线规划 |
| `form-builder` | FormDesigner / FormBuilder / FormCollect / FormRenderer | 低代码表单 |

> 组件用法与可运行示例都在 demo 站点里：`npm run dev` 后打开 http://localhost:3721 ，每个组件一页，含 Props 表与交互示例。

## 🌍 国际化

```ts
import { setLocale } from 'vcl-ui'

setLocale('en-US')   // 切换到英文
setLocale('zh-CN')   // 切换到中文
```

内置语言包按域组织，可通过 `useT()` / `useTm()` 在自定义组件中复用：

```ts
import { useT } from 'vcl-ui'
const t = useT()
t('common.confirm')   // → '确认' / 'Confirm'
```

## 🧱 Web Components（跨框架）

```ts
import { registerWebComponents } from 'vcl-ui/wc'

registerWebComponents()   // 注册全部支持的标签，如 <vc-button>、<vc-input>
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
- **质量门禁**：`npm run quality-check` — 类型检查 + lint + 单测（含覆盖率地板）+ 构建 + **发包自检** + 真实浏览器 e2e
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
