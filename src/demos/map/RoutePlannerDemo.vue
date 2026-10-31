<script setup lang="ts">
/**
 * 门店巡访路线规划器 — 主页面
 * 三栏布局：门店管理 | 路线地图 | 分天结果
 */
import { ref, computed, onMounted } from 'vue'
import StorePanel from '@/components/route-planner/StorePanel.vue'
import RouteMap from '@/components/route-planner/RouteMap.vue'
import RouteResult from '@/components/route-planner/RouteResult.vue'
import StoreFormModal from '@/components/route-planner/StoreFormModal.vue'
import ImportProgress from '@/components/route-planner/ImportProgress.vue'
import { useStoreData, useCoordinateResolver, useRoutePlanner } from '@/components/route-planner/composables'
import { parseExcel, setAmapKey } from '@/components/route-planner/utils'
import type { Store } from '@/components/route-planner/types'

// ── 状态管理 ──
const { stores, addStore, updateStore, removeStore, importStores, toggleSkip, clearAll } = useStoreData()
const { resolveBatch, resolveOne } = useCoordinateResolver()
const { plan, loading, enriching, generate, enrichDriving, replan, reset: resetPlanner } = useRoutePlanner()

// ── UI 状态 ──
const showForm = ref(false)
const editingStore = ref<Store | null>(null)
const importStage = ref<'idle' | 'parsing' | 'geocoding' | 'done'>('idle')
const importMsg = ref('')
const geocodeProgress = ref({ current: 0, total: 0 })
const amapKeyInput = ref('')
const showKeyInput = ref(false)
const startPoint = ref<{ name: string; address: string; lat: number; lon: number } | null>(null)
/** 是否已获取实测驾车数据 */
const hasRealDriving = ref(false)
/** GPS 定位中 */
const locating = ref(false)
/** GPS 定位错误 */
const locateError = ref('')
/** 计划天数（0=自动） */
const targetDays = ref(0)
/** 左侧面板折叠 */
const leftCollapsed = ref(false)
/** 实际使用的起点名（用于结果显示） */
const actualStartName = ref('')
/** 自定义起点输入 */
const customStartInput = ref('')
/** 自定义起点搜索中 */
const searchingStart = ref(false)

// ── 本地缓存 ──
const CACHE_KEY = 'route-planner-stores'
const CACHE_START_KEY = 'route-planner-start'

/** 保存起点到 localStorage（门店数据由 useStoreData 的 watch 持久化，此处不重复写同一 key） */
function saveCache(): void {
  try {
    if (startPoint.value) {
      localStorage.setItem(CACHE_START_KEY, JSON.stringify(startPoint.value))
    }
  } catch {
    /* 存储满时静默失败 */
  }
}

