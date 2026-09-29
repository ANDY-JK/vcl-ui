<script setup lang="ts">
// ⛔ 保护 — 时间列面板（Select type="time" 复用），禁止：clamp() → px，分钟 step 对齐逻辑删除
// ⭐ 时/分/秒三列滚动列表；select 输出 format 格式完整时间，分钟已对齐 step
import { ref, computed, watch, nextTick } from 'vue'
import { pad2 } from '../utils/date-utils'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  /** 当前时间字符串（可为空） */
  value: string
  /** 时间格式：'HH:mm'（默认）| 'HH:mm:ss'（含秒列） */
  format: 'HH:mm' | 'HH:mm:ss'
  /** 分钟步进，默认 1（需能被 60 整除效果最佳） */
  step: number
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
/** 分钟列按 step 步进 */
const minutes = computed(() => {
  const list: number[] = []
  for (let m = 0; m < 60; m += Math.max(1, props.step)) list.push(m)
  return list
})
const seconds = computed(() => Array.from({ length: 60 }, (_, i) => i))

/** 当前值各部分（分钟对齐到最近的 step 步进值） */
const curH = computed(() => clampInt(String(props.value).split(':')[0], 0, 23))
const curM = computed(() => {
  const raw = clampInt(String(props.value).split(':')[1], 0, 59)
  const st = Math.max(1, props.step)
  return Math.min(59, Math.round(raw / st) * st)
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
  const m = part === 'minute' ? v : clampInt(p[1], 0, 59)
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
  gap: var(--space-2);
}
.tp-column {
  flex: 1;
  min-width: 0;
  position: relative; /* 作为子项 offsetTop 的定位参照 */
  max-height: calc(200px * var(--vcl-scale));
  overflow-y: auto; /* 原生滚轮滚动 */
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
.tp-column::-webkit-scrollbar {
  width: calc(4px * var(--vcl-scale));
}
.tp-column::-webkit-scrollbar-track {
  background: transparent;
}
.tp-column::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-md);
}
.tp-col-title {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: center;
  font-size: calc(11px * var(--vcl-scale));
  color: var(--color-text-muted);
  font-weight: 600;
  padding: var(--space-1) 0;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border-light);
}
.tp-cell {
  padding: calc(6px * var(--vcl-scale)) 0;
  text-align: center;
  font-size: calc(12px * var(--vcl-scale));
  color: var(--color-text);
  cursor: pointer;
  user-select: none;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}
.tp-cell:hover {
  background: var(--color-bg-alt);
}
.tp-cell.selected {
  background: var(--color-primary);
  color: #fff;
  font-weight: 600;
}
</style>
