# 主题与设计令牌

## 令牌体系

全套视觉参数集中在 `tokens.css`，组件样式只引用 `var(--token)`，不写死颜色/间距/层级：

```css
:root {
  --color-primary: #4f6ef7;        /* 品牌色 */
  --color-primary-hover: #3b56e0;
  --color-bg: #ffffff;             /* 页面底 */
  --color-bg-soft: #f1f5f9;        /* 次级面 */
  --color-text: #1e293b;
  --color-border: #d8dee9;
  --z-top: 1000;                   /* 浮层层级单源 */
  --bp-sm: 640px;                  /* 断点（CSS 侧） */
  --bp-md: 768px;
  --bp-lg: 1024px;
}
```

> 引用未声明的令牌时浏览器会静默求值为继承值——亮色下常碰巧正常、暗色才暴露。库内有 `check:css-tokens` 闸口扫描全仓（含 demo 与内联 `:style`）。

## 暗色主题

在 `<html>` 上挂 `data-theme="dark"` 即切换（库内 `useTheme` 的 `auto` 模式跟随系统）：

```ts
import { useTheme } from 'vcl-ui'

const { mode, setMode } = useTheme() // 'light' | 'dark' | 'auto'
setMode('dark')
```

```html
<html data-theme="dark"></html>
```

暗色不是「反色」，是另一套令牌值：提亮语义色配白字会不可读，涉及 `-solid` 变体的对比度已按 AA 校准。

## 品牌色定制

覆盖令牌即可全库生效（组件无硬编码色，暗色硬编码色有闸口清零）：

```css
:root {
  --color-primary: #7c3aed;
  --color-primary-hover: #6d28d9;
}
```

`Button`、`Tabs`、`Pagination`、`ChartLegend` 等主色文字场景自动跟随；`-solid` 档（主色底白字）的对比度由令牌值决定，换色后建议跑一次 demo 站暗色巡检。

## 断点

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--bp-sm` | 640px | 手机 |
| `--bp-md` | 768px | 平板（卡片视图切换点） |
| `--bp-lg` | 1024px | 桌面 |

JS 侧引用 `src/components/_internal/breakpoints.ts` 的 `BP_SM/BP_MD/BP_LG`，与 CSS 同值由 `check:constants` 机械对账。
