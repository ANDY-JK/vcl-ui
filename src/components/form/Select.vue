<script setup lang="ts">
/**
 * Select 统一选择器 — 重写版
 *
 * 核心设计原则：
 * 1. 只用 @click 管开关（不用 @focus），消除 focus+click 双重触发
 * 2. useClickOutside 加 openedAt 时间戳防抖（150ms 内不响应外部点击）
 * 3. 面板用 v-if + Transition（不用 v-show），避免 display:none 时 offsetHeight=0
 * 4. v-if 条件链：先判断模式类型（Date/Time/Tree/Menu），再判断空选项
 * 5. 统一上浮骑缝（floating label）样式
 *
 * 支持模式：select | combobox | menu | cascader | tree-select | date | date-range | time
 */
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { pinyin } from '@/components/_internal/pinyin-pro'
import { warnOnce } from '@/components/_internal/warnOnce'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useFloating } from '@/components/_internal/useFloating'
import { useClickOutside } from '@/components/_internal/useClickOutside'
import { useTreeFlatten } from '@/components/_internal/useTreeFlatten'
import { parseDate } from './utils/date-utils'
import DatePanel from './date-panel/DatePanel.vue'
import TimeColumns from './date-panel/TimeColumns.vue'
import type { Option, MenuItem, CascaderOption } from '@/components/shared/types'

/* ════════════════════════════════════════
   Props
   ════════════════════════════════════════ */
interface Props {
  /** 模式 */
  type?: 'select' | 'menu' | 'combobox' | 'cascader' | 'tree-select' | 'date' | 'date-range' | 'time'
  modelValue?: string | number | (string | number | boolean)[] | [string, string] | null
  options?: Option[]
  label?: string
  rules?: ((v: string) => string | undefined)[]
  error?: string
  multiple?: boolean
  placeholder?: string
  searchable?: boolean
  pinyinEnabled?: boolean
  isLoading?: boolean
  emptyText?: string
  allowCreate?: boolean
  clearOnFocus?: boolean
  items?: MenuItem[]
  cascaderOptions?: CascaderOption[]
  disabled?: boolean
  zIndex?: string
  format?: string
  dateMin?: string
  dateMax?: string
  rangePlaceholder?: [string, string]
  timeStep?: number
  clearable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'select',
  rules: () => [],
  disabled: false,
  multiple: false,
  options: () => [],
  items: () => [],
  placeholder: '请选择',
  searchable: true,
  pinyinEnabled: true,
  isLoading: false,
  emptyText: '暂无匹配项',
  allowCreate: true,
  clearOnFocus: false,
  format: 'YYYY-MM-DD',
  dateMin: '',
  dateMax: '',
  rangePlaceholder: () => ['开始日期', '结束日期'] as [string, string],
  timeStep: 1,
  clearable: false,
})

type SelectModelValue = string | number | (string | number | boolean)[] | [string, string] | null

const emit = defineEmits<{
  'update:modelValue': [v: SelectModelValue]
  change: [v: SelectModelValue]
  focus: []
  blur: []
  visibleChange: [v: boolean]
}>()

/* ════════════════════════════════════════
   模式判断
   ════════════════════════════════════════ */
const isSelect = computed(() => props.type === 'select')
const isCombobox = computed(() => props.type === 'combobox')
const isMenu = computed(() => props.type === 'menu' && !!props.items)
const isTreeSelect = computed(() => props.type === 'tree-select' || props.type === 'cascader')
const isDate = computed(() => props.type === 'date')
const isDateRange = computed(() => props.type === 'date-range')
const isTime = computed(() => props.type === 'time')

/* ════════════════════════════════════════
   校验支持
   ════════════════════════════════════════ */
const errorMsg = ref('')
let _touched = false
function validate() {
  if (!props.rules?.length) {
    errorMsg.value = ''
    return
  }
  const value = props.modelValue == null ? '' : String(props.modelValue)
  for (const rule of props.rules) {
    const msg = rule(value)
    if (msg) {
      errorMsg.value = msg
      return
    }
  }
  errorMsg.value = ''
}
function markTouched() {
  _touched = true
  validate()
}
watch(
  () => props.modelValue,
  () => {
    if (_touched) validate()
  },
)

const hasValue = computed(() => {
  const v = props.modelValue
  if (v === '' || v === undefined || v === null) return false
  if (Array.isArray(v)) return v.length > 0
  return true
})

/* ════════════════════════════════════════
   下拉面板开关 — 核心重写
   设计：只用 toggleOpen 管开关，@click 绑定在 wrapper 上
   ════════════════════════════════════════ */
const open = ref(false)
let openedAt = 0

const {
  triggerRef,
  floatingRef,
  direction: flipDir,
  floatingStyle,
  updatePosition,
  prepareOpen,
} = useFloating({
  offset: 4,
  defaultDirection: 'down',
  minSize: 160,
  zIndex: props.zIndex,
  maxMatchWidth: isCombobox.value,
})

