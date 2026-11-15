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
| 组件数 | **71** | `gen:docs` 解析 `defineProps`/`defineEmits`/`defineSlots` 得到 |
| 命名导出数 | **183** | 同上，含类型与 composable |
| demo 组件演示页数 | **51** | `src/demos/ComponentDemo.vue` 的 `demoMap` 顶层键数（一个键一页，页面含 Props 表） |
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
| zh-CN | **1521** | 16 |
| en-US | **1521** | 16 |

两侧键数一致（1521）。`check:i18n` 逐块比对键集，不只是数量。

内置语言**只有这两门**。其他语言需宿主通过覆盖键值实现，库不提供官方包。

## 质量闸口

| 事实 | 值 |
| --- | --- |
| 整链步数 | **58** |

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
13. `check:edit-single-writer`
14. `check:esc-consume`
15. `check:public-surface`
16. `check:async-assert`
17. `check:debt-evidence`
18. `check:review-history`
19. `check:canwrite-usage`
20. `check:i18n-usage`
21. `check:event-codes`
22. `check:demo-routes`
23. `check:review-appendix`
24. `check:gate-wiring`
25. `check:css-tokens`
26. `check:contrast`
27. `check:css-breakpoints`
28. `check:css-fonts`
29. `check:css-scale`
30. `check:type-tokens`
31. `check:offline`
32. `check:i18n`
33. `check:demo-props`
34. `check:error-demo`
35. `check:template-statements`
36. `check:vendor-data`
37. `check:vendor-vulns`
38. `check:deps`
39. `test:unit`
40. `check:console-noise`
41. `bench:check`
42. `check:coverage-domains`
43. `build`
44. `smoke:entries`
45. `verify:pkg`
46. `check:licenses`
47. `check:release-consistency`
48. `docs:build`
49. `check:docs`
50. `check:audit`
51. `check:doc-completeness`
52. `gen:facts`
53. `check:facts`
54. `check:chain-doc`
55. `check:tech-debt`
56. `check:rtl`
57. `check:rtl-semantics`
58. `test:e2e`

## 测试规模（读自最近一次整链留痕）

| 事实 | 值 |
| --- | --- |
| 单测文件数 | **500** |
| 单测用例数 | **7332** |

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
