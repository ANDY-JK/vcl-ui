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

const trackRef = ref<HTMLDivElement | null>(null)
const dragging = ref(false)

const sliderPercent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return ((props.modelValue - props.min) / range) * 100
})

const stops = computed(() => {
  if (!props.interactive || !props.showStops) return []
  const range = props.max - props.min
  if (range <= 0) return []
  const count = Math.floor(range / props.step) + 1
  // count=1（range<step）时 0/0=NaN → 刻度定位失效
  if (count <= 1) return []
  return Array.from({ length: Math.min(count, 50) }, (_, i) => ({
    value: props.min + i * props.step,
    percent: (i / (count - 1)) * 100,
    active: props.min + i * props.step <= props.modelValue,
  }))
})

function snapToStep(val: number): number {
  const stepped = Math.round((val - props.min) / props.step) * props.step + props.min
  return Math.max(props.min, Math.min(props.max, stepped))
}

function posToValue(clientX: number): number {
  if (!trackRef.value) return props.min
  const rect = trackRef.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  return snapToStep(props.min + ratio * (props.max - props.min))
}

function onInputChange(val: string) {
  const n = Number(val)
  if (isNaN(n)) return
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
  const delta =
    e.key === 'ArrowRight' || e.key === 'ArrowUp'
      ? props.step
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
        ? -props.step
        : 0
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
      :min="min"
      :max="max"
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
        :aria-valuemin="min"
        :aria-valuemax="max"
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
    <span v-if="showText" class="progress-text">{{ Math.round(percent) }}%</span>
  </div>
</template>

<style scoped>
/* ===== 只读进度条 ===== */
.progress-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
}
.progress-track {
  flex: 1;
  background: var(--color-bg-alt);
  border-radius: calc(100px * var(--vcl-scale));
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: calc(100px * var(--vcl-scale));
  transition: width var(--transition-slow);
}
.fill-primary {
  background: var(--color-primary);
}
.fill-success {
  background: var(--color-success);
}
.fill-warning {
  background: var(--color-warning);
}
.fill-danger {
  background: var(--color-danger);
}
.progress-fill.striped {
  background-image: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.15) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.15) 75%,
    transparent 75%,
    transparent
  );
  background-size: calc(16px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
}
.progress-fill.animated.striped {
  animation: progress-stripe 0.6s linear infinite;
}
@keyframes progress-stripe {
  to {
    background-position: calc(16px * var(--vcl-scale)) 0;
  }
}
.progress-text {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--color-text-secondary);
  font-weight: 500;
  min-width: calc(40px * var(--vcl-scale));
  text-align: right;
}

/* ===== 滑块模式 ===== */
.progress-slider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  --thumb-size: calc(14px * var(--vcl-scale));
  --track-height: calc(6px * var(--vcl-scale));
}

/* 输入框 — 与滑块视觉协调 */
.slider-input {
  width: calc(42px * var(--vcl-scale));
  flex-shrink: 0;
  height: calc(26px * var(--vcl-scale));
  padding: 0 var(--space-1);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: calc(15px * var(--vcl-scale));
  font-family: inherit;
  text-align: center;
  color: var(--color-text);
  background: var(--color-surface);
  outline: none;
  transition: border-color var(--transition-fast);
}
.slider-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

/* 轨道 */
.slider-track {
  flex: 1;
  position: relative;
  height: var(--track-height);
  margin: calc(var(--thumb-size) / 2) 0;
  cursor: pointer;
  touch-action: none;
  border-radius: calc(100px * var(--vcl-scale));
}
.slider-track.dragging {
  cursor: grabbing;
}

/* 轨道背景 */
.slider-rail {
  position: absolute;
  inset: 0;
  background: var(--color-bg-alt);
  border-radius: calc(100px * var(--vcl-scale));
}

/* 填充条 */
.slider-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background: var(--color-primary);
  border-radius: calc(100px * var(--vcl-scale));
  pointer-events: none;
}

/* 刻度 */
.slider-stops {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.slider-stop {
  position: absolute;
  top: 50%;
  width: calc(5px * var(--vcl-scale));
  height: calc(5px * var(--vcl-scale));
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
}
.slider-stop.active {
  border-color: var(--color-primary);
}

/* 滑块拇指 */
.slider-thumb {
  position: absolute;
  top: 50%;
  width: var(--thumb-size);
  height: var(--thumb-size);
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--color-surface);
  border: 2px solid var(--color-primary);
  box-shadow: var(--shadow-sm);
  cursor: grab;
  z-index: 2;
  transition:
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
}
.slider-thumb:focus-visible {
  box-shadow: 0 0 0 3px var(--color-primary-light);
  outline: none;
}
.slider-thumb.dragging {
  cursor: grabbing;
  box-shadow: var(--shadow-md);
  transform: translate(-50%, -50%) scale(1.15);
}

.progress-slider.disabled {
  opacity: 0.5;
  pointer-events: none;
}
</style>