// useClickOutside：加 openedAt 防抖，面板刚打开 150ms 内不响应外部点击
useClickOutside([triggerRef, floatingRef], () => {
  if (!open.value) return
  if (Date.now() - openedAt < 150) return
  closePanel()
})

function onExternalScroll() {
  if (!open.value) return
  const scrollEl = event?.target
  if (scrollEl instanceof Node && floatingRef.value?.contains(scrollEl)) return
  if (Date.now() - openedAt < 300) return
  closePanel()
}

onMounted(() => window.addEventListener('scroll', onExternalScroll, true))
onUnmounted(() => {
  window.removeEventListener('scroll', onExternalScroll, true)
  if (blurTimer) clearTimeout(blurTimer)
})

const searchInputRef = ref<HTMLInputElement | null>(null)
const comboInputRef = ref<HTMLInputElement | null>(null)
const searchText = ref('')
const highlightIdx = ref(-1)

// combobox 输入文本
const comboText = ref('')
let lastCommittedText = ''
let justSelected = false
let blurTimer: ReturnType<typeof setTimeout> | null = null

// 面板打开后聚焦搜索框/输入框
watch(open, async (val) => {
  if (!val) return
  await nextTick()
  if (isCombobox.value) {
    comboInputRef.value?.focus()
  } else if (props.searchable && (isSelect.value || isTreeSelect.value)) {
    searchInputRef.value?.focus()
  }
})

/**
 * 打开/关闭面板 — 单一入口
 * - combobox 模式：由 input @click 调用（wrapper 不绑定 click）
 * - 其他模式：由 wrapper @click 调用
 * - 不再在 @focus 中调用，消除双重触发
 */
function toggleOpen(e?: MouseEvent) {
  if (props.disabled) return
  if (open.value) {
    closePanel()
    return
  }
  // 打开
  prepareOpen()
  openedAt = Date.now()
  open.value = true
  emit('visibleChange', true)
  // 下一帧更新位置（等面板渲染完成）
  nextTick(() => {
    requestAnimationFrame(() => updatePosition((e?.currentTarget as HTMLElement) || undefined))
  })
}

function closePanel() {
  open.value = false
  searchText.value = ''
  // 不在这里恢复 comboText — onComboBlur 已处理失焦恢复
  // 这里恢复会导致 commitComboValue 后 closePanel 把新值覆盖回旧值
  emit('visibleChange', false)
}

/* ════════════════════════════════════════
   拼音搜索 — 预计算索引 + 缓存
   每个选项的拼音在全量拼音和首字母只计算一次，存入 Map
   搜索时直接从缓存读取，避免重复调用 pinyin()
   ════════════════════════════════════════ */

/** 拼音缓存：key = 原始文本，value = { full, first } */
const _pinyinCache = new Map<string, { full: string; first: string }>()

/** 获取文本的拼音索引（带缓存） */
function getPinyinIndex(text: string): { full: string; first: string } {
  if (!text) return { full: '', first: '' }
  const cached = _pinyinCache.get(text)
  if (cached) return cached
  let result: { full: string; first: string }
  if (!props.pinyinEnabled) {
    result = { full: text.toLowerCase(), first: '' }
  } else {
    try {
      const full = pinyin(text, { toneType: 'none', type: 'string' }).toLowerCase()
      const first = pinyin(text, { pattern: 'first', toneType: 'none', type: 'string' })
        .replace(/\s/g, '')
        .toLowerCase()
      result = { full, first }
    } catch {
      warnOnce('Select', '拼音解析失败，已降级为普通搜索')
      result = { full: text.toLowerCase(), first: '' }
    }
  }
  _pinyinCache.set(text, result)
  return result
}

/** 快速拼音匹配（使用预计算索引） */
function matchPinyinFast(text: string, keyword: string): boolean {
  const lower = keyword.toLowerCase()
  if (text.toLowerCase().includes(lower)) return true
  if (!props.pinyinEnabled) return false
  const idx = getPinyinIndex(text)
  if (idx.full.includes(lower)) return true
  if (idx.first && idx.first.includes(lower)) return true
  return false
}

/** 选项变化时清理过期缓存项（防止内存泄漏） */
watch(
  () => props.options,
  () => {
    // 选项列表变化时，清理不在新选项中的缓存项
    if (!props.options || props.options.length === 0) {
      _pinyinCache.clear()
      return
    }
    const newLabels = new Set(props.options.map((o) => o.label))
    for (const key of _pinyinCache.keys()) {
      if (!newLabels.has(key)) _pinyinCache.delete(key)
    }
  },
)

