<script setup lang="ts">
// ⛔ 保护 — 统一输入组件，禁止：clamp() → px，浮动标签动画时序，type 枚举修改
//    需我确认：校验规则接口、新增 type
// ⭐ 统一上浮骑缝（floating）样式 — 标签上浮骑缝，视觉统一，节省空间
//    合并：Input + InputNumber + Textarea
//    type 取值：text | password | email | tel | number | textarea | search | url
//    日期/时间选择已移至 Select 组件（type=date / date-range / time）
import { ref, computed, watch, onMounted, onUnmounted, nextTick, onErrorCaptured } from 'vue'
const _error = ref<Error | null>(null)
onErrorCaptured((e: Error) => { _error.value = e; return false })
import IconSvg from '@/components/basic/IconSvg.vue'

/* ════════════════════════════════════════
   Props — 统一接口
   ════════════════════════════════════════ */
interface Props {
  /** 统一类型：text | password | email | tel | number | textarea | search | url */
  type?: 'text' | 'password' | 'email' | 'tel' | 'number' | 'textarea' | 'search' | 'url'
  modelValue: string | number | null
  label?: string
  icon?: string
  placeholder?: string
  disabled?: boolean
  readonly?: boolean
  /** 校验规则 */
  rules?: ((v: string) => string | undefined)[]
  hint?: string
  /** HTML name 属性 */
  name?: string
  /** HTML autocomplete */
  autocomplete?: string
  /** 数字模式：显示加减按钮 */
  stepper?: boolean
  /** 数字模式：最小值 */
  min?: number | null
  /** 数字模式：最大值 */
  max?: number | null
  /** 数字模式：步进值 */
  step?: number
  /** 数字模式：小数位数 */
  precision?: number
  /** 数字模式：尺寸 */
  size?: 'sm' | 'md' | 'lg'
  clearable?: boolean
  maxlength?: number
  minlength?: number
  /** textarea 行数 */
  rows?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  placeholder: '',
  disabled: false,
  readonly: false,
  rules: () => [],
  autocomplete: 'off',
  stepper: false,
  min: null,
  max: null,
  step: 1,
  precision: undefined,
  size: 'md',
  clearable: false,
  rows: 3,
})

const emit = defineEmits<{
  'update:modelValue': [v: string | number | null]
  focus: [e: FocusEvent]
  blur: [e: FocusEvent]
  keyup: [e: KeyboardEvent]
  clear: []
  change: [v: string | number | null]
}>()

/* ════════════════════════════════════════
   模式判断
   ════════════════════════════════════════ */
const isNumber = computed(() => props.type === 'number')
const isStepper = computed(() => isNumber.value && props.stepper)
const isTextarea = computed(() => props.type === 'textarea')

/* ════════════════════════════════════════
   通用状态
   ════════════════════════════════════════ */
const focused = ref(false)
const showPassword = ref(false)
const errorMsg = ref('')
const touched = ref(false)
const autoFilled = ref(false)
const floatInputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

const hasValue = computed(() => {
  const v = props.modelValue
  if (v === '' || v === null || v === undefined) return false
  return String(v).length > 0
})

const actualType = computed(() => {
  if (props.type === 'password' && showPassword.value) return 'text'
  if (isNumber.value) return 'text' // 数字用 inputmode=decimal
  return props.type as string
})

/* ════════════════════════════════════════
   校验
   ════════════════════════════════════════ */
function onFocus(e: FocusEvent) {
  focused.value = true
  if (floatInputRef.value && (floatInputRef.value as HTMLInputElement).value && !hasValue.value) autoFilled.value = true
  emit('focus', e)
}

function onBlur(e: FocusEvent) {
  focused.value = false
  touched.value = true
  validate()
  emit('blur', e)
}

function validate() {
  if (!props.rules?.length) return
  const val = props.modelValue == null ? '' : String(props.modelValue)
  for (const rule of props.rules) {
    const msg = rule(val)
    if (msg) { errorMsg.value = msg; return }
  }
  errorMsg.value = ''
}

