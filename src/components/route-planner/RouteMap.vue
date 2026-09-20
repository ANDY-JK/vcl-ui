<script setup lang="ts">
/**
 * 路线地图 — 高德地图展示门店标记 + 分天路线 + 起点
 * 动态居中，支持信息窗
 */
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue'
import { ElAmap } from '@vuemap/vue-amap'
import '@vuemap/vue-amap/dist/style.css'
import type { Store, RoutePlan } from '@/components/route-planner/types'
import { getAmapJsKey, getAmapSecurityCode } from '@/components/amap'
import { amapLoader } from '@/components/amap/amap-loader'
import { useT } from '@/components/_internal/i18n'
import { sanitizeHTML } from '@/components/_internal/sanitize'
import type { AmapMapInstance } from '@/components/amap/types'

/** 规划结果连发时合并渲染的防抖 */
const _RENDER_DEBOUNCE_MS = 600
/** 地图迟迟不 ready 就判失败并给重试入口（spinner 永远转圈不如失败态） */
const _MAP_READY_TIMEOUT_MS = 15000

const t = useT()

const props = defineProps<{
  stores: Store[]
  plan: RoutePlan | null
}>()

let mapInstance: AmapMapInstance | null = null
const mapReady = ref(false)

// 安全配置 + 初始化（setup 内执行，非模块加载时；用协调器避免 key 锁死）
const AMAP_SECRET = getAmapSecurityCode()
if (typeof window !== 'undefined') {
  const w = window as unknown as Record<string, unknown>
  // 判空 + 不覆盖宿主已有配置：写入空 securityJsCode 会让高德以"未配置安全密钥"失败且难排查
  // （与 AmapWidget 同一口径；混用两组件时后挂载的不得抹掉先写入的有效值）
  if (AMAP_SECRET && !w._AMapSecurityConfig) {
    w._AMapSecurityConfig = { securityJsCode: AMAP_SECRET }
  }
}
// SSR 守卫：ensureInit 内部会注入 <script> 操作 document，服务端渲染直接跳过
if (typeof window !== 'undefined') {
  amapLoader.ensureInit(getAmapJsKey())
}

/** 动态地图中心 */
const mapCenter = computed((): [number, number] => {
  // 有路线时用起点
  if (props.plan?.startPoint) {
    return [props.plan.startPoint.lon, props.plan.startPoint.lat]
  }
  // 有门店时用门店的几何中心
  const validStores = props.stores.filter((s) => s.longitude && s.latitude)
  if (validStores.length > 0) {
    const avgLon = validStores.reduce((s, st) => s + st.longitude!, 0) / validStores.length
    const avgLat = validStores.reduce((s, st) => s + st.latitude!, 0) / validStores.length
    return [avgLon, avgLat]
  }
  // 默认
  return [112.9388, 28.2282]
})

function onMapInit(map: AmapMapInstance): void {
  mapInstance = map
  mapReady.value = true
  renderAll()
}

/** 每天的颜色 */
const dayColors = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#6366f1',
  '#14b8a6',
  '#e11d48',
  '#7c3aed',
  '#0891b2',
]
function getDayColor(day: number): string {
  return dayColors[(day - 1) % dayColors.length]
}

/** 所有标记（用于信息窗管理） */
const allMarkers: unknown[] = []

