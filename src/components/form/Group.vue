<script setup lang="ts">
// ════════════════════════════════════════════════
//  Group — 统一选择组组件
//  合并：CheckboxGroup + RadioGroup + Switch + Rate + Slider
//  type 取值：radio | checkbox | switch | rate | slider
// ════════════════════════════════════════════════
import { ref, computed } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { clamp, alignStep } from './slider-utils'
import type { Option } from '@/components/shared/types'

interface Props {
  /** 统一类型：radio | checkbox | switch | rate | slider */
  type?: 'radio' | 'checkbox' | 'switch' | 'rate' | 'slider'
  modelValue: string | number | boolean | (string | number | boolean)[] | [number, number]
  /** radio / checkbox 模式选项列表 */
  options?: Option[]
  /** radio / checkbox 排列方向 */
  direction?: 'vertical' | 'horizontal'
  disabled?: boolean
  /** checkbox 最多选几项，0 = 不限 */
  max?: number
  /** 分组标签（无障碍） */
  ariaLabel?: string

  /* switch 模式 */
  /** switch 标签文字 */
  label?: string
  /** switch 尺寸 */
  size?: 'sm' | 'md'

  /* rate 模式 */
  /** rate 最大值，默认 5 */
  rateMax?: number
  /** rate 是否允许半星 */
  allowHalf?: boolean
  /** rate 颜色 */
  color?: string

  /* slider 模式 */
  /** slider 最小值 */
  min?: number
  /** slider 最大值（与 checkbox max 区分） */
  sliderMax?: number
  /** slider 步进 */
  step?: number
  /** slider 显示当前值 */
  showValue?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'radio',
  options: () => [],
  direction: 'vertical',
  disabled: false,
  max: 0,
  ariaLabel: '',
  size: 'md',
  rateMax: 5,
  allowHalf: false,
  color: '#F59E0B',
  min: 0,
  sliderMax: 100,
  step: 1,
  showValue: true,
})

const emit = defineEmits<{
  'update:modelValue': [v: any]
  change: [v: any]
}>()

/* ════════════════════════════════════════
   模式判断
   ════════════════════════════════════════ */
const isRadio = computed(() => props.type === 'radio')
const isCheckbox = computed(() => props.type === 'checkbox')
const isSwitch = computed(() => props.type === 'switch')
const isRate = computed(() => props.type === 'rate')
const isSlider = computed(() => props.type === 'slider')

/* ════════════════════════════════════════
   radio / checkbox 逻辑
   ════════════════════════════════════════ */
function onClick(opt: Option) {
  if (opt.disabled || props.disabled) return
  if (isCheckbox.value) {
    const vals = [...((props.modelValue || []) as (string | number | boolean)[])]
    const idx = vals.findIndex(v => String(v) === String(opt.value))
    if (idx >= 0) vals.splice(idx, 1)
    else if (!props.max || vals.length < props.max) vals.push(opt.value)
    emit('update:modelValue', vals)
    emit('change', vals)
  } else {
    emit('update:modelValue', opt.value)
    emit('change', opt.value)
  }
}

function isChecked(val: string | number | boolean) {
  if (isCheckbox.value) {
    return ((props.modelValue || []) as (string | number | boolean)[]).some(v => String(v) === String(val))
  }
  return String(props.modelValue) === String(val)
}

/* ════════════════════════════════════════
   switch 逻辑
   ════════════════════════════════════════ */
function onSwitchToggle() {
  if (props.disabled) return
  const next = !props.modelValue
  emit('update:modelValue', next)
  emit('change', next)
}

/* ════════════════════════════════════════
   rate 逻辑
   ════════════════════════════════════════ */
const hoverVal = ref(0)

function selectRate(e: MouseEvent, i: number) {
  if (props.disabled) return
  const val = props.allowHalf ? getHalfVal(e, i) : i + 1
  emit('update:modelValue', val)
  emit('change', val)
}

function onHoverRate(e: MouseEvent, i: number) {
  hoverVal.value = props.allowHalf ? getHalfVal(e, i) : i + 1
}

function getHalfVal(e: MouseEvent, i: number): number {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  return x < rect.width / 2 ? i + 0.5 : i + 1
}

const stars = computed(() => {
  const arr: { full: boolean; half: boolean }[] = []
  const activeVal = hoverVal.value || (props.modelValue as number)
  for (let i = 1; i <= props.rateMax; i++) {
    const full = i <= activeVal
    const half = !full && props.allowHalf && i - 0.5 === activeVal
    arr.push({ full, half })
  }
  return arr
})

