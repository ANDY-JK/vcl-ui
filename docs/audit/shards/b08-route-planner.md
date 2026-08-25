# route-planner 域功能清单（门店巡访路线规划）

> 5 vue + 11 ts。行号以 2026-08-25 为准。

---

## route-planner/utils/route-planning.ts（808 行）⭐ 核心算法

**定位**：闭环巡访回路规划——**先聚类再路线**，分天切割，绕路跳过，2-opt 优化。

**导出**：`DEFAULTS`（统一估算参数：日限 8h、单日 8 店、单段 80km、绕路 50km、路况系数 1.4、均速 50、聚类半径 30km、拜访 30min、驾驶上限 240min）、`planRoute(options)`、`replanFrom`、`enrichAccommodations`（async）。

**功能点**
1. **主流程**：过滤有效门店（无坐标/skipped 排除）→ 起点兜底（:41-53）→ 聚类 → 双策略排序比较（角度环形 vs 最近邻，取规划门店更多者）（:56-71）。
2. **贪心聚类**：离起点最近种子 + 吸收质心半径内门店（:155-199）。
3. **组内优化**：最近邻 + **2-opt**（2% 阈值防震荡，100 次迭代上限，反转段消除之字形）（:405-447）。
4. **绕路检测**：闭环绕路成本（detourCost = 到店+离店-直连），自适应阈值（均值×1.5 封顶 maxDetourKm），迭代 3 次至稳定（:721-775）。
5. **分天切割**：总时间上限（同聚类放宽 20%）+ 驾驶上限（安全第一不放松）+ 门店数 + 单段距离 4 条件（:506-596）。
6. **单店天合并**：尝试前后合并（时间+驾驶双检查）（:603-692）。
7. **住宿建议**：当天最常见城市 + 末店区县 → 建议住宿区域（:103-140）。
8. **时间估算**：直线距离×roadFactor/均速（:789-793）。

**测试**：route-planner-accommodation.spec（4 用例：住宿 enrich 等）。**未测**：聚类/2-opt/分天切割/绕路跳过。

**问题**：算法纯函数且复杂度高（聚类+2-opt+双策略），**测试覆盖极低**——但纯函数特性使其非常适合全面单测，是本域最值得补测的模块。

---

## route-planner/types/index.ts（117 行）

**导出**：`Store`（含 coordSource 溯源）、`StoreGroup`、`NavLink`、`DayPlan`、`Accommodation`、`RoutePlan`、`RouteOptions`、`CoordResult`、`ImportResult`、`ProgressCallback`、`CoordSource`。

**关键设计**：Store.coordSource 记录坐标来源（original/address_geocode/township_geocode/manual/none）——坐标溯源审计链。
**测试**：route-planner-accommodation.spec 间接。

---

## route-planner/utils/coordinate-resolver.ts（170 行）

**导出**：`resolveCoordinate(store)`、`batchResolveCoordinates`（复用 amap geocodeCalc/keywordSearch）。

**功能点**：单店地址→坐标（amap 地理编码 + 门店名兜底 + 乡镇降级）；批量 + 进度回调。
**测试**：无直接 spec。

---

## route-planner/utils/excel-import.ts（194 行）

**导出**：`parseExcel(file)` → ImportResult（门店列表 + 错误行）。

**功能点**：xlsx 解析 + 必填列校验 + 行级错误收集 + 经纬度/地址规范化。
**测试**：无直接 spec。

---

## route-planner/utils/driving-direction.ts（127 行）

**导出**：`findNearbyAccommodation`（周边搜酒店）、`enrichWithDrivingRoutes`（驾车路线 enrich + polyline 解析），re-export amap 的 getDrivingRoute/DrivingRouteResult。

**测试**：无直接 spec。

---

## route-planner/utils/gaode-navigator.ts（111 行）

**导出**：`buildDayNavLink`（单日聚合导航）、`buildStoreLegNavLinks`（逐段导航链接）、`buildAllNavLinks`，re-export amap detectPlatform/buildNavLink/NavLink/NavPoint。

**功能点**：按天生成 A→B 导航（含途经点）；逐店段链接；三端（iOS/Android/Web）深度链接。
**测试**：无直接 spec。

---

## route-planner/composables/