watch(() => props.modelValue, () => { if (touched.value) validate() })

/* ════════════════════════════════════════
   自动填充检测 — MutationObserver 替代 setTimeout 轮询
   浏览器自动填充会修改 input.value 属性，通过 MutationObserver 监听
   value 属性变化 + animationstart 事件双保险
   ════════════════════════════════════════ */
let _afObserver: MutationObserver | null = null
let _afFallbackTimer: ReturnType<typeof setTimeout> | null = null
function onAutoFillStart(e: AnimationEvent) {
  if (e.animationName === 'onAutoFillStart') autoFilled.value = true
}
function checkAutoFill() {
  const el = floatInputRef.value as HTMLInputElement | null
  if (el?.value) autoFilled.value = true
}
onMounted(() => {
  // 初始检测（nextTick 确保 DOM 渲染完成）
  nextTick(checkAutoFill)
  // 兜底：某些浏览器自动填充发生在 nextTick 之后但 MutationObserver 之前
  // 用一个短延迟兜底，替代原来的 4 次轮询
  const fallbackTimer = setTimeout(checkAutoFill, 300)
  _afFallbackTimer = fallbackTimer
  // MutationObserver 监听 value 属性变化（浏览器自动填充时触发）
  const el = floatInputRef.value
  if (el && typeof MutationObserver !== 'undefined') {
    _afObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'value') {
          checkAutoFill()
          // 检测到自动填充后断开，避免重复回调
          _afObserver?.disconnect()
          _afObserver = null
          break
        }
      }
    })
    _afObserver.observe(el, { attributes: true, attributeFilter: ['value'] })
  }
})
onUnmounted(() => {
  if (_afFallbackTimer) { clearTimeout(_afFallbackTimer); _afFallbackTimer = null }
  _afObserver?.disconnect()
  _afObserver = null
  clearHold() // 清理长按定时器，防止组件卸载后 interval 继续执行
})

/* ════════════════════════════════════════
   文本/密码/搜索/URL/Email/Tel 输入
   ════════════════════════════════════════ */
function onInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  emit('update:modelValue', v)
  emit('change', v)
}

/* ════════════════════════════════════════
   Textarea 输入
   ════════════════════════════════════════ */
const taFocused = ref(false)
const taValue = computed(() => String(props.modelValue ?? ''))
const hasTaValue = computed(() => taValue.value.length > 0)

function onTaFocus() { taFocused.value = true; emit('focus', new FocusEvent('focus')) }
function onTaBlur(e: FocusEvent) {
  taFocused.value = false; touched.value = true; validate(); emit('blur', e)
}
function onTaInput(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', v)
  emit('change', v)
}

/* ════════════════════════════════════════
   数字步进模式（原 InputNumber）
   ════════════════════════════════════════ */
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
  v => {
    if (!isNumber.value) return
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
    emit('update:modelValue', null)
    return
  }
  if (!/^-?\d*\.?\d*$/.test(raw)) {
    numText.value = displayNum(props.modelValue as number | null)
    return
  }
  numText.value = raw
  const n = Number(raw)
  if (Number.isFinite(n)) {
    emit('update:modelValue', n)
    emit('change', n)
  }
}

function commitNum() {
  const raw = numText.value.trim()
  if (raw === '') {
    emit('update:modelValue', null)
    emit('change', null)
    return
  }
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    numText.value = displayNum(props.modelValue as number | null)
    return
  }
  const next = clampRound(n)
  numText.value = displayNum(next)
  emit('update:modelValue', next)
  emit('change', next)
}

function stepBy(dir: 1 | -1) {
  const st = props.step > 0 ? props.step : 1
  const base = (props.modelValue as number ?? 0)
  const next = clampRound(base + dir * st)
  numText.value = displayNum(next)
  emit('update:modelValue', next)
  emit('change', next)
}

