<script setup lang="ts">
/**
 * 路线规划结果 — 分天展示（简洁版）
 * - 默认折叠，只显示关键信息
 * - 点击展开当天详情
 * - 当前天高亮
 */
import { ref, computed } from 'vue'
import { calculateDistance } from '@/components/geolocation/geolocation'
import type { RoutePlan, NavLink, Store } from '@/components/route-planner/types'

const props = defineProps<{
  plan: RoutePlan | null
  loading: boolean
  enriching: boolean
  /** 是否已获取实测驾车数据（用于区分估算/实测标识） */
  hasRealDriving?: boolean
  /** 起点名称（如"我的位置"），用于路线概览展示 */
  startPointName?: string
}>()

/** 当前展开的天（默认展开第一天） */
const expandedDay = ref(1)
/** 当前进行中的天（高亮显示） */
const currentDay = ref(1)

/** 格式化时间 */
function formatTime(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}分钟`
  if (m === 0) return `${h}小时`
  return `${h}小时${m}分钟`
}

/** 格式化距离 */
function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}米`
  return `${(m / 1000).toFixed(1)}公里`
}

/** 两点间估算距离和驾驶时间 */
function segmentInfo(a: Store, b: Store): { dist: string; time: string } | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null
  const distM = calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude)
  const roadM = distM * 1.4
  const timeMin = Math.round(roadM / (50 * 1000 / 60))
  return { dist: formatDistance(roadM), time: formatTime(timeMin) }
}

/** 展开/折叠当天 */
function toggleDay(day: number): void {
  expandedDay.value = expandedDay.value === day ? 0 : day
}

/** 打开导航链接 */
function openNav(link: NavLink): void {
  window.open(link.url, '_blank')
}

/** 标记当前天为进行中 */
function setCurrentDay(day: number): void {
  currentDay.value = day
}

/** 总驾驶时间 */
const totalDriveTime = computed(() => {
  if (!props.plan) return '—'
  return formatTime(props.plan.totalDrivingTimeMin)
})

/** 总距离 */
const totalDist = computed(() => {
  if (!props.plan) return '—'
  return formatDistance(props.plan.totalDrivingDistanceM)
})

/** 计算某天的门店密度（家/100km），距离为 0 时返回 null */
function storeDensity(day: { stores: { length: number }; drivingDistanceM: number }): number | null {
  if (day.drivingDistanceM <= 0 || day.stores.length === 0) return null
  return Math.round((day.stores.length / (day.drivingDistanceM / 1000)) * 100)
}

/** 密度等级 */
function densityLabel(density: number | null): { text: string; cls: string } {
  if (density == null) return { text: '', cls: '' }
  if (density >= 10) return { text: `${density}家/100km`, cls: 'density-good' }
  if (density >= 4) return { text: `${density}家/100km`, cls: 'density-ok' }
  return { text: `⚠️ ${density}家/100km`, cls: 'density-low' }
}
</script>