// combobox 打开面板时如果 comboText 等于已选值（watch 同步来的），不做过滤，显示全部
// 只有用户主动输入时才过滤
const filterKeyword = computed(() => {
  if (isCombobox.value) {
    // comboText 和已选 label 一样时 = 打开面板自动同步的，不是用户输入
    if (open.value && comboText.value === lastCommittedText) return ''
    return comboText.value
  }
  return searchText.value
})

const filteredOptions = computed(() => {
  if (!props.options) return []
  if (!filterKeyword.value) return props.options
  return props.options.filter(
    (o) =>
      matchPinyinFast(o.label, filterKeyword.value) ||
      matchPinyinFast(String(o.value), filterKeyword.value) ||
      (o._search ? matchPinyinFast(o._search, filterKeyword.value) : false),
  )
})

watch(filteredOptions, () => {
  highlightIdx.value = -1
})

/* ════════════════════════════════════════
   显示文本
   ════════════════════════════════════════ */
const selectedLabels = computed(() => {
  if (isTreeSelect.value) return treeSelectedPaths.value.map((p) => p.map((n) => n.label).join(' / '))
  if (!props.options) return []
  if (props.multiple) {
    const vals = (props.modelValue || []) as (string | number | boolean)[]
    return vals.map((v) => props.options!.find((o) => String(o.value) === String(v))?.label || String(v))
  }
  const found = props.options.find((o) => String(o.value) === String(props.modelValue))
  return found ? [found.label] : []
})

const displayText = computed(() => {
  if (isDate.value || isDateRange.value || isTime.value) return triggerDisplayText.value
  // tree-select 有 tag 显示完整路径时，input 不再重复显示文字
  if (isTreeSelect.value) return comboTags.value.length > 0 ? '' : treeDisplayText.value
  if (isCombobox.value && !props.multiple) return comboText.value
  return selectedLabels.value.join(', ')
})

// floating 标签上浮条件
const floatingRaised = computed(() => {
  return open.value || !!displayText.value || comboTags.value.length > 0
})

/* ════════════════════════════════════════
   多选 tag
   ════════════════════════════════════════ */
const comboTags = computed(() => {
  if (isTreeSelect.value) {
    return treeSelectedPaths.value.map((p) => ({
      value: p[p.length - 1].value,
      label: p.map((n) => n.label).join(' / '),
    }))
  }
  if (!isCombobox.value || !props.multiple) return []
  const vals = (props.modelValue || []) as (string | number | boolean)[]
  return vals.map((v) => ({
    value: v,
    label: props.options?.find((o) => String(o.value) === String(v))?.label || String(v),
  }))
})

function removeComboTag(tag: { value: string | number | boolean; label: string }) {
  const vals = ((props.modelValue || []) as (string | number | boolean)[]).filter(
    (v) => String(v) !== String(tag.value),
  )
  emit('update:modelValue', vals)
  emit('change', vals)
}

/* ════════════════════════════════════════
   选项选择
   ════════════════════════════════════════ */
function isSelected(opt: Option) {
  if (props.multiple)
    return ((props.modelValue || []) as (string | number | boolean)[]).some((v) => String(v) === String(opt.value))
  if (isCombobox.value) {
    if (!comboText.value) return String(props.modelValue) === String(opt.value)
    return opt.label === comboText.value || String(opt.value) === comboText.value
  }
  return String(props.modelValue) === String(opt.value)
}

function selectOption(opt: Option) {
  if (opt.disabled) return
  markTouched()
  if (props.multiple) {
    const vals = [...((props.modelValue || []) as (string | number | boolean)[])]
    const idx = vals.findIndex((v) => String(v) === String(opt.value))
    if (idx >= 0) vals.splice(idx, 1)
    else vals.push(opt.value)
    emit('update:modelValue', vals)
    emit('change', vals)
    if (isCombobox.value) {
      comboText.value = ''
      nextTick(() => comboInputRef.value?.focus())
    }
  } else {
    closePanel()
    emit('update:modelValue', opt.value as SelectModelValue)
    emit('change', opt.value as SelectModelValue)
    if (isCombobox.value) {
      comboText.value = opt.label
      lastCommittedText = opt.label
      justSelected = true
      nextTick(() => {
        comboInputRef.value?.blur()
        justSelected = false
      })
    }
  }
}

/* ════════════════════════════════════════
   清除按钮
   ════════════════════════════════════════ */
function onClear(e: MouseEvent) {
  e.stopPropagation()
  markTouched()
  if (props.multiple || isTreeSelect.value || isDateRange.value) {
    emit('update:modelValue', null)
    emit('change', null)
  } else if (isCombobox.value) {
    comboText.value = ''
    lastCommittedText = ''
    emit('update:modelValue', '')
    emit('change', '')
  } else {
    emit('update:modelValue', '')
    emit('change', '')
  }
}