/** 渲染所有标记和路线 */
function renderAll(): void {
  if (!mapInstance || !mapReady.value) return

  mapInstance.clearMap()
  allMarkers.length = 0

  // 渲染起点标记
  if (props.plan?.startPoint) {
    const sp = props.plan.startPoint
    const startMarker = new AMap.Marker({
      position: [sp.lon, sp.lat],
      title: t('routePlanner.startEnd'),
      icon: new AMap.Icon({
        size: new AMap.Size(30, 30),
        image: 'https://webapi.amap.com/theme/v1.3/markers/n/start.png',
        imageSize: new AMap.Size(30, 30),
      }),
      offset: new AMap.Pixel(-15, -15),
    })
    mapInstance.add(startMarker)
  }

  // 按天渲染门店标记和路线
  if (props.plan) {
    for (const day of props.plan.days) {
      const color = getDayColor(day.day)

      // 渲染当天门店标记
      for (const store of day.stores) {
        if (store.longitude == null || store.latitude == null) continue
        const pos: [number, number] = [store.longitude, store.latitude]

        const marker = new AMap.Marker({
          position: pos,
          title: store.name,
        })
        // 点击弹出信息窗（门店名/地址来自 Excel 导入等外部输入，必须消毒防 XSS）
        marker.on('click', () => {
          const infoWin = new AMap.InfoWindow({
            content: sanitizeHTML(`<div style="padding:4px 2px;font-size:12px;line-height:1.6">
              <strong>${store.name}</strong><br/>
              📍 ${store.address || store.city || ''}<br/>
              📅 ${t('routePlanner.mapInfoWindow', { day: day.day, idx: day.stores.indexOf(store) + 1 })}
            </div>`),
            offset: new AMap.Pixel(0, -28),
          })
          // 高德全局 AMap.InfoWindow.open 期望 vuemap 封装的 Map 完整类型，
          // 而 mapInstance 是本域最小接口（AmapMapInstance）——同一运行时对象的两套
          // 声明，此处断言对齐（SDK 边界，已在 amap/types.ts 登记）
          if (mapInstance) infoWin.open(mapInstance as never, pos)
        })
        mapInstance.add(marker)
        allMarkers.push(marker)
      }

      // 渲染当天路线
      if (day.routePolyline && day.routePolyline.length > 1) {
        const polyline = new AMap.Polyline({
          path: day.routePolyline,
          strokeColor: color,
          strokeWeight: 4,
          strokeOpacity: 0.8,
        })
        mapInstance.add(polyline)
      }
    }
  } else {
    // 无计划时只渲染所有门店
    const validStores = props.stores.filter((s) => s.longitude && s.latitude)
    for (const store of validStores) {
      const pos: [number, number] = [store.longitude!, store.latitude!]
      const marker = new AMap.Marker({
        position: pos,
        title: store.name,
      })
      marker.on('click', () => {
        const infoWin = new AMap.InfoWindow({
          content: sanitizeHTML(`<div style="padding:4px 2px;font-size:12px;line-height:1.6">
            <strong>${store.name}</strong><br/>
            📍 ${store.address || ''}<br/>
            🏙️ ${store.city || ''} ${store.district || ''}
          </div>`),
          offset: new AMap.Pixel(0, -28),
        })
        // 同上：同一运行时对象的两套类型声明（SDK 边界，见 amap/types.ts）
        if (mapInstance) infoWin.open(mapInstance as never, pos)
      })
      mapInstance.add(marker)
      allMarkers.push(marker)
    }
  }

  // 自适应视野
  mapInstance.setFitView(null, false, [60, 60, 60, 60])
}

let renderTimer: ReturnType<typeof setTimeout> | null = null

// 上游数据链（enrichDriving / useStoreData）是「原地修改」不改引用：plan.days[i].routePolyline
// 回填、addStore push、toggleSkip 字段翻转全都不会让 watch 源触发。
// 必须 deep 监听 — 否则实测驾车路线/门店增删在地图上静默不同步。
// 配合 600ms 防抖：深层编辑（如门店改名）触发重绘有防抖兜底，不闪烁。
watch(
  () => props.plan,
  () => {
    if (renderTimer) clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      nextTick(renderAll)
    }, _RENDER_DEBOUNCE_MS)
  },
  { deep: true },
)

// stores 变化也触发重绘（deep：addStore/importStores 是 push 原地变更）
watch(
  () => props.stores,
  () => {
    nextTick(renderAll)
  },
  { deep: true },
)

// 卸载时清掉 pending 的防抖回调，避免操作已销毁的地图实例
onUnmounted(() => {
  if (renderTimer) clearTimeout(renderTimer)
})