/** 从 localStorage 恢复门店数据 */
function loadCache(): { stores: Store[]; startPoint: typeof startPoint.value } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached: Store[] = JSON.parse(raw)
    if (!Array.isArray(cached) || cached.length === 0) return null
    const startRaw = localStorage.getItem(CACHE_START_KEY)
    const start = startRaw ? JSON.parse(startRaw) : null
    return { stores: cached, startPoint: start }
  } catch {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

// ── 计算属性 ──
const validStores = computed(() => stores.value.filter((s) => s.longitude != null && s.latitude != null && !s.skipped))

const canGenerate = computed(() => validStores.value.length > 0 && !loading.value)

// ── Excel 导入核心逻辑（带去重） ──
async function processImport(data: File | ArrayBuffer): Promise<void> {
  importStage.value = 'parsing'

  try {
    const { stores: parsed, needGeocode, startPoint: sp } = await parseExcel(data)

    // 保存起点/终点
    if (sp) {
      startPoint.value = { ...sp, lat: 0, lon: 0 }
    }

    // 去重：按 name + address 检测已存在的门店
    const existingKeys = new Set(stores.value.map((s) => `${s.name}|${s.address}`))
    const newItems: Store[] = []
    let dupCount = 0

    for (const s of parsed) {
      const key = `${s.name || ''}|${s.address || ''}`
      if (existingKeys.has(key)) {
        dupCount++
        continue
      }
      existingKeys.add(key)
      newItems.push({
        id: s.id || `store_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: s.name || '',
        address: s.address || '',
        province: s.province || '',
        city: s.city || '',
        district: s.district || '',
        town: s.town || '',
        fullAddr: s.fullAddr,
        isTownshipMarker: s.isTownshipMarker,
        contact: s.contact || '',
        phone: s.phone || '',
        longitude: s.longitude ?? null,
        latitude: s.latitude ?? null,
        coordSource: 'original' as const,
        skipped: false,
      })
    }

    if (newItems.length > 0) {
      importStores(newItems)
    }

    // 无坐标的批量编码
    if (needGeocode.length > 0) {
      importStage.value = 'geocoding'
      geocodeProgress.value = { current: 0, total: needGeocode.length }
      const resolved = await resolveBatch(needGeocode)
      importStores(resolved)
    }

    // 写入缓存，下次直接恢复
    saveCache()

    // 汇总提示
    let msg = `✅ 导入 ${newItems.length} 家门店`
    if (dupCount > 0) msg += `，跳过 ${dupCount} 条重复`
    if (needGeocode.length > 0) msg += `，${needGeocode.length} 条已自动定位`
    importStage.value = 'done'
    importMsg.value = msg
    setTimeout(() => {
      importStage.value = 'idle'
    }, 3000)
  } catch (e) {
    console.error('导入失败:', e)
    importStage.value = 'idle'
  }
}

// ── 文件选择导入 ──
async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await processImport(file)
  input.value = ''
}

// ── GPS 定位起点 ──
function handleLocate(silent = false): void {
  if (!navigator.geolocation) {
    if (!silent) locateError.value = '浏览器不支持定位'
    return
  }
  locating.value = true
  if (!silent) locateError.value = ''
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      startPoint.value = {
        name: '我的位置',
        address: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
      }
      locating.value = false
    },
    (err) => {
      if (!silent) locateError.value = err.message || '定位失败，请检查权限'
      locating.value = false
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  )
}

/** 自定义起点：输入地名 → 地理编码 → 设为起点 */
async function handleSetCustomStart(): Promise<void> {
  const input = customStartInput.value.trim()
  if (!input) return

  searchingStart.value = true
  locateError.value = ''

  try {
    // 用 resolveOne 地理编码（会走三级解析链）
    const resolved = await resolveOne({ name: input, address: input })
    if (resolved?.latitude != null && resolved?.longitude != null) {
      startPoint.value = {
        name: input,
        address: `(${resolved.latitude.toFixed(4)}, ${resolved.longitude.toFixed(4)})`,
        lat: resolved.latitude,
        lon: resolved.longitude,
      }
      saveCache()
    } else {
      locateError.value = `未找到「${input}」的位置，请尝试更具体的地址`
    }
  } catch {
    locateError.value = `搜索「${input}」失败，请检查网络或 Key`
  } finally {
    searchingStart.value = false
  }
}

// ── 路线规划（一键生成 + 自动获取驾车数据） ──
async function handleGenerate(): Promise<void> {
  if (validStores.value.length === 0) return

  hasRealDriving.value = false

  // 起点：优先 GPS → Excel 导入 → 第一个门店
  let sp = startPoint.value
  let startSource: 'gps' | 'excel' | 'firstStore' = 'firstStore'

  if (sp && sp.lat === 0 && sp.lon === 0) {
    // Excel 导入的起点需要解析坐标
    const resolved = await resolveOne({ name: sp.name, address: sp.address })
    if (resolved?.latitude != null && resolved?.longitude != null) {
      sp = { ...sp, lat: resolved.latitude, lon: resolved.longitude }
      startPoint.value = sp
      startSource = 'excel'
    }
  } else if (sp && sp.lat !== 0) {
    startSource = sp.name === '我的位置' ? 'gps' : 'excel'
  }

  const finalStart =
    sp && sp.lat !== 0
      ? { lat: sp.lat, lon: sp.lon }
      : { lat: validStores.value[0].latitude!, lon: validStores.value[0].longitude! }

  // 记录实际使用的起点名
  const actualName = startSource === 'firstStore' ? validStores.value[0]?.city || '第一家门店' : sp?.name || '起点'
  actualStartName.value = actualName

  // 第一步：生成路线（估算）
  await generate({
    stores: stores.value,
    startPoint: finalStart,
    dailyLimitHours: 8,
    maxStoresPerDay: 8,
    maxSegmentKm: 80,
    maxDetourKm: 50,
    clusterRadiusKm: 30,
    defaultVisitMinutes: 30,
    maxDrivingMinutesPerDay: 240,
    targetDays: targetDays.value || undefined,
  })

  if (!plan.value) return

  // 第二步：自动获取实测驾车数据
  await enrichDriving((cur, total) => {
    geocodeProgress.value = { current: cur, total }
  })
  hasRealDriving.value = true
}

/** 从当前位置重新规划剩余路线（保留所有门店，包括被跳过的） */
async function handleReplan(): Promise<void> {
  if (!plan.value || plan.value.days.length === 0) return

  // 找到最后一个有门店的天（作为当前位置）
  let currentDayIdx = -1
  for (let i = plan.value.days.length - 1; i >= 0; i--) {
    if (plan.value.days[i].stores.length > 0) {
      currentDayIdx = i
      break
    }
  }
  if (currentDayIdx < 0) return

  const currentDay = plan.value.days[currentDayIdx]
  const lastStore = currentDay.stores[currentDay.stores.length - 1]
  const currentLocation = { lat: lastStore.latitude!, lon: lastStore.longitude! }

  // 收集剩余未访问门店：
  // 1. 当天已过门店不算（保留当天后半段的）
  // 2. 后续所有天的门店 + 被跳过的门店全部纳入
  const visitedIds = new Set<string>()
  // 当天前半段视为已访问
  const midIdx = Math.floor(currentDay.stores.length / 2)
  for (let i = 0; i < midIdx; i++) {
    visitedIds.add(currentDay.stores[i].id)
  }
  // 之前所有天的门店全部视为已访问
  for (let i = 0; i < currentDayIdx; i++) {
    for (const s of plan.value.days[i].stores) {
      visitedIds.add(s.id)
    }
  }

  // 从全部门店中筛选未访问的
  const remainingStores = stores.value.filter((s) => !visitedIds.has(s.id) && s.longitude != null && s.latitude != null)

  if (remainingStores.length === 0) return

  hasRealDriving.value = false
  importStage.value = 'geocoding'
  geocodeProgress.value = { current: 0, total: remainingStores.length }

  try {
    await replan(currentLocation, remainingStores)
    await enrichDriving((cur, total) => {
      geocodeProgress.value = { current: cur, total }
    })
    hasRealDriving.value = true
    importMsg.value = ''
    importStage.value = 'done'
    setTimeout(() => {
      importStage.value = 'idle'
    }, 2000)
  } catch {
    importStage.value = 'idle'
  }
}

// ── 门店 CRUD ──
function handleAdd(): void {
  editingStore.value = null
  showForm.value = true
}

function handleEdit(store: Store): void {
  editingStore.value = store
  showForm.value = true
}

function handleSave(store: Store): void {
  if (editingStore.value) {
    updateStore(store.id, store)
  } else {
    addStore(store)
  }
  saveCache()
}

function handleRemove(id: string): void {
  removeStore(id)
  saveCache()
}

/** 跳过/取消跳过整个城市 */
function handleSkipCity(city: string): void {
  const cityStores = stores.value.filter((s) => s.city === city)
  if (cityStores.length === 0) return
  // 如果该城市所有门店都已跳过，则取消跳过；否则全部跳过
  const allSkipped = cityStores.every((s) => s.skipped)
  for (const s of cityStores) {
    if (s.skipped !== !allSkipped) {
      toggleSkip(s.id)
    }
  }
  saveCache()
}

/** 删除整个城市的所有门店 */
function handleRemoveCity(city: string): void {
  const ids = stores.value.filter((s) => s.city === city).map((s) => s.id)
  for (const id of ids) {
    removeStore(id)
  }
  saveCache()
}

// ── 高德 Key ──
function handleSaveKey(): void {
  if (amapKeyInput.value.trim()) {
    // 只进内存（setAmapKey 持有本次会话的有效 key）。此前这里还写了一份
    // localStorage['amap-user-key']，但全仓没有任何读取点 —— 既没起到"刷新后恢复"的作用，
    // 又在共享电脑上留下持久副本。改用会话内存：刷新后需要重填（demo 站点本就可重填）。
    setAmapKey(amapKeyInput.value.trim())
    showKeyInput.value = false
  }
}

// ── 导出结果（含已解析坐标） ──
function downloadResult(): void {
  if (stores.value.length === 0) return

  // CSV with BOM for Excel
  const header = '门店名,四级乡镇,详细地址,联系人,电话,经度,纬度,坐标来源\n'
  const rows = stores.value.map((s) => {
    const cols = [
      s.name,
      s.fullAddr || [s.province, s.city, s.district, s.town].filter(Boolean).join(''),
      s.address,
      s.contact,
      s.phone,
      s.longitude ?? '',
      s.latitude ?? '',
      s.coordSource || '',
    ]
    // CSV 转义：含逗号或引号的字段用引号包裹
    return cols
      .map((c) => {
        const str = String(c)
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
      })
      .join(',')
  })

  const csv = '\uFEFF' + header + rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const ts = new Date().toISOString().slice(0, 10)
  a.download = `门店路线规划结果_${ts}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
function downloadTemplate(): void {
  // 生成一个简单的 CSV 模板（比 xlsx 更通用，任何表格软件都能打开）
  const csvContent =
    '\uFEFF门店名,省,市,区/县,镇/乡,详细地址,联系人,电话,经度,纬度\n示例门店,湖南省,长沙市,芙蓉区,xx街道,五一大道xx号,张三,13800138000,112.98,28.19\n'
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '门店导入模板.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ── 清空 ──
function handleClear(): void {
  clearAll()
  resetPlanner()
  hasRealDriving.value = false
  localStorage.removeItem(CACHE_KEY)
  localStorage.removeItem(CACHE_START_KEY)
}

// ── 页面加载：恢复缓存起点 → 定位 ──
onMounted(() => {
  // 门店单例（useStoreData）已由模块级 loadFromStorage 从 localStorage 恢复，无需重复导入
  // 此处只恢复自定义起点（CACHE_KEY 与单例 STORAGE_KEY 相同，缓存里的门店数据即单例已有数据）
  const cached = loadCache()
  if (cached?.startPoint) {
    startPoint.value = cached.startPoint
  }

  // 空 stores 时不再请求 /default-stores.xlsx（2026-10-31，R5-A10 核对）：
  // 该文件从未入库，Vite SPA fallback 把它返回成 index.html（200 + text/html），
  // content-type 守卫拦掉后等于每次进入页面都发一次永远不可能成功的请求
  // （DevTools 里每次都有这条误导性请求）。示例数据请点「下载模板」或「导入 Excel」。

  // GPS 静默定位
  setTimeout(() => {
    if (!startPoint.value) {
      handleLocate(true)
    }
  }, 500)
})
</script>

<template>
  <div class="route-planner">
    <!-- 顶部栏 -->
    <header class="header">
      <h1>🗺️ 门店巡访路线规划器</h1>
      <div class="header-actions">
        <button class="btn-locate" :disabled="locating" title="用 GPS 定位当前位置作为起点" @click="handleLocate()">
          {{ locating ? '📍 定位中...' : '📍 我的位置' }}
        </button>
        <button class="btn-template" title="下载 Excel 导入模板" @click="downloadTemplate">📥 下载模板</button>
        <button class="btn-export" title="导出含坐标的完整数据" :disabled="stores.length === 0" @click="downloadResult">
          💾 导出结果
        </button>
        <label class="btn-import">
          📂 导入 Excel
          <input type="file" accept=".xlsx,.xls,.csv" style="display: none" @change="handleFileChange" />
        </label>
        <button class="btn-key" @click="showKeyInput = !showKeyInput">🔑 设置Key</button>
        <button class="btn-clear" @click="handleClear">🗑️ 清空</button>
      </div>
    </header>

    <!-- Key 输入 -->
    <div v-if="showKeyInput" class="key-bar">
      <input
        v-model="amapKeyInput"
        type="text"
        placeholder="输入高德 REST API Key（用于地理编码和路线规划，去控制台申请）"
      />
      <button @click="handleSaveKey">保存</button>
      <p class="key-hint">💡 Key 仅保存在浏览器本地，不会上传到任何服务器。没有 Key 也能使用估算功能</p>
    </div>

    <!-- GPS 定位错误 -->
    <div v-if="locateError" class="locate-error-bar">
      ⚠️ {{ locateError }}
      <button @click="locateError = ''">✕</button>
    </div>

    <!-- 起点 -->
    <div class="start-point-bar" :class="{ 'no-gps': !startPoint || startPoint.lat === 0 }">
      <template v-if="startPoint && startPoint.lat !== 0">
        🚩 起点：{{ startPoint.name }}（{{ startPoint.lat.toFixed(4) }}, {{ startPoint.lon.toFixed(4) }}）
        <button class="btn-start-reset" title="清除起点" @click="startPoint = null">✕</button>
      </template>
      <div class="start-input-row">
        <input
          v-model="customStartInput"
          type="text"
          placeholder="输入起点地名，如「浏阳市永安镇」"
          class="start-input"
          @keyup.enter="handleSetCustomStart"
        />
        <button
          class="btn-start-set"
          :disabled="searchingStart || !customStartInput.trim()"
          @click="handleSetCustomStart"
        >
          {{ searchingStart ? '搜索中...' : '设为起点' }}
        </button>
      </div>
    </div>

    <!-- 导入进度 -->
    <div v-if="importStage !== 'idle'" class="import-bar">
      <ImportProgress
        v-if="importStage === 'geocoding'"
        :current="geocodeProgress.current"
        :total="geocodeProgress.total"
        :label="hasRealDriving ? '获取驾车数据中...' : '地理编码中...'"
      />
      <p v-else-if="importStage === 'parsing'" class="import-status">📄 解析 Excel...</p>
      <p v-else-if="importStage === 'done'" class="import-status success">
        {{ importMsg || '✅ 操作完成' }}
      </p>
    </div>

    <!-- 三栏主体 -->
    <div class="main-layout">
      <!-- 左：门店管理 -->
      <aside class="left-panel" :class="{ collapsed: leftCollapsed }">
        <StorePanel
          v-if="!leftCollapsed"
          :stores="stores"
          @add="handleAdd"
          @edit="handleEdit"
          @remove="handleRemove"
          @toggle-skip="toggleSkip"
          @skip-city="handleSkipCity"
          @remove-city="handleRemoveCity"
        />
      </aside>

      <!-- 折叠按钮 -->
      <button
        class="collapse-btn"
        :title="leftCollapsed ? '展开门店列表' : '收起门店列表'"
        @click="leftCollapsed = !leftCollapsed"
      >
        {{ leftCollapsed ? '▶' : '◀' }}
      </button>

      <!-- 中：地图 -->
      <section class="center-panel">
        <RouteMap :stores="stores" :plan="plan" />
      </section>

      <!-- 右：结果 -->
      <aside class="right-panel">
        <div class="result-actions">
          <button class="btn-generate" :disabled="!canGenerate" @click="handleGenerate">
            🚀 {{ plan ? '重新生成' : '生成路线' }}
          </button>
          <div class="target-days">
            <label class="days-label">计划</label>
            <input
              v-model.number="targetDays"
              type="number"
              min="0"
              max="30"
              placeholder="自动"
              class="days-input"
              title="0=自动计算，输入数字指定计划天数"
            />
            <span class="days-suffix">天</span>
          </div>
          <button
            v-if="plan"
            class="btn-replan"
            :disabled="loading"
            title="从当前位置（当天最后一家门店）重新规划剩余路线"
            @click="handleReplan"
          >
            🔄 重新规划
          </button>
        </div>
        <RouteResult
          :plan="plan"
          :loading="loading"
          :enriching="enriching"
          :has-real-driving="hasRealDriving"
          :start-point-name="actualStartName"
        />
      </aside>
    </div>

    <!-- 添加/编辑弹窗 -->
    <StoreFormModal :visible="showForm" :store="editingStore" @close="showForm = false" @save="handleSave" />
  </div>
</template>

<style scoped>
.route-planner {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--vcl-color-bg);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(12px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  background: var(--vcl-color-surface);
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.header h1 {
  font-size: calc(18px * var(--vcl-scale));
  font-weight: 700;
  color: var(--vcl-color-text);
  margin: 0;
}

.header-actions {
  display: flex;
  gap: calc(10px * var(--vcl-scale));
}

.btn-template,
.btn-locate,
.btn-import,
.btn-key,
.btn-clear {
  padding: calc(6px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: var(--vcl-color-surface);
  color: var(--vcl-color-text-secondary);
  transition: all 0.15s;
}

.btn-template {
  color: var(--vcl-color-primary-on-surface);
  border-color: #bfdbfe;
  background: var(--vcl-color-primary-light);
}

.btn-template:hover {
  background: var(--vcl-color-primary-soft);
  border-color: #93c5fd;
}

.btn-export {
  padding: calc(6px * var(--vcl-scale)) calc(14px * var(--vcl-scale));
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  cursor: pointer;
  border: 1px solid #e2e8f0;
  background: var(--vcl-color-surface);
  color: var(--vcl-color-text-secondary);
  transition: all 0.15s;
  color: var(--vcl-color-success-text);
  border-color: #a7f3d0;
  background: var(--vcl-color-success-bg);
}

.btn-export:hover:not(:disabled) {
  background: var(--vcl-color-success-bg);
  border-color: #6ee7b7;
}

.btn-export:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-locate {
  color: var(--vcl-color-success-text);
  border-color: #a7f3d0;
  background: var(--vcl-color-success-bg);
}

.btn-locate:hover:not(:disabled) {
  background: var(--vcl-color-success-bg);
  border-color: #6ee7b7;
}

.btn-locate:disabled {
  opacity: 0.6;
  cursor: wait;
}

.btn-import:hover,
.btn-key:hover {
  background: var(--vcl-color-bg-soft);
  border-color: #cbd5e1;
}

.btn-clear:hover {
  background: var(--vcl-color-danger-bg);
  border-color: #fca5a5;
  color: var(--vcl-color-danger);
}

.key-bar {
  display: flex;
  align-items: center;
  gap: calc(10px * var(--vcl-scale));
  padding: calc(10px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  background: var(--vcl-color-warning-bg);
  border-bottom: 1px solid #fef08a;
}

.key-bar input {
  flex: 1;
  padding: calc(6px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border: 1px solid #fde047;
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  outline: none;
}

.key-bar button {
  padding: calc(6px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: calc(6px * var(--vcl-scale));
  cursor: pointer;
  font-size: calc(13px * var(--vcl-scale));
}

.key-hint {
  font-size: calc(11px * var(--vcl-scale));
  color: var(--vcl-color-warning-text);
  margin: 0;
  white-space: nowrap;
}

/* GPS 定位错误 */
.locate-error-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(8px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  background: var(--vcl-color-danger-bg);
  border-bottom: 1px solid #fecaca;
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-danger);
}

.locate-error-bar button {
  background: none;
  border: none;
  font-size: calc(16px * var(--vcl-scale));
  cursor: pointer;
  color: var(--vcl-color-danger);
}

/* 起点提示 */
.start-point-bar {
  padding: calc(6px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  background: var(--vcl-color-success-bg);
  border-bottom: 1px solid #bbf7d0;
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-success-text);
  display: flex;
  align-items: center;
  gap: calc(8px * var(--vcl-scale));
  flex-wrap: wrap;
}

.start-point-bar.no-gps {
  background: var(--vcl-color-warning-bg);
  border-color: #fde68a;
  color: var(--vcl-color-warning-text);
}

.start-input-row {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
  flex: 1;
  min-width: calc(280px * var(--vcl-scale));
}

.start-input {
  flex: 1;
  padding: calc(5px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  border: 1px solid #d1d5db;
  border-radius: calc(5px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  outline: none;
  transition: border-color 0.15s;
  min-width: calc(200px * var(--vcl-scale));
}

.start-input:focus {
  border-color: var(--vcl-color-primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.btn-start-set {
  padding: calc(5px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: calc(5px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.btn-start-set:hover:not(:disabled) {
  background: #2563eb;
}

.btn-start-set:disabled {
  background: var(--vcl-color-border);
  cursor: not-allowed;
}

.btn-start-reset {
  background: none;
  border: none;
  font-size: calc(14px * var(--vcl-scale));
  cursor: pointer;
  color: #94a3b8;
  padding: 0 2px;
  line-height: 1;
}

.btn-start-reset:hover {
  color: var(--vcl-color-danger);
}

.import-bar {
  padding: calc(8px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  background: var(--vcl-color-surface);
  border-bottom: 1px solid #e2e8f0;
}

.import-status {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin: 0;
}

.import-status.success {
  color: #10b981;
}

.main-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.left-panel {
  width: calc(300px * var(--vcl-scale));
  flex-shrink: 0;
  border-right: 1px solid #e2e8f0;
  background: var(--vcl-color-surface);
  overflow: hidden;
  transition: width 0.25s ease;
}

.left-panel.collapsed {
  width: 0;
  border-right: none;
}

/* 折叠按钮 */
.collapse-btn {
  width: calc(20px * var(--vcl-scale));
  flex-shrink: 0;
  background: var(--vcl-color-bg-soft);
  border: none;
  border-right: 1px solid #e2e8f0;
  cursor: pointer;
  font-size: calc(10px * var(--vcl-scale));
  color: #94a3b8;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  z-index: 5;
}

.collapse-btn:hover {
  background: var(--vcl-color-bg-alt);
  color: var(--vcl-color-text-muted);
}

.center-panel {
  flex: 1;
  overflow: hidden;
}

.right-panel {
  width: calc(340px * var(--vcl-scale));
  flex-shrink: 0;
  border-left: 1px solid #e2e8f0;
  background: var(--vcl-color-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.result-actions {
  display: flex;
  gap: calc(8px * var(--vcl-scale));
  padding: calc(10px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.btn-generate {
  flex: 1;
  padding: calc(8px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-generate:hover:not(:disabled) {
  background: #2563eb;
}

.btn-generate:disabled {
  background: var(--vcl-color-border);
  cursor: not-allowed;
}

.target-days {
  display: flex;
  align-items: center;
  gap: calc(3px * var(--vcl-scale));
  padding: 0 calc(4px * var(--vcl-scale));
  border: 1px solid #e2e8f0;
  border-radius: calc(6px * var(--vcl-scale));
  background: var(--vcl-color-surface);
}

.days-label {
  font-size: calc(11px * var(--vcl-scale));
  color: #94a3b8;
  white-space: nowrap;
}

.days-input {
  width: calc(36px * var(--vcl-scale));
  padding: calc(5px * var(--vcl-scale)) 2px;
  border: none;
  outline: none;
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text);
  text-align: center;
  background: transparent;
}

.days-input::placeholder {
  color: #cbd5e1;
  font-weight: 400;
  font-size: calc(11px * var(--vcl-scale));
}

.days-suffix {
  font-size: calc(11px * var(--vcl-scale));
  color: #94a3b8;
}

.btn-replan {
  padding: calc(8px * var(--vcl-scale)) calc(12px * var(--vcl-scale));
  background: var(--vcl-color-success-bg);
  color: var(--vcl-color-success-text);
  border: 1px solid #bbf7d0;
  border-radius: calc(6px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.btn-replan:hover:not(:disabled) {
  background: var(--vcl-color-success-bg);
  border-color: #86efac;
}

.btn-replan:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
