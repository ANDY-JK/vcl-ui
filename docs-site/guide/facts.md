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
| 组件数 | **66** | `gen:docs` 解析 `defineProps`/`defineEmits`/`defineSlots` 得到 |
| 命名导出数 | **177** | 同上，含类型与 composable |
| demo 组件演示页数 | **46** | `src/demos/ComponentDemo.vue` 的 `demoMap` 顶层键数（一个键一页，页面含 Props 表） |
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
| zh-CN | **1503** | 16 |
| en-US | **1503** | 16 |

两侧键数一致（1503）。`check:i18n` 逐块比对键集，不只是数量。

内置语言**只有这两门**。其他语言需宿主通过覆盖键值实现，库不提供官方包。

## 质量闸口

| 事实 | 值 |
| --- | --- |
| 整链步数 | **45** |

步清单（顺序即执行顺序）：

1. `typecheck`
2. `lint`
3. `check:constants`
4. `check:result-consumed`
5. `check:no-cycles`
6. `check:icons`
7. `check:test-skips`
8. `check:icon-names`
9. `check:mutation-tool`
10. `check:mutation-audit`
11. `check:hover-guard`
12. `check:tab-sequence`
13. `check:review-appendix`
14. `check:gate-wiring`
15. `check:css-tokens`
16. `check:contrast`
17. `check:css-breakpoints`
18. `check:css-fonts`
19. `check:css-scale`
20. `check:offline`
21. `check:i18n`
22. `check:demo-props`
23. `check:error-demo`
24. `check:template-statements`
25. `check:vendor-data`
26. `check:vendor-vulns`
27. `check:deps`
28. `test:unit`
29. `check:console-noise`
30. `bench:check`
31. `check:coverage-domains`
32. `build`
33. `smoke:entries`
34. `verify:pkg`
35. `check:licenses`
36. `check:release-consistency`
37. `docs:build`
38. `check:docs`
39. `check:doc-completeness`
40. `gen:facts`
41. `check:facts`
42. `check:tech-debt`
43. `check:rtl`
44. `check:rtl-semantics`
45. `test:e2e`

## 测试规模（读自最近一次整链留痕）

| 事实 | 值 |
| --- | --- |
| 单测文件数 | **402** |
| 单测用例数 | **6303** |

::: info 这两个数会随每次提交变化
它们来自 `reports/quality-check-logs/*-test-unit.log`（按后缀匹配，**不依赖步骤序号**；每次整链运行前清空），
所以只反映最近一次整链。闸口**不拦**这两个数的漂移，只拦结构规模与语言包键数。
:::

## 为什么要有这一页

因为「手写的数字」会**安静地过期**——它不会报错，只是慢慢变成谎话。实测过的三次：

1. 文档站首页写「14 个组件域」，实际 **13**（把手 `_internal`/`shared` 也算成了域）
2. README 写「60+ 组件」，实际 **65**（三年前的口径，之后没人回头改）
3. 「行数止涨线」注释里 4 处手写快照，**3 处**已与实测不符（H#51 改成脚本算才收口）

所以这里的规矩是：**能算的绝不手写；必须手写的，用闸口对着真源查。**
