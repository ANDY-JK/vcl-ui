<script setup lang="ts">
/**
 * 路线规划结果 — 分天展示（简洁版）
 * - 默认折叠，只显示关键信息
 * - 点击展开当天详情
 * - 当前天高亮
 */
import { ref, computed } from 'vue'
import { calcDistance as calculateDistance } from '@/components/amap'
import type { RoutePlan, NavLink, Store } from '@/components/route-planner/types'
import { useT } from '@/components/_internal/i18n'
import { DEFAULTS } from './utils/route-planning'

const t = useT()

const props = defineProps<{
  /** 规划结果（按天分组的路线视图；null 渲染空态） */
  plan: RoutePlan | null
  /** 规划计算中 */
  loading: boolean
  /** 实测驾车数据获取中（enrichDriving 进行时） */
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
  if (h === 0) return t('routePlanner.minutes', { m })
  if (m === 0) return t('routePlanner.hours', { h })
  return t('routePlanner.hoursMinutes', { h, m })
}

/** 格式化距离 */
function formatDistance(m: number): string {
  if (m < 1000) return t('routePlanner.meters', { m: Math.round(m) })
  return t('routePlanner.kilometers', { km: (m / 1000).toFixed(1) })
}

/** 当天途经城市串（首日带起点）：模板文本与 title 共用一份，避免两处各拼一遍后不同步 */
function dayCitiesLabel(day: { stores: Store[] }, dayIdx: number): string {
  const head = dayIdx === 0 && props.startPointName ? `🚩${props.startPointName} → ` : ''
  return head + [...new Set(day.stores.map((s) => s.city))].join(' → ')
}

/** 两点间估算距离和驾驶时间 */
function segmentInfo(a: Store, b: Store): { dist: string; time: string } | null {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null
  const distM = calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude)
  const roadM = distM * DEFAULTS.roadFactor
  const timeMin = Math.round(roadM / ((DEFAULTS.avgSpeedKmh * 1000) / 60))
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
  if (density >= 10) return { text: t('routePlanner.densityPer100km', { d: density }), cls: 'density-good' }
  if (density >= 4) return { text: t('routePlanner.densityPer100km', { d: density }), cls: 'density-ok' }
  return { text: t('routePlanner.densityLow', { d: density }), cls: 'density-low' }
}
</script>