/* ════════════════════════════════════════
   菜单模式
   ════════════════════════════════════════ */
function onMenuClick(item: MenuItem) {
  open.value = false
  emit('visibleChange', false)
  item.action?.()
}

/** 右键菜单 */
function openMenu(e: MouseEvent | { x: number; y: number }) {
  if (props.disabled || !isMenu.value) return
  openedAt = Date.now()
  prepareOpen()
  open.value = true
  searchText.value = ''
  emit('visibleChange', true)
  const x = 'clientX' in e ? e.clientX : e.x
  const y = 'clientY' in e ? e.clientY : e.y
  floatingStyle.value = {
    ...floatingStyle.value,
    top: `${y}px`,
    left: `${x}px`,
  }
}

defineExpose({ openMenu })

/* ════════════════════════════════════════
   Tree-select 模式
   ════════════════════════════════════════ */
const treeFlatten = useTreeFlatten<CascaderOption>({
  data: () => props.cascaderOptions || [],
  childrenKey: 'children',
  keyExtractor: (n) => n.value,
})
const treeNodes = computed(() => treeFlatten.flatNodes.value)

function findTreePath(nodes: CascaderOption[], value: string | number): CascaderOption[] | null {
  for (const node of nodes) {
    if (String(node.value) === String(value)) return [node]
    if (node.children) {
      const sub = findTreePath(node.children, value)
      if (sub) return [node, ...sub]
    }
  }
  return null
}

const treeSelectedPaths = computed((): CascaderOption[][] => {
  const vals = Array.isArray(props.modelValue) ? (props.modelValue as (string | number)[]) : []
  return vals
    .map((v) => findTreePath(props.cascaderOptions || [], v))
    .filter((p): p is CascaderOption[] => !!p && p.length > 0)
})

const treeDisplayText = computed(() => treeSelectedPaths.value.map((p) => p.map((n) => n.label).join(' / ')).join(', '))

function isTreeSelected(flatNode: (typeof treeNodes.value)[number]): boolean {
  if (!Array.isArray(props.modelValue)) return false
  return (props.modelValue as (string | number)[]).some((v) => String(v) === String(flatNode.node.value))
}

function onTreeNodeClick(flatNode: (typeof treeNodes.value)[number]) {
  if (flatNode.node.disabled) return
  if (!flatNode.isLeaf) {
    treeFlatten.toggleExpand(flatNode.node.value)
    return
  }
  const vals = [...(Array.isArray(props.modelValue) ? (props.modelValue as (string | number)[]) : [])]
  const idx = vals.findIndex((v) => String(v) === String(flatNode.node.value))
  if (idx >= 0) vals.splice(idx, 1)
  else vals.push(flatNode.node.value)
  emit('update:modelValue', vals)
  emit('change', vals)
}

function hasTreeChildren(node: CascaderOption): boolean {
  return !!node.children && node.children.length > 0
}

/* ════════════════════════════════════════
   Combobox 事件
   ════════════════════════════════════════ */
// 外部 modelValue 变化同步输入框
watch(
  () => props.modelValue,
  (val) => {
    if (!isCombobox.value || props.multiple) return
    if (val === '' || val === undefined || val === null) {
      comboText.value = ''
      lastCommittedText = ''
      return
    }
    const found = props.options?.find((o) => String(o.value) === String(val))
    const label = found ? found.label : String(val)
    comboText.value = label
    lastCommittedText = label
  },
  { immediate: true },
)

function onComboFocus() {
  if (props.disabled) return
  emit('focus')
  // 打开面板（如果还没打开）
  if (!open.value) {
    prepareOpen()
    openedAt = Date.now()
    open.value = true
    emit('visibleChange', true)
    nextTick(() => requestAnimationFrame(() => updatePosition()))
  }
  // 多选 + clearOnFocus
  if (isCombobox.value && props.multiple && props.clearOnFocus && comboTags.value.length > 0) {
    emit('update:modelValue', [])
    emit('change', [])
  }
}

function onComboInput() {
  if (!open.value) {
    prepareOpen()
    openedAt = Date.now()
    open.value = true
    emit('visibleChange', true)
    nextTick(() => requestAnimationFrame(() => updatePosition()))
  }
  highlightIdx.value = -1
}

function commitComboValue(text: string) {
  const matched = props.options?.find((o) => o.label === text || String(o.value) === text)
  if (matched) {
    emit('update:modelValue', matched.value as SelectModelValue)
    emit('change', matched.value as SelectModelValue)
    comboText.value = matched.label
    lastCommittedText = matched.label
  } else {
    emit('update:modelValue', text)
    emit('change', text)
    lastCommittedText = text
  }
}

