<script setup lang="ts">
// ⛔ 保护 — 日历面板（Select type="date" / type="date-range" 共用），禁止：clamp() → px，本地时区构造 new Date(y, m, d) 改动
// ⭐ iso 始终按 format 格式化；范围模式下以 selected 数组为 [start, end]，hoverEnd 为悬停预览终点
import { computed, useSlots } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { formatDate, todayISO } from '../date-utils'

interface Month {
  year: number
  month: number // 1-12
}

interface DateCell {
  iso: string
  day: number
  isCurrentMonth: boolean
}

interface Props {
  /** 当前显示月（v-model:modelMonth） */
  modelMonth: Month
  /** 选中日期；范围模式为 [start, end] */
  selected: string | string[]
  /** 范围悬停预览终点（未定终点时预览区间） */
  hoverEnd?: string
  /** 最小可选日期（同 format 格式字符串） */
  min?: string
  /** 最大可选日期（同 format 格式字符串） */
  max?: string
  /** 范围模式：区间高亮 / 两端圆角 / 悬停预览 */
  range?: boolean
  /** 日期格式，占位符 YYYY/MM/DD，默认 'YYYY-MM-DD' */
  format?: string
}

const props = withDefaults(defineProps<Props>(), {
  hoverEnd: '',
  min: '',
  max: '',
  range: false,
  format: 'YYYY-MM-DD',
})

const emit = defineEmits<{
  /** 点击日期（今天按钮同样触发，日期为今天 iso） */
  select: [date: string]
  /** 悬停日期（范围模式预览，仅未禁用格子） */
  hover: [date: string]
  /** 切月 */
  'update:modelMonth': [month: Month]
}>()

const slots = useSlots()

/** 构建 6×7 = 42 格日历（含前后月补齐，本地时区构造，避免 UTC 偏移） */
const calendarCells = computed<DateCell[]>(() => {
  const { year, month } = props.modelMonth // month 1-12
  const startWeekday = new Date(year, month - 1, 1).getDay() // 0=周日
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: DateCell[] = []

  // 前置：上月补齐星期
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevDays = new Date(prevYear, prevMonth, 0).getDate()
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevDays - i
    cells.push({ iso: formatDate(new Date(prevYear, prevMonth - 1, d), props.format), day: d, isCurrentMonth: false })
  }
  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: formatDate(new Date(year, month - 1, d), props.format), day: d, isCurrentMonth: true })
  }
  // 后置：补满 42 格
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  for (let d = 1; cells.length < 42; d++) {
    cells.push({ iso: formatDate(new Date(nextYear, nextMonth - 1, d), props.format), day: d, isCurrentMonth: false })
  }
  return cells
})

/** 是否今天 */
function isToday(iso: string): boolean {
  return iso === todayISO(props.format)
}

/** 非当月 / 超出 min-max 范围视为禁用 */
function isDisabled(cell: DateCell): boolean {
  if (!cell.isCurrentMonth) return true
  if (props.min && cell.iso < props.min) return true
  if (props.max && cell.iso > props.max) return true
  return false
}

/* ====== 范围模式：区间高亮 ====== */

const selStart = computed(() => (Array.isArray(props.selected) ? props.selected[0] : undefined))
const selEnd = computed(() => (Array.isArray(props.selected) ? props.selected[1] : undefined))

/** 是否在区间内（不含两端；终点未定时用 hoverEnd 预览） */
function isInRange(iso: string): boolean {
  const start = selStart.value
  const end = selEnd.value || props.hoverEnd
  if (!start || !end) return false
  const lo = start < end ? start : end
  const hi = start < end ? end : start
  return iso > lo && iso < hi
}

function cellClass(cell: DateCell): Record<string, boolean> {
  return {
    today: isToday(cell.iso),
    selected: !props.range && props.selected === cell.iso,
    'range-start': props.range && !!selStart.value && cell.iso === selStart.value,
    'range-end': props.range && !!selEnd.value && cell.iso === selEnd.value,
    'in-range': props.range && isInRange(cell.iso),
    'other-month': !cell.isCurrentMonth,
    disabled: isDisabled(cell),
  }
}

function prevMonth() {
  const { year, month } = props.modelMonth
  if (month === 1) emit('update:modelMonth', { year: year - 1, month: 12 })
  else emit('update:modelMonth', { year, month: month - 1 })
}

function nextMonth() {
  const { year, month } = props.modelMonth
  if (month === 12) emit('update:modelMonth', { year: year + 1, month: 1 })
  else emit('update:modelMonth', { year, month: month + 1 })
}

function onCellClick(cell: DateCell) {
  if (isDisabled(cell)) return
  emit('select', cell.iso)
}

