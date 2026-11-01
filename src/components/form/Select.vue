<script lang="ts">
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：prop 默认值工厂在 setup 之前执行（defineProps 被提升），不能引用 setup 局部变量 */
const t = useT()
</script>

<script setup lang="ts">
/**
 * Select 统一选择器 — 重写版
 *
 * 核心设计原则：
 * 1. 只用 @click 管开关（不用 @focus），消除 focus+click 双重触发
 * 2. useClickOutside 加 openedAt 时间戳防抖（窗口见 _CLICK_SUPPRESS_MS / _SCROLL_SUPPRESS_MS）
 * 3. 面板用 v-if + Transition（不用 v-show），避免 display:none 时 offsetHeight=0
 * 4. v-if 条件链：先判断模式类型（Date/Time/Tree/Menu），再判断空选项
 * 5. 统一上浮骑缝（floating label）样式
 *
 * 单选/多选统一格式（select 与 combobox 同一套交互，isInputable）：
 * - 已选值一律 tag 展示（单选 0-1 个、多选 0-N 个），input 只承载正在输入的文字
 * - trigger 可直接输入：输入即过滤，Enter/失焦提交，allowCreate 允许自定义值
 * - 打开面板恒展示全部选项（comboText 为空不过滤），选中项高亮 ✓
 *
 * 支持模式：select | combobox | menu | cascader | tree-select | date | date-range | time
 */
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useFloating } from '@/components/_internal/useFloating'
import { useClickOutside } from '@/components/_internal/useClickOutside'
import { isImeComposing } from '@/components/_internal/ime'
import { useSelectDatePanel } from './useSelectDatePanel'
import { useSelectTree } from './useSelectTree'
import { useSelectOption } from './useSelectOption'
import { useSelectFiltering } from './useSelectFiltering'
import DatePanel from './date-panel/DatePanel.vue'
import TimeColumns from './date-panel/TimeColumns.vue'
import type { Option, MenuItem, CascaderOption } from '@/components/shared/types'

/* ════════════════════════════════════════
   Props
   ════════════════════════════════════════ */
/** 导出以供声明文件引用：不导出会触发 TS4082，本组件的 .d.ts 将无法生成 */
export interface Props {
  /** 模式：select 下拉 | menu 菜单 | combobox 可输入 | cascader 级联 | tree-select 树选 | date | date-range | time */
  type?: 'select' | 'menu' | 'combobox' | 'cascader' | 'tree-select' | 'date' | 'date-range' | 'time'
  /** 受控值：单选 string|number；多选数组；date-range 为 [起, 止] */
  modelValue?: string | number | (string | number | boolean)[] | [string, string] | null
  /** 选项表（select/combobox）：{ value, label, disabled? } */
  options?: Option[]
  /** 浮动标签文案（上浮骑缝样式） */
  label?: string
  /** 校验规则：返回错误文案即不通过 */
  rules?: ((v: string) => string | undefined)[]
  /** 外部注入错误提示（覆盖 rules 结果） */
  error?: string
  /** 多选：tags 展示，值为数组 */
  multiple?: boolean
  /** 占位文案（默认内置「请选择」） */
  placeholder?: string
  /** 触发器可输入过滤（默认开） */
  searchable?: boolean
  /** 过滤启用拼音匹配（默认开） */
  pinyinEnabled?: boolean
  /** 面板加载态 */
  isLoading?: boolean
  /** 无匹配文案（默认内置） */
  emptyText?: string
  /** 允许创建选项表外的自定义值（默认开）；选项精确命中不受此开关限制 */
  allowCreate?: boolean
  /** 多选下聚焦即清空已选 tags、重新输入（默认关） */
  clearOnFocus?: boolean
  /** menu 模式的菜单项 */
  items?: MenuItem[]
  /** cascader 模式的级联选项（value/label/children/disabled） */
  cascaderOptions?: CascaderOption[]
  /** 禁用 */
  disabled?: boolean
  /** 浮层面板 z-index 覆盖 */
  zIndex?: string
  /** date/date-range 模式的值格式（默认 'YYYY-MM-DD'） */
  format?: string
  /** 可选日期下限（同 format 格式） */
  dateMin?: string
  /** 可选日期上限（同 format 格式） */
  dateMax?: string
  /** date-range 双占位（默认内置起/止文案） */
  rangePlaceholder?: [string, string]
  /** time 模式分钟步进（默认 1） */
  timeStep?: number
  /** 显示清除按钮（默认关） */
  clearable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'select',
  rules: () => [],
  disabled: false,
  multiple: false,
  options: () => [],
  items: () => [],
  placeholder: () => t('form.pleaseSelect'),
  searchable: true,
  pinyinEnabled: true,
  isLoading: false,
  emptyText: () => t('form.noMatch'),
  allowCreate: true,
  clearOnFocus: false,
  format: 'YYYY-MM-DD',
  dateMin: '',
  dateMax: '',
  rangePlaceholder: () => [t('form.startDate'), t('form.endDate')] as [string, string],
  timeStep: 1,
  clearable: false,
})

