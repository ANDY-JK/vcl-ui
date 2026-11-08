<script setup lang="ts">
/**
 * InputOTP — 一次性验证码输入（分段格子，整串一个值）
 *
 * ## 为什么不直接用 Input
 *
 * 验证码的交互不是"一个输入框"：粘贴要整串落位、退格要跨格回退、方向键要在格子间移动、
 * 数字要自动前进。这些用单个 input + 视觉背景切割也能做，但**粘贴与退格的行为会错**：
 * 单框里粘贴 6 位会一次性塞进一格，退格会把整串删掉。所以这里是真的 N 个 input。
 *
 * ## 值的形态
 *
 * 对外只有一个 `modelValue: string`（不足位补空，不补占位符），
 * 内部按位拆分 —— 宿主拿到的永远是可以直接提交的整串，不用自己拼。
 *
 * ## 密排取向
 *
 * 格子 36×42、间距 8，一行放完；不自带标题/说明（那是宿主表单的事），
 * 也不给格子加内阴影/立体感 —— 密排界面里 6 个立体格子会抢走整屏注意力。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { canWrite } from '@/components/_internal/writable'

interface Props {
  /** 整串值：不足 `length` 位时右侧留空（不补占位符） */
  modelValue: string
  /** 位数（默认 6；短信码 4~6、TOTP 6、部分平台 8） */
  length?: number
  /** numeric = 只收数字；alphanumeric = 数字+字母（TOTP 长密钥场景） */
  type?: 'numeric' | 'alphanumeric'
  /** 整组禁用 */
  disabled?: boolean
  /** 只读（可聚焦可复制，不可改） */
  readonly?: boolean
  /** 无障碍名：读屏念「<名字>，6 位验证码」 */
  ariaLabel?: string
  /** 是否自动聚焦第一格（模态里通常要） */
  autofocus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  length: 6,
  type: 'numeric',
  disabled: false,
  readonly: false,
  ariaLabel: '',
  autofocus: false,
})

const emit = defineEmits<{
  /** 整串值变化（每敲一位都会更新，宿主可用 `length` 判断是否输完） */
  'update:modelValue': [value: string]
  /** 输满时的回调：宿主不必自己数位数 */
  complete: [value: string]
}>()

const uid = useIdSafe('dtp-otp')
const inputs = ref<HTMLInputElement[]>([])

/**
 * 内部镜像值。
 * 为什么不是纯受控：纯受控下"没有 v-model 的宿主"敲字看不到任何变化（值永远回弹）。
 * 这里本地先落值、再通知宿主；宿主用 v-model 时 props 更新会覆盖本地（行为仍受控）。
 * 同时它也是**重复 emit 的守门人**：值没变就不抛，complete 不会连抛两次。
 */
const local = ref<string>(props.modelValue ?? '')

watch(
  () => props.modelValue,
  (v) => {
    local.value = sanitize(v ?? '')
  },
)

/** 按位拆分（右补空串），保证渲染出 length 个格子 */
const chars = computed<string[]>(() => Array.from({ length: props.length }, (_, i) => local.value[i] ?? ''))

/** 是否已输满 */
const isComplete = computed(() => local.value.length >= props.length)

/** 只保留合法字符：numeric 去非数字，alphanumeric 去非字母数字；统一大写（TOTP 约定） */
function sanitize(raw: string): string {
  const re = props.type === 'numeric' ? /\D/g : /[^0-9a-zA-Z]/g
  return raw.replace(re, '').toUpperCase().slice(0, props.length)
}

/** 把整串写回宿主，并在刚好输满时抛 complete */
function commit(next: string) {
  const value = sanitize(next)
  if (value === local.value) return
  local.value = value
  emit('update:modelValue', value)
  if (value.length >= props.length) emit('complete', value)
}

function setInputEl(el: Element | null, i: number) {
  if (el) inputs.value[i] = el as HTMLInputElement
}

