<script setup lang="ts">
// ProgressBar — 进度条 / 滑块（interactive 模式）
import { ref, computed, onUnmounted } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  /** 进度百分比 0-100（非交互模式） */
  percent?: number
  /** 语义色 */
  variant?: 'primary' | 'success' | 'warning' | 'danger'
  /** 显示百分比文字 */
  showText?: boolean
  /** 轨道高度（px，默认 6） */
  height?: number
  /** 条纹轨道 */
  striped?: boolean
  /** 流光动画 */
  animated?: boolean
  /** 交互模式：进度条变滑块（拖拽/键盘/数字输入） */
  interactive?: boolean
  /** 交互模式的受控值（v-model:modelValue） */
  modelValue?: number
  /** 交互模式最小值（默认 0） */
  min?: number
  /** 交互模式最大值（默认 100） */
  max?: number
  /** 交互模式步进（默认 1） */
  step?: number
  /** 交互模式禁用 */
  disabled?: boolean
  /** 交互模式显示数字输入框 */
  showInput?: boolean
  /** 显示刻度断点 */
  showStops?: boolean
  /** 无障碍名称：interactive 模式的 slider/数字输入需要可访问名，未传时回退通用文案 */
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  percent: 0,
  variant: 'primary',
  showText: true,
  height: 6,
  striped: false,
  animated: false,
  interactive: false,
  modelValue: 0,
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  showInput: false,
  showStops: false,
})

const emit = defineEmits<{
  /** 交互模式拖拽/输入中的实时值（v-model:modelValue） */
  'update:modelValue': [v: number]
  /** 交互模式值提交（松手/失焦/回车） */
  change: [v: number]
}>()

/** 只读模式显示的百分比：与填充宽度同口径夹紧，坏值当 0（原来会显示 NaN% / 150% / -20%） */
const displayPercent = computed(() => {
  const p = props.percent
  if (!Number.isFinite(p)) return 0
  return Math.round(Math.max(0, Math.min(100, p)))
})

const trackRef = ref<HTMLDivElement | null>(null)
const dragging = ref(false)

/**
 * 步进归一化：**必须是一个正的有限数**，否则退回 1。
 *
 * 原来直接信任 `props.step`，step=0 时 `Math.round(x / 0)` = `Infinity`，
 * 拖拽/键盘/数字输入**全部卡死在原值**（用户拖不动，界面上没有任何提示）；
 * step 为负数/NaN 时行为同样不可预期。归一化后这些输入退回默认步进 1。
 */
const safeStep = computed(() => {
  const s = props.step
  return typeof s === 'number' && Number.isFinite(s) && s > 0 ? s : 1
})

/**
 * 取值范围归一化：`max` 必须大于 `min`，否则整个区间塌缩。
 * （原来只判 `range <= 0` 就返回 0，导致滑块"看得见却永远拖不到"）
 */
const safeRange = computed(() => {
  const lo = Number.isFinite(props.min) ? props.min : 0
  const hi = Number.isFinite(props.max) ? props.max : 100
  return { min: lo, max: hi > lo ? hi : lo + 100, ok: hi > lo }
})

/** 实际生效的区间（模板里的 aria-valuemin/max 必须与它一致，否则读屏报的范围和能拖动的范围不符） */
const effectiveMin = computed(() => safeRange.value.min)
const effectiveMax = computed(() => safeRange.value.max)

/** 把任意值夹到 [min, max]（坏值退回 min） */
function clampRaw(v: number): number {
  const { min, max } = safeRange.value
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

const sliderPercent = computed(() => {
  const { min, max } = safeRange.value
  const ratio = (clampRaw(props.modelValue) - min) / (max - min)
  // 必须夹紧：越界值（modelValue=200）原来直接算成 width:200%，滑块跑到轨道外
  return Math.max(0, Math.min(100, ratio * 100))
})

const stops = computed(() => {
  if (!props.interactive || !props.showStops) return []
  const { min } = safeRange.value
  const step = safeStep.value
  const span = safeRange.value.max - min
  const count = Math.floor(span / step) + 1
  // count<=1（span<step）时 (count-1)=0 → 0/0=NaN → 刻度定位失效；此时干脆不画刻度
  if (!Number.isFinite(count) || count <= 1) return []
  const current = clampRaw(props.modelValue)
  return Array.from({ length: Math.min(count, 50) }, (_, i) => ({
    value: min + i * step,
    percent: (i / (count - 1)) * 100,
    active: min + i * step <= current,
  }))
})

function snapToStep(val: number): number {
  const { min, max } = safeRange.value
  const step = safeStep.value
  if (!Number.isFinite(val)) return min
  const stepped = Math.round((val - min) / step) * step + min
  return Math.max(min, Math.min(max, stepped))
}

function posToValue(clientX: number): number {
  const { min, max } = safeRange.value
  if (!trackRef.value) return min
  const rect = trackRef.value.getBoundingClientRect()
  // 轨道宽度为 0（未布局 / display:none）时 ratio 会是 Infinity 或 NaN → 直接落到 min
  const width = rect.width
  if (!width) return min
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / width))
  return snapToStep(min + ratio * (max - min))
}