function onNumKeydown(e: KeyboardEvent) {
  if (props.disabled) return
  if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1) }
  else if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1) }
  else if (e.key === 'Enter') { e.preventDefault(); commitNum() }
}

// 长按连加
let _holdTimer: ReturnType<typeof setTimeout> | null = null
let _holdInterval: ReturnType<typeof setInterval> | null = null
let _pointerHandled = false

function clearHold() {
  if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null }
  if (_holdInterval) { clearInterval(_holdInterval); _holdInterval = null }
}

function onBtnDown(dir: 1 | -1, e: PointerEvent) {
  if (props.disabled) return
  e.preventDefault()
  _pointerHandled = true
  stepBy(dir)
  clearHold()
  _holdTimer = setTimeout(() => {
    _holdInterval = setInterval(() => {
      if (props.disabled) { clearHold(); return }
      stepBy(dir)
    }, 100)
  }, 400)
}

function onBtnClick(dir: 1 | -1) {
  if (_pointerHandled) { _pointerHandled = false; return }
  stepBy(dir)
}

const minusDisabled = computed(() => props.min != null && ((props.modelValue as number) ?? 0) <= props.min)
const plusDisabled = computed(() => props.max != null && ((props.modelValue as number) ?? 0) >= props.max)

/* ----- 浮动标签上浮条件 ----- */
const floatingRaised = computed(() => {
  if (isTextarea.value) return taFocused.value || hasTaValue.value
  if (isStepper.value) return true // stepper 模式标签固定
  return focused.value || hasValue.value || autoFilled.value
})
</script>