<template>
  <div class="route-result">
    <!-- 加载中 -->
    <div v-if="loading" class="state-loading">
      <div class="spinner" />
      <p>{{ t('routePlanner.planning') }}</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!plan" class="state-empty">
      <p>{{ t('routePlanner.noRoute') }}</p>
      <div class="empty-steps">
        <div class="empty-step"><span class="step-num">①</span> {{ t('routePlanner.stepImport') }}</div>
        <div class="empty-step"><span class="step-num">②</span> {{ t('routePlanner.stepGenerate') }}</div>
        <div class="empty-step"><span class="step-num">③</span> {{ t('routePlanner.stepView') }}</div>
      </div>
    </div>

    <!-- 结果 -->
    <div v-else class="result-content">
      <!-- 汇总卡片 -->
      <div class="summary-card">
        <div class="summary-title">
          {{ t('routePlanner.overviewTitle') }}
          <span v-if="hasRealDriving" class="source-badge real">{{ t('routePlanner.realDriving') }}</span>
          <span v-else class="source-badge estimated">{{ t('routePlanner.estimated') }}</span>
        </div>
        <div class="summary-stats">
          <div class="stat">
            <span class="stat-num">{{ plan.totalDays }}</span>
            <span class="stat-label">{{ t('routePlanner.daysLabel') }}</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ plan.totalStores }}</span>
            <span class="stat-label">{{ t('routePlanner.storesLabel') }}</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ totalDist }}</span>
            <span class="stat-label">{{ t('routePlanner.totalDistance') }}</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ totalDriveTime }}</span>
            <span class="stat-label">{{ t('routePlanner.totalDriving') }}</span>
          </div>
        </div>
        <div class="summary-route">
          {{
            t('routePlanner.routeSummary', {
              start: startPointName || t('routePlanner.startPoint'),
              days: plan.totalDays,
            })
          }}
        </div>
      </div>

      <p v-if="enriching" class="enriching-tip">{{ t('routePlanner.enriching') }}</p>

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
          <div
            class="day-header"
            role="button"
            tabindex="0"
            @click="toggleDay(day.day)"
            @keydown.enter="toggleDay(day.day)"
            @keydown.space.prevent="toggleDay(day.day)"
          >
            <div class="day-header-left">
              <span class="day-badge" :class="{ current: currentDay === day.day }">
                {{ day.day }}
              </span>
              <span class="day-summary-text">
                {{ t('routePlanner.dayStores', { count: day.stores.length }) }} · {{ formatTime(day.drivingTimeMin) }} ·
                {{ formatDistance(day.drivingDistanceM) }}
                <span
                  v-if="storeDensity(day) != null"
                  class="density-tag"
                  :class="densityLabel(storeDensity(day)).cls"
                  >{{ densityLabel(storeDensity(day)).text }}</span
                >
              </span>
            </div>
            <div class="day-header-right">
              <span class="day-cities" :title="dayCitiesLabel(day, dayIdx)">{{ dayCitiesLabel(day, dayIdx) }}</span>
              <span class="expand-icon">{{ expandedDay === day.day ? '▲' : '▼' }}</span>
            </div>
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedDay === day.day" class="day-detail">
            <!-- 导航按钮 -->
            <div v-if="day.navLink" class="day-nav">
              <button class="btn-nav-day" @click="openNav(day.navLink)">{{ t('routePlanner.startNav') }}</button>
              <button class="btn-set-current" @click="setCurrentDay(day.day)">
                {{ t('routePlanner.setCurrent') }}
              </button>
            </div>

            <!-- 路线概览 -->
            <div class="route-overview">
              <div class="route-start">
                <span class="route-icon">{{ dayIdx === 0 ? '🚩' : '🏨' }}</span>
                <span>{{
                  dayIdx === 0
                    ? startPointName
                      ? t('routePlanner.fromStart', { name: startPointName })
                      : t('routePlanner.fromStartDefault')
                    : t('routePlanner.continueStart')
                }}</span>
              </div>
              <div class="route-arrow">↓</div>
              <div class="route-stores-brief">
                <span v-for="s in day.stores" :key="s.id" class="store-chip" :title="s.name">
                  {{ s.name.length > 6 ? s.name.slice(0, 6) + '…' : s.name }}
                </span>
              </div>
              <div class="route-arrow">↓</div>
              <div class="route-end">
                <span class="route-icon">{{ dayIdx === plan.days.length - 1 ? '🏁' : '🏨' }}</span>
                <span>{{
                  dayIdx === plan.days.length - 1 ? t('routePlanner.backToStart') : t('routePlanner.endDay')
                }}</span>
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
                  <span class="store-name" :title="store.name">{{ store.name }}</span>
                  <span class="store-city">{{ store.city }}</span>
                </div>
                <div class="store-segment">
                  <template v-if="idx < day.stores.length - 1">
                    <span v-if="segmentInfo(store, day.stores[idx + 1])" class="seg-info">
                      → {{ segmentInfo(store, day.stores[idx + 1])!.dist }} ·
                      {{ segmentInfo(store, day.stores[idx + 1])!.time }}
                    </span>
                    <span v-else class="seg-info seg-no-data">{{ t('routePlanner.noCoord') }}</span>
                  </template>
                  <template v-else>
                    <span class="seg-info seg-end">
                      {{ dayIdx === plan!.days.length - 1 ? t('routePlanner.returnStart') : '' }}
                    </span>
                  </template>
                </div>
                <button
                  v-if="day.legNavLinks && day.legNavLinks[idx]"
                  class="btn-nav-mini"
                  :title="day.legNavLinks[idx].label"
                  @click="openNav(day.legNavLinks[idx])"
                >
                  {{ t('routePlanner.nav') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 跳过列表 -->
      <div v-if="plan.skippedStores.length > 0" class="skipped-section">
        <div class="skipped-header">
          {{ t('routePlanner.skippedWarn', { count: plan.skippedStores.length }) }}
          <span class="skipped-reason">{{ t('routePlanner.skippedReason') }}</span>
        </div>
        <div class="skipped-list">
          <div v-for="store in plan.skippedStores" :key="store.id" class="skipped-item">
            {{ store.name }}（{{ store.city }}）
          </div>
        </div>
        <p class="skipped-hint">{{ t('routePlanner.skippedHint') }}</p>
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
  color: var(--vcl-color-text-muted);
  font-size: var(--vcl-ctrl-font-size);
}

.spinner {
  width: calc(32px * var(--vcl-scale));
  height: calc(32px * var(--vcl-scale));
  border: 3px solid var(--vcl-color-border-light);
  border-top-color: var(--vcl-color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: var(--vcl-space-3);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.state-empty .hint {
  font-size: calc(15px * var(--vcl-scale));
  margin-top: var(--vcl-space-1);
}

.empty-steps {
  display: flex;
  flex-direction: column;
  gap: var(--vcl-space-1);
  margin-top: var(--vcl-space-3);
  text-align: left;
}

.empty-step {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  display: flex;
  align-items: center;
  gap: var(--vcl-space-1);
}

.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(20px * var(--vcl-scale));
  height: calc(20px * var(--vcl-scale));
  border-radius: 50%;
  background: var(--vcl-color-info-bg);
  color: var(--vcl-color-info-text);
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 600;
  flex-shrink: 0;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--vcl-space-2);
}

/* 汇总卡片 */
.summary-card {
  background: linear-gradient(135deg, var(--vcl-color-success-bg), var(--vcl-color-success-bg));
  border: 1px solid var(--vcl-color-success-border);
  border-radius: var(--vcl-radius-lg);
  padding: var(--vcl-space-3);
  margin-bottom: var(--vcl-space-3);
}

.summary-title {
  font-size: var(--vcl-ctrl-font-size);
  font-weight: 700;
  color: var(--vcl-color-success-text);
  margin-bottom: var(--vcl-space-2);
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
}

.source-badge {
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 500;
  padding: var(--vcl-space-0) calc(6px * var(--vcl-scale));
  border-radius: var(--vcl-radius-lg);
  white-space: nowrap;
}

.source-badge.real {
  background: var(--vcl-color-success-bg);
  color: var(--vcl-color-success-text);
}

.source-badge.estimated {
  background: var(--vcl-color-warning-bg);
  color: var(--vcl-color-warning-text);
}

.summary-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--vcl-space-1);
  margin-bottom: var(--vcl-space-2);
}

