<script setup lang="ts">
import { reportError } from '@/components/_internal/runtime-observer'
// ⛔ 保护 — 统一输入组件，禁止：clamp() → px，浮动标签动画时序，type 枚举修改
//    需我确认：校验规则接口、新增 type
// ⭐ 统一上浮骑缝（floating）样式 — 标签上浮骑缝，视觉统一，节省空间
//    合并：Input + InputNumber + Textarea
//    type 取值：text | password | email | tel | number | textarea | search | url
//    日期/时间选择已移至 Select 组件（type=date / date-range / time）
import { ref, computed, watch, onMounted, onUnmounted, nextTick, onErrorCaptured } from 'vue'
const _error = ref<Error | null>(null)
onErrorCaptured((e: Error) => {
  reportError('[Input] 内部异常已隔离:', e.message)
  _error.value = e
  return false
})
import IconSvg from '@/components/basic/IconSvg.vue'
import { useT } from '@/components/_internal/i18n'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { toNativeColorValue } from '@/components/_internal/utils'
import { useInputStepper } from './useInputStepper'

const t = useT()

/** 自动填充检测的兜底延迟：MutationObserver 挂上之前浏览器可能已经填完（首帧后补测一次） */
const AUTOFILL_FALLBACK_MS = 300

/** 无障碍：label 与控件关联的唯一 id（number/textarea/text 三模式互斥，共享同一 id） */
const inputId = useIdSafe('input')
/** 错误文本元素 id：aria-describedby 关联（错误提示对读屏可感知） */
const errorDescId = useIdSafe('input-error')

/* ════════════════════════════════════════
   Props — 统一接口
   ════════════════════════════════════════ */
interface Props {
  /** 统一类型：text | password | email | tel | number | textarea | search | url | color */
  type?: 'text' | 'password' | 'email' | 'tel' | 'number' | 'textarea' | 'search' | 'url' | 'color'
  /** 受控值：数字模式回传 number，其余 string；可为 null */
  modelValue: string | number | null
  /** 浮动标签文案 */
  label?: string
  /** 输入框前置图标（IconSvg 图标名） */
  icon?: string
  /** 占位文案 */
  placeholder?: string
  /** 禁用 */
  disabled?: boolean
  /** 只读 */
  readonly?: boolean
  /** 校验规则 */
  rules?: ((v: string) => string | undefined)[]
  /** 控件下方帮助文案 */
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
  /** 显示一键清空按钮（默认关） */
  clearable?: boolean
  /** 原生 maxlength */
  maxlength?: number
  /** 原生 minlength */
  minlength?: number
  /** textarea 行数 */
  rows?: number
  /** 后缀文字（输入框内右侧固定显示，如单位 "元" / "kg"） */
  suffix?: string
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

// 入参变化 = 内容已变：清错误态让控件重渲染一次，否则 ⚠ 降级提示会永久卡死（仍坏会再次捕获，不成环）
watch(
  () => ({ ...props }),
  () => (_error.value = null),
)

const emit = defineEmits<{
  /** v-model——受控值 */
  'update:modelValue': [v: string | number | null]
  /** 获得焦点（原生事件） */
  focus: [e: FocusEvent]
  /** 失去焦点（原生事件） */
  blur: [e: FocusEvent]
  /** 按键抬起（原生事件） */
  keyup: [e: KeyboardEvent]
  /** 点击清空按钮后触发 */
  clear: []
  /** 值提交（失焦/回车，语义同原生 change） */
  change: [v: string | number | null]
}>()

/* ════════════════════════════════════════
   模式判断
   ════════════════════════════════════════ */
const isNumber = computed(() => props.type === 'number')
const isStepper = computed(() => isNumber.value && props.stepper)
const isTextarea = computed(() => props.type === 'textarea')
const isColor = computed(() => props.type === 'color')
/** 原生取色器只认 #rrggbb，其余写法（red / #abc / var(--x)）先归一再喂，显示与回传仍用原值 */
const nativeColorValue = computed(() => toNativeColorValue(props.modelValue))

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
    if (msg) {
      errorMsg.value = msg
      return
    }
  }
  errorMsg.value = ''
}

watch(
  () => props.modelValue,
  () => {
    if (touched.value) validate()
  },
)

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
  const fallbackTimer = setTimeout(checkAutoFill, AUTOFILL_FALLBACK_MS)
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
  if (_afFallbackTimer) {
    clearTimeout(_afFallbackTimer)
    _afFallbackTimer = null
  }
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

function onTaFocus() {
  taFocused.value = true
  emit('focus', new FocusEvent('focus'))
}
function onTaBlur(e: FocusEvent) {
  taFocused.value = false
  touched.value = true
  validate()
  emit('blur', e)
}
function onTaInput(e: Event) {
  const v = (e.target as HTMLTextAreaElement).value
  emit('update:modelValue', v)
  emit('change', v)
}

