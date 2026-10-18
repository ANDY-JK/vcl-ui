# 主题与设计令牌

## 令牌体系

全套视觉参数集中在 `tokens.css`，组件样式只引用 `var(--token)`，不写死颜色/间距/层级：

```css
:root {
  --vcl-color-primary: #4f6ef7;        /* 品牌色 */
  --vcl-color-primary-hover: #3b56e0;
  --vcl-color-bg: #ffffff;             /* 页面底 */
  --vcl-color-bg-soft: #f1f5f9;        /* 次级面 */
  --vcl-color-text: #1e293b;
  --vcl-color-border: #d8dee9;
  --vcl-z-top: 1000;                   /* 浮层层级单源 */
  --vcl-bp-sm: 640px;                  /* 断点（CSS 侧） */
  --vcl-bp-md: 768px;
  --vcl-bp-lg: 1024px;
}
```

> 引用未声明的令牌时浏览器会静默求值为继承值——亮色下常碰巧正常、暗色才暴露。库内有 `check:css-tokens` 闸口扫描全仓（含 demo 与内联 `:style`）。

## 暗色主题

在 `<html>` 上挂 `data-theme="dark"` 即切换（库内 `useTheme` 的 `auto` 模式跟随系统）。

**最省事的做法是纯 CSS**（不需要 JS，宿主的 JS 完全不参与）：

```html
<html data-theme="dark"></html>
```

**需要在 JS 里读写/切换时**用 `useTheme()`（返回值以 `src/components/_internal/useTheme.ts:94-107` 为准）：

```ts
import { useTheme } from 'vcl-ui'

const { theme, effectiveTheme, setTheme, toggleTheme, getSystemTheme } = useTheme()
// theme          'light' | 'dark' | 'auto'（用户选择值，ref）
// effectiveTheme 'light' | 'dark'（auto 时跟随系统，computed）
// setTheme('dark') / toggleTheme() / getSystemTheme()
setTheme('dark')
```

> 别名提醒：这两个字段叫 `theme` 与 `effectiveTheme`（不是 `mode` / `setMode`）。`setTheme` 接受 `'light' | 'dark' | 'auto'`。

暗色不是「反色」，是另一套令牌值：提亮语义色配白字会不可读，涉及 `-solid` 变体的对比度已按 AA 校准。

## 品牌色定制

覆盖令牌即可全库生效（组件无硬编码色，暗色硬编码色有闸口清零）：

```css
:root {
  --vcl-color-primary: #7c3aed;
  --vcl-color-primary-hover: #6d28d9;
}
```

`Button`、`Tabs`、`Pagination`、`ChartLegend` 等主色文字场景自动跟随；`-solid` 档（主色底白字）的对比度由令牌值决定，换色后建议跑一次 demo 站暗色巡检。

## 断点

| 令牌 | 值 | 用途 |
| --- | --- | --- |
| `--vcl-bp-sm` | 640px | 手机 |
| `--vcl-bp-md` | 768px | 平板（卡片视图切换点） |
| `--vcl-bp-lg` | 1024px | 桌面 |

JS 侧引用 `src/components/_internal/breakpoints.ts` 的 `BP_SM/BP_MD/BP_LG`，与 CSS 同值由 `check:constants` 机械对账。