<template>
  <div v-if="_error" class="input-field" style="color:var(--color-danger);padding:8px;font-size:12px">⚠ 输入组件异常</div>
  <div v-else class="input-field" :class="{ error: !!errorMsg, disabled }">

    <!-- ════════════════════════════════════════
         数字步进模式（原 InputNumber）
         ════════════════════════════════════════ -->
    <template v-if="isStepper">
      <div class="stepper-wrap" :class="[`size-${size}`, { disabled, focused }]">
        <input
          ref="floatInputRef"
          class="step-input"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :value="numText"
          :placeholder="placeholder"
          :disabled="disabled"
          @input="onNumInput"
          @focus="focused = true"
          @blur="focused = false; commitNum()"
          @keydown="onNumKeydown"
        />
        <div class="step-controls">
          <button
            type="button" class="step-btn up" tabindex="-1"
            :disabled="disabled || plusDisabled"
            aria-label="增加"
            @pointerdown="onBtnDown(1, $event)"
            @pointerup="clearHold"
            @pointerleave="clearHold"
            @pointercancel="clearHold"
            @click="onBtnClick(1)"
          >
            <IconSvg type="plus" size="sm" />
          </button>
          <button
            type="button" class="step-btn down" tabindex="-1"
            :disabled="disabled || minusDisabled"
            aria-label="减少"
            @pointerdown="onBtnDown(-1, $event)"
            @pointerup="clearHold"
            @pointerleave="clearHold"
            @pointercancel="clearHold"
            @click="onBtnClick(-1)"
          >
            <IconSvg type="minus" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- ════════════════════════════════════════
         纯数字输入（无步进按钮）
         ════════════════════════════════════════ -->
    <div v-else-if="isNumber && !isStepper" class="fl-container">
      <div class="fl-wrap" :class="{ focused: focused && !errorMsg, 'has-error': !!errorMsg, 'has-icon': !!icon, disabled, 'is-textarea': false }">
        <IconSvg v-if="icon" :type="icon" size="md" class="fl-icon" />
        <input
          ref="floatInputRef"
          class="f-input"
          type="text"
          inputmode="decimal"
          :value="numText"
          :placeholder="(focused || autoFilled) && !hasValue ? placeholder : ''"
          :disabled="disabled"
          :readonly="readonly"
          :name="name"
          :autocomplete="autocomplete"
          @input="onNumInput"
          @focus="onFocus"
          @blur="onBlur($event); commitNum()"
          @keydown="onNumKeydown"
          @keyup="emit('keyup', $event)"
          @animationstart="onAutoFillStart"
        />
        <label v-if="label" class="fl-label" :class="{ raised: floatingRaised }">{{ label }}</label>
        <button
          v-if="clearable && hasValue"
          type="button" class="f-clear" tabindex="-1"
          @click="emit('update:modelValue', null); emit('clear')"
        >
          <IconSvg type="x" size="sm" />
        </button>
      </div>
      <p v-if="errorMsg" class="fl-error">{{ errorMsg }}</p>
      <p v-else-if="hint" class="fl-hint">{{ hint }}</p>
    </div>

    <!-- ════════════════════════════════════════
         Textarea 模式
         ════════════════════════════════════════ -->
    <div v-else-if="isTextarea" class="fl-container">
      <div class="fl-wrap is-textarea" :class="{ focused: taFocused && !errorMsg, 'has-error': !!errorMsg, disabled }">
        <textarea
          ref="floatInputRef"
          class="f-textarea"
          :value="taValue"
          :placeholder="taFocused && !hasTaValue ? placeholder : ''"
          :disabled="disabled"
          :readonly="readonly"
          :rows="rows"
          :maxlength="maxlength"
          :minlength="minlength"
          :name="name"
          @input="onTaInput"
          @focus="onTaFocus"
          @blur="onTaBlur"
          @keyup="emit('keyup', $event)"
        />
        <label v-if="label" class="fl-label" :class="{ raised: floatingRaised }">{{ label }}</label>
        <button
          v-if="clearable && hasTaValue"
          type="button" class="f-clear" tabindex="-1"
          @click="emit('update:modelValue', ''); emit('clear')"
        >
          <IconSvg type="x" size="sm" />
        </button>
      </div>
      <p v-if="errorMsg" class="fl-error">{{ errorMsg }}</p>
      <p v-else-if="hint" class="fl-hint">{{ hint }}</p>
    </div>

    <!-- ════════════════════════════════════════
         标准文本输入（text/password/email/tel/search/url）
         ════════════════════════════════════════ -->
    <div v-else class="fl-container">
      <div class="fl-wrap" :class="{ focused: focused && !errorMsg, 'has-error': !!errorMsg, 'has-icon': !!icon, disabled }">
        <IconSvg v-if="icon" :type="icon" size="md" class="fl-icon" />
        <input
          ref="floatInputRef"
          :type="actualType"
          :value="String(modelValue ?? '')"
          :placeholder="(focused || autoFilled) && !hasValue ? placeholder : ''"
          :disabled="disabled"
          :readonly="readonly"
          :maxlength="maxlength"
          :minlength="minlength"
          :name="name"
          :autocomplete="autocomplete"
          class="f-input"
          @input="onInput"
          @focus="onFocus"
          @blur="onBlur"
          @keyup="emit('keyup', $event)"
          @animationstart="onAutoFillStart"
        />
        <label v-if="label" class="fl-label" :class="{ raised: floatingRaised }">{{ label }}</label>
        <button
          v-if="type === 'password'"
          type="button" class="f-toggle-pwd" tabindex="-1"
          @click="showPassword = !showPassword"
        >
          <IconSvg :type="showPassword ? 'eye-off' : 'eye'" size="sm" />
        </button>
        <button
          v-if="clearable && hasValue && type !== 'password'"
          type="button" class="f-clear" tabindex="-1"
          @click="emit('update:modelValue', ''); emit('clear')"
        >
          <IconSvg type="x" size="sm" />
        </button>
        <span v-if="type === 'password'" class="sr-only" role="status" aria-live="polite">{{ showPassword ? '密码已显示' : '密码已隐藏' }}</span>
      </div>
      <p v-if="errorMsg" class="fl-error">{{ errorMsg }}</p>
      <p v-else-if="hint" class="fl-hint">{{ hint }}</p>
    </div>

  </div>
</template>

<style scoped>
.input-field { display: flex; flex-direction: column; gap: var(--space-1); overflow: visible; }

