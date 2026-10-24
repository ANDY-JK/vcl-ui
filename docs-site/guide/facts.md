---
title: 事实清单（自动生成）
---

# 事实清单

> ⚠️ **本页由 `npm run gen:facts` 生成，请勿手改。**
> 漂移会被 `check:facts` 拦下；正文里硬编码的数字与这里冲突也会被拦下。

可核验事实的**单一真源**。文档正文只应引用本页，不要手写这些数字。

## 结构规模

| 事实 | 值 | 怎么算的 |
| --- | --- | --- |
| 域入口数 | **13** | `package.json` 的 `exports`，去掉 `./css`/`./i18n` 等辅助子路径 |
| 组件数 | **65** | `gen:docs` 解析 `defineProps`/`defineEmits`/`defineSlots` 得到 |
| 命名导出数 | **166** | 同上，含类型与 composable |
| 解析失败组件 | **0** | 应为 0；非 0 时 `check:docs` 直接红 |

域入口清单：

- `vcl-ui/basic`
- `vcl-ui/data`
- `vcl-ui/form`
- `vcl-ui/feedback`
- `vcl-ui/nav`
- `vcl-ui/layout`
- `vcl-ui/chart`
- `vcl-ui/login`
- `vcl-ui/storage`
- `vcl-ui/wc`
- `vcl-ui/form-builder`
- `vcl-ui/amap`
- `vcl-ui/route-planner`

## 语言包

| 语言 | 键数 | 分块文件 |
| --- | --- | --- |
| zh-CN | **1480** | 16 |
| en-US | **1480** | 16 |

两侧键数一致（1480）。`check:i18n` 逐块比对键集，不只是数量。

内置语言**只有这两门**。其他语言需宿主通过覆盖键值实现，库不提供官方包。

## 质量闸口

| 事实 | 值 |
| --- | --- |
| 整链步数 | **32** |

步清单（顺序即执行顺序）：

1. `typecheck`
2. `lint`
3. `check:constants`
4. `check:css-tokens`
5. `check:contrast`
6. `check:css-breakpoints`
7. `check:css-fonts`
8. `check:css-scale`
9. `check:offline`
10. `check:i18n`
11. `check:demo-props`
12. `check:vendor-data`
13. `check:vendor-vulns`
14. `check:deps`
15. `test:unit`
16. `check:console-noise`
17. `bench:check`
18. `check:coverage-domains`
19. `build`
20. `smoke:entries`
21. `verify:pkg`
22. `check:licenses`
23. `check:release-consistency`
24. `docs:build`
25. `check:docs`
26. `check:doc-completeness`
27. `gen:facts`
28. `check:facts`
29. `check:tech-debt`
30. `check:rtl`
31. `check:rtl-semantics`
32. `test:e2e`

## 测试规模（读自最近一次整链留痕）

| 事实 | 值 |
| --- | --- |
| 单测文件数 | **266** |
| 单测用例数 | **3868** |

::: info 这两个数会随每次提交变化
它们来自 `reports/quality-check-logs/15-test-unit.log`（**每次整链运行前清空**），
所以只反映最近一次整链。闸口**不拦**这两个数的漂移，只拦结构规模与语言包键数。
:::

## 为什么要有这一页

因为「手写的数字」会**安静地过期**——它不会报错，只是慢慢变成谎话。实测过的三次：

1. 文档站首页写「14 个组件域」，实际 **13**（把手 `_internal`/`shared` 也算成了域）
2. README 写「60+ 组件」，实际 **65**（三年前的口径，之后没人回头改）
3. 「行数止涨线」注释里 4 处手写快照，**3 处**已与实测不符（H#51 改成脚本算才收口）

所以这里的规矩是：**能算的绝不手写；必须手写的，用闸口对着真源查。**