type SelectModelValue = string | number | (string | number | boolean)[] | [string, string] | null

const emit = defineEmits<{
  /** v-model——受控值 */
  'update:modelValue': [v: SelectModelValue]
  /** 值提交（选中/清除后；与 update:modelValue 同步抛出） */
  change: [v: SelectModelValue]
  /** 触发器获得焦点 */
  focus: []
  /** 触发器失去焦点 */
  blur: []
  /** 下拉面板展开/收起：[true=展开] */
  'visible-change': [v: boolean]
}>()

/* ════════════════════════════════════════
   模式判断
   ════════════════════════════════════════ */
/** 无障碍：浮动 label 与 trigger input 关联的唯一 id */
const selectInputId = useIdSafe('select-input')
/** 下拉面板唯一 id：同页多个 Select 实例时 aria-controls/面板 id 各自独立，避免重复 id 导致关联错乱 */
const dropdownId = useIdSafe('select-panel')
const isSelect = computed(() => props.type === 'select')
const isCombobox = computed(() => props.type === 'combobox')
/** 统一交互模式（单选/多选、select/combobox 同格式）：已选 tag 展示 + trigger 直接输入 + 打开面板展示全部 */
const isInputable = computed(() => isSelect.value || isCombobox.value)
const isMenu = computed(() => props.type === 'menu' && !!props.items)
const isTreeSelect = computed(() => props.type === 'tree-select' || props.type === 'cascader')
const isDate = computed(() => props.type === 'date')
const isDateRange = computed(() => props.type === 'date-range')
const isTime = computed(() => props.type === 'time')
/**
 * 面板角色。日期/时间面板里装的是 DatePanel/TimeColumns 的一堆 <button type="button">，
 * 而 listbox 只允许 option 作后代 —— 挂 listbox 会让读屏把这些按钮整块剪出无障碍树
 * （用户听得见"列表框"却读不到任何一天）。这两种模式改为不设角色。
 */
const panelRole = computed(() => {
  if (isMenu.value) return 'menu'
  if (isTreeSelect.value) return 'tree'
  if (isDate.value || isDateRange.value || isTime.value) return undefined
  return 'listbox'
})
/** 日期/时间面板：有固有宽度（clamp 264-300px），不跟随触发器拉伸 */
const isDateTime = computed(() => isDate.value || isDateRange.value || isTime.value)

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
  // 日期/时间面板固有宽度，不随触发器拉伸（列表型面板仍与触发器同宽）
  matchWidth: !isDateTime.value,
  maxMatchWidth: isInputable.value,
})

/**
 * 打开后还要吞掉的两类外部事件，各自有各自的成因，所以窗口分开取：
 * - 外部 click：可输入变体是聚焦即开面板，而这次聚焦往往由一次点按带来，同一次手势随后还会
 *   派生一个 click 打到 document 捕获层。
 *   实测（Chromium，带 viewport meta）它距打开只有 0.2ms（鼠标）/ 0.8ms（触屏），
 *   150ms 已是大余量；再往上加会把用户紧接着的真点击也吞掉（点第二下没反应）。
 * - 外部 scroll：聚焦会让浏览器把元素滚进可视区，这一下可以拖到几百毫秒，取 300ms。
 *   不按 pointer:coarse 收窄，是因为带触摸屏的笔记本会报 fine，收窄就把
 *   「刚打开又被自己那次操作的滚动关掉」这个可见 bug 放回来了。
 */