<template>
  <div class="route-result">
    <!-- 加载中 -->
    <div v-if="loading" class="state-loading">
      <div class="spinner" />
      <p>正在规划路线...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!plan" class="state-empty">
      <p>📋 暂无路线方案</p>
      <div class="empty-steps">
        <div class="empty-step"><span class="step-num">①</span> 导入或添加门店</div>
        <div class="empty-step"><span class="step-num">②</span> 点击「生成路线」</div>
        <div class="empty-step"><span class="step-num">③</span> 查看地图和分天计划</div>
      </div>
    </div>

    <!-- 结果 -->
    <div v-else class="result-content">
      <!-- 汇总卡片 -->
      <div class="summary-card">
        <div class="summary-title">
          📋 巡访路线总览
          <span v-if="hasRealDriving" class="source-badge real">🛣️ 驾车实测</span>
          <span v-else class="source-badge estimated">📏 直线估算</span>
        </div>
        <div class="summary-stats">
          <div class="stat">
            <span class="stat-num">{{ plan.totalDays }}</span>
            <span class="stat-label">天</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ plan.totalStores }}</span>
            <span class="stat-label">家门店</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ totalDist }}</span>
            <span class="stat-label">总里程</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ totalDriveTime }}</span>
            <span class="stat-label">总驾驶</span>
          </div>
        </div>
        <div class="summary-route">
          🚩 {{ startPointName || '起点' }}出发 → {{ plan.totalDays }}天巡访 → 🏁 返回{{ startPointName || '起点' }}
        </div>
      </div>

      <p v-if="enriching" class="enriching-tip">🔄 正在获取实际驾车数据...</p>

      <!-- 分天列表 -->
      <div class="day-list">
        <div
          v-for="(day, dayIdx) in plan.days"
          :key="day.day"
          class="day-card"
          :class="{
            expanded: expandedDay === day.day,
            current: currentDay === day.day,
            completed: currentDay > day.day,
          }"
        >
          <!-- 天头（始终显示） -->
          <div class="day-header" @click="toggleDay(day.day)">
            <div class="day-header-left">
              <span class="day-badge" :class="{ current: currentDay === day.day }">
                {{ day.day }}
              </span>
              <span class="day-summary-text">
                {{ day.stores.length }}家 · {{ formatTime(day.drivingTimeMin) }} · {{ formatDistance(day.drivingDistanceM) }}
                <span
                  v-if="storeDensity(day) != null"
                  class="density-tag"
                  :class="densityLabel(storeDensity(day)).cls"
                >{{ densityLabel(storeDensity(day)).text }}</span>
              </span>
            </div>
            <div class="day-header-right">
              <span class="day-cities">
                <template v-if="dayIdx === 0 && startPointName">🚩{{ startPointName }} → </template>
                {{ [...new Set(day.stores.map(s => s.city))].join(' → ') }}
              </span>
              <span class="expand-icon">{{ expandedDay === day.day ? '▲' : '▼' }}</span>
            </div>
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedDay === day.day" class="day-detail">
            <!-- 导航按钮 -->
            <div v-if="day.navLink" class="day-nav">
              <button class="btn-nav-day" @click="openNav(day.navLink)">
                📱 开始导航
              </button>
              <button class="btn-set-current" @click="setCurrentDay(day.day)">
                📍 标记为当前
              </button>
            </div>

            <!-- 路线概览 -->
            <div class="route-overview">
              <div class="route-start">
                <span class="route-icon">{{ dayIdx === 0 ? '🚩' : '🏨' }}</span>
                <span>{{ dayIdx === 0 ? (startPointName ? `从「${startPointName}」出发` : '从起点出发') : '继续出发' }}</span>
              </div>
              <div class="route-arrow">↓</div>
              <div class="route-stores-brief">
                <span v-for="s in day.stores" :key="s.id" class="store-chip">
                  {{ s.name.length > 6 ? s.name.slice(0, 6) + '…' : s.name }}
                </span>
              </div>
              <div class="route-arrow">↓</div>
              <div class="route-end">
                <span class="route-icon">{{ dayIdx === plan.days.length - 1 ? '🏁' : '🏨' }}</span>
                <span>{{ dayIdx === plan.days.length - 1 ? '回到起点' : '结束当天' }}</span>
                <span v-if="dayIdx === plan.days.length - 1 && day.returnLeg" class="return-info">
                  · {{ formatDistance(day.returnLeg.distanceM) }}
                </span>
              </div>
            </div>

            <!-- 门店列表（含段距离） -->
            <div class="store-list">
              <div v-for="(store, idx) in day.stores" :key="store.id" class="store-item">
                <span class="store-num">{{ idx + 1 }}</span>
                <div class="store-main">
                  <span class="store-name">{{ store.name }}</span>
                  <span class="store-city">{{ store.city }}</span>
                </div>
                <div class="store-segment">
                  <template v-if="idx < day.stores.length - 1">
                    <span v-if="segmentInfo(store, day.stores[idx + 1])" class="seg-info">
                      → {{ segmentInfo(store, day.stores[idx + 1])!.dist }} · {{ segmentInfo(store, day.stores[idx + 1])!.time }}
                    </span>
                    <span v-else class="seg-info seg-no-data">→ 无坐标</span>
                  </template>
                  <template v-else>
                    <span class="seg-info seg-end">
                      {{ dayIdx === plan!.days.length - 1 ? '→ 返回起点' : '' }}
                    </span>
                  </template>
                </div>
                <button
                  v-if="day.legNavLinks && day.legNavLinks[idx]"
                  class="btn-nav-mini"
                  :title="day.legNavLinks[idx].label"
                  @click="openNav(day.legNavLinks[idx])"
                >
                  导航
                </button>
              </div>
              </div>
            </div>
        </div>
      </div>

      <!-- 跳过列表 -->
      <div v-if="plan.skippedStores.length > 0" class="skipped-section">
        <div class="skipped-header">
          ⚠️ {{ plan.skippedStores.length }} 家门店未纳入计划
          <span class="skipped-reason">（路途遥远 或 超出计划天数）</span>
        </div>
        <div class="skipped-list">
          <div v-for="store in plan.skippedStores" :key="store.id" class="skipped-item">
            {{ store.name }}（{{ store.city }}）
          </div>
        </div>
        <p class="skipped-hint">💡 这些门店偏离主路线太远，点击「重新生成」可重新计算</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.route-result {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.state-loading,
.state-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #3b82f6;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.state-empty .hint {
  font-size: 12px;
  margin-top: 4px;
}

