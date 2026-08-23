<script setup lang="ts">
/**
 * 路线地图 — 高德地图展示门店标记 + 分天路线 + 起点
 * 动态居中，支持信息窗
 */
import { ref, computed, watch, nextTick } from 'vue'
import { ElAmap, initAMapApiLoader } from '@vuemap/vue-amap'
import '@vuemap/vue-amap/dist/style.css'
import type { Store, RoutePlan } from '@/components/route-planner/types'
import { getAmapJsKey, getAmapSecurityCode } from '@/components/amap/amap-key'

const props = defineProps<{
  stores: Store[]
  plan: RoutePlan | null
}>()

let mapInstance: any = null
const mapReady = ref(false)

// 安全配置 + 初始化
const AMAP_KEY = getAmapJsKey()
const AMAP_SECRET = getAmapSecurityCode()
if (typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>)._AMapSecurityConfig = {
    securityJsCode: AMAP_SECRET,
  }
}
initAMapApiLoader({
  key: AMAP_KEY,
  version: '2.0',
  plugins: ['AMap.ToolBar', 'AMap.Scale'],
})

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

function onMapInit(map: any): void {
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
const allMarkers: any[] = []

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
      title: '起点/终点',
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
        // 点击弹出信息窗
        marker.on('click', () => {
          const infoWin = new AMap.InfoWindow({
            content: `<div style="padding:4px 2px;font-size:12px;line-height:1.6">
              <strong>${store.name}</strong><br/>
              📍 ${store.address || store.city || ''}<br/>
              📅 第 ${day.day} 天 · 第 ${day.stores.indexOf(store) + 1} 家
            </div>`,
            offset: new AMap.Pixel(0, -28),
          })
          infoWin.open(mapInstance, pos)
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
          content: `<div style="padding:4px 2px;font-size:12px;line-height:1.6">
            <strong>${store.name}</strong><br/>
            📍 ${store.address || ''}<br/>
            🏙️ ${store.city || ''} ${store.district || ''}
          </div>`,
          offset: new AMap.Pixel(0, -28),
        })
        infoWin.open(mapInstance, pos)
      })
      mapInstance.add(marker)
      allMarkers.push(marker)
    }
  }

  // 自适应视野
  mapInstance.setFitView(null, false, [60, 60, 60, 60])
}

let renderTimer: ReturnType<typeof setTimeout> | null = null

// 浅监听 + 防抖：避免 enrichDriving 每次更新都重绘地图导致闪烁
watch(
  () => props.plan,
  () => {
    if (renderTimer) clearTimeout(renderTimer)
    renderTimer = setTimeout(() => {
      nextTick(renderAll)
    }, 600)
  },
)

// stores 变化也触发重绘
watch(
  () => props.stores,
  () => {
    nextTick(renderAll)
  },
)

/** 是否有数据可显示 */
const hasContent = computed(() => props.stores.length > 0 || (props.plan && props.plan.days.length > 0))
</script>

<template>
  <div class="route-map">
    <div class="map-container">
      <ElAmap :center="mapCenter" :zoom="8" @init="onMapInit" />
    </div>
    <div v-if="!mapReady" class="map-loading">
      <div class="spinner" />
      <p>地图加载中...</p>
    </div>
    <!-- 空数据引导 -->
    <div v-if="mapReady && !hasContent" class="map-empty-guide">
      <p>📍 暂无门店数据</p>
      <p class="guide-hint">导入 Excel 或添加门店后，地图将自动显示标记</p>
    </div>
    <!-- 天颜色图例 -->
    <div v-if="plan && plan.days.length > 0" class="map-legend">
      <div v-for="day in plan.days" :key="day.day" class="legend-item">
        <span class="legend-color" :style="{ background: getDayColor(day.day) }" />
        <span class="legend-text">第{{ day.day }}天</span>
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
  background: rgba(255, 255, 255, 0.95);
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