const _CLICK_SUPPRESS_MS = 150
const _SCROLL_SUPPRESS_MS = 300

// useClickOutside：见上，面板刚打开时不响应这一次手势派生的外部点击
useClickOutside([triggerRef, floatingRef], () => {
  if (!open.value) return
  if (Date.now() - openedAt < _CLICK_SUPPRESS_MS) return
  closePanel()
})

/** 外部滚动关闭面板（捕获阶段拿真实 event，不依赖非标准的全局 event 对象） */
function onExternalScroll(e: Event) {
  if (!open.value) return
  const scrollEl = e.target
  if (scrollEl instanceof Node && floatingRef.value?.contains(scrollEl)) return
  if (Date.now() - openedAt < _SCROLL_SUPPRESS_MS) return
  closePanel()
}

onMounted(() => {
  // SSR/测试环境无 window 时跳过（此前裸挂 + 依赖全局 event，非标准且 SSR 不安全）
  if (typeof window !== 'undefined') window.addEventListener('scroll', onExternalScroll, true)
})
onUnmounted(() => {
  window.removeEventListener('scroll', onExternalScroll, true)
  if (blurTimer) clearTimeout(blurTimer)
})

const searchInputRef = ref<HTMLInputElement | null>(null)
const comboInputRef = ref<HTMLInputElement | null>(null)
const searchText = ref('')
const highlightIdx = ref(-1)

// combobox/select 统一输入文本：已选值由 tag 展示，comboText 只承载"正在输入"的内容
const comboText = ref('')
/** blur 后等一等：点选项必先触发输入框 blur，要给选项的 click 留出发时间 */
const _BLUR_SETTLE_MS = 150
let blurTimer: ReturnType<typeof setTimeout> | null = null

// 面板打开后聚焦输入框（select/combobox 聚 trigger 输入框可直接输入；tree-select 聚面板搜索框）
watch(open, async (val) => {
  if (!val) return
  await nextTick()
  if (isInputable.value) {
    comboInputRef.value?.focus()
  } else if (props.searchable && isTreeSelect.value) {
    searchInputRef.value?.focus()
  }
})

/**
 * 打开/关闭面板 — 单一入口
 * - combobox 模式：由 input @click 调用（wrapper 不绑定 click）
 * - 其他模式：由 wrapper @click 调用
 * - 不再在 @focus 中调用，消除双重触发
 */
/**
 * 是否允许写入（2026-11-01 #288）。
 *
 * 清空按钮、tag 上的 ×、时间面板确认…… 都是"改值入口"。#286/#287 两轮各自发现
 * 一个漏判的入口，根因是**判据散落**：每个入口自己写一次 `if (props.disabled)`。
 * 收敛到这里，新入口只要引一次 canWrite，就不会再漏。
 *
 * 注意只收 **写** 入口：查看/展开这类读操作不在此列（禁用态本来就打不开面板）。
 */
const canWrite = computed(() => !props.disabled)
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
  emit('visible-change', true)
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
  emit('visible-change', false)
}

/** 触发器点击：输入型（select/combobox）打开面板但不做"再点关闭"（输入中误点不收起，靠外部点击/Escape 收起）；其余模式维持开关切换 */
function onTriggerClick(e: MouseEvent) {
  if (!isInputable.value) {
    toggleOpen(e)
    return
  }
  if (!open.value) toggleOpen(e)
}

/* ════════════════════════════════════════
   拼音过滤 + 防抖搜索 + 下拉虚拟化（编排下沉 useSelectFiltering；
   共享拼音匹配器：全量拼音/首字母各算一次存 Map，搜索直接读缓存避免重复 pinyin()）
   ════════════════════════════════════════ */
const { filteredOptions, matchOptions, panelListRef, optVirtual, windowedOptions, measureOptionRow } =
  useSelectFiltering({
    options: () => props.options,
    pinyinEnabled: () => props.pinyinEnabled,
    isInputable: () => isInputable.value,
    comboText,
    searchText,
    highlightIdx,
  })