/* ════════════════════════════════════════════════
   浮动标签容器 + 包裹层（内联，原 FloatingLabel 组件逻辑）
   ════════════════════════════════════════════════ */
.fl-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  max-width: 100%;
}

.fl-wrap {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.fl-wrap.focused {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}
.fl-wrap.has-error {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}
.fl-wrap.disabled {
  opacity: 0.5;
  background: var(--color-bg-alt);
}
.fl-wrap.disabled input,
.fl-wrap.disabled textarea {
  cursor: not-allowed;
  color: var(--color-text);
}
.fl-wrap.is-textarea {
  align-items: flex-start;
}

/* 图标 */
.fl-icon {
  flex-shrink: 0;
  margin-left: clamp(10px, 1.5vw, 12px);
  color: var(--color-text-muted);
}
.fl-wrap.has-icon .fl-label:not(.raised) {
  left: calc(var(--ctrl-padding-x, clamp(10px, 1.5vw, 14px)) + 32px);
}
.fl-wrap.focused .fl-icon {
  color: var(--color-primary);
}

/* 浮动标签 */
.fl-label {
  position: absolute;
  left: var(--ctrl-padding-x, clamp(10px, 1.5vw, 14px));
  top: 50%;
  transform: translateY(-50%);
  font-size: clamp(12px, 1.8vw, 14px);
  color: var(--color-text-muted);
  pointer-events: none;
  transition: all var(--transition-fast);
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 16px);
  z-index: 1;
}
.fl-label.raised {
  top: 0;
  transform: translateY(-50%);
  font-size: clamp(10px, 1.5vw, 11px);
  color: var(--color-primary);
  background: var(--color-surface);
  padding: 0 var(--space-1);
  left: calc(var(--ctrl-padding-x, clamp(10px, 1.5vw, 14px)) - 4px);
}
.fl-wrap.has-error .fl-label.raised {
  color: var(--color-danger);
}
.fl-wrap.is-textarea .fl-label {
  top: clamp(10px, 1.5vw, 14px);
  transform: none;
}
.fl-wrap.is-textarea .fl-label.raised {
  top: 0;
  transform: translateY(-50%);
}

/* 错误/帮助文案 */
.fl-error {
  font-size: clamp(12px, 1.8vw, 13px);
  font-weight: 600;
  color: var(--color-danger);
  padding-left: var(--space-1);
}
.fl-hint {
  font-size: clamp(12px, 1.8vw, 13px);
  font-weight: 500;
  color: var(--color-text-muted);
  padding-left: var(--space-1);
}

