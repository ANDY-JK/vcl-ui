<script setup lang="ts">
import { ref, type ComponentPublicInstance } from 'vue'
import AmapWidget from '@/components/amap/AmapWidget.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
import { getAmapJsKey } from '@/components'
import type { MarkerItem } from '@/components'

const AMAP_KEY = getAmapJsKey()

const BEIJING: [number, number] = [116.397428, 39.90923]
const GUOMAO: [number, number] = [116.4585, 39.9087]

/** 三个颜色挡位 + 信息窗内容，覆盖 MarkerItem 的主要字段 */
const markers = ref<MarkerItem[]>([
  { longitude: 116.397, latitude: 39.909, title: '王府井', color: 'red', infoWindow: '<b>王府井</b><br/>红色标记 · 地图默认中心' },
  { longitude: 116.406, latitude: 39.915, title: '东四', color: 'blue', infoWindow: '<b>东四</b><br/>蓝色标记（缺省色）' },
  { longitude: 116.388, latitude: 39.903, title: '前门', color: 'green', infoWindow: '<b>前门</b><br/>绿色标记' },
])

/** AmapWidget 是泛型组件（generic="T"），InstanceType<typeof AmapWidget> 对它不成立，只能按 expose 形状取用 */
interface AmapWidgetHandle {
  getMap: () => { getZoom?: () => number } | null
  setZoomAndCenter: (zoom: number, center: [number, number]) => void
  clearMarkers: () => void
  renderMarkers: () => void
  openInfoWindow: (content: string, position: [number, number]) => void
  closeInfoWindow: () => void
}
const widgetRef = ref<ComponentPublicInstance | null>(null)
const widget = () => widgetRef.value as unknown as AmapWidgetHandle | null
const ready = ref(false)
const lastMarker = ref('（还没点过标记）')
const lastMapClick = ref('（还没点过地图）')
const status = ref('未调用')

function onReady() {
  ready.value = true
}

function onMarkerClick(marker: MarkerItem, index: number) {
  lastMarker.value = `第 ${index + 1} 个：${marker.title ?? '无标题'}（${marker.longitude}, ${marker.latitude}）`
}

function onMapClick(lng: number, lat: number) {
  lastMapClick.value = `经 ${lng.toFixed(6)} / 纬 ${lat.toFixed(6)}`
}

/* ===== defineExpose 的六个方法逐个点到 ===== */
function doSetCenter() {
  widget()?.setZoomAndCenter(15, GUOMAO)
  status.value = 'setZoomAndCenter(15, 国贸)'
}
function doClear() {
  widget()?.clearMarkers()
  status.value = 'clearMarkers() —— 标记已清空，点「重新渲染」画回来'
}
function doRender() {
  widget()?.renderMarkers()
  status.value = 'renderMarkers() —— 按 markers 重画'
}
function doOpenInfo() {
  const m = markers.value[0]
  widget()?.openInfoWindow(m.infoWindow ?? '', [m.longitude, m.latitude])
  status.value = `openInfoWindow(${m.title})`
}
function doCloseInfo() {
  widget()?.closeInfoWindow()
  status.value = 'closeInfoWindow()'
}
function doPeek() {
  const map = widget()?.getMap()
  status.value = map ? `getMap() → 实例存在，当前 zoom=${map.getZoom?.() ?? '?'}` : 'getMap() → null（地图还没初始化）'
}
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">AmapWidget 地图组件</h2>
    <p class="demo-desc">
      库自带的高德地图封装（挂 <code>ElAmap</code> 之上）：传 <code>markers</code> 自动画点、点标记弹信息窗、
      <code>marker-click</code> / <code>map-click</code> / <code>ready</code> 三个事件，外加
      <code>defineExpose</code> 的 6 个方法。
    </p>

    <p v-if="!AMAP_KEY" class="demo-desc">
      ⚠ 当前环境没配 <code>VITE_AMAP_KEY</code>，地图不会出图 —— 下面的事件区与按钮仍可验证接口是否接得上。
    </p>

    <Card title="标记 + 信息窗 + 事件" style="margin-bottom: 20px">
      <div class="amap-host">
        <AmapWidget
          ref="widgetRef"
          :center="BEIJING"
          :zoom="13"
          :markers="markers"
          :show-tool-bar="true"
          :show-scale="true"
          @ready="onReady"
          @marker-click="onMarkerClick"
          @map-click="onMapClick"
        />
      </div>
      <div class="echo">
        <span>初始化：<strong>{{ ready ? 'ready 已触发' : '等待中' }}</strong></span>
        <span>marker-click：<strong>{{ lastMarker }}</strong></span>
        <span>map-click：<strong>{{ lastMapClick }}</strong></span>
      </div>
    </Card>

    <Card title="defineExpose 的六个方法">
      <div class="btn-row">
        <Button text="setZoomAndCenter → 国贸" variant="primary" size="sm" @click="doSetCenter" />
        <Button text="clearMarkers" variant="outline" size="sm" @click="doClear" />
        <Button text="renderMarkers" variant="outline" size="sm" @click="doRender" />
        <Button text="openInfoWindow（第一个点）" variant="secondary" size="sm" @click="doOpenInfo" />
        <Button text="closeInfoWindow" variant="secondary" size="sm" @click="doCloseInfo" />
        <Button text="getMap" variant="ghost" size="sm" @click="doPeek" />
      </div>
      <p class="echo echo-one">最近调用：<strong>{{ status }}</strong></p>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.demo-desc {
  color: var(--color-text-muted);
  margin-bottom: 24px;
  font-size: 14px;
}
.amap-host {
  height: clamp(280px, 45vh, 460px);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.echo {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.echo-one {
  margin: 12px 0 0;
}
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
