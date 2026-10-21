# ADR-002：多入口（按域）构建——13 份独立产物而非单一包

- 状态：已接受（2026-10-21 追记；决策实际形成于 2026-09-20 的 Q3 多入口改造）
- 决策人：维护者
- 关联：`vite.config.ts` 的 `build.lib.entries`、`package.json` 的 `exports`、`scripts/emit-css.mjs`、`docs/tech-debt.md` TD-02

## 背景

单入口组件库有个绕不开的取舍：**宿主引一个 `Button`，要不要把 `echarts`、`xlsx`、`amap` 的类型与代码一起拖进来？**

常见的三条路：

1. **单入口 + 靠打包器 tree-shaking**：库发一个巨大 barrel，宿主 bundler 摇掉没用的。问题：库自己无法保证摇得干净（副作用、跨 chunk 引用、`import.meta` 都可能拦住），且**摇不干净时宿主很难定位**。
2. **unplugin 自动按需转换**（Element Plus / Ant Design Vue 的做法）：编译期把 `import { Button } from 'lib'` 改写成 `import Button from 'lib/es/button'`。问题：依赖宿主配置正确，且库的 `es/` 目录结构成为事实契约。
3. **库直接产出多份入口**：`vcl-ui/basic`、`vcl-ui/data`… 各是一份完整产物。

## 决策

**选 3，按域切 13 份入口**（`basic` / `data` / `form` / `feedback` / `nav` / `layout` / `chart` / `login` / `storage` / `amap` / `route-planner` / `form-builder` / `wc`）。

关键约束：

- **域是依赖边界**：跨域依赖必须走显式出口（`_shared.ts` 等），禁止直接引别的域内部路径。
- **域是产物边界**：`vcl-ui/basic` 只加载 basic 与共享 core chunk，**不含其他域代码**。
- **域也是 CSS 边界**：`dist/css/<domain>.css` 各自自包含，宿主只引自己用的域。
- 主入口保留为**薄壳**（实测 ~9 KB），它膨胀就说明隔离被破坏 —— 有预算守着。

## 后果

**正**：

- 隔离是**构建期保证**，不依赖宿主 bundler 的 tree-shaking 能力。
- 宿主能用 `dist/css/basic.css` 精确控制样式体积（域级 CSS 是选型时的差异点之一）。
- 摇不干净时问题**在库内暴露**（主入口体积预算会红），而不是在宿主侧表现为"包莫名变大"。

**负**：

- **构建时间 ×13**（实测约 40s），且产物总量翻倍 —— 同一份 wasm/图标数据在 ESM 与 CJS 各一份，实测**双格式重复 3.97 MB（占 dist 34%）**。
- **改一个公开 prop 的成本被放大**：`defineProps` + 域 barrel + 主 barrel + 生成文档四处冗余表达（报告 R5-B11 实测：改 `cardBreakpoint` 命中 17 个文件）。
- 域划分一旦定型，**新增跨域能力要重新考虑归属**（例：`chart` + `data` 的图表表格组合）。

## 复核触发条件

- 宿主侧普遍反馈"装进来的还是太大" → 考虑再加一层按组件的细粒度入口。
- 构建时间成为迭代瓶颈（> 2 min）→ 考虑增量构建或只构建改动域。
- ESM 单格式成为可行默认（Node 22+ / 现代 bundler 普及）→ 去掉 CJS 可省 3.97 MB 重复。