.stat {
  text-align: center;
}

.stat-num {
  display: block;
  font-size: calc(36px * var(--vcl-scale));
  font-weight: 700;
  color: var(--vcl-color-text);
}

.stat-label {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

.summary-route {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-success-text);
  text-align: center;
  padding-top: var(--vcl-space-1);
  border-top: 1px dashed var(--vcl-color-success-border);
}

.enriching-tip {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-primary);
  text-align: center;
  margin: 0 0 var(--vcl-space-2);
}

/* 分天列表 */
.day-list {
  display: flex;
  flex-direction: column;
  gap: var(--vcl-space-1);
}

.day-card {
  border: 1px solid var(--vcl-color-border-light);
  border-radius: var(--vcl-radius-md);
  overflow: hidden;
  transition: all 0.2s;
}

.day-card.current {
  border-color: var(--vcl-color-primary);
  box-shadow: 0 0 0 1px var(--vcl-color-primary);
}

.day-card.completed {
  opacity: 0.6;
}

.day-card.expanded {
  border-color: var(--vcl-color-primary);
}

/* 天头 */
.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--vcl-space-2) var(--vcl-space-3);
  background: var(--vcl-color-bg);
  cursor: pointer;
  user-select: none;
}

.day-header:hover {
  background: var(--vcl-color-bg-alt);
}

.day-header-left {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
}

.day-badge {
  width: calc(22px * var(--vcl-scale));
  height: calc(22px * var(--vcl-scale));
  border-radius: 50%;
  background: var(--vcl-color-border-light);
  color: var(--vcl-color-text-secondary);
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-badge.current {
  background: var(--vcl-color-primary);
  color: var(--vcl-color-surface);
}

.day-summary-text {
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text);
  display: flex;
  align-items: center;
  gap: var(--vcl-space-1);
  flex-wrap: wrap;
}

/* 门店密度标签 */
.density-tag {
  font-size: calc(13px * var(--vcl-scale));
  font-weight: 500;
  padding: var(--vcl-space-1) var(--vcl-space-1);
  border-radius: var(--vcl-radius-md);
  white-space: nowrap;
}

.density-good {
  background: var(--vcl-color-success-bg);
  color: var(--vcl-color-success-text);
}

.density-ok {
  background: var(--vcl-color-warning-bg);
  color: var(--vcl-color-warning-text);
}

.density-low {
  background: var(--vcl-color-danger-bg);
  color: var(--vcl-color-danger-on-surface);
}

.day-header-right {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-1);
}

