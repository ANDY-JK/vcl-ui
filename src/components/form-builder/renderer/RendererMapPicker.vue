<!--
  RendererMapPicker —— 地图选点（输入型字段）

  与展示组的 RendererDisplayMap 是两件事，刻意分开：
  · 展示组只“看”（isLayout=true，不进提交数据）
  · 本组件“选”（isLayout=false，**产出一个值进提交数据**）

  值结构 `{ lng, lat }`。选择理由：
  · 不拼地址字符串——地图点击只给坐标，反向地理编码要额外请求，失败时会让“选了点却没值”；
    地址仍由既有 `address` 字段负责，两者互补而不是互相替代。
  · 也不存成 `[lng, lat]` 数组——对象在提交后的后端消费侧更自解释，且不怕顺序搞反。

  回填：外部传入的值会作为初始标记点渲染，于是“编辑已有记录”时能直接看到上次选的位置。
-->
<script setup lang="ts">
import { computed } from 'vue'
import AmapWidget from '@/components/amap/AmapWidget.vue'
import { useT } from '@/components/_internal/i18n'
import type { FormField } from '../types'

const t = useT()

const props = defineProps<{
  /** 字段定义（center / zoom 取自字段配置，可空） */
  field: FormField
  /** 当前值 `{ lng, lat }` */
  modelValue: unknown
}>()

const emit = defineEmits<{
  /** 选点后回填 */
  'update:modelValue': [v: unknown]
}>()

/** 从当前值里读出坐标；形态不对就当作“未选点”（不猜） */
function pickPoint(v: unknown): { lng: number; lat: number } | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (typeof o.lng === 'number' && typeof o.lat === 'number') return { lng: o.lng, lat: o.lat }
  return null
}

const current = computed(() => pickPoint(props.modelValue))

/** 已选点则标记出来；未选点则空数组（地图不画多余的点） */
const markers = computed(() =>
  current.value ? [{ longitude: current.value.lng, latitude: current.value.lat, title: props.field.label }] : [],
)

/** 中心：已选点优先，否则用字段配置或默认值 */
const center = computed<[number, number] | undefined>(() => {
  if (current.value) return [current.value.lng, current.value.lat]
  const c = (props.field as { mapCenter?: [number, number] }).mapCenter
  return c
})

const zoom = computed<number | undefined>(() => (props.field as { mapZoom?: number }).mapZoom)

function onMapClick(lng: number, lat: number): void {
  emit('update:modelValue', { lng, lat })
}

/** 展示已选坐标，让"选没选上"当场可见 */
const pickedText = computed(() =>
  current.value ? `${current.value.lng.toFixed(6)}, ${current.value.lat.toFixed(6)}` : '',
)
</script>

<template>
  <div class="fb-map-picker">
    <AmapWidget :center="center" :zoom="zoom" :markers="markers" @map-click="onMapClick" />
    <p class="fb-map-picker-hint">
      <template v-if="pickedText">{{ t('fb.mapPicked', { pos: pickedText }) }}</template>
      <template v-else>{{ t('fb.mapPickHint') }}</template>
    </p>
  </div>
</template>
