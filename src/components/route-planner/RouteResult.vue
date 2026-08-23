<script setup lang="ts">
/**
 * 路线规划结果 — 分天展示（简洁版）
 * - 默认折叠，只显示关键信息
 * - 点击展开当天详情
 * - 当前天高亮
 */
import { ref, computed } from 'vue'
import { calcDistance as calculateDistance } from '@/components/amap/amap-service'
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
  const timeMin = Math.round(roadM / ((50 * 1000) / 60))
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
                {{ day.stores.length }}家 · {{ formatTime(day.drivingTimeMin) }} ·
                {{ formatDistance(day.drivingDistanceM) }}
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
                {{ [...new Set(day.stores.map((s) => s.city))].join(' → ') }}
              </span>
              <span class="expand-icon">{{ expandedDay === day.day ? '▲' : '▼' }}</span>
            </div>
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedDay === day.day" class="day-detail">
            <!-- 导航按钮 -->
            <div v-if="day.navLink" class="day-nav">
              <button class="btn-nav-day" @click="openNav(day.navLink)">📱 开始导航</button>
              <button class="btn-set-current" @click="setCurrentDay(day.day)">📍 标记为当前</button>
            </div>

            <!-- 路线概览 -->
            <div class="route-overview">
              <div class="route-start">
                <span class="route-icon">{{ dayIdx === 0 ? '🚩' : '🏨' }}</span>
                <span>{{
                  dayIdx === 0 ? (startPointName ? `从「${startPointName}」出发` : '从起点出发') : '继续出发'
                }}</span>
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
                      → {{ segmentInfo(store, day.stores[idx + 1])!.dist }} ·
                      {{ segmentInfo(store, day.stores[idx + 1])!.time }}
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
  color: var(--color-text-muted);
  font-size: var(--ctrl-font-size);
}

.spinner {
  width: clamp(28px, 4vw, 32px);
  height: clamp(28px, 4vw, 32px);
  border: 3px solid var(--color-border-light);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: var(--space-3);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.state-empty .hint {
  font-size: clamp(11px, 1.5vw, 15px);
  margin-top: var(--space-1);
}

.empty-steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-top: var(--space-3);
  text-align: left;
}

.empty-step {
  font-size: clamp(11px, 1.5vw, 15px);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(18px, 2.5vw, 20px);
  height: clamp(18px, 2.5vw, 20px);
  border-radius: 50%;
  background: var(--color-info-bg);
  color: var(--color-info-text);
  font-size: clamp(10px, 1.3vw, 15px);
  font-weight: 600;
  flex-shrink: 0;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
}

/* 汇总卡片 */
.summary-card {
  background: linear-gradient(135deg, var(--color-success-bg), var(--color-success-bg));
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}

.summary-title {
  font-size: var(--ctrl-font-size);
  font-weight: 700;
  color: var(--color-success-text);
  margin-bottom: var(--space-2);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.source-badge {
  font-size: clamp(10px, 1.3vw, 13px);
  font-weight: 500;
  padding: var(--space-0) 6px;
  border-radius: var(--radius-lg);
  white-space: nowrap;
}

.source-badge.real {
  background: var(--color-success-bg);
  color: var(--color-success-text);
}

.source-badge.estimated {
  background: var(--color-warning-bg);
  color: var(--color-warning-text);
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}

.stat {
  text-align: center;
}

.stat-num {
  display: block;
  font-size: clamp(14px, 2.2vw, 36px);
  font-weight: 700;
  color: var(--color-text);
}

.stat-label {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-muted);
}

.summary-route {
  font-size: clamp(10px, 1.3vw, 15px);
  color: var(--color-success-text);
  text-align: center;
  padding-top: var(--space-1);
  border-top: 1px dashed var(--color-success-border);
}

.enriching-tip {
  font-size: clamp(11px, 1.5vw, 15px);
  color: var(--color-primary);
  text-align: center;
  margin: 0 0 var(--space-2);
}

/* 分天列表 */
.day-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.day-card {
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  transition: all 0.2s;
}

.day-card.current {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

.day-card.completed {
  opacity: 0.6;
}

.day-card.expanded {
  border-color: var(--color-primary);
}

/* 天头 */
.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg);
  cursor: pointer;
  user-select: none;
}

.day-header:hover {
  background: var(--color-bg-alt);
}

