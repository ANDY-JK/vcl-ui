<script setup lang="ts">
// ⛔ 保护 — 日历面板（Select type="date" / type="date-range" 共用），禁止：clamp() → px，本地时区构造 new Date(y, m, d) 改动
// ⭐ iso 始终按 format 格式化；范围模式下以 selected 数组为 [start, end]，hoverEnd 为悬停预览终点
import { computed, useSlots } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { formatDate, todayISO } from '../utils/date-utils'
import { useT, useTm } from '@/components/_internal/i18n'

const t = useT()
const tm = useTm()

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

/* ====== 无障碍：grid 语义 + 方向键漫游 ======
   日历是 6×7 网格，但视觉层是 CSS grid 平铺 42 个 button。给它们补
   role=grid/row/gridcell 时不能改 DOM 嵌套（会动样式），故用 display:contents 的
   行包装 —— 它不参与布局，视觉与拆分前完全一致。
   星期名直接按下标取（网格首行从周日起算，startWeekday 已按此补齐），
   不去 new Date 解析 iso —— 本文件头明令禁止改本地时区构造。 */

const weeks = computed(() => {
  const cells = calendarCells.value
  const rows: { cell: DateCell; idx: number }[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    const row: { cell: DateCell; idx: number }[] = []
    for (let j = 0; j < 7 && i + j < cells.length; j++) row.push({ cell: cells[i + j]!, idx: i + j })
    rows.push(row)
  }
  return rows
})

function cellAria(cell: DateCell, idx: number): string {
  const wd = (tm('form.weekdays') as string[])[idx % 7] ?? ''
  return t('form.dateCellAria', { ymd: cell.iso, weekday: wd })
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
    <button type="button" class="dp-nav-btn" :aria-label="t('form.prevMonth')" @click="prevMonth">
      <IconSvg type="chevron-left" size="sm" />
    </button>
    <span class="dp-title" role="status" aria-live="polite">{{
      t('form.yearMonth', { year: modelMonth.year, month: modelMonth.month })
    }}</span>
    <button type="button" class="dp-nav-btn" :aria-label="t('form.nextMonth')" @click="nextMonth">
      <IconSvg type="chevron-right" size="sm" />
    </button>
  </div>
  <div class="dp-weekdays" aria-hidden="true">
    <span v-for="w in tm('form.weekdays')" :key="w" class="dp-weekday">{{ w }}</span>
  </div>
  <!-- role=grid 的行包装用 display:contents，不参与布局，视觉与改前完全一致；
       星期表头设为 aria-hidden —— 每格的可访问名已自带星期，避免重复播报 -->
  <div
    class="dp-grid"
    role="grid"
    :aria-label="t('form.yearMonth', { year: modelMonth.year, month: modelMonth.month })"
  >
    <div v-for="(row, ri) in weeks" :key="ri" role="row" class="dp-row">
      <button
        v-for="{ cell, idx } in row"
        :key="cell.iso"
        :data-iso="cell.iso"
        type="button"
        class="dp-cell"
        :class="cellClass(cell)"
        :disabled="isDisabled(cell)"
        role="gridcell"
        :aria-label="cellAria(cell, idx)"
        :aria-current="!range && selected === cell.iso ? 'date' : undefined"
        @click="onCellClick(cell)"
        @mouseenter="onCellHover(cell)"
      >
        {{ cell.day }}
      </button>
    </div>
  </div>
  <div class="dp-footer" :class="slots.actions ? 'dp-footer--actions' : 'dp-footer--center'">
    <button type="button" class="dp-today-btn" @click="onToday">{{ t('form.today') }}</button>
    <span v-if="slots.actions" class="dp-footer-spacer" />
    <!-- @slot actions: 面板底部右侧自定义按钮区 -->
    <slot name="actions" />
  </div>
</template>

<style scoped>
/* ===== 日历网格（视觉与拆分前一致） ===== */
.dp-header {
  display: flex;
  align-items: center;
  margin-bottom: var(--vcl-space-2);
}
.dp-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: calc(28px * var(--vcl-scale));
  height: calc(28px * var(--vcl-scale));
  flex-shrink: 0;
  border: none;
  background: transparent;
  border-radius: var(--vcl-radius-sm);
  cursor: pointer;
  color: var(--vcl-color-text-muted);
  transition:
    background var(--vcl-transition-fast),
    color var(--vcl-transition-fast);
}
.dp-nav-btn:hover {
  background: var(--vcl-color-bg-alt);
  color: var(--vcl-color-text);
}
.dp-title {
  flex: 1;
  text-align: center;
  font-size: calc(14px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text);
}
.dp-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: var(--vcl-space-1);
}
.dp-weekday {
  text-align: center;
  font-size: calc(11px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  padding: var(--vcl-space-1) 0;
  font-weight: 500;
}
.dp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--vcl-space-1);
}
/* 仅为承载 role=row 的语义包装：display:contents 让它不生成盒子，
   格子仍是 .dp-grid 的直接网格项，布局与加行包装前逐像素一致 */
.dp-row {
  display: contents;
}
.dp-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: calc(32px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  border: none;
  background: transparent;
  border-radius: var(--vcl-radius-sm);
  color: var(--vcl-color-text);
  cursor: pointer;
  transition:
    background var(--vcl-transition-fast),
    color var(--vcl-transition-fast);
}
.dp-cell:hover:not(.disabled):not(.selected):not(.range-start):not(.range-end) {
  background: var(--vcl-color-bg-alt);
}
.dp-cell.other-month {
  color: var(--vcl-color-text-muted);
  opacity: 0.35;
}
.dp-cell.today {
  color: var(--vcl-color-primary);
  font-weight: 700;
}
.dp-cell.today.selected,
.dp-cell.today.range-start,
.dp-cell.today.range-end {
  color: #fff;
}
.dp-cell.selected {
  background: var(--vcl-color-primary);
  color: #fff;
  font-weight: 600;
}

/* 区间高亮：中间段淡蓝、两端主色 + 圆角 */
.dp-cell.in-range {
  background: var(--vcl-color-primary-light);
  border-radius: 0;
}
.dp-cell.in-range.today {
  color: var(--vcl-color-primary);
}
.dp-cell.range-start {
  background: var(--vcl-color-primary);
  color: #fff;
  font-weight: 600;
  border-radius: var(--vcl-radius-sm) 0 0 var(--vcl-radius-sm);
}
.dp-cell.range-end {
  background: var(--vcl-color-primary);
  color: #fff;
  font-weight: 600;
  border-radius: 0 var(--vcl-radius-sm) var(--vcl-radius-sm) 0;
}
.dp-cell.range-start.range-end {
  border-radius: var(--vcl-radius-sm);
}
.dp-cell.disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* 底部操作区：无 actions 槽时今天按钮居中（与 Select type="date" 一致） */
.dp-footer {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
  margin-top: var(--vcl-space-2);
}
.dp-footer--center {
  justify-content: center;
}
.dp-footer--actions {
  margin-top: var(--vcl-space-3);
}
.dp-today-btn {
  padding: var(--vcl-space-1) var(--vcl-space-3);
  border: none;
  border-radius: var(--vcl-radius-sm);
  background: transparent;
  color: var(--vcl-color-primary);
  font-size: calc(12px * var(--vcl-scale));
  cursor: pointer;
  transition: background var(--vcl-transition-fast);
}
.dp-today-btn:hover {
  background: var(--vcl-color-primary-light);
}
.dp-footer-spacer {
  flex: 1;
}
</style>
