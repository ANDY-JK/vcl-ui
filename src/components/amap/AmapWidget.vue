<script setup lang="ts" generic="T extends Record<string, any> = Record<string, any>">
/**
 * AmapWidget.vue — 通用高德地图组件
 *
 * 封装 @vuemap/vue-amap 的初始化、Key 管理、标记管理、信息窗等通用功能。
 * 业务侧只需传入 markers / center / zoom，无需重复处理 initAMapApiLoader / securityConfig。
 *
 * 功能：
 *   - 自动从统一 Key 管理读取 JS API Key + Security Code
 *   - 自动初始化 initAMapApiLoader
 *   - 支持 v-model:center / v-model:zoom 双向绑定
 *   - markers 数组驱动标记渲染（自动增删）
 *   - 点击标记 emit marker-click 事件
 *   - 点击地图 emit map-click 事件
 *   - 支持插件加载（ToolBar / Scale 等）
 */
import { ref, watch, nextTick } from 'vue'
import { ElAmap, initAMapApiLoader } from '@vuemap/vue-amap'
import '@vuemap/vue-amap/dist/style.css'
import { getAmapJsKey, getAmapSecurityCode } from './amap-key'

// ════════════════════════════════════════
// Props & Emits
// ════════════════════════════════════════

interface MarkerItem {
  /** 经度 */
  longitude: number
  /** 纬度 */
  latitude: number
  /** 标记标题 */
  title?: string
  /** 标记颜色：red / blue / green（默认 blue） */
  color?: 'red' | 'blue' | 'green'
  /** 自定义图标 URL */
  iconUrl?: string
  /** 标记大小 [width, height] */
  iconSize?: [number, number]
  /** 弹出信息窗内容（HTML 字符串） */
  infoWindow?: string
  /** 自定义数据（emit 时回传） */
  data?: T
}

const props = withDefaults(
  defineProps<{
    /** 地图中心 [lng, lat] */
    center?: [number, number]
    /** 缩放级别 */
    zoom?: number
    /** 标记列表 */
    markers?: MarkerItem[]
    /** 是否显示工具条 */
    showToolBar?: boolean
    /** 是否显示比例尺 */
    showScale?: boolean
    /** 地图样式 ID */
    mapStyle?: string
    /** 自定义类名 */
    customClass?: string
  }>(),
  {
    center: () => [116.397428, 39.90923],
    zoom: 13,
    markers: () => [],
    showToolBar: true,
    showScale: true,
    mapStyle: '',
    customClass: '',
  },
)

const emit = defineEmits<{
  'marker-click': [marker: MarkerItem, index: number]
  'map-click': [lng: number, lat: number]
  ready: [map: any]
}>()

// ════════════════════════════════════════
// 地图初始化
// ════════════════════════════════════════

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

const mapReady = ref(false)
let mapInstance: any = null

/** 颜色映射到图标 URL */
const ICON_MAP: Record<string, string> = {
  red: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png',
  blue: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png',
  green: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_g.png',
}

/** 标记实例列表 */
let markerInstances: any[] = []
let infoWindow: any = null

function onMapInit(map: any) {
  mapInstance = map
  mapReady.value = true

  const plugins: string[] = []
  if (props.showToolBar) plugins.push('AMap.ToolBar')
  if (props.showScale) plugins.push('AMap.Scale')

  if (plugins.length > 0) {
    mapInstance.plugin(plugins, () => {
      const AMapNS = AMap as unknown as Record<string, unknown>
      if (props.showToolBar) {
        mapInstance.addControl(new (AMapNS.ToolBar as new () => any)())
      }
      if (props.showScale) {
        mapInstance.addControl(new (AMapNS.Scale as new () => any)())
      }
    })
  }

  const AMapNS = AMap as unknown as Record<string, unknown>
  infoWindow = new (AMapNS.InfoWindow as new (opts: any) => any)({
    isCustom: true,
    offset: new (AMapNS.Pixel as new (x: number, y: number) => any)(0, -35),
  })

  mapInstance.on('click', (e: any) => {
    if (e.lnglat) {
      emit('map-click', e.lnglat.getLng(), e.lnglat.getLat())
    }
  })

  renderMarkers()
  emit('ready', mapInstance)
}

// ════════════════════════════════════════
// 标记管理
// ════════════════════════════════════════

function clearMarkers() {
  markerInstances.forEach((m) => {
    try {
      mapInstance?.remove(m)
    } catch {
      /* ignore */
    }
  })
  markerInstances = []
}

function renderMarkers() {
  if (!mapInstance || !mapReady.value) return
  clearMarkers()

  const AMapNS = AMap as unknown as Record<string, unknown>

  props.markers.forEach((item, idx) => {
    const iconUrl = item.iconUrl || ICON_MAP[item.color || 'blue']
    const iconSize = item.iconSize || [24, 24]

    const marker = new (AMapNS.Marker as new (opts: any) => any)({
      position: [item.longitude, item.latitude],
      title: item.title || '',
      zIndex: 90,
      icon: new (AMapNS.Icon as new (opts: any) => any)({
        size: iconSize,
        image: iconUrl,
        imageSize: iconSize,
      }),
    })

    marker.on('click', () => {
      if (item.infoWindow) {
        infoWindow?.setContent(item.infoWindow)
        infoWindow?.open(mapInstance, marker.getPosition())
      }
      emit('marker-click', item, idx)
    })

    mapInstance.add(marker)
    markerInstances.push(marker)
  })
}

watch(
  () => props.markers,
  () => {
    nextTick(renderMarkers)
  },
  { deep: true },
)

watch(
  () => props.center,
  (newCenter) => {
    if (mapInstance && newCenter) {
      mapInstance.setCenter(newCenter)
    }
  },
)

watch(
  () => props.zoom,
  (newZoom) => {
    if (mapInstance && newZoom) {
      mapInstance.setZoom(newZoom)
    }
  },
)

defineExpose({
  getMap: () => mapInstance,
  setZoomAndCenter: (zoom: number, center: [number, number]) => {
    mapInstance?.setZoomAndCenter(zoom, center)
  },
  clearMarkers,
  renderMarkers,
  openInfoWindow: (content: string, position: [number, number]) => {
    infoWindow?.setContent(content)
    infoWindow?.open(mapInstance, position)
  },
  closeInfoWindow: () => {
    infoWindow?.close()
  },
})
</script>

<template>
  <div
    class="amap-widget"
    :class="customClass"
    style="width: 100%; height: 100%; min-height: 300px; position: relative"
  >
    <ElAmap :center="center" :zoom="zoom" :map-style="mapStyle" @init="onMapInit" />
  </div>
</template>

<style scoped>
.amap-widget {
  border-radius: var(--radius-md, var(--radius-md));
  overflow: hidden;
}
</style>