| 文件 | 行数 | 导出 | 职责 |
|------|-----:|------|------|
| useRoutePlanner.ts | 117 | `useRoutePlanner()` | 主状态机：门店列表/路线规划/重规划/导入/添加编辑删除跳过 |
| useStoreData.ts | 113 | `useStoreData()` | 门店数据分组（按城市）、搜索过滤、统计 |
| useCoordinateResolver.ts | 71 | `useCoordinateResolver()` | 坐标解析状态（解析中/进度/错误）+ batch 调用 |

**测试**：route-planner-accommodation.spec（useRoutePlanner 部分）。

---

## route-planner/RouteResult.vue（778 行）⭐

**定位**：路线结果展示——按天卡片（门店列表/驾驶时长/住宿）、密度标签、导航跳转、设置当前天。

**Props**：`plan`(RoutePlan|null)、`hasRealDriving`(bool)、`startPointName`。
**Emits**：`set-current-day`、`restart` 等（由 useRoutePlanner 接线）。
**功能点**：formatTime/formatDistance 展示；segmentInfo 逐段驾驶估算；storeDensity/densityLabel 密度分级；按天展开（toggleDay）；openNav 导航链接（:61）；setCurrentDay（:66）；legNavLinks 逐段导航（:265）。
**i18n**：t('routePlanner.*') 全覆盖。
**测试**：无直接 spec。**问题**：无。

---

## route-planner/RouteMap.vue（313 行）

**定位**：地图路线展示——按天着色 polyline + 标记 + 起终点。

**Props**：`plan`、`stores`、`showRoute` 等。
**功能点**：mapCenter 由 plan.startPoint 推算（:34-36）；getDayColor 按天配色（:73）；renderAll 清空+重绘标记/路线（:81-88）。
**测试**：无直接 spec（依赖真实地图）。**问题**：同 AmapWidget，地图无键盘替代。

---

## route-planner/StorePanel.vue（566 行）

**定位**：门店侧栏——按城市分组、搜索、批量跳过/删除、单店编辑/删除/跳过、确认弹层。

**Emits**：`add`、`edit`、`delete`、`toggleSkip`、`skipCity`、`deleteCity` 等。
**功能点**：分组展开（toggleGroup/isExpanded）；组内批量操作（:163-170）；删除二次确认（requestDelete→confirmTarget overlay，:79-97,224-239）；sourceLabel 坐标来源展示（:102）。
**测试**：无直接 spec。**问题**：确认弹层（confirm-overlay）已接 useFocusTrap（:73-78）——2026-08-24 P2-5 整改时补齐，焦点管理达标。

---

## route-planner/StoreFormModal.vue（346 行）

**定位**：门店新增/编辑弹窗——名称/地址/坐标（手动/解析）/备注。

**Props**：`visible`、`store`(编辑对象)、`editing` 等。**Emits**：`submit`、`close`。
**功能点**：isEdit 判定（:52）；表单校验 name/address 至少其一（:82）；坐标解析按钮。
**测试**：route-planner-i18n.spec（1 用例：locale 切换文案）。**问题**：自绘 modal-overlay 已接 useFocusTrap + Esc（:26-37）——2026-08-24 P2-5 已补齐。

---

## route-planner/ImportProgress.vue（70 行）

**定位**：Excel 导入进度条（进度百分比 + 文件名校验）。

**Props**：`progress`、`total`、`current`、`label`、`error`。**功能点**：进度条渲染 + 完成态。
**测试**：无直接 spec。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | 5 |
| ts 模块 | 11（3 composable + 5 utils + types + 2 index） |
| 直接 spec 覆盖 | route-planner-accommodation(4)、route-planner-i18n(1) |
| 未测 | 4 个组件挂载级 + 全部 utils 纯函数 |
| i18n | 组件全覆盖；composable 内少量硬编码（'总记录'等统计标签在 FormCollect，非本域） |
| a11y | 两个弹层（StoreFormModal/StorePanel 确认框）均已接 useFocusTrap + Esc（2026-08-24 P2-5）✅ |

**最重要发现**
1. **route-planning.ts 是本域（也是全库）算法复杂度最高的纯函数模块**（聚类/2-opt/分天/绕路），测试仅 4 用例——算法回归风险高，最该补测。
2. **两个弹层焦点管理已达标**（useFocusTrap + Esc，P2-5 已修），历史 07 审计问题在本域已清零。
3. **与 amap 域复用良好**：getDrivingRoute/buildNavLink/geocodeCalc 全部 re-export amap-service，无重复实现。