function focusAt(i: number) {
  const target = Math.max(0, Math.min(props.length - 1, i))
  inputs.value[target]?.focus()
  inputs.value[target]?.select()
}

/** 单格输入：写第 i 位；多位（移动端一次补全/输入法）就整串落位 */
function onInput(i: number, e: Event) {
  const el = e.target as HTMLInputElement
  const typed = sanitize(el.value)
  const base = chars.value.slice()
  if (typed.length > 1) {
    // 整串落位（粘贴、输入法一次性给整串）：从第 i 位往后铺
    for (const ch of typed) {
      if (i >= props.length) break
      base[i] = ch
      i++
    }
    commit(base.join(''))
    nextTick(() => focusAt(Math.min(i, props.length - 1)))
    return
  }
  base[i] = typed
  commit(base.join(''))
  // 输入后自动前进；已到末格则留在原地
  if (typed) nextTick(() => focusAt(i + 1))
  else el.value = ''
}

/** 退格：当前格有值就清掉；已空则回退到前一格并清掉它 */
function onKeydown(i: number, e: KeyboardEvent) {
  if (!canWrite(props)) return
  if (e.key === 'Backspace') {
    e.preventDefault()
    const base = chars.value.slice()
    if (base[i]) {
      base[i] = ''
      commit(base.join(''))
    } else if (i > 0) {
      base[i - 1] = ''
      commit(base.join(''))
      focusAt(i - 1)
    }
    return
  }
  if (e.key === 'Delete') {
    e.preventDefault()
    const base = chars.value.slice()
    base[i] = ''
    commit(base.join(''))
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    focusAt(i - 1)
    return
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    focusAt(i + 1)
  }
}

/** 粘贴：整串剥掉非目标字符后从当前格开始铺 */
function onPaste(i: number, e: ClipboardEvent) {
  if (!canWrite(props)) return
  e.preventDefault()
  const text = sanitize(e.clipboardData?.getData('text') ?? '')
  if (!text) return
  const base = chars.value.slice()
  let at = i
  for (const ch of text) {
    if (at >= props.length) break
    base[at] = ch
    at++
  }
  commit(base.join(''))
  nextTick(() => focusAt(Math.min(at, props.length - 1)))
}

/** 聚焦整组时定位到第一个空格子（模态打开后最常用） */
function onGroupFocus() {
  const firstEmpty = chars.value.findIndex((c) => !c)
  focusAt(firstEmpty < 0 ? 0 : firstEmpty)
}

watch(
  () => props.autofocus,
  (on) => {
    if (on) nextTick(() => focusAt(0))
  },
  { immediate: true },
)

defineExpose({
  /** 聚焦到第一个空格子（宿主在模态打开/校验失败时调用） */
  focusFirstEmpty: onGroupFocus,
})
</script>

<template>
  <div
    class="otp-group"
    :class="{ 'otp-disabled': disabled, 'otp-readonly': readonly, 'otp-complete': isComplete }"
    role="group"
    :aria-label="ariaLabel || undefined"
  >
    <input
      v-for="(ch, i) in chars"
      :key="`${uid}-${i}`"
      :ref="(el) => setInputEl(el as Element | null, i)"
      class="otp-cell"
      :value="ch"
      :type="type === 'numeric' ? 'tel' : 'text'"
      :inputmode="type === 'numeric' ? 'numeric' : 'text'"
      :autocomplete="i === 0 ? 'one-time-code' : 'off'"
      :disabled="disabled"
      :readonly="readonly"
      :aria-label="`${ariaLabel || '验证码'} 第 ${i + 1} 位`"
      maxlength="1"
      @input="onInput(i, $event)"
      @keydown="onKeydown(i, $event)"
      @paste="onPaste(i, $event)"
      @focus="(e) => (e.target as HTMLInputElement).select()"
    />
  </div>
</template>

<style src="./input-otp-scoped.css" scoped></style>
