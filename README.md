# Vue 通用组件库（vue-component-lib）

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
npm install vue-component-lib
```

**peer 依赖**（需同时安装）：

| 包 | 版本 | 说明 |
|----|------|------|
| `vue` | `^3.4.0` | 必需 |
| `echarts` | `^5.0.0 \|\| ^6.0.0` | 使用图表组件时 |
| `vue-router` | `^4.3.0` | 使用布局/登录组件时 |
| `pinia` | `^2.1.7` | 按需 |

## 🚀 快速上手

### 全量引入

```ts
// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { i18n, setLocale } from 'vue-component-lib'

const app = createApp(App)
app.use(i18n)          // 注册国际化
setLocale('zh-CN')     // 可选，默认中文

app.mount('#app')
```

### 按需引入

```ts
import { Button, Input, DataTable } from 'vue-component-lib'
// 或按域引入
import { Button } from 'vue-component-lib/basic'
import { Input, Select } from 'vue-component-lib/form'
```

### 基本使用

```vue
<template>
  <Button variant="primary" @click="handleClick">点击我</Button>
  <Input v-model="text" label="用户名" placeholder="请输入" />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Button, Input } from 'vue-component-lib'

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
| `layout` | AppLayout / MiniLayout / ModalBox / Flex / AccordionNav | 布局 |
| `chart` | Chart / BaseChart / ChartTable / ChartLegend（20+ 图表类型） | 图表 |
| `login` | LoginPage / RegisterPage / ForgotPasswordPage / PortalLogin | 登录 |
| `storage` | storage\*（localStorage）/ db\*（IndexedDB）/ createBackend | 存储 |
| `amap` | AmapWidget + setAmapKey 等工具 | 高德地图 |
| `route-planner` | RouteMap / RouteResult / StorePanel … | 路线规划 |
| `form-builder` | FormDesigner / FormBuilder / FormCollect / FormRenderer | 低代码表单 |

> 完整组件清单与 API 见 [docs/组件使用手册.md](docs/组件使用手册.md) 与 [docs/api-auto.md](docs/api-auto.md)。

## 🌍 国际化

```ts
import { setLocale } from 'vue-component-lib'

setLocale('en-US')   // 切换到英文
setLocale('zh-CN')   // 切换到中文
```

内置语言包按域组织，可通过 `useT()` / `useTm()` 在自定义组件中复用：

```ts
import { useT } from 'vue-component-lib'
const t = useT()
t('common.confirm')   // → '确认' / 'Confirm'
```

## 📚 文档

- **使用手册**：`docs/组件使用手册.md` — 组件用法、Props、示例
- **工具函数**：`docs/utils-api.md` — 校验 / 行政区划 / 金额 / 字符串 / 随机 ID / 文件转换 / 脱敏 / 颜色等通用工具
- **API 文档**：`docs/api-auto.md` — 组件类型定义（历史快照，脚本已移除，手动维护）
- **审计报告**：`docs/audit/` — 架构/安全/性能/无障碍/国际化等 13 份专项审计

## 🛠 本地开发

```bash
npm install         # 安装依赖
npm run dev         # 启动开发服务器（http://localhost:3721）
npm run typecheck   # TypeScript 类型检查
npm run lint        # ESLint
npm run test:unit   # 单元测试 + 覆盖率
npm run build       # 构建产物到 dist/
```

## 📄 License

MIT