/* ── 错误态边框覆盖 ── */
.input-field.error .fl-wrap {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
}
.input-field.disabled .fl-wrap {
  opacity: 1;
  background: var(--bg-secondary, #f4f5f7);
}
.input-field.disabled .fl-wrap input,
.input-field.disabled .fl-wrap textarea {
  color: var(--color-text);
  cursor: not-allowed;
}
.input-error-msg { color: var(--color-danger); font-size: 12px; margin-top: 4px; line-height: 1.4; }

/* ===== floating 模式 — 输入控件样式 ===== */
.f-input {
  flex: 1; min-width: 0; height: var(--ctrl-height, clamp(42px, 7vw, 48px));
  padding: 0 var(--ctrl-padding-x, clamp(8px, 1.5vw, 12px)); padding-left: clamp(6px, 1vw, 8px);
  border: none; background: transparent;
  font-size: var(--ctrl-font-size, clamp(13px, 2vw, 15px)); color: var(--color-text); outline: none;
}
.fl-wrap:not(.has-icon) .f-input {
  padding-left: var(--ctrl-padding-x, clamp(10px, 1.5vw, 14px));
}

/* textarea */
.f-textarea {
  flex: 1; min-width: 0; width: 100%;
  min-height: 60px;
  padding: clamp(10px, 1.5vw, 14px) clamp(8px, 1.5vw, 12px);
  border: none; background: transparent; outline: none; resize: vertical;
  font-size: var(--ctrl-font-size, clamp(13px, 2vw, 15px));
  font-family: inherit; color: var(--color-text);
  line-height: 1.5;
}

/* 密码显示/隐藏按钮 — 始终显示，保持右侧布局统一 */
.f-toggle-pwd { position: absolute; right: 8px; display: flex; padding: var(--space-1); border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }
/* 清除按钮 */
.f-clear { position: absolute; right: 8px; display: flex; padding: var(--space-1); border: none; background: transparent; color: var(--color-text-muted); cursor: pointer; }
.fl-wrap:has(.f-toggle-pwd) .f-input,
.fl-wrap:has(.f-clear) .f-input {
  padding-right: 34px;
}
.f-input::-ms-reveal,
.f-input::-ms-clear { display: none; }
.f-input::-webkit-credentials-auto-fill-button { visibility: hidden; }

/* ── 浏览器自动填充 ── */
.f-input:-webkit-autofill,
.f-input:-webkit-autofill:hover,
.f-input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px var(--color-surface) inset;
  -webkit-text-fill-color: var(--color-text);
  caret-color: var(--color-text);
  transition: background-color 5000s ease-in-out 0s;
}
.f-input:-webkit-autofill { animation-name: onAutoFillStart; }
@keyframes onAutoFillStart { from { opacity: 0.99 } to { opacity: 1 } }

.f-input:-webkit-autofill ~ .fl-label,
.f-input:autofill ~ .fl-label {
  top: 0; transform: translateY(-50%);
  font-size: clamp(10px, 1.5vw, 11px); color: var(--color-primary);
  background: var(--color-surface); padding: 0 var(--space-1);
  left: calc(clamp(36px, 5.5vw, 40px) - 4px);
}
.fl-wrap:not(.has-icon) .f-input:-webkit-autofill ~ .fl-label,
.fl-wrap:not(.has-icon) .f-input:autofill ~ .fl-label {
  left: calc(var(--ctrl-padding-x, clamp(10px, 1.5vw, 14px)) - 4px);
}
.input-field.error .f-input:-webkit-autofill ~ .fl-label,
.input-field.error .f-input:autofill ~ .fl-label {
  color: var(--color-danger);
}
.fl-wrap:has(.f-input:-webkit-autofill) .fl-icon,
.fl-wrap:has(.f-input:autofill) .fl-icon {
  color: var(--color-primary);
}

/* ===== 数字步进器 ===== */
.stepper-wrap {
  display: inline-flex;
  align-items: stretch;
  width: 160px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--ctrl-radius, var(--radius-md));
  background: var(--color-surface);
  overflow: hidden;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.stepper-wrap.focused {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}
.stepper-wrap.disabled {
  opacity: 0.5;
  background: var(--color-bg-alt);
  pointer-events: none;
}
.step-input {
  flex: 1;
  min-width: 0;
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  color: var(--color-text);
  font-family: inherit;
  text-align: center;
}
.step-input::placeholder { color: var(--color-text-muted); }

/* 尺寸 */
.size-sm .step-input { height: 30px; font-size: 12px; padding: 0 var(--space-2); }
.size-md .step-input { height: var(--ctrl-height, clamp(38px, 6vw, 42px)); font-size: var(--ctrl-font-size, clamp(13px, 1.8vw, 14px)); padding: 0 var(--ctrl-padding-x, clamp(10px, 1.5vw, 14px)); }
.size-lg .step-input { height: 46px; font-size: 15px; padding: 0 var(--space-4); }

/* 步进按钮（上下排） */
.step-controls {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.step-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  width: 26px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.step-btn + .step-btn { border-top: 1px solid var(--color-border-light); }
.step-btn:hover:not(:disabled) { background: var(--color-bg-alt); }
.step-btn:active:not(:disabled) { background: var(--color-primary-light); color: var(--color-primary); }
.step-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* 无障碍 */
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
</style>
