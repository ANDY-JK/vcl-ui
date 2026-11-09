<script setup lang="ts">
// ⛔ 保护 — 时间列面板（Select type="time" 复用），禁止：clamp() → px，分钟 step 对齐逻辑删除
// ⭐ 时/分/秒三列滚动列表；select 输出 format 格式完整时间，分钟已对齐 step
import { ref, computed, watch, nextTick } from 'vue'
import { pad2 } from '../utils/date-utils'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  /** 当前时间字符串（可为空） */
  value?: string
  /** 时间格式：'HH:mm'（默认）| 'HH:mm:ss'（含秒列） */
  format?: 'HH:mm' | 'HH:mm:ss'
  /** 分钟步进，默认 1（需能被 60 整除效果最佳） */
  step?: number
}

const props = withDefaults(defineProps<Props>(), {
  value: '',
  format: 'HH:mm',
  step: 1,
})

const emit = defineEmits<{
  /** 点击某列数值，输出 format 格式完整时间 */
  select: [time: string]
}>()

/** 解析字符串为数字并夹在 [lo, hi]，非法返回 0 */
function clampInt(s: string | undefined, lo: number, hi: number): number {
  const v = parseInt(s || '', 10)
  if (Number.isNaN(v)) return 0
  return Math.min(hi, Math.max(lo, v))
}

/** 是否显示秒列（format 含 ss） */
const showSeconds = computed(() => /ss/i.test(props.format))

const hours = computed(() => Array.from({ length: 24 }, (_, i) => i))

/**
 * 合法的分钟步进（第 165 轮补）：`Math.max(1, NaN)` 是 **NaN**，会让下面的 for 循环
 * 在 push(0) 后立刻因 `NaN < 60` 为 false 而结束 → 分钟列只剩 "00" 一项，
 * 用户再也选不到别的分钟。非整数（如 2.5）也会产生 0/2.5/5… 这种半个分钟的列表。
 * 统一在这里收口：非有限、非正、非整数一律退化为 1。
 */
const stepSafe = computed(() => {
  const n = Math.floor(Number(props.step))
  return Number.isFinite(n) && n > 0 ? n : 1
})
/** 分钟列按 step 步进 */
const minutes = computed(() => {
  const list: number[] = []
  for (let m = 0; m < 60; m += stepSafe.value) list.push(m)
  return list
})
const seconds = computed(() => Array.from({ length: 60 }, (_, i) => i))

/** 当前值各部分（分钟对齐到最近的 step 步进值） */
const curH = computed(() => clampInt(String(props.value).split(':')[0], 0, 23))
const curM = computed(() => {
  const raw = clampInt(String(props.value).split(':')[1], 0, 59)
  const st = stepSafe.value
  // 对齐到最近的步进点，**但必须落回列表里真实存在的值**（第 165 轮补）：
  // step 不整除 60 时（如 9/12/17），round(59/st)*st 会超过末项（step=9 → 63），
  // 原来夹到 59 —— 而 59 根本不在 [0,9,…,54] 里，于是**分钟列一个选中项都没有**，
  // 用户看不出当前时间是几分（滚到正确位置也无从谈起）。
  const last = minutes.value.length ? minutes.value[minutes.value.length - 1] : 0
  return Math.min(last, Math.round(raw / st) * st)
})
const curS = computed(() => clampInt(String(props.value).split(':')[2], 0, 59))

/* ====== 列表滚动到选中项 ====== */

const hourColRef = ref<HTMLElement | null>(null)
const minuteColRef = ref<HTMLElement | null>(null)
const secondColRef = ref<HTMLElement | null>(null)

/** 将第 index 项滚动到列中部（index 0 是表头） */
function scrollToIndex(col: HTMLElement | null, index: number) {
  if (!col) return
  const cell = col.children[index + 1] as HTMLElement | undefined
  if (!cell) return
  col.scrollTop = cell.offsetTop - col.clientHeight / 2 + cell.offsetHeight / 2
}

/** 各列滚动到当前选中值（面板打开 / 值变化时调用） */
function scrollToValue() {
  scrollToIndex(hourColRef.value, curH.value)
  scrollToIndex(minuteColRef.value, minutes.value.indexOf(curM.value))
  if (showSeconds.value) scrollToIndex(secondColRef.value, curS.value)
}

