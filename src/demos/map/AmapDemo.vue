<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { searchNearby, calculateDistance, geolocationCalc, amapKeywordSearch, isValidLatLon, Toast, fetchPoiDetail, batchFetchPoiPhotos, ImagePreview } from '@/components'
import { ElAmap, initAMapApiLoader } from '@vuemap/vue-amap'
import '@vuemap/vue-amap/dist/style.css'
import type { PoiItem } from '@/components'

// 必须在 initAMapApiLoader 之前设置安全密钥
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || 'fc4f7320f8250eea3e500eaf326cd3ed'
const AMAP_SECRET = import.meta.env.VITE_AMAP_SECRET || 'd4ccfb3db42ec0b958e54566ed5e5e73'
;(window as unknown as Record<string, unknown>)._AMapSecurityConfig = { securityJsCode: AMAP_SECRET }
initAMapApiLoader({ key: AMAP_KEY, version: '2.0' })

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
const lightboxSrc = ref('')

// ==================== 地图 ====================
const mapCenter = ref<[number, number]>([116.397428, 39.90923])
let mapIns: any = null
let originMarker: any = null
const poiMarkers: any[] = []
let infoWin: any = null

function onMapInit(map: any) {
  mapIns = map
  mapIns.plugin(['AMap.ToolBar', 'AMap.Scale'], () => {
    mapIns.addControl(new ((AMap as unknown as Record<string, unknown>).ToolBar as new () => AMap.ToolBar)())
    mapIns.addControl(new ((AMap as unknown as Record<string, unknown>).Scale as new () => AMap.Scale)())
  })
  infoWin = new AMap.InfoWindow({ isCustom: true, offset: new AMap.Pixel(0, -35) })
}

function clearMarkers() {
  if (originMarker) { mapIns?.remove(originMarker); originMarker = null }
  poiMarkers.forEach(m => mapIns?.remove(m))
  poiMarkers.length = 0
  activeIdx.value = -1
}

