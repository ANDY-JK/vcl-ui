<script setup lang="ts">
// ════════════════════════════════════════════════
//  Group — 统一选择组组件
//  合并：CheckboxGroup + RadioGroup + Switch + Rate + Slider
//  type 取值：radio | checkbox | switch | rate | slider
// ════════════════════════════════════════════════
import { ref, computed } from 'vue'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import IconSvg from '@/components/basic/IconSvg.vue'
import { clamp, alignStep } from './utils/slider-utils'
import { useT } from '@/components/_internal/i18n'
import type { Option } from '@/components/shared/types'

// 命名为 tt 避免与 slider 模板 v-for 的 thumb 变量 t 冲突
const tt = useT()

interface Props {
  /**
   * 外部判定为无效（不带文案）：挂到**组容器**的 aria-invalid。
   * 焦点落在组里的单个选项上，但"这题答错了"是组的语义 —— 所以挂 radiogroup / group（#342）。
   */
  invalid?: boolean
  /** 外部错误元素的 id：挂到 aria-describedby，让读屏能回查「为什么无效」 */
  describedby?: string
  /** 统一类型：radio | checkbox | switch | rate | slider */
  type?: 'radio' | 'checkbox' | 'switch' | 'rate' | 'slider'
  /** 受控值：radio/switch 为单值，checkbox 为数组，rate 为数值，slider 为数值或 [起, 止] */
  modelValue: string | number | boolean | (string | number | boolean)[] | [number, number]
  /** radio / checkbox 模式选项列表 */
  options?: Option[]
  /** radio / checkbox 排列方向 */
  direction?: 'vertical' | 'horizontal'
  /** 整组禁用 */
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

type GroupValue = string | number | boolean | (string | number | boolean)[] | [number, number]

/** radio 分组唯一 name（避免多个 Group 实例的 radio 互相干扰） */
const groupId = useIdSafe('group')

const emit = defineEmits<{
  /** v-model——受控值（形状随 type：checkbox 为数组、range 滑块为 [起, 止]） */
  'update:modelValue': [v: GroupValue]
  /** 值提交（与 update:modelValue 同步抛出） */
  change: [v: GroupValue]
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
    const idx = vals.findIndex((v) => String(v) === String(opt.value))
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
    return ((props.modelValue || []) as (string | number | boolean)[]).some((v) => String(v) === String(val))
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
  // 键盘触发的 click（Enter/Space）clientX=0 且 detail=0，getHalfVal 会误判为左半星
  // → 键盘操作恒选整星，鼠标点击才走半星判定
  const val = props.allowHalf && e.detail > 0 ? getHalfVal(e, i) : i + 1
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
    let b = clamp(
      typeof props.modelValue[1] === 'number' ? props.modelValue[1] : props.sliderMax,
      props.min,
      props.sliderMax,
    )
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

function emitChange() {
  // 从当前 props.modelValue（range computed）取值，避免 lastValue 快照
  // 在父组件外部改值后回吐旧值
  const [a, b] = range.value
  emit('change', Array.isArray(props.modelValue) ? ([a, b] as [number, number]) : a)
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
  bindWindowPointer()
  setValue(idx, posToValue(e.clientX))
}

function onTrackDown(e: PointerEvent) {
  if (props.disabled) return
  e.preventDefault()
  dragging.value = true
  const v = posToValue(e.clientX)
  draggingIdx.value = pickThumb(v)
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  bindWindowPointer()
  setValue(draggingIdx.value, v)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  setValue(draggingIdx.value, posToValue(e.clientX))
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  unbindWindowPointer()
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

import { onUnmounted } from 'vue'
// 指针监听按需挂载：拖拽开始（onThumbDown/onTrackDown）才挂 window 级 move/up，
// pointerup 即摘——避免常驻监听让页面每次指针移动都进回调
function bindWindowPointer(): void {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}
function unbindWindowPointer(): void {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}
onUnmounted(unbindWindowPointer)
</script>

<template>
  <!-- ===== radio ===== -->
  <div
    v-if="isRadio"
    class="group-radio"
    :class="[`direction-${direction}`]"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
  >
    <label
      v-for="opt in options"
      :key="String(opt.value)"
      class="choice-item"
      :class="{ disabled: opt.disabled || disabled }"
    >
      <input
        type="radio"
        class="choice-input sr-only"
        :name="`radio-${groupId}`"
        :value="String(opt.value)"
        :checked="isChecked(opt.value)"
        :disabled="opt.disabled || disabled"
        @change="onClick(opt)"
      />
      <span class="choice-box is-radio" :class="{ checked: isChecked(opt.value) }">
        <!-- 选中态=经典内实心点。不用 circle-check-big：开口圆环+勾尾的墨迹集中在右侧，
             与外圈边框叠成双环后肉眼可见「右厚」（2026-09-30 实测几何居中 ±0.02px 仍被判歪，
             根因是字形墨迹分布而非定位），纯 CSS 圆点彻底规避 -->
        <span v-if="isChecked(opt.value)" class="radio-dot" aria-hidden="true" />
      </span>
      <span class="choice-label">{{ opt.label }}</span>
    </label>
  </div>

  <!-- ===== checkbox ===== -->
  <div
    v-else-if="isCheckbox"
    class="group-checkbox"
    :class="[`direction-${direction}`]"
    role="group"
    :aria-label="ariaLabel"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
  >
    <label
      v-for="opt in options"
      :key="String(opt.value)"
      class="choice-item"
      :class="{ disabled: opt.disabled || disabled }"
    >
      <input
        type="checkbox"
        class="choice-input sr-only"
        :value="String(opt.value)"
        :checked="isChecked(opt.value)"
        :disabled="opt.disabled || disabled"
        @change="onClick(opt)"
      />
      <span class="choice-box is-checkbox" :class="{ checked: isChecked(opt.value) }">
        <!-- 纯对勾（同 radio 定案：circle-check-big 的开口环+勾尾在实心底上同样右偏墨） -->
        <IconSvg v-if="isChecked(opt.value)" type="check" size="sm" color="white" />
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
  <!--
    rate 语义纠正：原 role="slider" 是谎报——slider 必须容器可聚焦 + 方向键可调，
    而这里真实的交互是「N 个星形按钮 + 整组说明」。改为 role="group"（组合控件），
    每个星按钮自带 aria-label 说明点数。这样既消除 aria-input-field-name /
    nested-interactive（slider 里嵌 button）两类违规，也不谎报能力。
  -->
  <div
    v-else-if="isRate"
    class="rate"
    role="group"
    :aria-label="tt('form.rateLabel', { value: modelValue, max: rateMax })"
    @mouseleave="hoverVal = 0"
  >
    <button
      v-for="(_, i) in stars"
      :key="i"
      type="button"
      class="rate-btn"
      :class="{ active: stars[i].full || stars[i].half }"
      :disabled="disabled"
      :aria-label="tt('form.rateStar', { value: i + 1, max: rateMax })"
      @click="selectRate($event, i)"
      @mousemove="onHoverRate($event, i)"
    >
      <template v-if="stars[i].half">
        <span class="half-wrap">
          <IconSvg type="star" size="lg" color="var(--vcl-color-border)" />
          <span class="half-clip">
            <IconSvg type="star" size="lg" :color="color" />
          </span>
        </span>
      </template>
      <IconSvg v-else type="star" size="lg" :color="stars[i].full ? color : 'var(--vcl-color-border)'" />
    </button>
  </div>

  <!-- ===== slider ===== -->
  <div v-else-if="isSlider" class="slider-root" :class="{ disabled, 'is-range': isRange }">
    <div ref="trackRef" class="slider-track" :class="{ dragging }" @pointerdown="onTrackDown">
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
        :aria-label="isRange ? (i === 0 ? tt('form.sliderMin') : tt('form.sliderMax')) : tt('form.slider')"
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

<style src="./group-scoped.css" scoped></style>