/** 是否有数据可显示 */
const hasContent = computed(() => props.stores.length > 0 || (props.plan && props.plan.days.length > 0))

// 初始化失败判定：SDK 15s 未就绪视为失败（网络断/key 无效/安全密钥错误都会卡在这里），
// spinner 永远转圈不如给出失败态 + 重试
const _mapFailed = ref(false)
let _readyTimer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  _readyTimer = setTimeout(() => {
    if (!mapReady.value) _mapFailed.value = true
  }, _MAP_READY_TIMEOUT_MS)
})
onUnmounted(() => {
  if (_readyTimer) clearTimeout(_readyTimer)
})
function retryMap(): void {
  _mapFailed.value = false
  if (_readyTimer) clearTimeout(_readyTimer)
  _readyTimer = setTimeout(() => {
    if (!mapReady.value) _mapFailed.value = true
  }, _MAP_READY_TIMEOUT_MS)
  amapLoader.ensureInit(getAmapJsKey())
}
</script>

<template>
  <div class="route-map">
    <div class="map-container">
      <ElAmap :center="mapCenter" :zoom="8" @init="onMapInit" />
    </div>
    <div v-if="!mapReady && !_mapFailed" class="map-loading">
      <div class="spinner" />
      <p>{{ t('routePlanner.mapLoading') }}</p>
    </div>
    <!-- 加载失败态：网络断/key 无效/安全密钥错误，15s 未就绪判定；给重试入口而非永远转圈 -->
    <div v-if="!mapReady && _mapFailed" class="map-loading map-failed">
      <p>{{ t('routePlanner.mapLoadFail') }}</p>
      <button type="button" class="map-retry-btn" @click="retryMap">{{ t('common.retry') }}</button>
    </div>
    <!-- 空数据引导 -->
    <div v-if="mapReady && !hasContent" class="map-empty-guide">
      <p>{{ t('routePlanner.mapEmpty') }}</p>
      <p class="guide-hint">{{ t('routePlanner.mapGuide') }}</p>
    </div>
    <!-- 天颜色图例 -->
    <div v-if="plan && plan.days.length > 0" class="map-legend">
      <div v-for="day in plan.days" :key="day.day" class="legend-item">
        <span class="legend-color" :style="{ background: getDayColor(day.day) }" />
        <span class="legend-text">{{ t('routePlanner.dayLegend', { day: day.day }) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.route-map {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  width: 100%;
  height: 100%;
}

.map-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  color: var(--color-text-muted);
  font-size: clamp(13px, 1.8vw, 15px);
}

.spinner {
  width: clamp(24px, 3vw, 28px);
  height: clamp(24px, 3vw, 28px);
  border: 3px solid var(--color-border-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: var(--space-2);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 失败态 + 重试按钮 */
.map-failed {
  gap: var(--space-2);
}
.map-retry-btn {
  padding: var(--space-1) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-primary);
  font-size: clamp(12px, 1.6vw, 14px);
  cursor: pointer;
}
.map-retry-btn:hover {
  border-color: var(--color-primary);
}

/* 空数据引导 */
.map-empty-guide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(248, 250, 252, 0.9);
  color: var(--color-text-muted);
  font-size: clamp(14px, 1.8vw, 15px);
  z-index: 2;
  pointer-events: none;
}

.guide-hint {
  font-size: clamp(12px, 1.8vw, 15px);
  margin-top: var(--space-1);
}

/* 图例 */
.map-legend {
  position: absolute;
  bottom: var(--space-3);
  left: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-2);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1) var(--space-2);
  max-width: clamp(180px, 22vw, 220px);
  box-shadow: var(--shadow-sm);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.legend-color {
  width: clamp(8px, 1.2vw, 10px);
  height: clamp(8px, 1.2vw, 10px);
  border-radius: var(--radius-sm);
}

.legend-text {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-secondary);
}
</style>
