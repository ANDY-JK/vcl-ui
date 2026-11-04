/**
 * useSelectDatePanel — Select 的 Date / Date-range / Time 面板逻辑（自主文件下沉，M3 持续拆分）
 *
 * 承接日期块完整状态与编排：草稿态（start/end/hover/time）、modelValue 同步的三个
 * immediate watch、面板打开时的行高/滚位修正、选中/确认/取消处理器。
 * 耦合面刻意收窄：类型标志在本地按 props 重算（避免反向 import 主文件）；
 * 面板显隐/关闭/失焦标记/非日期型行高测量/emit 均由宿主注入——
 * emit 走注入通道是为了 composable 不 import 主文件的 emit（循环）。
 */
import { ref, computed, nextTick, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { parseDate } from './utils/date-utils'
import TimeColumns from './date-panel/TimeColumns.vue'

/** 模块级 t：占位符文案按当前语言 */
const t = useT()

/** 日期族模型值：单日期/时间为字符串，区间为 [起, 止]（Select 本地 SelectModelValue 的子集） */
export type DatePanelValue = string | [string, string]

/** 最小 props 面：Select 的 props 结构上可直接传入 */
export interface DatePanelProps {
  type: string
  modelValue: unknown
  format?: string
  placeholder?: string
  rangePlaceholder: [string, string]
}

export function useSelectDatePanel(
  props: DatePanelProps,
  open: { value: boolean },
  o: {
    closePanel: () => void
    markTouched: () => void
    measureOptionRow: () => Promise<void> | void
    emit: (event: 'update:modelValue' | 'change', value: DatePanelValue) => void
    /**
     * 写入口守卫（TD-90 / #427）。时间面板的「确定」是**写**：它 emit
     * `update:modelValue` + `change` 把草稿时间落库。面板打开时宿主完全可能把
     * `disabled` 翻成 true（表单校验失败、权限回收、提交中锁表单）—— 此时按钮还在，
     * 点下去照样写。模板上的 `v-if` 只能保证"界面上看不见时点不到"，**入口级守卫**
     * 才能保证"任何路径都写不进"（与 `onClearGuarded` 同一条判据）。
     */
    canWrite?: () => boolean
  },
) {
  // 类型标志本地重算（与 Select 主文件同语义；不 import 主文件防循环）
  const isDate = computed(() => props.type === 'date')
  const isDateRange = computed(() => props.type === 'date-range')
  const isTime = computed(() => props.type === 'time')

  const dateFmt = computed(() => props.format || 'YYYY-MM-DD')
  const modelMonth = ref({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
  const draftStart = ref('')
  const draftEnd = ref('')
  const draftHover = ref('')
  const draftTime = ref('')
  const timeColumnsRef = ref<InstanceType<typeof TimeColumns> | null>(null)

  const triggerDisplayText = computed(() => {
    if (isDateRange.value) {
      const arr = Array.isArray(props.modelValue) ? (props.modelValue as unknown[]) : []
      if (arr[0] && arr[1]) return `${String(arr[0])} ~ ${String(arr[1])}`
      return ''
    }
    const v = props.modelValue
    if (!v) return ''
    return String(v)
  })

  const dateTimePlaceholder = computed(() => {
    if (isDateRange.value) return `${props.rangePlaceholder[0]} ~ ${props.rangePlaceholder[1]}`
    return props.placeholder || (isDate.value ? t('form.selectDate') : isTime.value ? t('form.selectTime') : '')
  })

  watch(
    () => props.modelValue,
    (val) => {
      if (isDate.value) {
        const parsed = parseDate(String(val || ''), dateFmt.value)
        if (parsed) modelMonth.value = { year: parsed.y, month: parsed.m }
      }
    },
    { immediate: true },
  )

  function onDateSelect(date: string) {
    o.markTouched()
    o.closePanel()
    o.emit('update:modelValue', date)
    o.emit('change', date)
  }

  watch(
    () => props.modelValue,
    (val) => {
      if (isDateRange.value) {
        const arr = Array.isArray(val) ? (val as unknown[]) : []
        draftStart.value = arr[0] ? String(arr[0]) : ''
        draftEnd.value = arr[1] ? String(arr[1]) : ''
        draftHover.value = ''
        const first = draftStart.value || draftEnd.value
        const parsed = parseDate(first, dateFmt.value)
        if (parsed) modelMonth.value = { year: parsed.y, month: parsed.m }
      }
    },
    { immediate: true },
  )

  function onDateRangeClick(date: string) {
    if (!draftStart.value || draftEnd.value) {
      draftStart.value = date
      draftEnd.value = ''
    } else {
      if (date < draftStart.value) {
        draftEnd.value = draftStart.value
        draftStart.value = date
      } else {
        draftEnd.value = date
      }
    }
    draftHover.value = ''
  }

  function onDateRangeHover(date: string) {
    if (draftStart.value && !draftEnd.value) draftHover.value = date
  }

  function onDateRangeConfirm() {
    if (!draftStart.value) return
    o.markTouched()
    const value: [string, string] = [draftStart.value, draftEnd.value || draftStart.value]
    o.closePanel()
    o.emit('update:modelValue', value)
    o.emit('change', value)
  }

  watch(
    () => props.modelValue,
    (val) => {
      if (isTime.value) draftTime.value = String(val || '')
    },
    { immediate: true },
  )

  watch(open, async (val) => {
    if (!val) return
    // 面板是 v-if 渲染的，打开之后才有可测的行高与可视高
    if (!isDate.value && !isDateRange.value && !isTime.value) await o.measureOptionRow()
    if (isTime.value) {
      await nextTick()
      timeColumnsRef.value?.scrollToValue()
    }
  })

  function onTimePick(time: string) {
    draftTime.value = time
  }

  function onTimeConfirm() {
    // 入口级守卫（TD-90 / #427）：面板打开后 disabled 才翻真的场景下，
    // 模板上的按钮仍在 —— 只靠 v-if 挡不住，写入口必须自己判。
    // 判不过时**照常关面板**：用户点了确定却什么都不发生更困惑，
    // 关掉面板 + 不落值是"禁用态下点确定"最不意外的结果。
    if (o.canWrite && !o.canWrite()) {
      o.closePanel()
      return
    }
    o.markTouched()
    o.closePanel()
    o.emit('update:modelValue', draftTime.value as DatePanelValue)
    o.emit('change', draftTime.value as DatePanelValue)
  }

  function onTimeCancel() {
    o.closePanel()
  }

  return {
    isDate,
    isDateRange,
    isTime,
    dateFmt,
    modelMonth,
    draftStart,
    draftEnd,
    draftHover,
    draftTime,
    timeColumnsRef,
    triggerDisplayText,
    dateTimePlaceholder,
    onDateSelect,
    onDateRangeClick,
    onDateRangeHover,
    onDateRangeConfirm,
    onTimePick,
    onTimeConfirm,
    onTimeCancel,
  }
}