.empty-steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  text-align: left;
}

.empty-step {
  font-size: 12px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #e0f2fe;
  color: #0369a1;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

/* 汇总卡片 */
.summary-card {
  background: linear-gradient(135deg, #f0fdf4, #dcfce7);
  border: 1px solid #bbf7d0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
}

.summary-title {
  font-size: 14px;
  font-weight: 700;
  color: #166534;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

.source-badge.real {
  background: #dcfce7;
  color: #166534;
}

.source-badge.estimated {
  background: #fef3c7;
  color: #92400e;
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 8px;
}

.stat {
  text-align: center;
}

.stat-num {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.stat-label {
  font-size: 10px;
  color: #94a3b8;
}

.summary-route {
  font-size: 11px;
  color: #166534;
  text-align: center;
  padding-top: 6px;
  border-top: 1px dashed #bbf7d0;
}

.enriching-tip {
  font-size: 12px;
  color: #3b82f6;
  text-align: center;
  margin: 0 0 10px;
}

/* 分天列表 */
.day-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.day-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.day-card.current {
  border-color: #3b82f6;
  box-shadow: 0 0 0 1px #3b82f6;
}

.day-card.completed {
  opacity: 0.6;
}

.day-card.expanded {
  border-color: #3b82f6;
}

/* 天头 */
.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  background: #f8fafc;
  cursor: pointer;
  user-select: none;
}

.day-header:hover {
  background: #f1f5f9;
}

.day-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.day-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #e2e8f0;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-badge.current {
  background: #3b82f6;
  color: #fff;
}

.day-summary-text {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

/* 门店密度标签 */
.density-tag {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 8px;
  white-space: nowrap;
}

.density-good {
  background: #dcfce7;
  color: #166534;
}

.density-ok {
  background: #fef3c7;
  color: #92400e;
}

.density-low {
  background: #fef2f2;
  color: #dc2626;
}

.day-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.day-cities {
  font-size: 10px;
  color: #94a3b8;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  font-size: 9px;
  color: #94a3b8;
}

/* 展开详情 */
.day-detail {
  padding: 10px;
  border-top: 1px solid #f1f5f9;
}

/* 导航按钮 */
.day-nav {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.btn-nav-day {
  flex: 1;
  padding: 8px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.btn-nav-day:hover {
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}

.btn-set-current {
  padding: 8px 10px;
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

/* 路线概览 */
.route-overview {
  background: #f8fafc;
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 10px;
}

.route-start,
.route-end {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #64748b;
}

.route-icon {
  font-size: 14px;
}

.route-arrow {
  text-align: center;
  font-size: 10px;
  color: #cbd5e1;
  margin: 2px 0;
}

.route-stores-brief {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 0;
}

.store-chip {
  padding: 2px 6px;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 4px;
  font-size: 10px;
  white-space: nowrap;
}

.return-info {
  color: #f59e0b;
  font-weight: 500;
}

/* 门店列表 */
.store-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
}

.store-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 4px;
  background: #fafafa;
}

.store-item:hover {
  background: #f1f5f9;
}

.store-num {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #3b82f6;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.store-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.store-name {
  font-size: 12px;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-city {
  font-size: 9px;
  color: #94a3b8;
  flex-shrink: 0;
}

.store-segment {
  flex-shrink: 0;
}

.seg-info {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 4px;
}

.seg-end {
  color: #f59e0b;
  background: #fef3c7;
}

.btn-nav-mini {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  padding: 2px 6px;
  flex-shrink: 0;
  color: #2563eb;
  font-weight: 500;
}

.btn-nav-mini:hover {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

/* 跳过列表 */
.skipped-section {
  margin-top: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 10px;
}

.skipped-header {
  font-size: 12px;
  font-weight: 600;
  color: #92400e;
  margin-bottom: 6px;
}

.skipped-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 0;
}

.skipped-item {
  font-size: 10px;
  color: #78716c;
  padding: 2px 6px;
  background: #fef3c7;
  border-radius: 4px;
}

.skipped-hint {
  font-size: 10px;
  color: #a16207;
  margin: 6px 0 0;
}
</style>
