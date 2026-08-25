# chart 域功能清单

> 4 组件 + 27 ts（options 工厂 ×21 + utils ×3 + index）。行号以 2026-08-25 为准。

---

## chart/BaseChart.vue（345 行）⭐

**定位**：ECharts 最小封装——实例生命周期/自适应/空态/加载态/深色模式/工具栏注入；接收完整 EChartsOption。

**Props**：`option`(EChartsOption|null)、`loading`(false)、`emptyText`('')、`height`('100%')、`width`('100%')、`darkMode`(false)、`toolbar`(['saveAsImage','zoom']|false)。
**Emits**：无（事件绑定在 Chart.vue 层）。**Expose**：`chart`(getter)、`getOption`、`setOption`、`resize`、`dispatchAction`、`clear`、`showLoading`、`hideLoading`。

**功能点**
1. **空态判定**：无 option / 无 series 且无 dataset / timeline compound 无 options → 空遮罩（:39-58）。
2. **无障碍**：容器 role="img" + aria-label 从 option.title 提取（支持 string/数组/对象，:60-73）。
3. **toolbox 注入**：saveAsImage/zoom/dataView 按需，合并（非覆盖）用户自定义 toolbox；timeline compound 挂到 baseOption 且 title 存在时 top=36 避让（:76-121）。
4. **timeline compound 降级**：setOption 失败（ECharts 内部 bug）→ 取 options[0]/baseOption 渲染（:146-166,206-220）。
5. **ResizeObserver 自适应** + rAF 合并 + 零尺寸跳过 + 无 RO 环境 window resize 兜底（:123-127,180-196,250-259）。
6. **darkMode 切换重建实例**（:242-248）。
7. setOption 前检查 DOM isConnected 防操作已替换 canvas（:281）。

**测试**：无直接 spec（依赖真实 canvas）。**未测**：全部。

**问题**
1. `mergeToolbox` 的 `if ('title' in opt)` 对 string title 判断类型不严谨（ECharts title 可为对象）——实际 `'title' in opt` 仅判 key 存在，安全。
2. empty 遮罩与 ECharts canvas 同层，z-index 1 覆盖正常。

---

## chart/Chart.vue（398 行）⭐

**定位**：三层封装——极简数据自动推断 + ChartProps 高级控制 + 自定义 HTML 图例接管。

**Props**：完整 ChartProps（21 项，见 utils/types.ts:155-199）+ 默认值（type/option 缺省时 data 推断为 bar）。
**Emits**：`chart-ready`、`click`、`dblclick`、`mousedown`、`mouseup`、`mouseover`、`mouseout`、`globalout`、`contextmenu`、`legendselectchanged`、`datazoom`、`finished`（全部透传 ECharts 事件，:49-62）。
**Expose**：chart/getOption/setOption/resize/dispatchAction/clear/showLoading/hideLoading（透传 BaseChart）。

**功能点**
1. **极简推断**：number[]→单系列、number[][]→多系列、{name,value}[]→分类系列（:70-90,106-123）；全部无 type/categories/series 时推断 bar。
2. **HTML 图例接管**：ECharts 内置 legend show:false，隐藏系列通过置空 data 重 setOption 实现（:158-197）；饼图/漏斗按数据项名过滤（:183-191）。
3. **wordCloud 按需加载**：echarts-wordcloud ~30KB 动态 import，加载完 wordCloudReady → :key 重建 BaseChart（:294-315）。
4. **事件重绑定**：监听 baseChartRef.chart 变化，11 个事件 off+on（:261-292）。
5. legendselectchanged 同步 hiddenSeries（:280-287）；emit 自定义 selected 载荷（:252-259）。

**测试**：无直接 spec。**未测**：全部（推断/图例显隐/wordCloud 加载）。

**问题**
1. 推断模式的 `{name,value}` 分支仅匹配**全部项**都是对象——混合数组降级 null。低危。
2. `emitLegendSelectChanged` 手工构造 legendselectchanged 事件对象（非 ECharts 原生）——消费方需按组件契约处理。

---

## chart/ChartLegend.vue（121 行）

**定位**：独立 HTML 图例（flex-wrap 永不重叠），全选/全不选 + 单项切换。

**Props**：`items: {name,color,visible}[]`。**Emits**：`toggle: [name]`、`toggle-all: [visible]`。
**功能点**：allVisible 判定（:14）；toggle-all 语义取反（:20-23）；off 项 opacity 0.3。
**测试**：无。**问题**：'全不选'/'全选' 硬编码中文未 i18n。

---

## chart/ChartTable.vue（281 行）

**定位**：图表 + DataTable 复合组件——横向分栏 / 纵向堆叠自适应 + 图例/表格开关。

**Props**：ChartProps 全集 + `columns`(Column[])、`tableData`、`showTable`(true)、`tableTitle`、`rowKey`('rank')、`chartRatio`(0.45)。
**Emits**：`chart-click`、`chart-ready`。**Slots**：`header`、`footer`。

**功能点**
- **DataTable 动态 import**（defineAsyncComponent，独立 chunk，M15 解耦 chart→data 静态依赖）（:9）。
- ResizeObserver 布局判定：根宽 < 图表min+表格min+间距 → 纵向堆叠（:82-128）。
- 图例/表格本地开关（showLegendLocal/showTableLocal）（:75-76,145-150）。
- 表格 props 透传 DataTable（striped/dense/auto-height）（:187）。