function onComboBlur() {
  markTouched()
  emit('blur')
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    if (!open.value || justSelected) return
    if (isCombobox.value && props.multiple) return
    const text = comboText.value.trim()
    if (!text) {
      comboText.value = lastCommittedText
      if (!lastCommittedText) {
        emit('update:modelValue', '')
        emit('change', '')
      }
    } else if (props.allowCreate) {
      commitComboValue(text)
    } else {
      const prev = props.modelValue
      if (prev !== '' && prev !== undefined && prev !== null) {
        const found = props.options?.find((o) => String(o.value) === String(prev))
        comboText.value = found ? found.label : String(prev)
      } else {
        comboText.value = ''
      }
    }
    closePanel()
  }, 150)
}

function onComboKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    comboText.value = lastCommittedText
    closePanel()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIdx.value = Math.min(highlightIdx.value + 1, navItems.value.length - 1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (highlightIdx.value >= 0) {
      const item = navItems.value[highlightIdx.value]
      if (!isMenu.value) selectOption(item as Option)
      return
    }
    const text = comboText.value.trim()
    if (text && props.allowCreate) {
      if (isCombobox.value && props.multiple) {
        const vals = [...((props.modelValue || []) as (string | number | boolean)[])]
        let addVal: string | number | boolean = text
        if (filteredOptions.value.length > 0) {
          addVal = filteredOptions.value[0].value
        } else {
          const matched = props.options?.find((o) => o.label === text || String(o.value) === text)
          addVal = matched ? matched.value : text
        }
        if (!vals.some((v) => String(v) === String(addVal))) {
          vals.push(addVal)
          emit('update:modelValue', vals)
          emit('change', vals)
        }
        comboText.value = ''
        nextTick(() => comboInputRef.value?.focus())
        return
      }
      commitComboValue(text)
      closePanel()
    }
  }
}

/* ════════════════════════════════════════
   键盘导航
   ════════════════════════════════════════ */
const navItems = computed(() => (isMenu.value ? props.items || [] : filteredOptions.value))
const navCount = computed(() => (isTreeSelect.value ? treeNodes.value.length : navItems.value.length))

function onTriggerKeydown(e: KeyboardEvent) {
  if (isMenu.value) return
  if (e.key === 'Escape') {
    closePanel()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault()
    if (!open.value) {
      toggleOpen()
      return
    }
    if (e.key === 'ArrowDown') highlightIdx.value = Math.min(highlightIdx.value + 1, navCount.value - 1)
    if (e.key === 'Enter' && highlightIdx.value >= 0) {
      if (isTreeSelect.value) {
        const flatNode = treeNodes.value[highlightIdx.value]
        if (flatNode) onTreeNodeClick(flatNode)
      } else {
        const item = navItems.value[highlightIdx.value]
        if (isMenu.value) onMenuClick(item as MenuItem)
        else selectOption(item as Option)
      }
    }
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
  }
}

/* ════════════════════════════════════════
   Date / Date-range / Time
   ════════════════════════════════════════ */
const dateFmt = computed(() => props.format || 'YYYY-MM-DD')
const modelMonth = ref({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 })
const draftStart = ref('')
const draftEnd = ref('')
const draftHover = ref('')
const draftTime = ref('')
const timeColumnsRef = ref<InstanceType<typeof TimeColumns> | null>(null)

const triggerDisplayText = computed(() => {
  if (isDateRange.value) {
    const arr = Array.isArray(props.modelValue) ? props.modelValue : []
    if (arr[0] && arr[1]) return `${String(arr[0])} ~ ${String(arr[1])}`
    return ''
  }
  if (!props.modelValue) return ''
  return String(props.modelValue)
})

