# 安装

## 环境要求

- Node.js ≥ 18
- Vue `^3.4.0`（类型声明按最低承诺版本 3.4 生成）

## 安装

::: code-group

```bash [npm]
npm install vcl-ui
```

```bash [pnpm]
pnpm add vcl-ui
```

:::

## peer 依赖（按需安装）

| 依赖 | 版本 | 何时需要 |
| --- | --- | --- |
| `echarts` | `^5.0.0 \|\| ^6.0.0` | 仅使用 `chart` 域 |
| `echarts-wordcloud` | `^2.1.0` | 仅使用词云 |
| `vue-router` | `^4.3.0` | 仅使用 `layout` / `login` / `route-planner` 域 |

地图域（`amap` / `route-planner`）另需高德 Key，运行时注入（不随库分发）：

```ts
import { setAmapKey } from 'vcl-ui/amap'
setAmapKey('你的 Key')
```

## 运行时依赖

以下依赖由库直接管理，安装 `vcl-ui` 即自动带入：`@iconify/vue`、`@lucide/vue`、`jszip`、`qrcode`、`vue-i18n`、`zxing-wasm`、`xlsx`（SheetJS CDN 版，仅 Excel 导入导出按需惰性加载）、`html2canvas`（仅截图工具按需惰性加载）。
