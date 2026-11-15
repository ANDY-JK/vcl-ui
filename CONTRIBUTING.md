# 参与贡献（界面 / 布局 / 美化方向）

欢迎来帮忙改进这个组件库的界面和布局。这份指南只讲 **改 UI 需要知道的最小集**，其他工程规范见 [README](README.md#-开发规范改代码前先看)。

## 第一步：把界面跑起来

```bash
npm install
npm run dev          # 打开 http://localhost:3721
```

- 每个组件一页 demo，含 Props 表与交互示例，demo 源码在 `src/demos/`
- 主题编辑器：站点顶栏月亮按钮（路由 `#/theme-editor`）—— 改令牌全站实时预览

## 改什么、改哪里

| 想做的事 | 去哪里改 |
| --- | --- |
| 调整某个组件的外观 / 布局 | `src/components/<域>/<组件>.vue`（样式就近写在组件内） |
| 全局配色、间距、圆角、暗色模式 | `src/components/tokens.css`（`--vcl-*` 统一前缀，别写死颜色） |
| 组件示例页 / 展示效果 | `src/demos/` |
| 文档站排版 | `docs-site/`（VitePress） |

**改样式的三条底线**（CI 会拦，提前知道少走弯路）：

1. 颜色、字号、间距一律引用 `--vcl-*` 令牌，引用了未声明的令牌会直接红（`check:css-tokens`）
2. 对比度有审计：`npm run check:contrast`，改配色后跑一下
3. 原生 `<button>` 必须写 `type="button"`（防止吃掉宿主表单提交）

## 提交前自检

```bash
npm run quick-check   # 快速闸口组合，几秒钟
npm run lint          # 零警告
npm run typecheck     # 零错误
```

纯视觉改动（不碰逻辑）跑过 `quick-check` 就可以提 PR，CI 会补跑完整链路。

## 提 PR

1. Fork → 新建分支（`feat/theme-dark-polish` 这类名字）
2. 改动尽量小而聚焦：一个 PR 只做一件事，截图放 PR 描述里（改前 / 改后）
3. 描述里写清楚：改了哪些界面、为什么这么改、在哪些页面能看出来

## 发现问题但不想动手改？

提 [Issue](../../issues/new/choose) 选「界面 / 布局改进建议」，附截图和期望效果即可，维护者会跟进。