/* ════════════════════════════════════════
   slider 逻辑
   ════════════════════════════════════════ */
const isRange = computed(() => Array.isArray(props.modelValue))

function snap(v: number): number {
  return alignStep(v, props.min, props.sliderMax, props.step)
}

function norm(): [number, number] {
  if (Array.isArray(props.modelValue)) {
    let a = clamp(typeof props.modelValue[0] === 'number' ? props.modelValue[0] : props.min, props.min, props.sliderMax)
    let b = clamp(typeof props.modelValue[1] === 'number' ? props.modelValue[1] : props.sliderMax, props.min, props.sliderMax)
    if (a > b) [a, b] = [b, a]
    return [a, b]
  }
  const v = clamp(typeof props.modelValue === 'number' ? props.modelValue : props.min, props.min, props.sliderMax)
  return [v, v]
}

const range = computed(() => norm())
const span = computed(() => (props.sliderMax - props.min > 0 ? props.sliderMax - props.min : 1))

function pct(v: number): number {
  return ((v - props.min) / span.value) * 100
}

const thumbs = computed(() => {
  const [a, b] = range.value
  if (Array.isArray(props.modelValue)) {
    return [
      { value: a, percent: pct(a) },
      { value: b, percent: pct(b) },
    ]
  }
  return [{ value: a, percent: pct(a) }]
})

const fillStyle = computed(() => {
  const [a, b] = range.value
  if (Array.isArray(props.modelValue)) {
    return { left: pct(a) + '%', width: Math.max(0, pct(b) - pct(a)) + '%' }
  }
  return { left: '0%', width: pct(a) + '%' }
})

const displayValue = computed(() => {
  const [a, b] = range.value
  return Array.isArray(props.modelValue) ? `${a} ~ ${b}` : String(a)
})

const trackRef = ref<HTMLDivElement | null>(null)
const dragging = ref(false)
const draggingIdx = ref(0)
const lastValue = ref<number | [number, number]>(props.modelValue as number | [number, number])

function emitChange() {
  emit('change', Array.isArray(lastValue.value) ? ([...lastValue.value] as [number, number]) : lastValue.value)
}

function setValue(idx: number, raw: number) {
  const v = snap(raw)
  let next: number | [number, number]
  if (Array.isArray(props.modelValue)) {
    const [a, b] = range.value
    next = idx === 0 ? [v, Math.max(v, b)] : [Math.min(a, v), v]
  } else {
    next = v
  }
  lastValue.value = next
  emit('update:modelValue', next)
}

function posToValue(clientX: number): number {
  if (!trackRef.value) return props.min
  const rect = trackRef.value.getBoundingClientRect()
  if (rect.width <= 0) return props.min
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return snap(props.min + ratio * span.value)
}

function pickThumb(v: number): number {
  if (!Array.isArray(props.modelValue)) return 0
  const [a, b] = range.value
  return Math.abs(v - a) <= Math.abs(v - b) ? 0 : 1
}

function onThumbDown(idx: number, e: PointerEvent) {
  if (props.disabled) return
  e.preventDefault()
  e.stopPropagation()
  dragging.value = true
  draggingIdx.value = idx
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  setValue(idx, posToValue(e.clientX))
}

function onTrackDown(e: PointerEvent) {
  if (props.disabled) return
  e.preventDefault()
  dragging.value = true
  const v = posToValue(e.clientX)
  draggingIdx.value = pickThumb(v)
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  setValue(draggingIdx.value, v)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  setValue(draggingIdx.value, posToValue(e.clientX))
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  emitChange()
}

function onThumbKeydown(idx: number, e: KeyboardEvent) {
  if (props.disabled) return
  const st = props.step > 0 ? props.step : 1
  const cur = thumbs.value[idx]?.value ?? props.min
  let raw: number | null = null
  if (e.key === 'ArrowRight' || e.key === 'ArrowUp') raw = cur + st
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') raw = cur - st
  else if (e.key === 'Home') raw = props.min
  else if (e.key === 'End') raw = props.sliderMax
  if (raw === null) return
  e.preventDefault()
  setValue(idx, raw)
  emitChange()
}

import { onMounted, onUnmounted } from 'vue'
onMounted(() => {
  if (isSlider.value) {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }
})
onUnmounted(() => {
  if (isSlider.value) {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }
})
</script>