function highlightMarker(idx: number, on: boolean) {
  const m = poiMarkers[idx]
  if (!m) return
  try {
    if (on) {
      m.setIcon(new AMap.Icon({ size: [28, 28], image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png', imageSize: [28, 28] }))
    } else {
      m.setIcon(new AMap.Icon({ size: [24, 24], image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png', imageSize: [24, 24] }))
    }
  } catch (_) { /* AMap 图标切换偶发异常，忽略 */ }
  m.setzIndex(on ? 101 : 90)
}

function renderMap(center: { latitude: number; longitude: number }, list: (PoiItem & { distanceM: number })[]) {
  if (!mapIns) return
  clearMarkers()
  mapCenter.value = [center.longitude, center.latitude]
  mapIns.setZoomAndCenter(18, [center.longitude, center.latitude])
  // 原始位置红色大头针
  const pinDiv = document.createElement('div')
  pinDiv.innerHTML = `<div style="position:relative;width:25px;height:34px;">
    <svg width="25" height="34"><path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 34 12.5 34S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#dc2626"/><circle cx="12.5" cy="12.5" r="5" fill="#fff"/></svg>
    <span style="position:absolute;top:5px;left:0;width:25px;text-align:center;font-size:9px;font-weight:700;color:#dc2626;">起</span></div>`
  originMarker = new AMap.Marker({ position: [center.longitude, center.latitude], content: pinDiv, offset: new AMap.Pixel(-13, -34), zIndex: 100 })
  mapIns.add(originMarker)
  // POI 标记
  list.forEach((p, i) => {
    const m = new AMap.Marker({
      position: [p.longitude, p.latitude], title: p.name, zIndex: 90,
      icon: new AMap.Icon({ size: [24, 24], image: 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png', imageSize: [24, 24] }),
    })
    m.on('click', () => {
      // 同步卡片选中
      if (activeIdx.value >= 0) highlightMarker(activeIdx.value, false)
      activeIdx.value = i
      highlightMarker(i, true)
      infoWin.setContent(`<div style="min-width:180px;padding:10px 12px;font-size:13px;line-height:1.6;background:#fff;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.15);">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;color:#1f2937;">${p.name}</div>
        <div style="color:#6b7280;margin-bottom:4px;">📍 ${p.address}</div>
        <div style="display:flex;align-items:center;gap:8px;padding-top:4px;border-top:1px solid #e5e7eb;">
          <span style="font-weight:700;font-size:16px;color:#dc2626;">${fm(p.distanceM)}</span>
          <span style="font-size:11px;color:#9ca3af;font-family:monospace;">${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}</span>
        </div>
      </div>`)
      infoWin.open(mapIns, m.getPosition())
    })
    mapIns.add(m)
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
  mapIns.setCenter(m.getPosition())
  m.emit('click')
}
function hoverPoi(idx: number, on: boolean) {
  if (idx === activeIdx.value) return // 已选中不动
  highlightMarker(idx, on)
}

// ==================== 搜索 ====================
async function doSearch() {
  const n = name_.value.trim(), a = addr_.value.trim()
  if (!n || !a) { t('请填写名称和地址', 'warning'); return }
  loading.value = true; gps.value = null; pois.value = []; calcRes.value = null
  try {
    // 定位 + 周边
    const { amapLat, amapLon } = await geolocationCalc({ address: a, storeName: n, targetLat: 0, targetLon: 0 })
    gps.value = { latitude: amapLat, longitude: amapLon }
    const list = await searchNearby(amapLat, amapLon, radius.value, '120000|141200|080000|150000|110000')
    pois.value = list.map(p => ({ ...p, distanceM: calculateDistance(amapLat, amapLon, p.latitude, p.longitude) }))
    // 搜索定位项：amapKeywordSearch 名称+地址
    const { latitude: slat, longitude: slon } = await amapKeywordSearch(`${n} ${a}`)
    if (slat !== null && slon !== null) {
      const dup = pois.value.findIndex(p => Math.abs(p.latitude - slat) < 0.0001 && Math.abs(p.longitude - slon) < 0.0001)
      if (dup > 0) { const [m] = pois.value.splice(dup, 1); pois.value.unshift(m) }
      else if (dup === -1) { pois.value.unshift({ name: n, address: a, latitude: slat, longitude: slon, distanceM: calculateDistance(amapLat, amapLon, slat, slon) }) }
    }
    // 关键词降级
    const kw = n.toLowerCase()
    const mi = pois.value.findIndex(p => p.name.toLowerCase().includes(kw) || kw.includes(p.name.toLowerCase()))
    if (mi > 0) { const [m] = pois.value.splice(mi, 1); pois.value.unshift(m) }
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
  } catch (e: unknown) { t(e instanceof Error ? e.message : '失败', 'error') }
  finally { loading.value = false }
}

async function doCalc() {
  const n = name_.value.trim(), a = addr_.value.trim()
  const lat = parseFloat(tLat_.value), lon = parseFloat(tLon_.value)
  if (!n || !a) { t('请填写名称和地址', 'warning'); return }
  if (isNaN(lat) || isNaN(lon) || !isValidLatLon(lat, lon)) { t('经纬度无效', 'error'); return }
  try { calcRes.value = await geolocationCalc({ address: a, storeName: n, targetLat: lat, targetLon: lon }); t('计算完成', 'success') }
  catch (e: unknown) { t(e instanceof Error ? e.message : '失败', 'error'); calcRes.value = null }
}

function f(n: number) { return n.toFixed(6) }
function fm(n: number) { return n < 1000 ? n.toFixed(0) + 'm' : (n / 1000).toFixed(2) + 'km' }

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
	function closeDetail() {
	  detailPoi.value = null
	  lightboxSrc.value = ''
	}

/** 图片加载失败 → 改为占位 */
function onImgFail(e: Event) {
  const el = e.target as HTMLImageElement
  if (el) el.style.display = 'none'
}
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">🗺️ 高德地图 API（@vuemap/vue-amap）</h2>
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
        <button :disabled="loading" @click="doSearch" class="btn btn-primary">{{ loading ? '⏳' : '🔍 搜索周边' }}</button>
        <button @click="doCalc" class="btn btn-secondary">📏 仅算距离</button>
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
        距离 <b :class="calcRes.exceeded ? 'over' : 'ok'">{{ calcRes.distance.toFixed(2) }}m</b>
        · <span :class="calcRes.exceeded ? 'over' : 'ok'">{{ calcRes.exceeded ? '⚠️ 超 700m' : '✅ 700m 内' }}</span>
      </div>
    </div>

    <!-- ② 地图 + 列表 -->
    <div class="map-shell">
      <ElAmap
        :center="mapCenter"
        :zoom="18"
        :features="['bg','road','building','point']"
        :showBuildingBlock="true"
        :showLabel="true"
        :showIndoorMap="true"
        :isHotspot="true"
        :scrollWheel="true"
        @init="onMapInit"
      />
      <div v-if="pois.length" class="map-panel">
        <div class="panel-head">
          <span>周边 {{ pois.length }} 个 POI</span>
          <span v-if="gps" class="panel-gps">{{ f(gps.latitude) }}, {{ f(gps.longitude) }}</span>
        </div>
        <div class="map-panel-body">
          <div
            v-for="(p, i) in pois" :key="i"
            class="poi-card" :class="{ active: i === activeIdx }"
            @click="focusPoi(i)" @mouseenter="hoverPoi(i, true)" @mouseleave="hoverPoi(i, false)"
          >
            <div class="poi-card-img" @click.stop="openDetail(p)">
              <img v-if="cardImg(p)" :src="cardImg(p)!" :alt="p.name" loading="lazy" @error="onImgFail" />
              <span v-else class="poi-card-noimg">📍</span>
            </div>
            <div class="poi-card-body">
              <div class="poi-card-name">{{ p.name }}</div>
              <div class="poi-card-addr">{{ p.address }}</div>
              <div class="poi-card-meta">
                <span class="badge" :class="{ warn: p.distanceM > 700 }">{{ fm(p.distanceM) }}</span>
                <span class="poi-card-type">{{ p.type?.slice(0, 8) || '' }}</span>
              </div>
            </div>
            <button class="poi-card-detail" @click.stop="openDetail(p)" title="查看详情">📋</button>
          </div>
        </div>
      </div>
    </div>
        <div v-if="!pois.length && !loading" class="empty-hint">输入门店名称和地址，点击"搜索周边"</div>

    <!-- ③ POI 详情浮层 -->
    <Teleport to="body">
      <div v-if="detailPoi" class="poi-detail-overlay" @click.self="closeDetail">
        <div class="poi-detail-panel">
          <button class="poi-detail-close" @click="closeDetail">✕</button>
          <div class="poi-detail-head">
            <h3>{{ detailPoi.name }}</h3>
            <span class="poi-detail-dist" :class="{ warn: detailPoi.distanceM > 700 }">{{ fm(detailPoi.distanceM) }}</span>
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
                v-for="(photo, pi) in detailPoi.photos" :key="pi"
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

          <!-- 操作 -->
          <div class="poi-detail-actions">
            <button class="btn btn-secondary" @click="closeDetail">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

	    <!-- ④ 图片预览 -->
	    <ImagePreview v-if="lightboxSrc" :src="lightboxSrc" @close="lightboxSrc = ''" />

    <Toast ref="toastRef" variant="toast" position="top" />
  </div>
</template>

<style scoped>
.demo { max-width: 1100px; margin: 0 auto; padding: 0 16px 40px; }
.demo-title { font-size: 18px; margin-bottom: 2px; }
.demo-desc { font-size: 13px; color: var(--color-text-muted, #64748b); margin-bottom: 16px; }

.toolbar { background: var(--color-surface, #f8fafc); border: 1px solid var(--color-border, #e2e8f0); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.toolbar-inputs { display: flex; gap: 8px; flex-wrap: wrap; }
.inp { flex: 1; min-width: 140px; padding: 7px 10px; border: 1px solid var(--color-border, #d1d5db); border-radius: 6px; font-size: 13px; background: var(--color-bg, #fff); }
.inp-sm { flex: 0.5; min-width: 120px; }
.toolbar-actions { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.btn { padding: 7px 18px; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--color-primary, #3b82f6); color: #fff; }
.btn-secondary { background: #8b5cf6; color: #fff; }
.gps-display { font-size: 13px; color: var(--color-primary, #3b82f6); font-weight: 500; }
.radius-label { font-size: 13px; color: var(--color-text-muted, #64748b); margin-left: 4px; }
.radius-select { padding: 5px 8px; border: 1px solid var(--color-border, #d1d5db); border-radius: 6px; font-size: 13px; background: var(--color-bg, #fff); }
.calc-info { margin-top: 8px; font-size: 13px; color: var(--color-text-muted, #64748b); }

/* ② 地图 + 卡片列表 */
.map-shell { position: relative; height: 500px; margin-bottom: 14px; border-radius: 10px; border: 1px solid var(--color-border, #e2e8f0); }
.map-shell :deep(.el-vue-amap-container),
.map-shell :deep(.el-vue-amap) { width: 100% !important; height: 100% !important; border-radius: 10px; overflow: hidden; }
.map-panel {
  position: absolute; top: 8px; left: 8px; bottom: 8px; width: 340px;
  background: rgba(255,255,255,.95); backdrop-filter: blur(10px);
  border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,.12);
  z-index: 1; display: flex; flex-direction: column;
}
.map-panel-body { flex: 1; overflow-y: auto; padding: 6px 0; }
.panel-head {
  padding: 10px 14px; font-size: 13px; font-weight: 600; color: #1f2937;
  border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;
  flex-shrink: 0;
}
.panel-gps { font-size: 11px; font-weight: 400; color: #9ca3af; font-family: monospace; }

/* ③ POI 卡片 */
.poi-card {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background .12s;
}
.poi-card:last-child { border-bottom: none; }
.poi-card:hover { background: #f0f7ff; }
.poi-card.active { background: #eff6ff; border-left: 3px solid #dc2626; padding-left: 11px; }

.poi-card-img {
  width: 56px; height: 56px; border-radius: 8px; overflow: hidden; flex-shrink: 0;
  cursor: pointer; border: 1px solid #e2e8f0; background: #f1f5f9;
  display: flex; align-items: center; justify-content: center;
}
.poi-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.poi-card-img:hover { border-color: #3b82f6; }
.poi-card-noimg { font-size: 22px; opacity: 0.5; }

.poi-card-body { flex: 1; min-width: 0; overflow: hidden; }
.poi-card-name { font-size: 13px; font-weight: 600; color: #1f2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.poi-card-addr { font-size: 11px; color: #9ca3af; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.poi-card-meta { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
.poi-card-type { font-size: 10px; color: #94a3b8; }

.poi-card-detail {
  background: none; border: none; padding: 4px 6px; cursor: pointer;
  font-size: 16px; line-height: 1; opacity: 0.4; transition: opacity .12s;
  border-radius: 4px; align-self: flex-start; margin-top: 2px;
}
.poi-card:hover .poi-card-detail { opacity: 1; }
.poi-card-detail:hover { background: #f1f5f9; }

.badge { font-size: 12px; font-weight: 700; padding: 1px 8px; border-radius: 10px; background: #dbeafe; color: #1d4ed8; white-space: nowrap; flex-shrink: 0; }
.badge.warn { background: #fef3c7; color: #d97706; }

/* ④ POI 详情浮层 */
.poi-detail-overlay { position: fixed; inset: 0; z-index: 9000; background: rgba(0,0,0,.45); display: flex; align-items: center; justify-content: center; padding: 20px; }
.poi-detail-panel { background: var(--color-bg, #fff); border-radius: 12px; max-width: 600px; width: 100%; max-height: 80vh; overflow-y: auto; padding: 24px; position: relative; box-shadow: 0 8px 40px rgba(0,0,0,.18); }
.poi-detail-close { position: absolute; top: 12px; right: 12px; width: 32px; height: 32px; border: none; border-radius: 50%; background: #f1f5f9; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; }
.poi-detail-close:hover { background: #e2e8f0; }
.poi-detail-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.poi-detail-head h3 { font-size: 18px; font-weight: 700; color: #1f2937; margin: 0; }
.poi-detail-dist { font-size: 14px; font-weight: 700; padding: 2px 10px; border-radius: 10px; background: #dbeafe; color: #1d4ed8; white-space: nowrap; }
.poi-detail-dist.warn { background: #fef3c7; color: #d97706; }
.poi-detail-addr { font-size: 13px; color: #6b7280; margin-bottom: 4px; }
.poi-detail-cord { font-size: 12px; color: #9ca3af; font-family: monospace; margin-bottom: 4px; }
.poi-detail-type { font-size: 12px; color: #6b7280; margin-bottom: 12px; }
.poi-detail-loading { padding: 24px 0; text-align: center; color: #6b7280; font-size: 13px; }

/* 图片画廊 */
.poi-detail-photos { margin: 16px 0; }
.poi-detail-photos-label { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px; }
.poi-detail-photos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.poi-detail-photo-item { position: relative; border-radius: 8px; overflow: hidden; cursor: pointer; background: #f8fafc; border: 1px solid #e2e8f0; aspect-ratio: 4/3; }
.poi-detail-photo-item img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .2s; }
.poi-detail-photo-item:hover img { transform: scale(1.05); }
.poi-detail-photo-title { position: absolute; bottom: 0; left: 0; right: 0; padding: 4px 6px; font-size: 10px; color: #fff; background: rgba(0,0,0,.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.poi-detail-no-photos { padding: 24px 0; text-align: center; color: #9ca3af; font-size: 13px; }
.poi-detail-actions { margin-top: 16px; display: flex; gap: 8px; justify-content: flex-end; }

	/* 空状态 */
.empty-hint { height: 500px; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 14px; }
.ok { color: #16a34a; font-weight: 600; }
.over { color: #dc2626; font-weight: 600; }
@media (max-width: 768px) { .map-panel { width: 280px; } }
</style>