/* ════════════════════════════════════════
   显示文本
   ════════════════════════════════════════ */
const displayText = computed(() => {
  if (isDate.value || isDateRange.value || isTime.value) return triggerDisplayText.value
  // tree-select 有 tag 显示完整路径时，input 不再重复显示文字
  if (isTreeSelect.value) return comboTags.value.length > 0 ? '' : treeDisplayText.value
  // select/combobox 统一：已选值由 tag 展示，input 只显示正在输入的文字
  return comboText.value
})

// floating 标签上浮条件
const floatingRaised = computed(() => {
  return open.value || !!displayText.value || comboTags.value.length > 0
})

/* ════════════════════════════════════════
   已选 tag（单选 0-1 个、多选 0-N 个，格式统一）
   ════════════════════════════════════════ */
const comboTags = computed(() => {
  if (isTreeSelect.value) {
    return treeSelectedPaths.value.map((p) => ({
      value: p[p.length - 1].value,
      label: p.map((n) => n.label).join(' / '),
    }))
  }
  if (!isInputable.value) return []
  const options = props.options ?? []
  if (props.multiple) {
    const vals = (props.modelValue || []) as (string | number | boolean)[]
    return vals.map((v) => ({
      value: v,
      label: options.find((o) => String(o.value) === String(v))?.label || String(v),
    }))
  }
  // 单选：0 或 1 个 tag，展示格式与多选一致
  if (!hasValue.value) return []
  const v = props.modelValue as string | number | boolean
  return [{ value: v, label: options.find((o) => String(o.value) === String(v))?.label || String(v) }]
})

function removeComboTag(tag: { value: string | number | boolean; label: string }) {
  // 禁用语义守卫（2026-11-01 #287）：这是**第二条清空路径** —— #286 只守了 `.select-clear`，
  // tag 上的 × 同样能把值删掉（多选删一项、单选清空），实测 disabled 下点击 emit ['sh']。
  // 与 onClearGuarded 同一判据，防止再出现"同一契约两条路径只守一条"。
  if (!canWrite.value) return
  markTouched()
  if (props.multiple || isTreeSelect.value) {
    const vals = ((props.modelValue || []) as (string | number | boolean)[]).filter(
      (v) => String(v) !== String(tag.value),
    )
    emit('update:modelValue', vals)
    emit('change', vals)
  } else {
    // 单选：移除唯一 tag = 清空值（统一 null，与 onClear 一致）
    emit('update:modelValue', null)
    emit('change', null)
  }
}

/* ════════════════════════════════════════
   选项选择（选中/提交/清除下沉 useSelectOption；selectedValueKeys 查表优化口径见模块 JSDoc）
   ════════════════════════════════════════ */
const { selectedValueKeys, isSelected, selectOption, onClear } = useSelectOption({
  modelValue: () => props.modelValue ?? null,
  multiple: () => props.multiple,
  isInputable: () => isInputable.value,
  comboText,
  focusCombo: () => nextTick(() => comboInputRef.value?.focus()),
  blurCombo: () => nextTick(() => comboInputRef.value?.blur()),
  closePanel,
  markTouched,
  emit: (ev, v) => {
    const val = v as SelectModelValue
    if (ev === 'change') emit('change', val)
    else emit('update:modelValue', val)
  },
})

/* ════════════════════════════════════════
   菜单模式
   ════════════════════════════════════════ */
function onMenuClick(item: MenuItem) {
  open.value = false
  emit('visible-change', false)
  item.action?.()
}

