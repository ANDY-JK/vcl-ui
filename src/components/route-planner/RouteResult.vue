<script setup lang="ts">
/**
 * 路线规划结果 — 分天展示（简洁版）
 * - 默认折叠，只显示关键信息
 * - 点击展开当天详情
 * - 当前天高亮
 */
import { ref, computed } from 'vue'
import { calcDistance as calculateDistance } from '@/components/amap'
import IconSvg from '@/components/basic/IconSvg.vue'
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
              <span class="expand-icon">
                <IconSvg :type="expandedDay === day.day ? 'chevron-up' : 'chevron-down'" size="xs" />
              </span>
            </div>
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedDay === day.day" class="day-detail">
            <!-- 导航按钮 -->
            <div v-if="day.navLink" class="day-nav">
              <button type="button" class="btn-nav-day" @click="openNav(day.navLink)">
                {{ t('routePlanner.startNav') }}
              </button>
              <button type="button" class="btn-set-current" @click="setCurrentDay(day.day)">
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
              <div class="route-arrow">
                <IconSvg type="arrow-down" size="sm" />
              </div>
              <div class="route-stores-brief">
                <span v-for="s in day.stores" :key="s.id" class="store-chip" :title="s.name">
                  {{ s.name.length > 6 ? s.name.slice(0, 6) + '…' : s.name }}
                </span>
              </div>
              <div class="route-arrow">
                <IconSvg type="arrow-down" size="sm" />
              </div>
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
                  type="button"
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

<style src="./route-result.css" scoped></style>
