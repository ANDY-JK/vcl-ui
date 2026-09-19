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
import { ElAmap } from '@vuemap/vue-amap'
import '@vuemap/vue-amap/dist/style.css'
import { getAmapJsKey, getAmapSecurityCode } from './amap-key'
import { amapLoader } from './amap-loader'
import { sanitizeHTML } from '@/components/_internal/sanitize'
import { useT } from '@/components/_internal/i18n'
import type { MarkerItem } from './types'

const t = useT()

// ════════════════════════════════════════
// Props & Emits
// ════════════════════════════════════════

const props = withDefaults(
  defineProps<{
    /** 地图中心 [lng, lat] */
    center?: [number, number]
    /** 缩放级别 */
    zoom?: number
    /** 标记列表 */
    markers?: MarkerItem<T>[]
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
  'marker-click': [marker: MarkerItem<T>, index: number]
  'map-click': [lng: number, lat: number]
  ready: [map: any]
}>()

// ════════════════════════════════════════
// 地图初始化（setup 内执行，非模块加载时）
// 用 amapLoader 协调器：首次渲染用当前 key 初始化；已初始化后 setAmapKey 无法热换（SDK 限制）
// ════════════════════════════════════════

// securityJsCode 仅开发期来自 .env（见 _internal/env-guard），生产由宿主运行时 setAmapKeys() 注入。
// 为空时不写全局配置：写入空串会让高德以"未配置安全密钥"失败，报错更难定位。
const AMAP_SECRET = getAmapSecurityCode()

if (typeof window !== 'undefined' && AMAP_SECRET) {
  ;(window as unknown as Record<string, unknown>)._AMapSecurityConfig = {
    securityJsCode: AMAP_SECRET,
  }
}

// 首次渲染时用当时的 key 初始化（模块级同步初始化已移除）
// SSR 守卫：ensureInit 内部会注入 <script> 操作 document，服务端渲染直接跳过，客户端挂载时重试
if (typeof window !== 'undefined') {
  amapLoader.ensureInit(getAmapJsKey())
}

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
        // 白名单消毒：infoWindow 为 HTML 字符串，可能含用户输入（店名/地址），剥离脚本/事件属性防 XSS
        infoWindow?.setContent(sanitizeHTML(item.infoWindow))
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
    infoWindow?.setContent(sanitizeHTML(content))
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
    role="region"
    :aria-label="t('amap.mapWithMarkers', { n: markers.length })"
  >
    <ElAmap :center="center" :zoom="zoom" :map-style="mapStyle" @init="onMapInit" />
  </div>
</template>

<style scoped>
.amap-widget {
  border-radius: var(--radius-md);
  overflow: hidden;
}
</style>