<template>
  <!-- ===== radio ===== -->
  <div v-if="isRadio" class="group-radio" :class="[`direction-${direction}`]" role="radiogroup" :aria-label="ariaLabel">
    <label
      v-for="opt in options"
      :key="String(opt.value)"
      class="choice-item"
      :class="{ disabled: opt.disabled || disabled }"
      @click="opt.disabled || disabled ? null : onClick(opt)"
    >
      <span class="choice-box is-radio" :class="{ checked: isChecked(opt.value) }">
        <IconSvg v-if="isChecked(opt.value)" type="circle-check-big" size="sm" color="var(--color-primary)" />
      </span>
      <span class="choice-label">{{ opt.label }}</span>
    </label>
  </div>

  <!-- ===== checkbox ===== -->
  <div v-else-if="isCheckbox" class="group-checkbox" :class="[`direction-${direction}`]" role="group" :aria-label="ariaLabel">
    <label
      v-for="opt in options"
      :key="String(opt.value)"
      class="choice-item"
      :class="{ disabled: opt.disabled || disabled }"
      @click="onClick(opt)"
    >
      <span class="choice-box is-checkbox" :class="{ checked: isChecked(opt.value) }">
        <IconSvg v-if="isChecked(opt.value)" type="circle-check-big" size="sm" color="white" />
      </span>
      <span class="choice-label">{{ opt.label }}</span>
    </label>
  </div>

  <!-- ===== switch ===== -->
  <span
    v-else-if="isSwitch"
    class="switch"
    :class="{ disabled }"
    role="switch"
    :aria-checked="modelValue ? 'true' : 'false'"
    :aria-label="label"
    :aria-disabled="disabled ? 'true' : 'false'"
    :tabindex="disabled ? -1 : 0"
    @keydown.enter.prevent="onSwitchToggle"
    @keydown.space.prevent="onSwitchToggle"
  >
    <span class="switch-track" :class="[`track-${size}`, { on: modelValue }]" @click="onSwitchToggle">
      <span class="switch-thumb" :class="[`thumb-${size}`, { on: modelValue }]" />
    </span>
    <span v-if="label" class="switch-label">{{ label }}</span>
  </span>

  <!-- ===== rate ===== -->
  <div
    v-else-if="isRate"
    class="rate"
    role="slider"
    :aria-valuenow="Number(modelValue)"
    aria-valuemin="0"
    :aria-valuemax="rateMax"
    :aria-label="`评分 ${modelValue}/${rateMax}`"
    @mouseleave="hoverVal = 0"
  >
    <button
      v-for="(_, i) in stars"
      :key="i"
      type="button"
      class="rate-btn"
      :class="{ active: stars[i].full || stars[i].half }"
      :disabled="disabled"
      @click="selectRate($event, i)"
      @mousemove="onHoverRate($event, i)"
    >
      <template v-if="stars[i].half">
        <span class="half-wrap">
          <IconSvg type="star" size="lg" color="var(--color-border)" />
          <span class="half-clip">
            <IconSvg type="star" size="lg" :color="color" />
          </span>
        </span>
      </template>
      <IconSvg v-else type="star" size="lg" :color="stars[i].full ? color : 'var(--color-border)'" />
    </button>
  </div>

  <!-- ===== slider ===== -->
  <div v-else-if="isSlider" class="slider-root" :class="{ disabled, 'is-range': isRange }">
    <div class="slider-track" :class="{ dragging }" ref="trackRef" @pointerdown="onTrackDown">
      <div class="slider-rail" />
      <div class="slider-fill" :style="fillStyle" />
      <div
        v-for="(t, i) in thumbs"
        :key="i"
        class="slider-thumb"
        :class="{ dragging: dragging && draggingIdx === i }"
        :style="{ left: t.percent + '%' }"
        role="slider"
        tabindex="0"
        :aria-label="isRange ? (i === 0 ? '最小值' : '最大值') : '滑块'"
        :aria-valuemin="min"
        :aria-valuemax="sliderMax"
        :aria-valuenow="t.value"
        @pointerdown="onThumbDown(i, $event)"
        @keydown="onThumbKeydown(i, $event)"
      />
    </div>
    <span v-if="showValue" class="slider-value">{{ displayValue }}</span>
  </div>
</template>