const dateTimePlaceholder = computed(() => {
  if (isDateRange.value) return `${props.rangePlaceholder[0]} ~ ${props.rangePlaceholder[1]}`
  return props.placeholder || (isDate.value ? '请选择日期' : isTime.value ? '请选择时间' : '')
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
  markTouched()
  closePanel()
  emit('update:modelValue', date)
  emit('change', date)
}

watch(
  () => props.modelValue,
  (val) => {
    if (isDateRange.value) {
      const arr = Array.isArray(val) ? val : []
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
  markTouched()
  const value: [string, string] = [draftStart.value, draftEnd.value || draftStart.value]
  closePanel()
  emit('update:modelValue', value)
  emit('change', value)
}

watch(
  () => props.modelValue,
  (val) => {
    if (isTime.value) draftTime.value = String(val || '')
  },
  { immediate: true },
)

watch(open, async (val) => {
  if (val && isTime.value) {
    await nextTick()
    timeColumnsRef.value?.scrollToValue()
  }
})

function onTimePick(time: string) {
  draftTime.value = time
}
function onTimeConfirm() {
  markTouched()
  closePanel()
  emit('update:modelValue', draftTime.value)
  emit('change', draftTime.value)
}
function onTimeCancel() {
  closePanel()
}
</script>

<template>
  <div class="select-root">
    <div class="select-dropdown-root" :class="{ 'has-floating': label, error: !!(errorMsg || props.error) }">
      <!-- 触发器 -->
      <div
        ref="triggerRef"
        class="trigger-wrapper"
        :class="{ open, disabled, 'has-floating': label, 'has-tags': comboTags.length > 0 }"
        @click="!isCombobox && toggleOpen($event)"
      >
        <label v-if="label" class="fl-label" :class="{ raised: floatingRaised }">{{ label }}</label>

        <!-- 多选 tag -->
        <span v-for="tag in comboTags" :key="String(tag.value)" class="combobox-tag">
          <span class="tag-text">{{ tag.label }}</span>
          <button type="button" class="tag-close" tabindex="-1" @mousedown.prevent @click.stop="removeComboTag(tag)">
            ×
          </button>
        </span>

        <input
          ref="comboInputRef"
          :value="isCombobox ? comboText : displayText"
          type="text"
          class="trigger-input"
          :class="{ readonly: !isCombobox }"
          :placeholder="label ? '' : isDate || isDateRange || isTime ? dateTimePlaceholder : placeholder"
          :disabled="disabled"
          :readonly="!isCombobox"
          role="combobox"
          :aria-expanded="open"
          :aria-haspopup="
            isMenu ? 'menu' : isTreeSelect ? 'tree' : isDate || isDateRange || isTime ? 'dialog' : 'listbox'
          "
          aria-autocomplete="list"
          :aria-controls="open ? 'select-dropdown-list' : undefined"
          :aria-activedescendant="open && highlightIdx >= 0 ? `select-option-${highlightIdx}` : undefined"
          autocomplete="off"
          @click.stop="isCombobox ? !open && toggleOpen($event) : toggleOpen($event)"
          @focus="isCombobox ? onComboFocus() : emit('focus')"
          @blur="(isCombobox ? onComboBlur() : markTouched(), emit('blur'))"
          @input="isCombobox ? ((comboText = ($event.target as HTMLInputElement).value), onComboInput()) : undefined"
          @keydown="isCombobox ? onComboKeydown($event) : onTriggerKeydown($event)"
        />

        <span
          v-if="clearable && hasValue"
          class="select-clear"
          role="button"
          aria-label="清除"
          tabindex="-1"
          @click="onClear"
        >
          <IconSvg type="x" size="xs" />
        </span>

        <IconSvg
          :type="isTime ? 'clock' : isDate || isDateRange ? 'calendar' : 'chevron-down'"
          size="sm"
          class="trigger-arrow"
          :class="{ rotated: open }"
        />
      </div>

      <!-- 校验错误 -->
      <div v-if="errorMsg || props.error" class="select-error">{{ props.error || errorMsg }}</div>

      <!-- 下拉面板 -->
      <Teleport to="body">
        <Transition name="drop">
          <div
            v-if="open"
            :id="open ? 'select-dropdown-list' : undefined"
            ref="floatingRef"
            class="dropdown-panel"
            :class="[`flip-${flipDir}`]"
            :style="floatingStyle"
            :role="isMenu ? 'menu' : isTreeSelect ? 'tree' : 'listbox'"
          >
            <!-- 搜索框（select / tree-select 模式） -->
            <div v-if="(isSelect || isTreeSelect) && searchable" class="panel-search">
              <IconSvg type="search" size="sm" />
              <input
                ref="searchInputRef"
                v-model="searchText"
                type="text"
                class="panel-input"
                placeholder="输入搜索..."
              />
            </div>

            <!-- Loading -->
            <div v-if="isLoading" class="panel-status">
              <IconSvg type="loader" size="md" />
            </div>

            <!-- Menu 模式 -->
            <div v-else-if="isMenu" class="panel-list">
              <template v-for="(item, idx) in items" :key="idx">
                <div v-if="item.divided && idx > 0" class="menu-divider" />
                <button
                  type="button"
                  class="panel-item"
                  :class="{ danger: item.danger, highlighted: idx === highlightIdx }"
                  @click="onMenuClick(item)"
                >
                  <IconSvg v-if="item.icon" :type="item.icon" size="sm" />
                  <span>{{ item.label }}</span>
                </button>
              </template>
            </div>

            <!-- Tree-select 模式 -->
            <div v-else-if="isTreeSelect" class="panel-list">
              <template v-if="treeNodes.length">
                <button
                  v-for="(flatNode, idx) in treeNodes"
                  :key="flatNode.path.map((n) => String(n.value)).join('>')"
                  type="button"
                  class="panel-item tree-node-item"
                  :class="{
                    selected: flatNode.isLeaf && isTreeSelected(flatNode),
                    disabled: flatNode.node.disabled,
                    highlighted: idx === highlightIdx,
                  }"
                  :style="{ paddingLeft: `${12 + flatNode.depth * 20}px` }"
                  :disabled="flatNode.node.disabled"
                  role="treeitem"
                  :aria-selected="flatNode.isLeaf ? isTreeSelected(flatNode) : undefined"
                  @click="onTreeNodeClick(flatNode)"
                  @mouseenter="highlightIdx = idx"
                >
                  <IconSvg
                    v-if="hasTreeChildren(flatNode.node)"
                    type="chevron-right"
                    size="sm"
                    class="expand-icon"
                    :class="{ expanded: treeFlatten.isExpanded(flatNode.node.value) }"
                  />
                  <span v-else class="expand-placeholder" />
                  <div class="item-text">
                    <span class="item-label">{{ flatNode.node.label }}</span>
                  </div>
                  <IconSvg
                    v-if="flatNode.isLeaf && isTreeSelected(flatNode)"
                    type="circle-check-big"
                    size="sm"
                    color="var(--color-primary)"
                  />
                </button>
              </template>
              <div v-else class="panel-status">
                <span>{{ emptyText }}</span>
              </div>
            </div>

            <!-- Date 面板 -->
            <DatePanel
              v-else-if="isDate"
              v-model:model-month="modelMonth"
              :selected="String(props.modelValue || '')"
              :min="props.dateMin"
              :max="props.dateMax"
              :format="dateFmt"
              @select="onDateSelect"
            />

            <!-- Date-range 面板 -->
            <DatePanel
              v-else-if="isDateRange"
              v-model:model-month="modelMonth"
              :selected="[draftStart, draftEnd]"
              :hover-end="draftHover"
              :min="props.dateMin"
              :max="props.dateMax"
              :format="dateFmt"
              range
              @select="onDateRangeClick"
              @hover="onDateRangeHover"
            >
              <template #actions>
                <button type="button" class="dd-btn" @click="onTimeCancel">取消</button>
                <button type="button" class="dd-btn dd-btn-primary" :disabled="!draftStart" @click="onDateRangeConfirm">
                  确定
                </button>
              </template>
            </DatePanel>

            <!-- Time 面板 -->
            <template v-else-if="isTime">
              <TimeColumns
                ref="timeColumnsRef"
                :value="draftTime"
                :format="(props.format || 'HH:mm') as 'HH:mm' | 'HH:mm:ss'"
                :step="props.timeStep"
                @select="onTimePick"
              />
              <div class="dd-footer">
                <button type="button" class="dd-btn" @click="onTimeCancel">取消</button>
                <button type="button" class="dd-btn dd-btn-primary" @click="onTimeConfirm">确定</button>
              </div>
            </template>

            <!-- 空选项状态 -->
            <div v-else-if="!filteredOptions.length" class="panel-status">
              <slot name="empty">
                <template v-if="isCombobox && allowCreate && comboText">按回车使用"{{ comboText }}"</template>
                <template v-else-if="isCombobox && allowCreate && !options?.length">输入搜索或直接回车创建</template>
                <template v-else>{{ emptyText }}</template>
              </slot>
            </div>

            <!-- 选项列表 -->
            <div v-else class="panel-list">
              <button
                v-for="(opt, idx) in filteredOptions"
                :id="`select-option-${idx}`"
                :key="String(opt.value)"
                type="button"
                class="panel-item"
                :class="{ selected: isSelected(opt), disabled: opt.disabled, highlighted: idx === highlightIdx }"
                :disabled="opt.disabled"
                role="option"
                :aria-selected="isSelected(opt)"
                @click="selectOption(opt)"
              >
                <slot name="option" :opt="opt" :selected="isSelected(opt)">
                  <IconSvg v-if="opt.icon" :type="opt.icon" size="sm" />
                  <div class="item-text">
                    <span class="item-label">{{ opt.label }}</span>
                    <span v-if="opt.desc" class="item-desc">{{ opt.desc }}</span>
                  </div>
                </slot>
                <IconSvg v-if="isSelected(opt)" type="circle-check-big" size="sm" color="var(--color-primary)" />
              </button>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.select-dropdown-root {
  position: relative;
  width: 100%;
}
.select-dropdown-root.has-floating {
  overflow: visible;
}
.select-dropdown-root.error .trigger-wrapper {
  border-color: var(--color-danger);
}
.select-error {
  color: var(--color-danger);
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
}

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
.select-dropdown-root.error .fl-label.raised {
  color: var(--color-danger);
}

.trigger-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  height: var(--ctrl-height, clamp(42px, 7vw, 48px));
  padding: 0 var(--ctrl-padding-x, clamp(8px, 1.5vw, 12px));
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--ctrl-radius, var(--radius-md));
  font-size: var(--ctrl-font-size, clamp(13px, 1.8vw, 14px));
  transition: border-color var(--transition-fast);
  cursor: pointer;
}
.trigger-wrapper.open {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}
.trigger-wrapper.disabled {
  opacity: 1;
  background: var(--bg-secondary, #f4f5f7);
  cursor: not-allowed;
}

.combobox-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex-shrink: 0;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  height: 28px;
  padding: 0 var(--space-2);
  background: var(--color-primary-light);
  border-radius: var(--radius-sm);
  font-size: 13px;
  line-height: 1;
  color: var(--color-primary);
}
.combobox-tag .tag-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.tag-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}
.tag-close:hover {
  opacity: 1;
  background: rgba(79, 110, 247, 0.15);
}
.trigger-wrapper.has-tags {
  height: auto;
  min-height: var(--ctrl-height, clamp(38px, 6vw, 42px));
  padding-block: 5px;
  flex-wrap: wrap;
}
.trigger-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--ctrl-font-size, clamp(13px, 1.8vw, 14px));
  color: var(--color-text);
}
.trigger-input::placeholder {
  color: var(--color-text-muted);
}
.trigger-input:disabled {
  color: var(--color-text);
  cursor: not-allowed;
}
.trigger-input.readonly {
  cursor: pointer;
}
.trigger-arrow {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
}
.trigger-arrow.rotated {
  transform: rotate(180deg);
}