/* ════════════════════════════════════════
   数字步进模式（原 InputNumber，逻辑下沉 useInputStepper）
   失焦编排 onStepperBlur 牵涉 focused/touched/validate，留在宿主；
   数值口径 / 输入 / 提交 / 步进 / 长按由 useInputStepper 提供
   ════════════════════════════════════════ */
const {
  numText,
  onNumInput,
  commitNum,
  clearNumValue,
  onNumKeydown,
  clearHold,
  onBtnDown,
  onBtnClick,
  minusDisabled,
  plusDisabled,
} = useInputStepper(props, {
  emit: (event, value) => {
    if (event === 'clear') emit('clear')
    else if (event === 'change') emit('change', value ?? null)
    else emit('update:modelValue', value ?? null)
  },
})

function onStepperBlur(e: FocusEvent) {
  focused.value = false
  touched.value = true
  commitNum()
  // 失焦触发规则校验：此前 touched 恒 false，number 字段配了 rules 也永不出错（与 text 口径不一致）
  validate()
  // number 模式此前从不 emit blur（消费方拿得到 focus 拿不到 blur），补齐
  emit('blur', e)
}

function clearTaValue() {
  emit('update:modelValue', '')
  emit('clear')
}

function clearTextValue() {
  emit('update:modelValue', '')
  emit('clear')
}

const floatingRaised = computed(() => {
  if (isTextarea.value) return taFocused.value || hasTaValue.value
  if (isStepper.value) return true // stepper 模式标签固定
  return focused.value || hasValue.value || autoFilled.value
})
</script>