**测试**：无直接 spec。**未测**：全部。**问题**：toggle 按钮 emoji + 中文硬编码。

---

## chart/utils/echarts-setup.ts（86 行）

**定位**：按需注册 16 图表 + 17 组件 + CanvasRenderer；wordCloud 动态加载。

**导出**：`use` 注册、`ensureWordCloud()`、`init/getInstanceByDom/registerMap`。
**功能点**：按需注册降低首屏体积（:48-83）；wordCloud 模块懒加载幂等（:41-46）。
**测试**：无直接 spec。**问题**：无。

---

## chart/utils/chart-utils.ts（8 行）

**导出**：`toSize(val, fallback)` —— 数字/纯数字字符串补 px，否则原样。**测试**：无。**问题**：无。

---

## chart/utils/types.ts（239 行）

**定位**：ChartType（21 类）、ChartProps（3 层控制）、ChartData（各图专用数据字段）、MarkLine/MarkArea/AxisConfig、系列类型。

**问题**：`ChartSeriesItem` 含 `[key: string]: any` 索引签名（:71）——灵活但削弱类型安全（P2 已知）。

---

## chart/options/common.ts（310 行）⭐

**定位**：所有 builder 共享底座——色板/图例配置/标注/智能默认值/tooltip 防溢出/公共外壳。

**导出**：DEFAULT_COLORS(16 色)、PALETTE_PRESETS(6 预设)、textColor/mutedColor、resolvePalette、resolveLegendPosition、buildLegendConfig、buildMarkLine、buildMarkArea、autoLabelRotate、autoDataZoom、smartLegend、buildCommonChrome、buildXAxis/buildYAxis。

**功能点**
- 防重叠图例策略：itemGap 24 + padding + 长名截断 + >10 条自动右侧竖排 + >15 条 scroll（:68-127）。
- 智能默认：分类名>4 字自动旋转 45°（:169-172）；数据>50 点自动 dataZoom（:178-190）。
- tooltip appendToBody + 动态位置防溢出（:206-235）。
- 强制标尺：splitLine + axisTick 常显（:281-309）。
- grid 无 legend 占位优化（:243-246）。

**测试**：无直接 spec。**问题**：无。

---

## chart/options/index.ts（66 行）

**导出**：`buildChartOption(type, params)` —— 21 类型→builder 映射表，未知类型 warn + 回退 bar（:58-65）。

---

## chart/options/core/（8 个 builder）

| 文件 | 行为要点（行号） |
|------|------|
| bar.ts | horizontal 轴互换；stack/stacked100；barMaxWidth 48；showDataLabel 位置自适应（:6-35） |
| line.ts | smooth/showSymbol/areaStyle；stack 支持 |
| area.ts | 折线 + 渐变 areaStyle |
| pie.ts | pieData 或 series[0].data；环形 30%-58%；label {b}\n{d}%（:6-28） |
| scatter.ts | symbolSize、多系列 |
| mixed.ts | 折线+柱状叠加（series type 混合） |
| waterfall.ts | 柱状模拟瀑布 |
| pictorialBar.ts | 象形柱（symbol 图片） |

**测试**：全部无直接 spec。**问题**：core 层默认值/高级控制依赖 common，行为正确但零测试。

---

## chart/options/advanced/（13 个 builder）

| 文件 | 输入数据字段 | 行为要点 |
|------|------|------|
| radar.ts | radarIndicators | radar indicator + series |
| gauge.ts | gaugeData | 仪表盘 |
| funnel.ts | series data | 漏斗 |
| heatmap.ts | heatmapData/heatmapX/YCategories | visualMap 热力 |
| candlestick.ts | candlestickData | K 线 |
| sankey.ts | sankeyNodes/Links | 桑基 |
| sunburst.ts | treeData | 旭日 |
| graph.ts | graphNodes/Links | 关系图/力导向 |
| boxplot.ts | boxplotData | 箱线 |
| tree.ts | treeData | 树图 |
| treemap.ts | treeData | 矩形树 |
| timeline.ts | timelineData（compound option） | 时间轴 |
| wordCloud.ts | series data | 词云（依赖 ensureWordCloud 前置加载） |

**测试**：全部无直接 spec。**问题**：advanced 层是纯配置函数，**最易被单测锁定但 0 覆盖**——是 chart 域测试欠账最重的部分。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | 4（BaseChart/Chart/ChartLegend/ChartTable） |
| 工厂函数 | 21 个 builder + common 11 个工具 |
| 直接 spec 覆盖 | **0**（整个 chart 域无任何 spec） |
| i18n | 组件级：BaseChart emptyText 用 t('common.empty')；ChartLegend/ChartTable 按钮硬编码中文；builder 内 `系列${i}`/`项${i}` 硬编码（Chart.vue 用 t('chart.seriesFallback') 覆盖部分） |
| 关键问题 | 全域 0 测试；a11y 仅容器 aria-label（canvas 无替代，07 审计已列） |

**最重要发现**
1. **chart 域是全库测试最薄弱的域之一**：21 个 option builder 是纯函数，非常适合单测，但 0 覆盖。
2. **三层架构清晰**：BaseChart（实例管理）→ Chart（控制/图例）→ ChartTable（复合），职责分离良好；wordCloud 按需加载 + DataTable 异步解耦是架构亮点。
3. **a11y 仅容器级 aria-label**：canvas 图表无数据表格替代（07 审计"canvas 无替代"仍成立）。