.day-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.day-badge {
  width: clamp(20px, 2.8vw, 22px);
  height: clamp(20px, 2.8vw, 22px);
  border-radius: 50%;
  background: var(--color-border-light);
  color: var(--color-text-secondary);
  font-size: clamp(10px, 1.3vw, 15px);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-badge.current {
  background: var(--color-primary);
  color: var(--color-surface);
}

.day-summary-text {
  font-size: clamp(11px, 1.5vw, 15px);
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: var(--space-1);
  flex-wrap: wrap;
}

/* 门店密度标签 */
.density-tag {
  font-size: clamp(10px, 1.3vw, 13px);
  font-weight: 500;
  padding: var(--space-1) var(--space-1);
  border-radius: var(--radius-md);
  white-space: nowrap;
}

.density-good {
  background: var(--color-success-bg);
  color: var(--color-success-text);
}

.density-ok {
  background: var(--color-warning-bg);
  color: var(--color-warning-text);
}

.density-low {
  background: var(--color-danger-bg);
  color: var(--color-danger-hover);
}

.day-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.day-cities {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-muted);
  max-width: clamp(100px, 12vw, 120px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  font-size: clamp(8px, 1.1vw, 9px);
  color: var(--color-text-muted);
}

/* 展开详情 */
.day-detail {
  padding: var(--space-2);
  border-top: 1px solid var(--color-bg-alt);
}

/* 导航按钮 */
.day-nav {
  display: flex;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
}

.btn-nav-day {
  flex: 1;
  padding: var(--space-2);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: var(--color-surface);
  border: none;
  border-radius: var(--radius-md);
  font-size: clamp(11px, 1.5vw, 15px);
  font-weight: 600;
  cursor: pointer;
}

.btn-nav-day:hover {
  box-shadow: var(--shadow-sm);
}

.btn-set-current {
  padding: var(--space-2) var(--space-3);
  background: var(--color-success-bg);
  color: var(--color-success-text);
  border: 1px solid var(--color-success-border);
  border-radius: var(--radius-md);
  font-size: clamp(10px, 1.3vw, 15px);
  cursor: pointer;
}

/* 路线概览 */
.route-overview {
  background: var(--color-bg);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  margin-bottom: var(--space-2);
}

.route-start,
.route-end {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: clamp(10px, 1.3vw, 15px);
  color: var(--color-text-secondary);
}

.route-icon {
  font-size: var(--ctrl-font-size);
}

.route-arrow {
  text-align: center;
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-muted);
  margin: var(--space-0) 0;
}

.route-stores-brief {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-1) 0;
}

.store-chip {
  padding: var(--space-0) 6px;
  background: var(--color-info-bg);
  color: var(--color-info-text);
  border-radius: var(--radius-sm);
  font-size: clamp(10px, 1.3vw, 13px);
  white-space: nowrap;
}

.return-info {
  color: var(--color-warning);
  font-weight: 500;
}

/* 门店列表 */
.store-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-0);
  margin-bottom: var(--space-2);
}

.store-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 5px var(--space-1);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}

.store-item:hover {
  background: var(--color-bg-alt);
}

.store-num {
  width: clamp(16px, 2.2vw, 18px);
  height: clamp(16px, 2.2vw, 18px);
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-surface);
  font-size: clamp(10px, 1.3vw, 13px);
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
  font-size: clamp(11px, 1.5vw, 15px);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-city {
  font-size: clamp(8px, 1.1vw, 9px);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.store-segment {
  flex-shrink: 0;
}

.seg-info {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-secondary);
  white-space: nowrap;
  background: var(--color-bg-alt);
  padding: var(--space-1) var(--space-1);;
}

.seg-end {
  color: var(--color-warning);
  background: var(--color-warning-bg);
}

.btn-nav-mini {
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: clamp(10px, 1.3vw, 13px);
  padding: var(--space-0) 6px;
  flex-shrink: 0;
  color: var(--color-primary-hover);
  font-weight: 500;
}

.btn-nav-mini:hover {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-surface);
}

/* 跳过列表 */
.skipped-section {
  margin-top: var(--space-2);
  background: var(--color-warning-bg);
  border: 1px solid var(--color-warning-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
}

.skipped-header {
  font-size: clamp(11px, 1.5vw, 15px);
  font-weight: 600;
  color: var(--color-warning-text);
  margin-bottom: var(--space-1);
}

.skipped-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: var(--space-1) 0;
}

.skipped-item {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-muted);
  padding: var(--space-0) 6px;
  background: var(--color-warning-bg);
  border-radius: var(--radius-sm);
}

.skipped-hint {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-warning-text);
  margin: var(--space-1) 0 0;
}
</style>