/** 右键菜单 */
function openMenu(e: MouseEvent | { x: number; y: number }) {
  if (props.disabled || !isMenu.value) return
  openedAt = Date.now()
  prepareOpen()
  open.value = true
  searchText.value = ''
  emit('visible-change', true)
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
const {
  treeFlatten,
  visibleTreeNodes,
  treeSelectedPaths,
  treeDisplayText,
  isTreeSelected,
  onTreeNodeClick,
  hasTreeChildren,
} = useSelectTree({
  cascaderOptions: () => props.cascaderOptions,
  modelValue: () => props.modelValue,
  searchText,
  selectedValueKeys,
  emit: (event, value) => {
    // TreeModelValue（(string|number)[]）是 SelectModelValue 的子集
    if (event === 'change') emit('change', value as SelectModelValue)
    else emit('update:modelValue', value as SelectModelValue)
  },
})

/* ════════════════════════════════════════
   Combobox / Select 统一输入事件
   说明：已选值由 tag 展示，modelValue 外部变化无需同步进 comboText，
   comboText 只承载"正在输入"的内容，失焦/选中后统一清空
   ════════════════════════════════════════ */
function onComboFocus() {
  if (props.disabled) return
  emit('focus')
  // 打开面板（如果还没打开）
  if (!open.value) {
    prepareOpen()
    openedAt = Date.now()
    open.value = true
    emit('visible-change', true)
    nextTick(() => requestAnimationFrame(() => updatePosition()))
  }
  // 多选 + clearOnFocus
  if (props.multiple && props.clearOnFocus && comboTags.value.length > 0) {
    emit('update:modelValue', [])
    emit('change', [])
  }
}

function onComboInput() {
  if (!open.value) {
    prepareOpen()
    openedAt = Date.now()
    open.value = true
    emit('visible-change', true)
    nextTick(() => requestAnimationFrame(() => updatePosition()))
  }
  highlightIdx.value = -1
}

/** 精确命中（label 或 value 全等；disabled 不过滤——调用方按语义拒绝） */
function findExact(text: string): Option | undefined {
  return props.options?.find((o) => o.label === text || String(o.value) === text)
}

/**
 * 提交输入：命中可选选项取其 value，否则（allowCreate）直接用输入文本作为值。
 * - 精确命中不受 allowCreate 限制（意图明确=选它；allowCreate 只管"创建列表外新值"）
 * - disabled 命中一律拒绝（与面板 pick/selectOption 守卫对齐：点不动的键盘也不得选）
 */
function commitComboValue(text: string) {
  const matched = findExact(text)
  if (matched?.disabled) return
  if (matched) {
    emit('update:modelValue', matched.value as SelectModelValue)
    emit('change', matched.value as SelectModelValue)
  } else {
    emit('update:modelValue', text)
    emit('change', text)
  }
  comboText.value = ''
}

function onComboBlur() {
  markTouched()
  emit('blur')
  // 延迟处理：等待面板选项 click 先行（点击选项必先触发 input blur）
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    // 焦点仍在触发器/面板内（如多选刚点选选项后重新聚焦输入框）→ 视为未离开，不收起
    const active = document.activeElement as Node | null
    if (active && (triggerRef.value?.contains(active) || floatingRef.value?.contains(active))) return
    if (props.multiple) {
      // 多选：未提交的输入直接丢弃，已选值由 tag 展示；焦点真离开时收起面板
      comboText.value = ''
      if (open.value) closePanel()
      return
    }
    // 单选：精确命中不受 allowCreate 限制；disabled 命中被 commitComboValue 拒绝
    const text = comboText.value.trim()
    if (!text) {
      comboText.value = ''
      if (open.value) closePanel()
      return
    }
    if (findExact(text) || props.allowCreate) commitComboValue(text)
    comboText.value = ''
    if (open.value) closePanel()
  }, _BLUR_SETTLE_MS)
}

/**
 * 清空入口守卫（2026-11-01 #286）。
 *
 * 模板上的 × 已按 `!disabled` 隐藏，但 `onClear` 仍可被其它路径
 * （外部调用 / 键盘扩展 / 未来新增入口）触发 —— 只读与禁用语义必须由**入口**保证，
 * 而不是靠"界面上看不见"。
 */