/** 悬停预览（仅范围模式、未禁用的格子） */
function onCellHover(cell: DateCell) {
  if (props.range && !isDisabled(cell)) emit('hover', cell.iso)
}

/** 今天按钮：选中今天（受 min/max 约束） */
function onToday() {
  const iso = todayISO(props.format)
  if (isDisabled({ iso, day: new Date().getDate(), isCurrentMonth: true })) return
  emit('select', iso)
}
</script>

<template>
  <div class="dp-header">
    <button type="button" class="dp-nav-btn" aria-label="上个月" @click="prevMonth">
      <IconSvg type="chevron-left" size="sm" />
    </button>
    <span class="dp-title">{{ modelMonth.year }}年{{ modelMonth.month }}月</span>
    <button type="button" class="dp-nav-btn" aria-label="下个月" @click="nextMonth">
      <IconSvg type="chevron-right" size="sm" />
    </button>
  </div>
  <div class="dp-weekdays">
    <span v-for="w in ['日', '一', '二', '三', '四', '五', '六']" :key="w" class="dp-weekday">{{ w }}</span>
  </div>
  <div class="dp-grid">
    <button
      v-for="cell in calendarCells"
      :key="cell.iso"
      type="button"
      class="dp-cell"
      :class="cellClass(cell)"
      :disabled="isDisabled(cell)"
      @click="onCellClick(cell)"
      @mouseenter="onCellHover(cell)"
    >
      {{ cell.day }}
    </button>
  </div>
  <div class="dp-footer" :class="slots.actions ? 'dp-footer--actions' : 'dp-footer--center'">
    <button type="button" class="dp-today-btn" @click="onToday">今天</button>
    <span v-if="slots.actions" class="dp-footer-spacer" />
    <slot name="actions" />
  </div>
</template>

<style scoped>
/* ===== 日历网格（视觉与拆分前一致） ===== */
.dp-header { display: flex; align-items: center; margin-bottom: var(--space-2); }
.dp-nav-btn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; flex-shrink: 0;
  border: none; background: transparent; border-radius: var(--radius-sm);
  cursor: pointer; color: var(--color-text-muted);
  transition: background var(--transition-fast), color var(--transition-fast);
}
.dp-nav-btn:hover { background: var(--color-bg-alt); color: var(--color-text); }
.dp-title {
  flex: 1; text-align: center;
  font-size: clamp(12px, 1.8vw, 14px); font-weight: 600; color: var(--color-text);
}
.dp-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: var(--space-1); }
.dp-weekday {
  text-align: center; font-size: clamp(10px, 1.5vw, 11px);
  color: var(--color-text-muted); padding: var(--space-1) 0; font-weight: 500;
}
.dp-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: var(--space-1); }
.dp-cell {
  display: flex; align-items: center; justify-content: center;
  height: clamp(28px, 4.5vw, 32px);
  font-size: clamp(11px, 1.6vw, 12px);
  border: none; background: transparent; border-radius: var(--radius-sm);
  color: var(--color-text); cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.dp-cell:hover:not(.disabled):not(.selected):not(.range-start):not(.range-end) { background: var(--color-bg-alt); }
.dp-cell.other-month { color: var(--color-text-muted); opacity: 0.35; }
.dp-cell.today { color: var(--color-primary); font-weight: 700; }
.dp-cell.today.selected, .dp-cell.today.range-start, .dp-cell.today.range-end { color: #fff; }
.dp-cell.selected { background: var(--color-primary); color: #fff; font-weight: 600; }

/* 区间高亮：中间段淡蓝、两端主色 + 圆角 */
.dp-cell.in-range { background: var(--color-primary-light); border-radius: 0; }
.dp-cell.in-range.today { color: var(--color-primary); }
.dp-cell.range-start {
  background: var(--color-primary); color: #fff; font-weight: 600;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}
.dp-cell.range-end {
  background: var(--color-primary); color: #fff; font-weight: 600;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.dp-cell.range-start.range-end { border-radius: var(--radius-sm); }
.dp-cell.disabled { opacity: 0.25; cursor: not-allowed; }

/* 底部操作区：无 actions 槽时今天按钮居中（与 Select type="date" 一致） */
.dp-footer { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
.dp-footer--center { justify-content: center; }
.dp-footer--actions { margin-top: var(--space-3); }
.dp-today-btn {
  padding: var(--space-1) var(--space-3);
  border: none; border-radius: var(--radius-sm);
  background: transparent; color: var(--color-primary);
  font-size: clamp(11px, 1.6vw, 12px); cursor: pointer;
  transition: background var(--transition-fast);
}
.dp-today-btn:hover { background: var(--color-primary-light); }
.dp-footer-spacer { flex: 1; }
</style>