watch(
  () => props.value,
  () => nextTick(scrollToValue),
)

defineExpose({ scrollToValue })

/** 点击某列数值：按当前值拼装新时间并输出 */
function onPick(part: 'hour' | 'minute' | 'second', v: number) {
  const p = String(props.value).split(':')
  const h = part === 'hour' ? v : clampInt(p[0], 0, 23)
  // 点"时"时分钟取**已对齐并落回列表**的 curM，而不是原始 p[1]（第 165 轮补）：
  // 否则 step=15 + 值 10:37 时，界面高亮 30 却输出 22:37 —— 用户看到的和提交的不一致。
  const m = part === 'minute' ? v : curM.value
  const s = part === 'second' ? v : clampInt(p[2], 0, 59)
  let result = `${pad2(h)}:${pad2(m)}`
  if (showSeconds.value) result += `:${pad2(s)}`
  emit('select', result)
}
</script>

<template>
  <div class="tp-columns">
    <div ref="hourColRef" class="tp-column">
      <div class="tp-col-title">{{ t('form.hour') }}</div>
      <div
        v-for="h in hours"
        :key="h"
        class="tp-cell"
        :class="{ selected: h === curH }"
        role="button"
        tabindex="0"
        @click="onPick('hour', h)"
        @keydown.enter="onPick('hour', h)"
        @keydown.space.prevent="onPick('hour', h)"
      >
        {{ pad2(h) }}
      </div>
    </div>
    <div ref="minuteColRef" class="tp-column">
      <div class="tp-col-title">{{ t('form.minute') }}</div>
      <div
        v-for="m in minutes"
        :key="m"
        class="tp-cell"
        :class="{ selected: m === curM }"
        role="button"
        tabindex="0"
        @click="onPick('minute', m)"
        @keydown.enter="onPick('minute', m)"
        @keydown.space.prevent="onPick('minute', m)"
      >
        {{ pad2(m) }}
      </div>
    </div>
    <div v-if="showSeconds" ref="secondColRef" class="tp-column">
      <div class="tp-col-title">{{ t('form.second') }}</div>
      <div
        v-for="s in seconds"
        :key="s"
        class="tp-cell"
        :class="{ selected: s === curS }"
        role="button"
        tabindex="0"
        @click="onPick('second', s)"
        @keydown.enter="onPick('second', s)"
        @keydown.space.prevent="onPick('second', s)"
      >
        {{ pad2(s) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 时间列（视觉与拆分前一致） ===== */
.tp-columns {
  display: flex;
  gap: var(--vcl-space-2);
}
.tp-column {
  flex: 1;
  min-width: 0;
  position: relative; /* 作为子项 offsetTop 的定位参照 */
  max-height: calc(200px * var(--vcl-scale));
  overflow-y: auto; /* 原生滚轮滚动 */
  border: 1px solid var(--vcl-color-border-light);
  border-radius: var(--vcl-radius-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--vcl-color-border) transparent;
}
.tp-column::-webkit-scrollbar {
  width: calc(4px * var(--vcl-scale));
}
.tp-column::-webkit-scrollbar-track {
  background: transparent;
}
.tp-column::-webkit-scrollbar-thumb {
  background: var(--vcl-color-border);
  border-radius: var(--vcl-radius-md);
}
.tp-col-title {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: center;
  font-size: calc(11px * var(--vcl-scale));
  line-height: var(--vcl-text-caption-line);
  color: var(--vcl-color-text-muted);
  font-weight: 600;
  padding: var(--vcl-space-1) 0;
  background: var(--vcl-color-surface);
  border-bottom: 1px solid var(--vcl-color-border-light);
}
.tp-cell {
  padding: calc(6px * var(--vcl-scale)) 0;
  text-align: center;
  font-size: calc(12px * var(--vcl-scale));
  line-height: var(--vcl-text-label-line);
  color: var(--vcl-color-text);
  cursor: pointer;
  user-select: none;
  transition:
    background var(--vcl-transition-fast),
    color var(--vcl-transition-fast);
}
@media (hover: hover) {
  .tp-cell:hover {
    background: var(--vcl-color-bg-alt);
  }
}
.tp-cell.selected {
  background: var(--vcl-color-primary);
  color: #fff;
  font-weight: 600;
}
</style>
