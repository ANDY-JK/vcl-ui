# data/DataTable 域功能清单（上帝组件 + 14 composables）

> DataTable.vue 3310 行 + 14 个 composable ts。行号以 2026-08-25 为准。

---

## data/DataTable.vue（3310 行）⭐ 全库最大组件

**定位**：企业级数据表格——列管理（拖拽/固定/宽度/自动适配）、筛选/排序/搜索（拼音）、分页、卡片视图、单元格编辑/矩形选区/右键菜单/备注、截图/导出（CSV/Excel）、全屏、虚拟滚动、持久化、汇总行、缩放。

**Props**（57 项，:51-132，默认 :134-171）：

| 类别 | 关键项 |
|------|--------|
| 基础 | columns(Column[])、data(T[])、rowKey('seq')、striped/bordered/hoverable、isLoading、emptyText、dense、maxHeight、autoHeight、virtualScroll、autoFit、truncateMode |
| 列 | colSettings(true)、sortKey/sortOrder、cardBreakpoint(768) |
| 数据操作 | pinyinSearch(true)、searchMode/filterMode('client'/'server')、filters(v-model)、onExport |
| 选择/导出 | selectable、selectedKeys、exportable/excelExportable、exportFileName、exportScope('all'/'page')、shotMode、screenshotMaxRows(400) |
| 编辑/备注 | editable、noteMode、notes、originalTooltip、modifiedMark、cellSelection、keyboardNav、cellContextMenu |
| 行/单元格 | rowActions、rowContextActions、rowClass/rowStyle/cellClass/cellStyle、summary |
| 高级 | storage(TableStorage)、namespace、persistence('auto'/'none')、imageDomains、onToggleSidebar |
| 分页 | pageSize(0=不分页)、currentPage、total |

**Emits**：`update:selectedKeys`、`update:filters`、`update:currentPage`、`sort-change`、`filter`、`search`、`row-click/dblclick`、`cell-click`、`row-action`、`rowContextAction`、`fullscreenChange`、`page-change`、`export` 等（Emits 接口见 types.ts:129）。

**功能点**（按接线 composable 划分，:301-369）
1. **useTableColumns**：列显隐/拖拽排序/宽度拖拽 resize/固定列（left/right 级联 + 动态偏移）/自动适配 autoFit/卡片视图断点切换（:301-333）。
2. **useTableFilter**：列筛选下拉（多选/搜索/排序/快捷操作）、服务端模式抛事件、v-model:filters 同步（:339-369）。
3. **useTableCore**：数据加工（排序/筛选/搜索/分页/摘要/行元数据/stableRowId）、virtualScroll、displayData（:核心）。
4. **useTableEdit**：单元格双击编辑、矩形选区（拖选/键盘 Shift 扩展）、复制粘贴/清空、备注、原始值对比、修改标记（856 行最大 composable）。
5. **useTableExtras**：导出（CSV/Excel 动态 xlsx）/截图（canvas 合成 + 模式 preview/download/copy）/全屏（含侧栏收起回调）/右键菜单（:340-369 接线）。
6. **useTablePersistence**：IndexedDB 持久化列设置/宽度/筛选（persistence auto/none 自动判断）。
7. **useTableTooltip / useTableScrollProgress / useTableZoom**：单元格 tooltip（截断检测）/滚动进度条/全局缩放（dense/缩放组合）。
8. **内置异常隔离**：onErrorCaptured 单组件崩溃不拖垮页面（:42-48）。
9. **图片识别**：isImageUrl 域名白名单（含默认 CDN 列表，:1775-1781）。
10. **a11y**：键盘导航（方向键/Shift 扩展/Enter 编辑/Delete 清空）、role 表格语义、行选择 checkbox 真实 input。

**测试**：table-core(11)/table-extras(8)/table-filter(10)/table-persistence(24)/table-perf(4) + 挂载级基本。**未测**：编辑/选区/虚拟滚动/全屏/截图合成等重型交互。

**问题**
1. 3310 行单文件——**全库最重维护性负担**（12 审计已列 P2 拆分项，未动）。
2. `Record<string, any>` 贯穿 composable 边界（row 类型擦除）——类型安全由用户回调断言兜底（:179-184）。
3. composable 间通过 ref 前向引用 + 回填（_displayDataRef，:280-281）——耦合较重但已注释说明循环依赖解法。

---

## data/composables/

| 文件 | 行数 | 职责/关键点 |
|------|-----:|------|
| types.ts | 140+ | Column/ColumnOption/RowAction/RowContextAction/ColumnFilterState/FilterOption/RowMeta/OptionSort/TableStorage/Emits + `createLocalStorage(prefix)` 存储适配器工厂 |
| utils.ts | 120+ | measureTextWidth/measureDomTextWidth（列宽测量）、getCellText、clampFloatingPosition、markLayerOpen/isLayerFresh（浮层竞态）、readClipboardImage/extractImageFile（图片粘贴） |
| useTableCore.ts | 321 | 数据管道：排序/筛选/搜索/分页/摘要/行元数据/stableRowId（object→稳定 id） |
| useTableColumns.ts | 479 | 列管理：显隐/拖拽排序/宽度拖拽/固定列级联/autoFit/卡片断点 |
| useTableFilter.ts | 330 | 筛选：下拉面板/多选/搜索/排序/快捷项/服务端模式 |
| useTableEdit.ts | 856 | **最大**：单元格编辑/矩形选区/键盘导航/复制粘贴清空/备注/原始值 tooltip/修改标记 |
| useTableExtras.ts | 344 | 导出（CSV/Excel 动态加载 xlsx）/截图/右键菜单/全屏 |
| useTablePersistence.ts | 403 | IndexedDB 持久化（列设置/宽度/筛选）+ 命名空间隔离 |
| useTableFullscreen.ts | 180 | 全屏切换 + 宿主侧栏收起（inject toggleCollapse 降级） |
| useTableScreenshot.ts | 145 | canvas 合成截图（含滚动拼接）+ preview/download/copy 模式 |
| useTableScrollProgress.ts | 89 | 滚动进度条（顶部/底部感知） |
| useTableTooltip.ts | 102 | 截断检测 + 定位 tooltip + 键盘关闭 |
| useTableZoom.ts | 79 | 全局缩放（dense 联动 + 缩放原点） |

**测试**：table-core(11)/extras(8)/filter(10)/persistence(24)/perf(4)/sanitize(10)/composables 间接。**未测**：useTableEdit（856 行！）/useTableFullscreen/useTableScreenshot/useTableTooltip/useTableZoom/useTableScrollProgress/useTableColumns。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | 1（DataTable）+ 12 展示类（见 b02） |
| composables | 14 ts |
| 直接 spec | table-core/extras/filter/persistence/perf 共 57 用例 |
| 未测 composable | useTableEdit（856 行，最大）、Columns、Fullscreen、Screenshot、Tooltip、Zoom、ScrollProgress |
| i18n | 覆盖 table.* 词条（emptyText 回退 t('table.noData')） |

**最重要发现**
1. **useTableEdit（856 行）零直接测试**——编辑/选区/键盘导航是全库交互最重的功能块，却无任何锁定。
2. **composable 化程度高**：3310 行主组件由 14 个 composable 承载，拆分比 12 审计时的"上帝组件"评价已大幅改善（结构上）。
3. **持久化/导出/截图等企业特性完备**，且 persistence 支持 SaaS 注入 TableStorage——设计层面是库的旗舰组件。
