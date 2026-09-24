# 路线规划（route-planner）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `RouteMap` | 2 | 0 | 0 |
| `RouteResult` | 5 | 0 | 0 |
| `StorePanel` | 1 | 6 | 0 |
| `StoreFormModal` | 2 | 2 | 0 |
| `ImportProgress` | 3 | 0 | 0 |

---

## `RouteMap`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `stores` | `Store[]` | — | 是 | 门店列表（有坐标的门店打点渲染） |
| `plan` | `RoutePlan \| null` | — | 是 | 规划结果（非空时按天绘制路线顺序连线） |

## `RouteResult`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `plan` | `RoutePlan \| null` | — | 是 | 规划结果（按天分组的路线视图；null 渲染空态） |
| `loading` | `boolean` | — | 是 | 规划计算中 |
| `enriching` | `boolean` | — | 是 | 实测驾车数据获取中（enrichDriving 进行时） |
| `hasRealDriving` | `boolean` | — | 否 | 是否已获取实测驾车数据（用于区分估算/实测标识） |
| `startPointName` | `string` | — | 否 | 起点名称（如"我的位置"），用于路线概览展示 |

## `StorePanel`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `stores` | `Store[]` | — | 是 | 门店列表（按城市分组展示，支持搜索过滤） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `add` | `无` | 点击「新增门店」 |
| `edit` | `store: Store` | 点击某门店的编辑 |
| `remove` | `id: string` | 删除单个门店：[门店 id] |
| `toggle-skip` | `id: string` | 切换单个门店跳过态：[门店 id] |
| `skip-city` | `city: string` | 跳过/取消跳过整个城市 |
| `remove-city` | `city: string` | 删除整个城市的所有门店 |

## `StoreFormModal`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `visible` | `boolean` | — | 是 | 显隐 |
| `store` | `Store \| null` | — | 否 | 编辑目标（null = 新增模式） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `close` | `无` | 关闭弹窗（取消/Esc） |
| `save` | `store: Store` | 保存：[完整门店数据]（宿主负责落库） |

## `ImportProgress`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `current` | `number` | — | 是 | 已完成条数 |
| `total` | `number` | — | 是 | 总条数 |
| `label` | `string` | — | 否 | 进度说明文字（空串用内置 i18n） |