<template>
  <div
    v-if="_error"
    class="input-field"
    style="
      color: var(--vcl-color-danger-on-surface);
      padding: var(--vcl-space-2);
      font-size: calc(12px * var(--vcl-scale));
    "
  >
    ⚠ {{ t('form.inputError') }}
  </div>
  <div v-else class="input-field" :class="{ error: !!errorMsg, disabled }">
    <!-- ════════════════════════════════════════
         数字步进模式（原 InputNumber）
         ════════════════════════════════════════ -->
    <template v-if="isStepper">
      <div class="stepper-wrap" :class="[`size-${size}`, { disabled, focused }]">
        <input
          :id="inputId"
          ref="floatInputRef"
          class="step-input"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :aria-label="label || placeholder || undefined"
          :value="numText"
          :placeholder="placeholder"
          :disabled="disabled"
          @input="onNumInput"
          @focus="focused = true"
          @blur="onStepperBlur"
          @keydown="onNumKeydown"
        />
        <!-- stepper 模式的标签：浮窗模式用 .fl-label 浮动效果，此处静态标签即可，
             但必须与 inputId 关联 —— 否则 input 无可访问名（axe label 违规） -->
        <label v-if="label" class="step-label" :for="inputId" :title="label">{{ label }}</label>
        <div class="step-controls">
          <button
            type="button"
            class="step-btn up"
            tabindex="-1"
            :disabled="disabled || plusDisabled"
            :aria-label="t('form.increase')"
            @pointerdown="onBtnDown(1, $event)"
            @pointerup="clearHold"
            @pointerleave="clearHold"
            @pointercancel="clearHold"
            @click="onBtnClick(1)"
          >
            <IconSvg type="plus" size="sm" />
          </button>
          <button
            type="button"
            class="step-btn down"
            tabindex="-1"
            :disabled="disabled || minusDisabled"
            :aria-label="t('form.decrease')"
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
      <div
        class="fl-wrap"
        :class="{
          focused: focused && !errorMsg,
          'has-error': !!errorMsg,
          'has-icon': !!icon,
          disabled,
          'is-textarea': false,
        }"
      >
        <IconSvg v-if="icon" :type="icon" size="md" class="fl-icon" />
        <input
          :id="inputId"
          ref="floatInputRef"
          :aria-label="label || placeholder || undefined"
          :aria-invalid="!!errorMsg || undefined"
          :aria-describedby="errorMsg ? errorDescId : undefined"
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
          @blur="onStepperBlur"
          @keydown="onNumKeydown"
          @keyup="emit('keyup', $event)"
          @animationstart="onAutoFillStart"
        />
        <label v-if="label" class="fl-label" :for="inputId" :title="label" :class="{ raised: floatingRaised }">{{
          label
        }}</label>
        <button
          v-if="clearable && hasValue"
          type="button"
          class="f-clear"
          tabindex="-1"
          :aria-label="t('common.reset')"
          @click="clearNumValue"
        >
          <IconSvg type="x" size="sm" />
        </button>
      </div>
      <p v-if="errorMsg" :id="errorDescId" class="fl-error" role="alert">
        {{ errorMsg }}
      </p>
      <p v-else-if="hint" class="fl-hint">
        {{ hint }}
      </p>
    </div>

    <!-- ════════════════════════════════════════
         Textarea 模式
         ════════════════════════════════════════ -->
    <div v-else-if="isTextarea" class="fl-container">
      <div class="fl-wrap is-textarea" :class="{ focused: taFocused && !errorMsg, 'has-error': !!errorMsg, disabled }">
        <textarea
          :id="inputId"
          ref="floatInputRef"
          :aria-label="label || placeholder || undefined"
          :aria-invalid="!!errorMsg || undefined"
          :aria-describedby="errorMsg ? errorDescId : undefined"
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
        <label v-if="label" class="fl-label" :for="inputId" :title="label" :class="{ raised: floatingRaised }">{{
          label
        }}</label>
        <button
          v-if="clearable && hasTaValue"
          type="button"
          class="f-clear"
          tabindex="-1"
          :aria-label="t('common.reset')"
          @click="clearTaValue"
        >
          <IconSvg type="x" size="sm" />
        </button>
      </div>
      <p v-if="errorMsg" :id="errorDescId" class="fl-error" role="alert">
        {{ errorMsg }}
      </p>
      <p v-else-if="hint" class="fl-hint">
        {{ hint }}
      </p>
    </div>

    <!-- ════════════════════════════════════════
         Color 取色模式（原生 color 输入 + 色值显示）
         ════════════════════════════════════════ -->
    <div v-else-if="isColor" class="fl-container">
      <div class="fl-wrap" :class="{ focused: focused && !errorMsg, 'has-error': !!errorMsg, disabled }">
        <input
          :id="inputId"
          ref="floatInputRef"
          :aria-label="label || placeholder || undefined"
          :aria-invalid="!!errorMsg || undefined"
          :aria-describedby="errorMsg ? errorDescId : undefined"
          type="color"
          class="f-color"
          :value="nativeColorValue"
          :disabled="disabled"
          :name="name"
          @input="onInput"
          @focus="onFocus"
          @blur="onBlur"
        />
        <span class="f-color-hex">{{ String(modelValue ?? '') || '—' }}</span>
        <label v-if="label" class="fl-label" :for="inputId" :title="label" :class="{ raised: floatingRaised }">{{
          label
        }}</label>
      </div>
      <p v-if="errorMsg" :id="errorDescId" class="fl-error" role="alert">
        {{ errorMsg }}
      </p>
      <p v-else-if="hint" class="fl-hint">
        {{ hint }}
      </p>
    </div>

    <!-- ════════════════════════════════════════
         标准文本输入（text/password/email/tel/search/url）
         ════════════════════════════════════════ -->
    <div v-else class="fl-container">
      <div
        class="fl-wrap"
        :class="{ focused: focused && !errorMsg, 'has-error': !!errorMsg, 'has-icon': !!icon, disabled }"
      >
        <IconSvg v-if="icon" :type="icon" size="md" class="fl-icon" />
        <input
          :id="inputId"
          ref="floatInputRef"
          :aria-label="label || placeholder || undefined"
          :aria-invalid="!!errorMsg || undefined"
          :aria-describedby="errorMsg ? errorDescId : undefined"
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
        <label v-if="label" class="fl-label" :for="inputId" :title="label" :class="{ raised: floatingRaised }">{{
          label
        }}</label>
        <span v-if="suffix" class="fl-suffix" aria-hidden="true">{{ suffix }}</span>
        <button
          v-if="type === 'password'"
          type="button"
          class="f-toggle-pwd"
          tabindex="-1"
          :aria-label="showPassword ? t('form.passwordHidden') : t('form.passwordShown')"
          @click="showPassword = !showPassword"
        >
          <IconSvg :type="showPassword ? 'eye-off' : 'eye'" size="sm" />
        </button>
        <button
          v-if="clearable && hasValue && type !== 'password'"
          type="button"
          class="f-clear"
          tabindex="-1"
          :aria-label="t('common.reset')"
          @click="clearTextValue"
        >
          <IconSvg type="x" size="sm" />
        </button>
        <span v-if="type === 'password'" class="sr-only" role="status" aria-live="polite">{{
          showPassword ? t('form.passwordShown') : t('form.passwordHidden')
        }}</span>
      </div>
      <p v-if="errorMsg" :id="errorDescId" class="fl-error" role="alert">
        {{ errorMsg }}
      </p>
      <p v-else-if="hint" class="fl-hint">
        {{ hint }}
      </p>
    </div>
  </div>
</template>

<style src="./input-scoped.css" scoped></style>
