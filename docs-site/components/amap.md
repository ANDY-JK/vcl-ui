# 地图（amap）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 |
| --- | --- | --- |
| `AmapWidget` | 7 | 3 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `setAmapKey` | 统一设置高德 Key（JS API 和 REST 共用，保留已设置的 securityCode） |
| `setAmapKeys` | 分别设置高德 Key（JS API 和 REST 可不同） |
| `getAmapJsKey` | 获取 JS API Key（前端地图 SDK 用） |
| `getAmapRestKey` | 获取 REST API Key（驾车路线、地理编码等服务端接口用） |
| `getAmapSecurityCode` | 获取 JS API Security Code |
| `isValidLatLon` | 验证经纬度是否合法。(0,0) 视为无效——它是占位/解析失败的典型值，不是真实门店坐标 |
| `normalizeChinaLatLon` | 归一化中国范围经纬度：自动纠正经纬度互换（如录入时经度纬度写反）。 |
| `calcDistance` | 球面余弦定理距离计算（纯函数，不调用 API） |
| `keywordSearch` | 高德 POI 关键词搜索，返回第一条结果的经纬度 |
| `searchNearby` | 周边搜索：合并前两页，指定 types 时补无 types 的剩余 POI |
| `fetchPoiDetail` | 根据 POI ID 获取详情（含照片） |
| `batchFetchPoiPhotos` | 批量获取 POI 照片 |
| `getDrivingRoute` | 获取驾车路线（支持多途经点） |
| `geocodeCalc` | 执行高德搜索 + 距离计算（重试策略） |
| `detectPlatform` | 检测当前平台 |
| `buildNavLink` | 生成单段导航链接（A → B，可选途经点） |

---

## `AmapWidget`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `center` | `[number, number]` | `() => [116.397428, 39.90923]` | 否 | 地图中心 [lng, lat] |
| `zoom` | `number` | `13` | 否 | 缩放级别 |
| `markers` | `MarkerItem<T>[]` | `() => []` | 否 | 标记列表 |
| `showToolBar` | `boolean` | `true` | 否 | 是否显示工具条 |
| `showScale` | `boolean` | `true` | 否 | 是否显示比例尺 |
| `mapStyle` | `string` | `''` | 否 | 地图样式 ID |
| `customClass` | `string` | `''` | 否 | 自定义类名 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'marker-click'` | `marker: MarkerItem<T>, index: number` | — |
| `'map-click'` | `lng: number, lat: number` | — |
| `ready` | `map: AmapMapInstance` | — |