function onInputChange(val: string) {
  // 空串与非数字都**不提交**：原来 Number('abc')=NaN 会被 snapToStep 悄悄当成 min 存进去，
  // 用户输错了却得到一个"看起来合法"的值，完全无从发现。
  if (val.trim() === '') return
  const n = Number(val)
  if (!Number.isFinite(n)) return
  emit('update:modelValue', snapToStep(n))
  emit('change', snapToStep(n))
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled) return
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
  bindWindowPointer()
  emit('update:modelValue', posToValue(e.clientX))
}

function onTrackPointerDown(e: PointerEvent) {
  if (props.disabled) return
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  e.preventDefault()
  bindWindowPointer()
  emit('update:modelValue', posToValue(e.clientX))
}

// 指针监听按需挂载：拖拽开始才挂 window 级 move/up，pointerup 即摘——
// 避免常驻监听让页面每次指针移动都进回调
function bindWindowPointer(): void {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function unbindWindowPointer(): void {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  emit('update:modelValue', posToValue(e.clientX))
}

function onPointerUp() {
  if (dragging.value) emit('change', props.modelValue)
  dragging.value = false
  unbindWindowPointer()
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  const step = safeStep.value
  const delta =
    e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0
  if (delta === 0) return
  e.preventDefault()
  const newVal = snapToStep(props.modelValue + delta)
  emit('update:modelValue', newVal)
  emit('change', newVal)
}

onUnmounted(unbindWindowPointer)
</script>

<template>
  <!-- ========== 滑块模式 ========== -->
  <div v-if="interactive" class="progress-slider" :class="{ disabled }">
    <input
      v-if="showInput"
      type="number"
      class="slider-input"
      :aria-label="label || t('common.progress')"
      :value="modelValue"
      :min="effectiveMin"
      :max="effectiveMax"
      :step="step"
      :disabled="disabled"
      @change="onInputChange(($event.target as HTMLInputElement).value)"
    />
    <div ref="trackRef" class="slider-track" :class="{ dragging }" @pointerdown="onTrackPointerDown">
      <div class="slider-rail" />
      <div class="slider-fill" :style="{ width: sliderPercent + '%' }" />
      <div v-if="showStops" class="slider-stops">
        <span
          v-for="s in stops"
          :key="s.value"
          class="slider-stop"
          :class="{ active: s.active }"
          :style="{ left: s.percent + '%' }"
        />
      </div>
      <div
        class="slider-thumb"
        :class="{ dragging }"
        :style="{ left: sliderPercent + '%' }"
        tabindex="0"
        role="slider"
        :aria-label="label || t('common.progress')"
        :aria-valuemin="effectiveMin"
        :aria-valuemax="effectiveMax"
        :aria-valuenow="modelValue"
        @pointerdown.stop="onPointerDown"
        @keydown="onKeydown"
      />
    </div>
  </div>

  <!-- ========== 只读进度条模式 ========== -->
  <div v-else class="progress-wrap">
    <div class="progress-track" :style="{ height: height + 'px' }">
      <div
        class="progress-fill"
        :class="[`fill-${variant}`, { striped, animated }]"
        :style="{ width: Math.min(100, Math.max(0, isNaN(percent) ? 0 : percent)) + '%' }"
      />
    </div>
    <span v-if="showText" class="progress-text">{{ displayPercent }}%</span>
  </div>
</template>

<style src="./progress-bar-scoped.css" scoped></style>