function onClearGuarded(e: MouseEvent) {
  if (!canWrite.value) {
    e.stopPropagation()
    return
  }
  onClear(e)
}
function onComboKeydown(e: KeyboardEvent) {
  // 输入法合成期一律放行（2026-11-01 #276）。
  // 中文用户输拼音 → 候选框 → 按 Enter 上屏；此前这里会把 Enter 当作"确认选中"，
  // 拿**拼音**去匹配/创建选项（`allowCreate` 下直接生成 "zhongguo" 这种脏选项），
  // 同时 `preventDefault()` 让上屏本身也失败。部分 WebView 只给 keyCode 229，两个都判。
  if (isImeComposing(e)) return
  if (e.key === 'Escape') {
    // 消费掉 Esc：不让它冒泡去关闭外层弹窗（#280）
    e.preventDefault?.()
    comboText.value = ''
    closePanel()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault?.()
    if (!open.value) {
      toggleOpen()
      return
    }
    highlightIdx.value = Math.min(highlightIdx.value + 1, navItems.value.length - 1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault?.()
    highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault?.()
    if (highlightIdx.value >= 0) {
      const item = navItems.value[highlightIdx.value]
      if (!isMenu.value) selectOption(item as Option)
      return
    }
    const text = comboText.value.trim()
    if (!text) return
    const exact = findExact(text)
    if (props.multiple) {
      // 多选：精确命中优先（disabled 拒绝、不受 allowCreate 限制）；否则 allowCreate 才创建/模糊追加
      if (exact) {
        const vals = [...((props.modelValue || []) as (string | number | boolean)[])]
        if (!exact.disabled && !vals.some((v) => String(v) === String(exact.value))) {
          vals.push(exact.value)
          emit('update:modelValue', vals)
          emit('change', vals)
        }
        comboText.value = ''
        nextTick(() => comboInputRef.value?.focus())
        return
      }
      if (props.allowCreate) {
        const vals = [...((props.modelValue || []) as (string | number | boolean)[])]
        // 即时匹配（不走 200ms 防抖）：快速输入+回车时防抖列表尚未更新，取 stale 首项会静默失败；
        // 模糊首匹配跳过 disabled（键盘与面板守卫对齐）
        let addVal: string | number | boolean = text
        const fresh = matchOptions(text).filter((o) => !o.disabled)
        if (fresh.length > 0) addVal = fresh[0].value
        if (!vals.some((v) => String(v) === String(addVal))) {
          vals.push(addVal)
          emit('update:modelValue', vals)
          emit('change', vals)
        }
        comboText.value = ''
        nextTick(() => comboInputRef.value?.focus())
      }
      return
    }
    // 单选：精确命中不受 allowCreate 限制（意图明确=选它）；disabled 命中被 commitComboValue 拒绝
    if (exact || props.allowCreate) {
      commitComboValue(text)
      closePanel()
    }
  }
}

/* ════════════════════════════════════════
   键盘导航
   ════════════════════════════════════════ */
const navItems = computed(() => (isMenu.value ? props.items || [] : filteredOptions.value))
const navCount = computed(() => (isTreeSelect.value ? visibleTreeNodes.value.length : navItems.value.length))

function onTriggerKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    // 消费掉 Esc，避免同时关闭外层弹窗（#280）
    e.preventDefault?.()
    closePanel()
    return
  }
  if (e.key === 'Tab') {
    // 焦点随 Tab 移走，只读型面板（日期/树/菜单）没有 blur 收起逻辑，这里显式关闭
    closePanel()
    return
  }
  // 菜单模式：方向键在菜单项间导航，Enter 选中（此前直接 return，下拉对键盘完全不可达）
  if (isMenu.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault?.()
      if (!open.value) {
        toggleOpen()
        return
      }
      if (e.key === 'ArrowDown') highlightIdx.value = Math.min(highlightIdx.value + 1, navCount.value - 1)
      else highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
    } else if (e.key === 'Enter' && open.value) {
      e.preventDefault?.()
      const item = navItems.value[highlightIdx.value]
      if (item) onMenuClick(item as MenuItem)
    } else if ((e.key === 'Enter' || e.key === ' ') && !open.value) {
      e.preventDefault?.()
      toggleOpen()
    }
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault?.()
    if (!open.value) {
      toggleOpen()
      return
    }
    if (e.key === 'ArrowDown') highlightIdx.value = Math.min(highlightIdx.value + 1, navCount.value - 1)
    if (e.key === 'Enter' && highlightIdx.value >= 0) {
      if (isTreeSelect.value) {
        const flatNode = visibleTreeNodes.value[highlightIdx.value]
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
    e.preventDefault?.()
    highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
  }
}