<style scoped>
/* ===== radio / checkbox ===== */
.group-radio, .group-checkbox { display: flex; gap: var(--space-1); }
.direction-horizontal { flex-direction: row; flex-wrap: wrap; gap: clamp(10px, 1.8vw, 16px); }
.direction-vertical { flex-direction: column; }
.choice-item { display: flex; align-items: center; gap: var(--space-2); font-size: clamp(12px, 1.8vw, 14px); padding: var(--space-2) 0; cursor: pointer; }
.choice-item.disabled { opacity: 0.45; cursor: not-allowed; }
.choice-box { display: flex; align-items: center; justify-content: center; transition: all var(--transition-fast); }
.is-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--color-border); }
.is-checkbox { width: 18px; height: 18px; border-radius: var(--radius-sm); border: 2px solid var(--color-border); }
.choice-box.checked { border-color: var(--color-primary); }
.is-checkbox.checked { background: var(--color-primary); }
.choice-label { color: var(--color-text); }

/* ===== switch ===== */
.switch { display: inline-flex; align-items: center; gap: var(--space-3); cursor: pointer; }
.switch.disabled { opacity: 0.45; cursor: not-allowed; }
.switch:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.switch-track { position: relative; display: inline-block; border-radius: 100px; background: var(--color-border); transition: background var(--transition-fast); cursor: pointer; }
.track-md { width: clamp(40px, 6vw, 44px); height: clamp(22px, 3vw, 24px); }
.track-sm { width: clamp(28px, 4vw, 32px); height: clamp(16px, 2vw, 18px); }
.switch-track.on { background: var(--color-primary); }
.switch-thumb { position: absolute; top: 50%; left: 2px; border-radius: 50%; background: white; transition: transform var(--transition-fast); box-shadow: var(--shadow-sm); }
.thumb-md { width: 20px; height: 20px; margin-top: -10px; }
.thumb-sm { width: 14px; height: 14px; margin-top: -7px; }
.thumb-md.on { transform: translateX(clamp(16px, 2.5vw, 20px)); }
.thumb-sm.on { transform: translateX(clamp(10px, 1.5vw, 14px)); }
.switch-label { font-size: clamp(12px, 1.8vw, 14px); color: var(--color-text); }

/* ===== rate ===== */
.rate { display: inline-flex; gap: var(--space-1); }
.rate-btn { display: flex; padding: 0; border: none; background: transparent; cursor: pointer; transition: transform var(--transition-fast); }
.rate-btn:not(:disabled):hover { transform: scale(1.15); }
.rate-btn:disabled { cursor: default; }
.half-wrap { position: relative; display: inline-flex; }
.half-clip { position: absolute; left: 0; top: 0; width: 50%; overflow: hidden; }

/* ===== slider ===== */
.slider-root { display: flex; align-items: center; gap: var(--space-3); width: 100%; --thumb-size: 16px; --track-height: 6px; }
.slider-track { flex: 1; position: relative; height: var(--track-height); margin: calc(var(--thumb-size) / 2) 0; cursor: pointer; touch-action: none; border-radius: 100px; }
.slider-rail { position: absolute; inset: 0; background: var(--color-bg-alt); border-radius: 100px; }
.slider-fill { position: absolute; top: 0; bottom: 0; background: var(--color-primary); border-radius: 100px; pointer-events: none; transition: left var(--transition-fast), width var(--transition-fast); }
.slider-track.dragging .slider-fill { transition: none; }
.slider-thumb { position: absolute; top: 50%; width: var(--thumb-size); height: var(--thumb-size); transform: translate(-50%, -50%); border-radius: 50%; background: var(--color-surface); border: 2px solid var(--color-primary); box-shadow: var(--shadow-sm); cursor: grab; z-index: 2; transition: box-shadow var(--transition-fast), transform var(--transition-fast); }
.slider-thumb:hover { transform: translate(-50%, -50%) scale(1.1); }
.slider-thumb:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--color-primary-light), var(--shadow-sm); }
.slider-thumb.dragging { cursor: grabbing; box-shadow: var(--shadow-md); transform: translate(-50%, -50%) scale(1.15); }
.slider-value { flex-shrink: 0; min-width: 34px; text-align: right; font-size: clamp(12px, 1.8vw, 13px); font-variant-numeric: tabular-nums; font-weight: 500; color: var(--color-text-secondary); }
.slider-root.disabled { opacity: 0.5; pointer-events: none; cursor: not-allowed; }
</style>
