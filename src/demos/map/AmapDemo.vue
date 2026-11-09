<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import {
  searchNearby,
  calcDistance,
  geocodeCalc,
  keywordSearch,
  isValidLatLon,
  Toast,
  fetchPoiDetail,
  batchFetchPoiPhotos,
  ImagePreview,
  getAmapJsKey,
  getAmapSecurityCode,
} from '@/components'
import ModalBox from '@/components/layout/ModalBox.vue'
import { mapMarkerIcon, MAP_MARKER_BLUE, MAP_MARKER_RED } from '@/components/_internal/map-marker'
import { ElAmap, initAMapApiLoader } from '@vuemap/vue-amap'
import '@vuemap/vue-amap/dist/style.css'
import type { PoiItem } from '@/components'

// 使用统一 Key 管理模块初始化高德 JS API
const AMAP_KEY = getAmapJsKey()
const AMAP_SECRET = getAmapSecurityCode()
if (AMAP_KEY) {
  if (AMAP_SECRET) {
    ;(window as unknown as Record<string, unknown>)._AMapSecurityConfig = { securityJsCode: AMAP_SECRET }
  }
  initAMapApiLoader({ key: AMAP_KEY, version: '2.0' })
}

const toastRef = ref<InstanceType<typeof Toast>>()
const t = (msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', dur = 3000) =>
  toastRef.value?.show(msg, type, dur)

// ==================== 状态 ====================
const name_ = ref('')
const addr_ = ref('')
const tLat_ = ref('')
const tLon_ = ref('')
const loading = ref(false)
const gps = ref<{ latitude: number; longitude: number } | null>(null)
const pois = ref<(PoiItem & { distanceM: number })[]>([])
const activeIdx = ref(-1)
const radius = ref(100)
const calcRes = ref<{ distance: number; amapLat: number; amapLon: number; exceeded: boolean } | null>(null)

// ==================== 详情面板 ====================
const detailPoi = ref<(PoiItem & { distanceM: number }) | null>(null)
const detailVisible = computed({
  get: () => detailPoi.value !== null,
  set: (v) => {
    if (!v) {
      detailPoi.value = null
      lightboxSrc.value = ''
    }
  },
})
const lightboxSrc = ref('')

// ==================== 地图 ====================
const mapCenter = ref<[number, number]>([116.397428, 39.90923])
let mapIns: AMap.Map | null = null
let originMarker: AMap.Marker | null = null
const poiMarkers: AMap.Marker[] = []
let infoWin: AMap.InfoWindow | null = null

function onMapInit(map: AMap.Map) {
  mapIns = map
  map.plugin(['AMap.ToolBar', 'AMap.Scale'], () => {
    map.addControl(new ((AMap as unknown as Record<string, unknown>).ToolBar as new () => AMap.ToolBar)())
    map.addControl(new ((AMap as unknown as Record<string, unknown>).Scale as new () => AMap.Scale)())
  })
  infoWin = new AMap.InfoWindow({ isCustom: true, offset: new AMap.Pixel(0, -35) })
}

function clearMarkers() {
  if (originMarker) {
    mapIns?.remove(originMarker)
    originMarker = null
  }
  poiMarkers.forEach((m) => mapIns?.remove(m))
  poiMarkers.length = 0
  activeIdx.value = -1
}

function highlightMarker(idx: number, on: boolean) {
  const m = poiMarkers[idx]
  if (!m) return
  try {
    if (on) {
      m.setIcon(
        new AMap.Icon({
          size: [28, 28],
          image: mapMarkerIcon(MAP_MARKER_RED),
          imageSize: [28, 28],
        }),
      )
    } else {
      m.setIcon(
        new AMap.Icon({
          size: [24, 24],
          image: mapMarkerIcon(MAP_MARKER_BLUE),
          imageSize: [24, 24],
        }),
      )
    }
  } catch {
    /* AMap 图标切换偶发异常，忽略 */
  }
  m.setzIndex(on ? 101 : 90)
}

function renderMap(center: { latitude: number; longitude: number }, list: (PoiItem & { distanceM: number })[]) {
  if (!mapIns) return
  const map = mapIns // 回调里窄化不传导,先取局部非空引用
  clearMarkers()
  mapCenter.value = [center.longitude, center.latitude]
  map.setZoomAndCenter(18, [center.longitude, center.latitude])
  // 原始位置红色大头针 — 使用 DOM API 构建避免 XSS
  const pinWrapper = document.createElement('div')
  pinWrapper.style.cssText = 'position:relative;width:25px;height:34px;'
  const pinSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  pinSvg.setAttribute('width', '25')
  pinSvg.setAttribute('height', '34')
  const pinPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  pinPath.setAttribute('d', 'M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 34 12.5 34S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z')
  pinPath.setAttribute('fill', '#dc2626')
  const pinCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  pinCircle.setAttribute('cx', '12.5')
  pinCircle.setAttribute('cy', '12.5')
  pinCircle.setAttribute('r', '5')
  pinCircle.setAttribute('fill', '#fff')
  pinSvg.appendChild(pinPath)
  pinSvg.appendChild(pinCircle)
  const pinLabel = document.createElement('span')
  pinLabel.style.cssText =
    'position:absolute;top:5px;left:0;width:25px;text-align:center;font-size:9px;font-weight:700;color:#dc2626;'
  pinLabel.textContent = '起'
  pinWrapper.appendChild(pinSvg)
  pinWrapper.appendChild(pinLabel)
  originMarker = new AMap.Marker({
    position: [center.longitude, center.latitude],
    content: pinWrapper,
    offset: new AMap.Pixel(-13, -34),
    zIndex: 100,
  })
  map.add(originMarker)
  // POI 标记
  list.forEach((p, i) => {
    const m = new AMap.Marker({
      position: [p.longitude, p.latitude],
      title: p.name,
      zIndex: 90,
      icon: new AMap.Icon({
        size: [24, 24],
        image: mapMarkerIcon(MAP_MARKER_BLUE),
        imageSize: [24, 24],
      }),
    })
    m.on('click', () => {
      // 同步卡片选中
      if (activeIdx.value >= 0) highlightMarker(activeIdx.value, false)
      activeIdx.value = i
      highlightMarker(i, true)
      // 使用 DOM API 构建 InfoWindow 内容，避免 XSS
      const iwRoot = document.createElement('div')
      iwRoot.style.cssText =
        'min-width:180px;padding:10px 12px;font-size:13px;line-height:1.6;background:var(--vcl-color-surface);border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.15);'
      const iwName = document.createElement('div')
      iwName.style.cssText = 'font-weight:700;font-size:14px;margin-bottom:4px;color:var(--vcl-color-text);'
      iwName.textContent = p.name
      const iwAddr = document.createElement('div')
      iwAddr.style.cssText = 'color:var(--vcl-color-text-muted);margin-bottom:4px;'
      iwAddr.textContent = '📍 ' + p.address
      const iwFooter = document.createElement('div')
      iwFooter.style.cssText =
        'display:flex;align-items:center;gap:8px;padding-top:4px;border-top:1px solid var(--vcl-color-border);'
      const iwDist = document.createElement('span')
      iwDist.style.cssText = 'font-weight:700;font-size:16px;color:var(--vcl-color-danger);'
      iwDist.textContent = fm(p.distanceM)
      const iwCoord = document.createElement('span')
      iwCoord.style.cssText = 'font-size:11px;color:var(--vcl-color-text-muted);font-family:monospace;'
      iwCoord.textContent = `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}`
      iwFooter.appendChild(iwDist)
      iwFooter.appendChild(iwCoord)
      iwRoot.appendChild(iwName)
      iwRoot.appendChild(iwAddr)
      iwRoot.appendChild(iwFooter)
      if (!infoWin || !map) return
      infoWin.setContent(iwRoot)
      // 类型定义把 position 收成 Vector2(运行时也接受 LngLat);标记本就钉在该坐标,直接用数组
      infoWin.open(map, [p.longitude, p.latitude])
    })
    map.add(m)
    poiMarkers.push(m)
  })
}

function focusPoi(idx: number) {
  if (!mapIns || !poiMarkers[idx]) return
  // 还原上一个高亮
  if (activeIdx.value >= 0) highlightMarker(activeIdx.value, false)
  activeIdx.value = idx
  highlightMarker(idx, true)
  const m = poiMarkers[idx]
  const pos = m.getPosition()
  if (pos) mapIns.setCenter(pos)
  m.emit('click')
}
function hoverPoi(idx: number, on: boolean) {
  if (idx === activeIdx.value) return // 已选中不动
  highlightMarker(idx, on)
}

// ==================== 搜索 ====================
async function doSearch() {
  const n = name_.value.trim(),
    a = addr_.value.trim()
  if (!n || !a) {
    t('请填写名称和地址', 'warning')
    return
  }
  loading.value = true
  gps.value = null
  pois.value = []
  calcRes.value = null
  try {
    // 定位 + 周边
    const { amapLat, amapLon } = await geocodeCalc({ address: a, storeName: n, targetLat: 0, targetLon: 0 })
    gps.value = { latitude: amapLat, longitude: amapLon }
    const list = await searchNearby(amapLat, amapLon, radius.value, '120000|141200|080000|150000|110000')
    pois.value = list.map((p) => ({ ...p, distanceM: calcDistance(amapLat, amapLon, p.latitude, p.longitude) }))
    // 搜索定位项：keywordSearch 名称+地址
    const { latitude: slat, longitude: slon } = await keywordSearch(`${n} ${a}`)
    if (slat !== null && slon !== null) {
      const dup = pois.value.findIndex(
        (p) => Math.abs(p.latitude - slat) < 0.0001 && Math.abs(p.longitude - slon) < 0.0001,
      )
      if (dup > 0) {
        const [m] = pois.value.splice(dup, 1)
        pois.value.unshift(m)
      } else if (dup === -1) {
        pois.value.unshift({
          name: n,
          address: a,
          latitude: slat,
          longitude: slon,
          distanceM: calcDistance(amapLat, amapLon, slat, slon),
        })
      }
    }
    // 关键词降级
    const kw = n.toLowerCase()
    const mi = pois.value.findIndex((p) => p.name.toLowerCase().includes(kw) || kw.includes(p.name.toLowerCase()))
    if (mi > 0) {
      const [m] = pois.value.splice(mi, 1)
      pois.value.unshift(m)
    }
    // 批量补门店照片
    const photoMap = await batchFetchPoiPhotos(pois.value, 20, amapLat, amapLon)
    if (photoMap.size > 0) {
      for (const p of pois.value) {
        if (p.id && photoMap.has(p.id)) {
          p.photos = photoMap.get(p.id)
        } else if (!p.id) {
          // 无 id 的 POI 用 name|lat|lon 合成 key 查找
          const key = `${p.name}|${p.latitude}|${p.longitude}`
          const photos = photoMap.get(key)
          if (photos) p.photos = photos
        }
      }
    }
    nextTick(() => renderMap({ latitude: amapLat, longitude: amapLon }, pois.value))
    t(`${radius.value}m 内 ${pois.value.length} 个 POI${photoMap.size ? `，${photoMap.size} 张照片` : ''}`, 'success')
  } catch (e: unknown) {
    t(e instanceof Error ? e.message : '失败', 'error')
  } finally {
    loading.value = false
  }
}

async function doCalc() {
  const n = name_.value.trim(),
    a = addr_.value.trim()
  const lat = parseFloat(tLat_.value),
    lon = parseFloat(tLon_.value)
  if (!n || !a) {
    t('请填写名称和地址', 'warning')
    return
  }
  if (isNaN(lat) || isNaN(lon) || !isValidLatLon(lat, lon)) {
    t('经纬度无效', 'error')
    return
  }
  try {
    calcRes.value = await geocodeCalc({ address: a, storeName: n, targetLat: lat, targetLon: lon })
    t('计算完成', 'success')
  } catch (e: unknown) {
    t(e instanceof Error ? e.message : '失败', 'error')
    calcRes.value = null
  }
}

function f(n: number) {
  return n.toFixed(6)
}
function fm(n: number) {
  return n < 1000 ? n.toFixed(0) + 'm' : (n / 1000).toFixed(2) + 'km'
}

/** 卡片图片：有门店照片则显示，无则透明占位（保留点击区域） */
function cardImg(p: PoiItem | (PoiItem & { distanceM: number })): string | undefined {
  if (p.photos && p.photos.length > 0) return p.photos[0].url
  return undefined
}

// ==================== 详情 / 灯箱 ====================
const detailLoading = ref(false)

async function openDetail(p: PoiItem & { distanceM: number }) {
  detailPoi.value = p
  // 如果当前POI没有照片但持有 id，尝试补获取详情
  if ((!p.photos || p.photos.length === 0) && p.id) {
    detailLoading.value = true
    const detail = await fetchPoiDetail(p.id)
    if (detail && detail.photos && detail.photos.length > 0) {
      detailPoi.value = { ...p, photos: detail.photos, type: detail.type || p.type }
    }
    detailLoading.value = false
  }
}
/** 图片加载失败 → 改为占位 */
function onImgFail(e: Event) {
  const el = e.target as HTMLImageElement
  if (el) el.style.display = 'none'
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">🗺️ 高德地图 API（@vuemap/vue-amap）</h1>
    <p class="demo-desc">输入门店名称+地址 → 自动获取 GPS → 100m 周边固定建筑 + 地图标记</p>

    <!-- ① 搜索工具栏 -->
    <div class="toolbar">
      <div class="toolbar-inputs">
        <input v-model="name_" placeholder="门店名称" class="inp" @keyup.enter="doSearch" />
        <input v-model="addr_" placeholder="地址" class="inp" @keyup.enter="doSearch" />
        <input v-model="tLat_" placeholder="目标纬度（可选）" class="inp inp-sm" />
        <input v-model="tLon_" placeholder="目标经度（可选）" class="inp inp-sm" />
      </div>
      <div class="toolbar-actions">
        <button :disabled="loading" class="btn btn-primary" @click="doSearch">
          {{ loading ? '⏳' : '🔍 搜索周边' }}
        </button>
        <button class="btn btn-secondary" @click="doCalc">📏 仅算距离</button>
        <label class="radius-label">半径</label>
        <select v-model.number="radius" class="radius-select">
          <option :value="50">50m</option>
          <option :value="100">100m</option>
          <option :value="200">200m</option>
          <option :value="500">500m</option>
          <option :value="1000">1000m</option>
          <option :value="2000">2000m</option>
        </select>
        <span v-if="gps" class="gps-display">📍 {{ f(gps.latitude) }}, {{ f(gps.longitude) }}</span>
      </div>
      <div v-if="calcRes" class="calc-info">
        距离 <b :class="calcRes.exceeded ? 'over' : 'ok'">{{ calcRes.distance.toFixed(2) }}m</b> ·
        <span :class="calcRes.exceeded ? 'over' : 'ok'">{{ calcRes.exceeded ? '⚠️ 超 700m' : '✅ 700m 内' }}</span>
      </div>
    </div>

    <!-- ② 地图 + 列表 -->
    <div class="map-shell">
      <ElAmap
        :center="mapCenter"
        :zoom="18"
        :features="['bg', 'road', 'building', 'point']"
        :show-building-block="true"
        :show-label="true"
        :show-indoor-map="true"
        :is-hotspot="true"
        :scroll-wheel="true"
        @init="onMapInit"
      />
      <div v-if="pois.length" class="map-panel">
        <div class="panel-head">
          <span>周边 {{ pois.length }} 个 POI</span>
          <span v-if="gps" class="panel-gps">{{ f(gps.latitude) }}, {{ f(gps.longitude) }}</span>
        </div>
        <div class="map-panel-body">
          <div
            v-for="(p, i) in pois"
            :key="i"
            class="poi-card"
            :class="{ active: i === activeIdx }"
            @click="focusPoi(i)"
            @mouseenter="hoverPoi(i, true)"
            @mouseleave="hoverPoi(i, false)"
          >
            <div class="poi-card-img" @click.stop="openDetail(p)">
              <img v-if="cardImg(p)" :src="cardImg(p)!" :alt="p.name" loading="lazy" @error="onImgFail" />
              <span v-else class="poi-card-noimg">📍</span>
            </div>
            <div class="poi-card-body">
              <div class="poi-card-name">
                {{ p.name }}
              </div>
              <div class="poi-card-addr">
                {{ p.address }}
              </div>
              <div class="poi-card-meta">
                <span class="badge" :class="{ warn: p.distanceM > 700 }">{{ fm(p.distanceM) }}</span>
                <span class="poi-card-type">{{ p.type?.slice(0, 8) || '' }}</span>
              </div>
            </div>
            <button class="poi-card-detail" title="查看详情" @click.stop="openDetail(p)">📋</button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="!pois.length && !loading" class="empty-hint">输入门店名称和地址，点击"搜索周边"</div>

    <!-- ③ POI 详情浮层 -->
    <ModalBox v-model:visible="detailVisible" :title="detailPoi?.name || ''" size="md">
      <template v-if="detailPoi">
        <div class="poi-detail-head">
          <span class="poi-detail-dist" :class="{ warn: detailPoi.distanceM > 700 }">{{
            fm(detailPoi.distanceM)
          }}</span>
        </div>
        <div class="poi-detail-addr">📍 {{ detailPoi.address }}</div>
        <div class="poi-detail-cord">🌐 {{ f(detailPoi.latitude) }}, {{ f(detailPoi.longitude) }}</div>
        <div v-if="detailPoi.type" class="poi-detail-type">🏷️ {{ detailPoi.type }}</div>

        <!-- 图片画廊 -->
        <div v-if="detailLoading" class="poi-detail-loading">⏳ 加载照片中…</div>
        <div v-else-if="detailPoi.photos && detailPoi.photos.length" class="poi-detail-photos">
          <div class="poi-detail-photos-label">📸 照片（{{ detailPoi.photos.length }}）</div>
          <div class="poi-detail-photos-grid">
            <div
              v-for="(photo, pi) in detailPoi.photos"
              :key="pi"
              class="poi-detail-photo-item"
              @click="lightboxSrc = photo.url"
            >
              <img :src="photo.url" :alt="photo.title || detailPoi.name" loading="lazy" @error="onImgFail" />
              <span v-if="photo.title" class="poi-detail-photo-title">{{ photo.title }}</span>
            </div>
          </div>
        </div>
        <div v-else class="poi-detail-no-photos">
          <span>暂无门店照片</span>
        </div>
      </template>
      <template #footer>
        <button class="btn btn-secondary" @click="detailVisible = false">关闭</button>
      </template>
    </ModalBox>

    <!-- ④ 图片预览 -->
    <ImagePreview v-if="lightboxSrc" :src="lightboxSrc" @close="lightboxSrc = ''" />

    <Toast ref="toastRef" variant="toast" position="top" />
  </div>
</template>

<style scoped>
.demo {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 calc(16px * var(--vcl-scale)) calc(40px * var(--vcl-scale));
}
.demo-title {
  font-size: calc(18px * var(--vcl-scale));
  margin-bottom: 2px;
}
.demo-desc {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(16px * var(--vcl-scale));
}

.toolbar {
  background: var(--vcl-color-surface);
  border: 1px solid var(--vcl-color-border);
  border-radius: calc(10px * var(--vcl-scale));
  padding: calc(12px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
  margin-bottom: calc(12px * var(--vcl-scale));
}
.toolbar-inputs {
  display: flex;
  gap: calc(8px * var(--vcl-scale));
  flex-wrap: wrap;
}
.inp {
  flex: 1;
  min-width: calc(140px * var(--vcl-scale));
  padding: calc(7px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  background: var(--vcl-color-bg);
}
.inp-sm {
  flex: 0.5;
  min-width: calc(120px * var(--vcl-scale));
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--vcl-scale));
  margin-top: calc(10px * var(--vcl-scale));
  flex-wrap: wrap;
}
.btn {
  padding: calc(7px * var(--vcl-scale)) calc(18px * var(--vcl-scale));
  border: none;
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  cursor: pointer;
  white-space: nowrap;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--vcl-color-primary);
  color: #fff;
}
.btn-secondary {
  background: #8b5cf6;
  color: #fff;
}
.gps-display {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-primary-on-surface);
  font-weight: 500;
}
.radius-label {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-left: calc(4px * var(--vcl-scale));
}
.radius-select {
  padding: calc(5px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  background: var(--vcl-color-bg);
}
.calc-info {
  margin-top: calc(8px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

/* ② 地图 + 卡片列表 */
.map-shell {
  position: relative;
  height: calc(500px * var(--vcl-scale));
  margin-bottom: calc(14px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
}
.map-shell :deep(.el-vue-amap-container),
.map-shell :deep(.el-vue-amap) {
  width: 100% !important;
  height: 100% !important;
  border-radius: calc(10px * var(--vcl-scale));
  overflow: hidden;
}
.map-panel {
  position: absolute;
  top: calc(8px * var(--vcl-scale));
  left: calc(8px * var(--vcl-scale));
  bottom: calc(8px * var(--vcl-scale));
  width: calc(340px * var(--vcl-scale));
  background: var(--vcl-color-surface);
  backdrop-filter: blur(10px);
  border-radius: calc(10px * var(--vcl-scale));
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
  z-index: 1;
  display: flex;
  flex-direction: column;
}
.map-panel-body {
  flex: 1;
  overflow-y: auto;
  padding: calc(6px * var(--vcl-scale)) 0;
}
.panel-head {
  padding: calc(10px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text);
  border-bottom: 1px solid var(--vcl-color-border-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.panel-gps {
  font-size: calc(11px * var(--vcl-scale));
  font-weight: 400;
  color: var(--vcl-color-text-muted);
  font-family: monospace;
}

/* ③ POI 卡片 */
.poi-card {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--vcl-scale));
  padding: calc(10px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
  cursor: pointer;
  border-bottom: 1px solid var(--vcl-color-border-light);
  transition: background 0.12s;
}
.poi-card:last-child {
  border-bottom: none;
}
.poi-card:hover {
  background: var(--vcl-color-info-bg);
}
.poi-card.active {
  background: var(--vcl-color-info-bg);
  border-left: 3px solid var(--vcl-color-danger-hover);
  padding-left: calc(11px * var(--vcl-scale));
}

.poi-card-img {
  width: calc(56px * var(--vcl-scale));
  height: calc(56px * var(--vcl-scale));
  border-radius: calc(8px * var(--vcl-scale));
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  border: 1px solid var(--vcl-color-border);
  background: var(--vcl-color-bg-alt);
  display: flex;
  align-items: center;
  justify-content: center;
}
.poi-card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.poi-card-img:hover {
  border-color: var(--vcl-color-primary);
}
.poi-card-noimg {
  font-size: calc(22px * var(--vcl-scale));
  opacity: 0.5;
}

.poi-card-body {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.poi-card-name {
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.poi-card-addr {
  font-size: calc(11px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.poi-card-meta {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
  margin-top: calc(4px * var(--vcl-scale));
}
.poi-card-type {
  font-size: calc(10px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

.poi-card-detail {
  background: none;
  border: none;
  padding: calc(4px * var(--vcl-scale)) calc(6px * var(--vcl-scale));
  cursor: pointer;
  font-size: calc(16px * var(--vcl-scale));
  line-height: 1;
  opacity: 0.4;
  transition: opacity 0.12s;
  border-radius: calc(4px * var(--vcl-scale));
  align-self: flex-start;
  margin-top: 2px;
}
.poi-card:hover .poi-card-detail {
  opacity: 1;
}
.poi-card-detail:hover {
  background: var(--vcl-color-bg-alt);
}

.badge {
  font-size: calc(12px * var(--vcl-scale));
  font-weight: 700;
  padding: 1px calc(8px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  background: var(--vcl-color-info-bg);
  color: var(--vcl-color-info-text);
  white-space: nowrap;
  flex-shrink: 0;
}
.badge.warn {
  background: var(--vcl-color-warning-bg);
  color: var(--vcl-color-warning-text);
}

/* ④ POI 详情浮层 */
.poi-detail-head {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--vcl-scale));
  margin-bottom: calc(8px * var(--vcl-scale));
}
.poi-detail-dist {
  font-size: calc(14px * var(--vcl-scale));
  font-weight: 700;
  padding: 2px calc(10px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  background: var(--vcl-color-info-bg);
  color: var(--vcl-color-info-text);
  white-space: nowrap;
}
.poi-detail-dist.warn {
  background: var(--vcl-color-warning-bg);
  color: var(--vcl-color-warning-text);
}
.poi-detail-addr {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  margin-bottom: calc(4px * var(--vcl-scale));
}
.poi-detail-cord {
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  font-family: monospace;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.poi-detail-type {
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  margin-bottom: calc(12px * var(--vcl-scale));
}
.poi-detail-loading {
  padding: calc(24px * var(--vcl-scale)) 0;
  text-align: center;
  color: var(--vcl-color-text-secondary);
  font-size: calc(13px * var(--vcl-scale));
}

/* 图片画廊 */
.poi-detail-photos {
  margin: calc(16px * var(--vcl-scale)) 0;
}
.poi-detail-photos-label {
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text-secondary);
  margin-bottom: calc(8px * var(--vcl-scale));
}
.poi-detail-photos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(140px * var(--vcl-scale)), 1fr));
  gap: calc(8px * var(--vcl-scale));
}
.poi-detail-photo-item {
  position: relative;
  border-radius: calc(8px * var(--vcl-scale));
  overflow: hidden;
  cursor: pointer;
  background: var(--vcl-color-bg-alt);
  border: 1px solid var(--vcl-color-border);
  aspect-ratio: 4/3;
}
.poi-detail-photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s;
}
.poi-detail-photo-item:hover img {
  transform: scale(1.05);
}
.poi-detail-photo-title {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: calc(4px * var(--vcl-scale)) calc(6px * var(--vcl-scale));
  font-size: calc(10px * var(--vcl-scale));
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.poi-detail-no-photos {
  padding: calc(24px * var(--vcl-scale)) 0;
  text-align: center;
  color: var(--vcl-color-text-muted);
  font-size: calc(13px * var(--vcl-scale));
}
/* 空状态 */
.empty-hint {
  height: calc(500px * var(--vcl-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--vcl-color-text-muted);
  font-size: calc(14px * var(--vcl-scale));
}
.ok {
  color: var(--vcl-color-success-text);
  font-weight: 600;
}
.over {
  color: var(--vcl-color-danger-hover);
  font-weight: 600;
}
@container demo (max-width: 767px) {
  .map-panel {
    width: calc(280px * var(--vcl-scale));
  }
}
</style>
