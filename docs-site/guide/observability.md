---
title: 可观测信号清单（自动生成）
---

# 可观测信号清单

> ⚠️ **本页由 `npm run gen:facts` 从源码生成，请勿手改。** 漂移会被 `check:facts` 拦下。

宿主把库内的警告/错误/事件接进自己的监控（埋点、Sentry、告警平台）只需两步：

```ts
import { setRuntimeObserver } from 'vcl-ui/_internal/runtime-observer'

setRuntimeObserver({
  event: (e) => {
    // e.code 是稳定事件码，按它建告警规则；不要用 message（可能本地化）
    myTelemetry.track(e.code, { level: e.level, ...e.context })
  },
  warn: (...args) => myLogger.warn(...args),
  error: (...args) => myLogger.error(...args),
})
```

## 路由规则（只投一次，不重复上报）

1. 宿主实现了 `event` → **只投** `event`（结构化管道，宿主自己决定要不要再落文本日志）
2. 否则退到 `warn` / `error`（只接了文本管道的宿主也能收到，不丢信息）
3. 再退到 `console`（未注入 observer 时行为与迁移前逐字一致）

**宿主管道抛异常不会打断组件数据流**：报一次并降级 console（故障可见，不静默吞）。

## 事件码清单

共 **15** 个事件码（error 4 / warn 11 / info 0）。

| 事件码 | 级别 | 触发场景 | context 字段 | 代码位置 |
| --- | --- | --- | --- | --- |
| `amap/js-key-missing` | error | [amap] 未设置高德 JS API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY | — | `src/components/amap/amap-key.ts:85` |
| `amap/key-swapped-after-init` | warn | [amap] 高德地图已用旧 Key 初始化，新 Key 需刷新页面才能生效（JS SDK 无法热换） | — | `src/components/amap/amap-loader.ts:70` |
| `amap/keyword-search-failed` | warn | [amap] 关键词搜索失败: | `{ keywords` | `src/components/amap/amap-service.ts:199` |
| `amap/nearby-search-failed` | warn | [amap] 周边搜索失败 | — | `src/components/amap/amap-service.ts:263` |
| `amap/rest-key-missing` | error | [amap] 未设置高德 REST API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY | — | `src/components/amap/amap-key.ts:95` |
| `chart/init-failed` | error | [BaseChart] ECharts 初始化失败: | `{ error: String(e) }` | `src/components/chart/BaseChart.vue:212` |
| `chart/set-option-failed` | error | [BaseChart] setOption 失败: | `{ error: String(e) }` | `src/components/chart/BaseChart.vue:236` |
| `form-builder/geocode-failed` | warn | [map-picker] 反向地理编码失败，已忽略（坐标不受影响）: | `{ error: String(err) }` | `src/components/form-builder/renderer/RendererMapPicker.vue:91` |
| `form-builder/share-invalid` | warn | 分享码无效或已损坏 | `{` | `src/components/form-builder/FormShareView.vue:117` |
| `form-builder/share-signature-invalid` | warn | 分享码签名校验未通过，已拒绝渲染 | `{` | `src/components/form-builder/FormShareView.vue:107` |
| `storage/clear-failed` | warn | [contract-storage] IndexedDB 清空失败: | `{ error: String(e) }` | `src/components/storage/contract-storage.ts:159` |
| `storage/cloud-delete-failed` | warn | [contract-storage] 云端删除失败: | `{ name: obj.name` | `src/components/storage/contract-storage.ts:382` |
| `storage/load-failed` | warn | [contract-storage] IndexedDB 加载失败: | `{ error: String(e) }` | `src/components/storage/contract-storage.ts:136` |
| `storage/reconcile-failed` | warn | [contract-storage] 云端对账失败，仅恢复本地: | `{ error: String(e) }` | `src/components/storage/contract-storage.ts:489` |
| `storage/save-failed` | warn | [contract-storage] IndexedDB 保存失败: | `{ appleId` | `src/components/storage/contract-storage.ts:151` |

## 该按哪些码建告警

**必须告警（error 级）**——用户直接看不到东西：

- `amap/js-key-missing` —— 未设置高德 JS API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY
- `amap/rest-key-missing` —— 未设置高德 REST API Key，请调用 setAmapKey() 或配置 VITE_AMAP_KEY
- `chart/init-failed` —— ECharts 初始化失败:
- `chart/set-option-failed` —— setOption 失败:

**建议聚合观察（warn 级）**——功能降级但仍可用，按小时聚合看趋势：

- `amap/key-swapped-after-init` —— 高德地图已用旧 Key 初始化，新 Key 需刷新页面才能生效（JS SDK 无法热换）
- `amap/keyword-search-failed` —— 关键词搜索失败:
- `amap/nearby-search-failed` —— 周边搜索失败
- `form-builder/geocode-failed` —— 反向地理编码失败，已忽略（坐标不受影响）:
- `form-builder/share-invalid` —— 分享码无效或已损坏
- `form-builder/share-signature-invalid` —— 分享码签名校验未通过，已拒绝渲染
- `storage/clear-failed` —— IndexedDB 清空失败:
- `storage/cloud-delete-failed` —— 云端删除失败:
- `storage/load-failed` —— IndexedDB 加载失败:
- `storage/reconcile-failed` —— 云端对账失败，仅恢复本地:
- `storage/save-failed` —— IndexedDB 保存失败:

## 边界（如实声明）

- 这里只列**结构化事件**。库内还有大量 `reportWarn` 自由文本（如墓碑清理、对象名校验），
  它们只能"存下来给人看"，**没有稳定码**，不适合建告警规则。
- 当前事件覆盖集中在 4 个域（amap / chart / form-builder / storage）；
  其余域的失败路径仍是自由文本。新增失败路径时优先用 `reportEvent`。
- 事件**不含任何用户数据字段值**（只带 key/id/错误串），避免把 PII 送进监控系统。
