<!--
  RendererDisplayMap —— 地图标记展示元素

  与明细表/图表共用同一套数据源（静态 / 绑定字段 / 接口），差别在**行 → 标记点**的归一：
  每行取经纬度（`lng/lat` 或 `longitude/latitude`，也接受 `position: [lng, lat]`），
  名称取 `title`/`name`/`label`。

  刻意不做的事：**不给没有坐标的行编造位置**。缺经纬度的行直接跳过——
  在地图上凭空插一个点，比少一个点危险得多（用户会照着错位置跑一趟）。
  跳过多少条会显示出来，让"为什么少了几个点"当场可答。

  注意：本组件只做**展示**（isLayout=true，不进提交数据）。"在地图上选点并回填地址"
  是另一件事，属于输入型字段（与既有的 address 字段互补），不在本组件职责内。
-->
<script setup lang="ts">
import { computed } from 'vue'
import AmapWidget from '@/components/amap/AmapWidget.vue'
import Empty from '@/components/data/Empty.vue'
import Skeleton from '@/components/data/Skeleton.vue'
import { useDisplayData } from '../display-data-source'
import { useT } from '@/components/_internal/i18n'
import type { ApiUrlPolicy } from '../api-url-guard'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
  /** 字段定义（含 displaySource） */
  field: FormField
  /** 整个表单的数据（`field` 模式取值用） */
  formData?: Record<string, unknown>
  /** 外发 URL 策略（api 模式用；不传 = 只允许同源） */
  apiUrlPolicy?: ApiUrlPolicy
}>()

const { rows, loading, error } = useDisplayData({
  source: () => props.field.displaySource,
  formData: () => props.formData ?? {},
  apiUrlPolicy: () => props.apiUrlPolicy ?? {},
})

/** 从一行里取经纬度；取不到返回 null（调用方跳过该行） */
function positionOf(row: unknown): [number, number] | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null
  const r = row as Record<string, unknown>
  const p = r.position
  if (Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
    return [p[0], p[1]]
  }
  const lng = r.lng ?? r.longitude
  const lat = r.lat ?? r.latitude
  if (typeof lng === 'number' && typeof lat === 'number') return [lng, lat]
  return null
}

/** 行 → 标记点；无坐标的行被跳过并计数（MarkerItem 用 longitude/latitude，不是 position） */
const mapped = computed(() => {
  const markers: { longitude: number; latitude: number; title: string }[] = []
  let skipped = 0
  for (const row of rows.value) {
    const pos = positionOf(row)
    if (!pos) {
      skipped++
      continue
    }
    const r = (row ?? {}) as Record<string, unknown>
    const title = String(r.title ?? r.name ?? r.label ?? '')
    markers.push({ longitude: pos[0], latitude: pos[1], title })
  }
  return { markers, skipped }
})

/** 中心取首点；无点时用高德默认中心（组件自身默认值） */
const center = computed<[number, number] | undefined>(() => {
  const first = mapped.value.markers[0]
  return first ? [first.longitude, first.latitude] : undefined
})

/** 字段上可覆写缩放级别；未配则交给组件默认值 */
const zoom = computed<number | undefined>(() => (props.field as { zoom?: number }).zoom)
</script>

<template>
  <div class="fb-display-map">
    <Skeleton v-if="loading" :rows="4" />
    <Empty v-else-if="error" :description="error" />
    <Empty v-else-if="!mapped.markers.length" />
    <template v-else>
      <AmapWidget :center="center" :zoom="zoom" :markers="mapped.markers" />
      <!-- 跳过多少条要说出来：否则用户只会看到"点比数据少"，无从判断是数据问题还是渲染问题 -->
      <p v-if="mapped.skipped" class="fb-map-skipped">
        {{ t('fbDisplay.mapSkipped', { n: mapped.skipped }) }}
      </p>
    </template>
  </div>
</template>