.select-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-text-muted);
  color: var(--color-surface);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  transition:
    opacity var(--transition-fast),
    background var(--transition-fast);
}
.select-clear:hover {
  opacity: 1;
  background: var(--color-text);
}
.trigger-wrapper .select-clear {
  margin-right: var(--space-1);
}

.dropdown-panel:has(> .dp-header),
.dropdown-panel:has(> .tp-columns) {
  width: clamp(264px, 44vw, 300px);
  max-height: none;
  padding: var(--space-3);
  box-sizing: border-box;
}
</style>

<style>
.dropdown-panel {
  min-width: clamp(160px, 26vw, 220px);
  max-height: clamp(200px, 36vw, 280px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.panel-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: clamp(6px, 1vw, 8px) clamp(8px, 1.5vw, 12px);
  border-bottom: 1px solid var(--color-border-light);
  color: var(--color-text-muted);
  flex-shrink: 0;
}
.panel-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: clamp(11px, 1.8vw, 13px);
  outline: none;
}
.panel-list {
  flex: 1;
  max-height: clamp(140px, 26vw, 200px);
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
.panel-list::-webkit-scrollbar {
  width: 5px;
}
.panel-list::-webkit-scrollbar-track {
  background: transparent;
}
.panel-list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-lg);
}
.panel-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
.panel-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: clamp(6px, 1vw, 8px) clamp(8px, 1.5vw, 12px);
  border: none;
  background: transparent;
  font-size: clamp(11px, 1.8vw, 13px);
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);
  text-align: left;
}
.panel-item:hover:not(.disabled) {
  background: var(--color-bg-alt);
}
.panel-item.selected {
  background: var(--color-primary-light);
}
.panel-item.highlighted {
  background: var(--color-bg-alt);
}
.panel-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.panel-item.danger {
  color: var(--color-danger);
}
.panel-item.danger:hover {
  background: #fef2f2;
}
.item-text {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.item-label {
  font-size: clamp(12px, 1.8vw, 14px);
}
.item-desc {
  font-size: clamp(10px, 1.5vw, 12px);
  color: var(--color-text-muted);
}
.menu-divider {
  margin: var(--space-1) 0;
  border-top: 1px solid var(--color-border-light);
}

.tree-node-item .expand-icon {
  flex-shrink: 0;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}
.tree-node-item .expand-icon.expanded {
  transform: rotate(90deg);
}
.tree-node-item .expand-placeholder {
  width: 16px;
  flex-shrink: 0;
}
.tree-node-item .item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-status {
  display: flex;
  justify-content: center;
  padding: clamp(16px, 3vw, 24px);
  color: var(--color-text-muted);
  font-size: clamp(11px, 1.8vw, 13px);
}
.panel-status svg {
  animation: spin 1s linear infinite;
}

.drop-enter-active {
  transition:
    opacity var(--transition-normal),
    transform var(--transition-normal);
}
.drop-leave-active {
  transition:
    opacity var(--transition-fast),
    transform var(--transition-fast);
}
.drop-enter-from {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
.flip-up.drop-enter-from {
  transform: translateY(6px) scale(0.97);
}
.flip-up.drop-leave-to {
  transform: translateY(4px) scale(0.97);
}

.dd-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.dd-btn {
  padding: clamp(4px, 0.8vw, 6px) clamp(12px, 2vw, 16px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: clamp(11px, 1.6vw, 12px);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.dd-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.dd-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dd-btn-primary {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}
.dd-btn-primary:hover {
  opacity: 0.85;
  color: #fff;
}
</style>
