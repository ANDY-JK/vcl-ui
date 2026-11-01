<script setup lang="ts">
// ⛔ 保护 — 日历面板（Select type="date" / type="date-range" 共用），禁止：clamp() → px，本地时区构造 new Date(y, m, d) 改动
// ⭐ iso 始终按 format 格式化；范围模式下以 selected 数组为 [start, end]，hoverEnd 为悬停预览终点
import { computed, nextTick, ref, useSlots } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { formatDate, pad2, todayISO } from '../utils/date-utils'
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

/* ── 键盘漫游（#318）──────────────────────────────────────────────
 * 上面那段注释写着"grid 语义 + 方向键漫游"，但**方向键从来没实现过**，
 * 而且 42 个 button 全是 tabbable —— 键盘用户要按 42 次 Tab 才能穿过日历。
 * 这里补齐 APG 日历网格的标准键位 + roving tabindex（整个网格只留 1 个 Tab 停靠点）：
 *   ← → 前后一天 ／ ↑ ↓ 前后一周 ／ Home/End 本周首尾 ／ PageUp/PageDown 前后一月
 * 日期加减一律走 UTC（`Date.UTC`），不碰本地时区构造 —— 与本文件头的约定一致。
 */
const gridRef = ref<HTMLElement | null>(null)

/** ISO 加减天数（UTC 运算，跨月/跨年/夏令时都不会错） */
function shiftDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y!, m! - 1, d!) + days * 86400000)
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

/** ISO 加减月数，日超出目标月长度时夹到月末 */
function shiftMonths(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const first = new Date(Date.UTC(y!, m! - 1 + delta, 1))
  const ty = first.getUTCFullYear()
  const tm = first.getUTCMonth() + 1
  const daysInMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate()
  return `${ty}-${pad2(tm)}-${pad2(Math.min(d!, daysInMonth))}`
}

/** 网格里唯一可 Tab 进入的那一格：已选 → 今天 → 当月第一个可选日 */
const tabIso = computed(() => {
  const cells = calendarCells.value
  const sel = Array.isArray(props.selected) ? props.selected[0] : props.selected
  if (sel && cells.some((c) => c.iso === sel && !isDisabled(c))) return sel
  const today = todayISO(props.format)
  if (cells.some((c) => c.iso === today && !isDisabled(c))) return today
  return cells.find((c) => !isDisabled(c))?.iso ?? cells[0]?.iso ?? ''
})

/** 把焦点移到某一天的格子；该天不在当前月时先翻月再移 */
function focusDay(iso: string) {
  const inGrid = (): boolean => !!gridRef.value?.querySelector(`[data-iso="${iso}"]`)
  const apply = () => {
    const el = gridRef.value?.querySelector<HTMLElement>(`[data-iso="${iso}"]`)
    el?.focus()
  }
  if (inGrid()) {
    apply()
    return
  }
  const [y, m] = iso.split('-').map(Number)
  emit('update:modelMonth', { year: y!, month: m! })
  void nextTick(apply)
}

function onGridKeydown(e: KeyboardEvent) {
  const cell = (e.target as HTMLElement | null)?.closest?.('[data-iso]') as HTMLElement | null
  const from = cell?.dataset.iso ?? tabIso.value
  if (!from) return
  let target: string
  switch (e.key) {
    case 'ArrowLeft':
      target = shiftDays(from, -1)
      break
    case 'ArrowRight':
      target = shiftDays(from, 1)
      break
    case 'ArrowUp':
      target = shiftDays(from, -7)
      break
    case 'ArrowDown':
      target = shiftDays(from, 7)
      break
    case 'Home':
      // 本周首日：网格首行从周日起算，这里按"同一行第 0 列"对齐
      target = shiftDays(from, -(((calendarCells.value.findIndex((c) => c.iso === from) % 7) + 7) % 7))
      break
    case 'End':
      target = shiftDays(from, 6 - (((calendarCells.value.findIndex((c) => c.iso === from) % 7) + 7) % 7))
      break
    case 'PageUp':
      target = shiftMonths(from, -1)
      break
    case 'PageDown':
      target = shiftMonths(from, 1)
      break
    default:
      return
  }
  e.preventDefault()
  focusDay(target)
}

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
    ref="gridRef"
    class="dp-grid"
    role="grid"
    :aria-label="t('form.yearMonth', { year: modelMonth.year, month: modelMonth.month })"
    @keydown="onGridKeydown"
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
        :tabindex="cell.iso === tabIso ? 0 : -1"
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

<style src="./date-panel-scoped.css" scoped></style>