.day-cities {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  max-width: calc(120px * var(--vcl-scale));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expand-icon {
  font-size: calc(9px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

/* 展开详情 */
.day-detail {
  padding: var(--vcl-space-2);
  border-top: 1px solid var(--vcl-color-bg-alt);
}

/* 导航按钮 */
.day-nav {
  display: flex;
  gap: var(--vcl-space-1);
  margin-bottom: var(--vcl-space-2);
}

.btn-nav-day {
  flex: 1;
  padding: var(--vcl-space-2);
  background: linear-gradient(135deg, var(--vcl-color-primary), var(--vcl-color-primary-hover));
  color: var(--vcl-color-surface);
  border: none;
  border-radius: var(--vcl-radius-md);
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 600;
  cursor: pointer;
}

.btn-nav-day:hover {
  box-shadow: var(--vcl-shadow-sm);
}

.btn-set-current {
  padding: var(--vcl-space-2) var(--vcl-space-3);
  background: var(--vcl-color-success-bg);
  color: var(--vcl-color-success-text);
  border: 1px solid var(--vcl-color-success-border);
  border-radius: var(--vcl-radius-md);
  font-size: calc(15px * var(--vcl-scale));
  cursor: pointer;
}

/* 路线概览 */
.route-overview {
  background: var(--vcl-color-bg);
  border-radius: var(--vcl-radius-md);
  padding: var(--vcl-space-2);
  margin-bottom: var(--vcl-space-2);
}

.route-start,
.route-end {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-1);
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
}

.route-icon {
  font-size: var(--vcl-ctrl-font-size);
}

.route-arrow {
  text-align: center;
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin: var(--vcl-space-0) 0;
}

.route-stores-brief {
  display: flex;
  flex-wrap: wrap;
  gap: var(--vcl-space-1);
  padding: var(--vcl-space-1) 0;
}

.store-chip {
  padding: var(--vcl-space-0) calc(6px * var(--vcl-scale));
  background: var(--vcl-color-info-bg);
  color: var(--vcl-color-info-text);
  border-radius: var(--vcl-radius-sm);
  font-size: calc(13px * var(--vcl-scale));
  white-space: nowrap;
}

.return-info {
  color: var(--vcl-color-warning);
  font-weight: 500;
}

/* 门店列表 */
.store-list {
  display: flex;
  flex-direction: column;
  gap: var(--vcl-space-0);
  margin-bottom: var(--vcl-space-2);
}

.store-item {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-1);
  padding: calc(5px * var(--vcl-scale)) var(--vcl-space-1);
  border-radius: var(--vcl-radius-sm);
  background: var(--vcl-color-bg);
}

.store-item:hover {
  background: var(--vcl-color-bg-alt);
}

.store-num {
  width: calc(18px * var(--vcl-scale));
  height: calc(18px * var(--vcl-scale));
  border-radius: 50%;
  background: var(--vcl-color-primary);
  color: var(--vcl-color-surface);
  font-size: calc(13px * var(--vcl-scale));
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
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.store-city {
  font-size: calc(9px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  flex-shrink: 0;
}

.store-segment {
  flex-shrink: 0;
}

.seg-info {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  white-space: nowrap;
  background: var(--vcl-color-bg-alt);
  padding: var(--vcl-space-1) var(--vcl-space-1);
}

.seg-end {
  color: var(--vcl-color-warning);
  background: var(--vcl-color-warning-bg);
}

.btn-nav-mini {
  background: var(--vcl-color-info-bg);
  border: 1px solid var(--vcl-color-info-border);
  border-radius: var(--vcl-radius-sm);
  cursor: pointer;
  font-size: calc(13px * var(--vcl-scale));
  padding: var(--vcl-space-0) calc(6px * var(--vcl-scale));
  flex-shrink: 0;
  color: var(--vcl-color-primary-hover);
  font-weight: 500;
}

.btn-nav-mini:hover {
  background: var(--vcl-color-primary);
  border-color: var(--vcl-color-primary);
  color: var(--vcl-color-surface);
}

/* 跳过列表 */
.skipped-section {
  margin-top: var(--vcl-space-2);
  background: var(--vcl-color-warning-bg);
  border: 1px solid var(--vcl-color-warning-border);
  border-radius: var(--vcl-radius-md);
  padding: var(--vcl-space-2);
}

.skipped-header {
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-warning-text);
  margin-bottom: var(--vcl-space-1);
}

.skipped-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--vcl-space-1);
  padding: var(--vcl-space-1) 0;
}

.skipped-item {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  padding: var(--vcl-space-0) calc(6px * var(--vcl-scale));
  background: var(--vcl-color-warning-bg);
  border-radius: var(--vcl-radius-sm);
}

.skipped-hint {
  font-size: calc(13px * var(--vcl-scale));
  color: var(--vcl-color-warning-text);
  margin: var(--vcl-space-1) 0 0;
}
</style>
