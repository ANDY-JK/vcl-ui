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
| `stores` | `Store[]` | — | 是 | — |
| `plan` | `RoutePlan \| null` | — | 是 | — |

## `RouteResult`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `plan` | `RoutePlan \| null` | — | 是 | — |
| `loading` | `boolean` | — | 是 | — |
| `enriching` | `boolean` | — | 是 | — |
| `hasRealDriving` | `boolean` | — | 否 | 是否已获取实测驾车数据（用于区分估算/实测标识） |
| `startPointName` | `string` | — | 否 | 起点名称（如"我的位置"），用于路线概览展示 |

## `StorePanel`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `stores` | `Store[]` | — | 是 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `add` | `无` | — |
| `edit` | `store: Store` | — |
| `remove` | `id: string` | — |
| `toggleSkip` | `id: string` | — |
| `skipCity` | `city: string` | — |
| `removeCity` | `city: string` | — |

## `StoreFormModal`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `visible` | `boolean` | — | 是 | — |
| `store` | `Store \| null` | — | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `close` | `无` | — |
| `save` | `store: Store` | — |

## `ImportProgress`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/route-planner`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `current` | `number` | — | 是 | — |
| `total` | `number` | — | 是 | — |
| `label` | `string` | — | 否 | — |