/* ════════════════════════════════════════
   Date / Date-range / Time（编排下沉 useSelectDatePanel：
   草稿态、modelValue 三个 immediate watch、打开时行高/滚位修正、选中/确认/取消处理器）
   ════════════════════════════════════════ */
const {
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
} = useSelectDatePanel(props, open, {
  closePanel,
  markTouched,
  measureOptionRow,
  emit: (ev, v) => {
    const val = v as SelectModelValue
    if (ev === 'change') emit('change', val)
    else emit('update:modelValue', val)
  },
})
</script>

<template>
  <div class="select-root">
    <div class="select-dropdown-root" :class="{ 'has-floating': label, error: !!(errorMsg || props.error) }">
      <!-- 触发器 -->
      <div
        ref="triggerRef"
        class="trigger-wrapper"
        :class="{ open, disabled, 'has-floating': label, 'has-tags': comboTags.length > 0 }"
        @click="onTriggerClick($event)"
      >
        <label v-if="label" class="fl-label" :for="selectInputId" :title="label" :class="{ raised: floatingRaised }">{{
          label
        }}</label>

        <!-- 已选 tag（单选 0-1 个 / 多选 0-N 个，格式统一） -->
        <span v-for="tag in comboTags" :key="String(tag.value)" class="combobox-tag">
          <span class="tag-text" :title="tag.label">{{ tag.label }}</span>
          <!-- 关闭钮用 SVG 图标不用文本 ×：文本字形受字体度量摆布（Arial 的 × 整体坐基线上方，
               墨迹中心比盒子中心高 ~1px），小尺寸 tag 里与文本肉眼可见不齐；IconSvg 由 flex 精确居中 -->
          <button
            v-if="canWrite"
            type="button"
            class="tag-close"
            tabindex="-1"
            @mousedown.prevent
            @click.stop="removeComboTag(tag)"
          >
            <IconSvg type="x" size="xs" />
          </button>
        </span>

        <input
          :id="selectInputId"
          ref="comboInputRef"
          :aria-invalid="!!(errorMsg || props.error) || undefined"
          :value="isInputable ? comboText : displayText"
          type="text"
          class="trigger-input"
          :class="{ readonly: !isInputable }"
          :placeholder="
            label || comboTags.length ? '' : isDate || isDateRange || isTime ? dateTimePlaceholder : placeholder
          "
          :disabled="disabled"
          :readonly="!isInputable"
          role="combobox"
          :aria-expanded="open"
          :aria-haspopup="
            isMenu ? 'menu' : isTreeSelect ? 'tree' : isDate || isDateRange || isTime ? 'dialog' : 'listbox'
          "
          aria-autocomplete="list"
          :aria-controls="open ? dropdownId : undefined"
          :aria-activedescendant="
            open && !isTreeSelect && highlightIdx >= 0 ? `${dropdownId}-${highlightIdx}` : undefined
          "
          autocomplete="off"
          @click.stop="onTriggerClick($event)"
          @focus="isInputable ? onComboFocus() : emit('focus')"
          @blur="(isInputable ? onComboBlur() : markTouched(), emit('blur'))"
          @input="isInputable ? ((comboText = ($event.target as HTMLInputElement).value), onComboInput()) : undefined"
          @keydown="isInputable ? onComboKeydown($event) : onTriggerKeydown($event)"
        />

        <span
          v-if="clearable && hasValue && canWrite"
          class="select-clear"
          role="button"
          :aria-label="t('form.clear')"
          tabindex="-1"
          @mousedown.prevent
          @click="onClearGuarded"
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
      <div v-if="errorMsg || props.error" class="select-error" role="alert">{{ props.error || errorMsg }}</div>

      <!-- 下拉面板 -->
      <Teleport to="body">
        <Transition name="drop">
          <div
            v-if="open"
            :id="dropdownId"
            ref="floatingRef"
            class="dropdown-panel"
            :class="[`flip-${flipDir}`]"
            :style="floatingStyle"
            :role="panelRole"
          >
            <!-- 搜索框（仅 tree-select：trigger 不可输入；select/combobox 由 trigger 直接输入过滤） -->
            <div v-if="isTreeSelect && searchable" class="panel-search">
              <IconSvg type="search" size="sm" />
              <input
                ref="searchInputRef"
                v-model="searchText"
                type="text"
                class="panel-input"
                :placeholder="t('form.searchInput')"
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
              <template v-if="visibleTreeNodes.length">
                <button
                  v-for="(flatNode, idx) in visibleTreeNodes"
                  :key="flatNode.path.map((n) => String(n.value)).join('>')"
                  type="button"
                  class="panel-item tree-node-item"
                  :class="{
                    selected: flatNode.isLeaf && isTreeSelected(flatNode),
                    disabled: flatNode.node.disabled,
                    highlighted: idx === highlightIdx,
                  }"
                  :style="{ paddingLeft: `calc(${12 + flatNode.depth * 20}px * var(--vcl-scale))` }"
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
                    <span class="item-label" :title="flatNode.node.label">{{ flatNode.node.label }}</span>
                  </div>
                  <IconSvg
                    v-if="flatNode.isLeaf && isTreeSelected(flatNode)"
                    type="circle-check-big"
                    size="sm"
                    color="var(--vcl-color-primary)"
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
                <button type="button" class="dd-btn" @click="onTimeCancel">{{ t('form.cancel') }}</button>
                <button type="button" class="dd-btn dd-btn-primary" :disabled="!draftStart" @click="onDateRangeConfirm">
                  {{ t('form.confirm') }}
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
                <button type="button" class="dd-btn" @click="onTimeCancel">{{ t('form.cancel') }}</button>
                <button type="button" class="dd-btn dd-btn-primary" @click="onTimeConfirm">
                  {{ t('form.confirm') }}
                </button>
              </div>
            </template>

            <!-- 空选项状态 -->
            <div v-else-if="!filteredOptions.length" class="panel-status">
              <!-- @slot empty: 下拉面板空选项态内容 -->
              <slot name="empty">
                <template v-if="isInputable && allowCreate && comboText">{{
                  t('form.enterToUse', { text: comboText })
                }}</template>
                <template v-else-if="isInputable && allowCreate && !options?.length">{{
                  t('form.enterToCreate')
                }}</template>
                <template v-else>{{ emptyText }}</template>
              </slot>
            </div>

            <!-- 选项列表 -->
            <div v-else ref="panelListRef" class="panel-list" @scroll="optVirtual.onScroll">
              <!-- 上下占位：撑出与全量等高的滚动区域，窗口才能按 scrollTop 换算行号 -->
              <div
                v-if="optVirtual.enabled.value"
                aria-hidden="true"
                :style="{ height: optVirtual.topPad.value + 'px' }"
              />
              <button
                v-for="{ opt, index } in windowedOptions"
                :id="`${dropdownId}-${index}`"
                :key="String(opt.value)"
                type="button"
                class="panel-item"
                :class="{ selected: isSelected(opt), disabled: opt.disabled, highlighted: index === highlightIdx }"
                :disabled="opt.disabled"
                role="option"
                :aria-selected="isSelected(opt)"
                @click="selectOption(opt)"
              >
                <!-- @slot option: 单个选项的自定义渲染（作用域：opt、selected） -->
                <slot name="option" :opt="opt" :selected="isSelected(opt)">
                  <IconSvg v-if="opt.icon" :type="opt.icon" size="sm" />
                  <div class="item-text">
                    <span class="item-label" :title="opt.label">{{ opt.label }}</span>
                    <span v-if="opt.desc" class="item-desc">{{ opt.desc }}</span>
                  </div>
                </slot>
                <IconSvg v-if="isSelected(opt)" type="circle-check-big" size="sm" color="var(--vcl-color-primary)" />
              </button>
              <div
                v-if="optVirtual.enabled.value"
                aria-hidden="true"
                :style="{ height: optVirtual.bottomPad.value + 'px' }"
              />
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>

<style src="./select-scoped.css" scoped></style>

<style src="./select.css"></style>
