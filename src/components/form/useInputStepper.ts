/**
 * useInputStepper — Input 数字步进模式（原 InputNumber）逻辑
 * （自 Input.vue 下沉，M3 持续拆分；对齐 useSelect* 的依赖注入约定）
 *
 * 承接：numText（受控文本）、numPrecision / displayNum / roundTo / clampRound（数值口径）、
 * onNumInput / commitNum / clearNumValue（输入与提交）、stepBy / onNumKeydown /
 * onBtnDown / onBtnClick（步进 + 长按连加）、minusDisabled / plusDisabled。
 * 依赖面收窄：props 取响应式对象（useSelectDatePanel 同法，宿主重渲染读最新值）；
 * emit 走注入。失焦编排（onStepperBlur）仍留在宿主（牵涉 focused/touched/validate 跨块状态）。
 * 类型本地化（不反向 import Input.vue，避免循环）。
 */
import { ref, computed, watch } from 'vue'

/** Input 数字步进所需的最小 props 形状（宿主 Props 的超集，结构兼容） */
interface StepperProps {
  type: string
  step: number
  precision?: number
  min?: number | null
  max?: number | null
  modelValue: unknown
  disabled: boolean
}

/** 长按连加的首触发延迟 / 连加间隔 */
const _STEP_HOLD_MS = 400
const _STEP_REPEAT_MS = 100

export function useInputStepper(
  props: StepperProps,
  o: {
    /** emit：数值提交/清空（update:modelValue + change 载荷 number|null；clear 无载荷） */
    emit: (event: 'update:modelValue' | 'change' | 'clear', value?: number | null) => void
  },
) {
  const numText = ref('')

  const numPrecision = computed(() => {
    if (props.precision != null) return Math.max(0, Math.floor(props.precision))
    const m = /\.(\d+)$/.exec(String(props.step))
    return m ? m[1].length : 0
  })

  function displayNum(v: number | null | undefined): string {
    return v === null || v === undefined || !Number.isFinite(v) ? '' : String(v)
  }

  function roundTo(v: number): number {
    return Number(v.toFixed(numPrecision.value))
  }

  function clampRound(v: number): number {
    let n = roundTo(v)
    if (props.min != null && n < props.min) n = props.min
    if (props.max != null && n > props.max) n = props.max
    return n
  }

  watch(
    () => props.modelValue,
    (v) => {
      if (props.type !== 'number') return
      const parsed = Number(numText.value)
      if (numText.value === '' && (v === null || v === undefined)) return
      if (Number.isFinite(parsed) && parsed === v) return
      numText.value = displayNum(v as number | null)
    },
    { immediate: true },
  )

  function onNumInput(e: Event) {
    const raw = (e.target as HTMLInputElement).value
    if (raw.trim() === '') {
      numText.value = ''
      o.emit('update:modelValue', null)
      return
    }
    if (!/^-?\d*\.?\d*$/.test(raw)) {
      numText.value = displayNum(props.modelValue as number | null)
      return
    }
    numText.value = raw
    const n = Number(raw)
    if (Number.isFinite(n)) {
      o.emit('update:modelValue', n)
      o.emit('change', n)
    }
  }

  function commitNum() {
    const raw = numText.value.trim()
    if (raw === '') {
      o.emit('update:modelValue', null)
      o.emit('change', null)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) {
      numText.value = displayNum(props.modelValue as number | null)
      return
    }
    const next = clampRound(n)
    numText.value = displayNum(next)
    o.emit('update:modelValue', next)
    o.emit('change', next)
  }

  function clearNumValue() {
    o.emit('update:modelValue', null)
    o.emit('clear')
  }

  function stepBy(dir: 1 | -1) {
    const st = props.step > 0 ? props.step : 1
    const base = (props.modelValue as number) ?? 0
    const next = clampRound(base + dir * st)
    numText.value = displayNum(next)
    o.emit('update:modelValue', next)
    o.emit('change', next)
  }

  function onNumKeydown(e: KeyboardEvent) {
    if (props.disabled) return
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      stepBy(1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      stepBy(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commitNum()
    }
  }

  // 长按连加
  let _holdTimer: ReturnType<typeof setTimeout> | null = null
  let _holdInterval: ReturnType<typeof setInterval> | null = null
  let _pointerHandled = false

  function clearHold() {
    if (_holdTimer) {
      clearTimeout(_holdTimer)
      _holdTimer = null
    }
    if (_holdInterval) {
      clearInterval(_holdInterval)
      _holdInterval = null
    }
  }

  function onBtnDown(dir: 1 | -1, e: PointerEvent) {
    if (props.disabled) return
    e.preventDefault()
    _pointerHandled = true
    stepBy(dir)
    clearHold()
    _holdTimer = setTimeout(() => {
      _holdInterval = setInterval(() => {
        if (props.disabled) {
          clearHold()
          return
        }
        stepBy(dir)
      }, _STEP_REPEAT_MS)
    }, _STEP_HOLD_MS)
  }

  function onBtnClick(dir: 1 | -1) {
    if (_pointerHandled) {
      _pointerHandled = false
      return
    }
    stepBy(dir)
  }

  const minusDisabled = computed(() => props.min != null && ((props.modelValue as number) ?? 0) <= props.min)
  const plusDisabled = computed(() => props.max != null && ((props.modelValue as number) ?? 0) >= props.max)

  return {
    numText,
    numPrecision,
    displayNum,
    onNumInput,
    commitNum,
    clearNumValue,
    onNumKeydown,
    clearHold,
    onBtnDown,
    onBtnClick,
    minusDisabled,
    plusDisabled,
  }
}
