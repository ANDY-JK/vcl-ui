<script lang="ts">
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：prop 默认值工厂在 setup 之前执行（defineProps 被提升），不能引用 setup 局部变量 */
const t = useT()
</script>

<script setup lang="ts">
// ⛔ 保护 — 图标选择器，禁止：clamp() → px，搜索过滤逻辑删除，图标列表导入
//    需我确认：lucide 图标源、分页大小
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { Icon } from '@iconify/vue'
import { SOLAR_ICONS } from '@/components/_internal/solar-icons'
import lucideIconNames from '@/components/_internal/lucide-icons.json'
import { useFloating } from '@/components/_internal/useFloating'
import { useClickOutside } from '@/components/_internal/useClickOutside'

/** Lucide 全量图标名（kebab-case），从预构建 JSON 加载，避免运行时 Object.keys + map 1500+ 项 */
const allIcons = lucideIconNames as string[]

interface Props {
  modelValue?: string
  color?: string
  bgColor?: string
  /** 触发按钮占位文字 */
  placeholder?: string
  /** 预定义色板 */
  presetColors?: string[]
  /** 图标提供者 */
  provider?: 'lucide' | 'solar'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 'star',
  color: '#6366F1',
  bgColor: '#EAECF0',
  placeholder: () => t('form.selectIcon'),
  provider: 'lucide',
  presetColors: () => ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4'],
})

const emit = defineEmits<{
  'update:modelValue': [v: string]
  'update:color': [v: string]
  'update:bgColor': [v: string]
  'update:provider': [v: 'lucide' | 'solar']
  change: [v: { icon: string; color: string; bgColor: string }]
}>()

const open = ref(false)
const searchText = ref('')
const localIcon = ref(props.modelValue)
const localColor = ref(props.color)
const localBgColor = ref(props.bgColor)
const colorTarget = ref<'fg' | 'bg'>('fg') // 预设色板作用于哪个颜色
const localProvider = ref<'lucide' | 'solar'>(props.provider)
const solarIcons = ref<string[]>([])
const solarLoading = ref(false)

// 事件处理用命名函数：模板内联多语句 handler 会被 prettier(semi:false) 去分号重排，导致 Vue 表达式解析失败
function selectProvider(p: 'lucide' | 'solar') {
  localProvider.value = p
  if (p === 'solar') loadSolarIcons()
}
function setFgColor(e: Event) {
  localColor.value = (e.target as HTMLInputElement).value
  colorTarget.value = 'fg'
}
function setBgColor(e: Event) {
  localBgColor.value = (e.target as HTMLInputElement).value
  colorTarget.value = 'bg'
}
function setTransparentBg() {
  localBgColor.value = 'transparent'
  colorTarget.value = 'bg'
}

/** 加载 Solar 图标列表：优先 Iconify CDN API，失败回退内置精选列表 */
async function loadSolarIcons() {
  if (solarIcons.value.length) return
  solarLoading.value = true
  try {
    const res = await fetch('https://api.iconify.design/collection?prefix=solar&info=true')
    const data = await res.json()
    const names: string[] = Object.values(data.categories || {}).flat() as string[]
    // 仅取 -linear 变体（Apple 风格）
    solarIcons.value = names.filter((n: string) => n.endsWith('-linear')).sort()
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[IconPicker] 在线图标加载失败，降级使用内置图标', e)
    solarIcons.value = SOLAR_ICONS
  } finally {
    solarLoading.value = false
  }
}

const { triggerRef, floatingRef, direction, floatingStyle, updatePosition, prepareOpen } = useFloating({
  offset: 8,
  defaultDirection: 'down',
  minSize: 160,
  matchWidth: false,
})

useClickOutside([triggerRef, floatingRef], () => {
  if (open.value) confirm()
})

/* 外部滚动时关闭面板，避免 useFloating 重算位置导致抖动 */
function onExternalScroll(e: Event) {
  if (!open.value) return
  const scrollEl = e.target as HTMLElement
  if (scrollEl && floatingRef.value?.contains(scrollEl)) return
  confirm()
}
onMounted(() => window.addEventListener('scroll', onExternalScroll, true))
onUnmounted(() => window.removeEventListener('scroll', onExternalScroll, true))

/** 当前提供者的图标源 */
const iconSource = computed(() => {
  return localProvider.value === 'solar' ? solarIcons.value : allIcons
})

const filteredIcons = computed(() => {
  return iconSource.value.filter((i: string) => i.toLowerCase().includes(searchText.value.toLowerCase()))
})

// 分批渲染：初始只渲染前 200 个，滚动触底追加，减少首次打开的 DOM 节点数
const PAGE_SIZE = 200
const iconPage = ref(1)
const pagedIcons = computed(() =>
  _noInfiniteScroll ? filteredIcons.value : filteredIcons.value.slice(0, iconPage.value * PAGE_SIZE),
)
const iconSentinel = ref<HTMLDivElement | null>(null)
let _iconObserver: IntersectionObserver | null = null
/** 环境无 IntersectionObserver 时的降级标记：分页计算返回全量 */
let _noInfiniteScroll = false

watch(searchText, () => {
  iconPage.value = 1
})
watch(localProvider, () => {
  iconPage.value = 1
  searchText.value = ''
})

onMounted(() => {
  // 旧 WebView 无 IntersectionObserver：sentinel 永远不触发 → 无限加载失效。
  // 降级为一次性全量渲染（图标为纯 SVG 名单，全量渲染可接受）
  if (typeof IntersectionObserver === 'undefined') {
    _noInfiniteScroll = true
    return
  }
  _iconObserver = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting && iconPage.value * PAGE_SIZE < filteredIcons.value.length) {
      iconPage.value++
    }
  })
})
onUnmounted(() => {
  _iconObserver?.disconnect()
})

// 确保 sentinel 挂载后 observer 绑定（面板打开时 sentinel 才存在于 DOM）
watch(open, (val) => {
  if (val) {
    iconPage.value = 1
    nextTick(() => {
      if (iconSentinel.value) _iconObserver?.observe(iconSentinel.value)
    })
  }
})

/** 构建 Iconify Solar 图标标识符，未指定变体时默认 -linear */
function solarIconName(name: string): string {
  const variants = ['linear', 'bold', 'broken', 'outline', 'bold-duotone', 'line-duotone']
  const parts = name.split('-')
  const lastTwo = parts.slice(-2).join('-')
  const lastOne = parts[parts.length - 1]!
  const hasVariant = variants.includes(lastTwo) || variants.includes(lastOne)
  return `solar:${name}${hasVariant ? '' : '-linear'}`
}

async function toggle(e: MouseEvent) {
  if (open.value) {
    open.value = false
    return
  }
  localIcon.value = props.modelValue
  localColor.value = props.color
  localBgColor.value = props.bgColor
  localProvider.value = props.provider
  searchText.value = ''
  // 先预定位到触发器附近，再显示面板，避免从错误位置闪现
  prepareOpen()
  if (localProvider.value === 'solar') loadSolarIcons()
  open.value = true
  await nextTick()
  await Promise.race([new Promise((r) => requestAnimationFrame(r)), new Promise((r) => setTimeout(r, 100))])
  updatePosition(e.currentTarget as HTMLElement)
}

function selectIcon(name: string) {
  localIcon.value = name
}

function confirm() {
  emit('update:modelValue', localIcon.value)
  emit('update:color', localColor.value)
  emit('update:bgColor', localBgColor.value)
  emit('update:provider', localProvider.value)
  emit('change', { icon: localIcon.value, color: localColor.value, bgColor: localBgColor.value })
  open.value = false
}
</script>

<template>
  <div class="picker-root">
    <button ref="triggerRef" type="button" class="picker-trigger" @click="toggle">
      <span class="trigger-icon" :style="{ background: bgColor === 'transparent' ? 'var(--color-bg-alt)' : bgColor }">
        <Icon v-if="provider === 'solar'" :icon="solarIconName(modelValue)" :width="20" :height="20" :color="color" />
        <IconSvg v-else :type="modelValue" size="md" :color="color" />
      </span>
      <span class="trigger-placeholder">{{ placeholder }}</span>
      <IconSvg type="chevron-down" size="sm" class="trigger-arrow" :class="{ rotated: open }" />
    </button>

    <Teleport to="body">
      <Transition name="drop">
        <div v-show="open" ref="floatingRef" class="picker-panel" :class="[`flip-${direction}`]" :style="floatingStyle">
          <!-- 提供者切换 -->
          <div class="provider-switch" role="tablist" :aria-label="t('form.iconProvider')">
            <button
              class="provider-tab"
              role="tab"
              :aria-selected="localProvider === 'lucide'"
              :class="{ active: localProvider === 'lucide' }"
              @click="selectProvider('lucide')"
            >
              Lucide
            </button>
            <button
              class="provider-tab"
              role="tab"
              :aria-selected="localProvider === 'solar'"
              :class="{ active: localProvider === 'solar' }"
              @click="selectProvider('solar')"
            >
              Solar
            </button>
          </div>

          <!-- 搜索 -->
          <div class="panel-search">
            <IconSvg type="search" size="sm" />
            <input v-model="searchText" type="text" class="panel-input" :placeholder="t('form.searchIcon')" />
          </div>

          <!-- 颜色选择 -->
          <div class="panel-colors">
            <div class="color-group">
              <span class="color-label">{{ t('form.iconColor') }}</span>
              <input
                type="color"
                :value="localColor"
                class="native-picker"
                @input="setFgColor($event)"
                @focus="colorTarget = 'fg'"
              />
              <input
                type="text"
                :value="localColor"
                class="hex-input"
                @input="setFgColor($event)"
                @focus="colorTarget = 'fg'"
              />
            </div>
            <div class="color-group">
              <span class="color-label">{{ t('form.bgColor') }}</span>
              <input
                type="color"
                :value="localBgColor"
                class="native-picker"
                @input="setBgColor($event)"
                @focus="colorTarget = 'bg'"
              />
              <input
                type="text"
                :value="localBgColor"
                class="hex-input"
                @input="setBgColor($event)"
                @focus="colorTarget = 'bg'"
              />
              <button
                class="transparent-btn"
                :class="{ active: localBgColor === 'transparent' }"
                @click="setTransparentBg()"
              >
                {{ t('form.none') }}
              </button>
            </div>
          </div>

          <!-- 选中预览 + 预设 + 确认 -->
          <div class="panel-preview">
            <span class="preview-icon-bg" :style="{ background: localBgColor }">
              <Icon
                v-if="localProvider === 'solar'"
                :icon="solarIconName(localIcon)"
                :width="24"
                :height="24"
                :color="localColor"
              />
              <IconSvg v-else :type="localIcon" size="lg" :color="localColor" />
            </span>
            <span class="preview-name"
              >{{ localIcon }} <span class="preview-hex">/ {{ localColor }}</span></span
            >
            <div class="preset-colors">
              <button
                v-for="c in presetColors"
                :key="c"
                class="preset-dot"
                :style="{ background: c }"
                :class="{ active: (colorTarget === 'fg' ? localColor : localBgColor) === c }"
                :aria-label="t('form.selectColor', { color: c })"
                :aria-pressed="(colorTarget === 'fg' ? localColor : localBgColor) === c"
                @click="colorTarget === 'fg' ? (localColor = c) : (localBgColor = c)"
              />
            </div>
            <button type="button" class="confirm-btn" @click="confirm">{{ t('form.confirm') }}</button>
          </div>

          <!-- 图标网格 -->
          <div class="panel-icons">
            <button
              v-for="name in pagedIcons"
              :key="name"
              type="button"
              class="icon-item"
              :class="{ selected: name === localIcon }"
              :aria-label="t('form.selectIconName', { name })"
              :aria-pressed="name === localIcon"
              @click="selectIcon(name)"
            >
              <span class="icon-item-bg">
                <Icon
                  v-if="localProvider === 'solar'"
                  :icon="'solar:' + name"
                  :width="20"
                  :height="20"
                  color="var(--color-text)"
                />
                <IconSvg v-else :type="name" size="md" color="var(--color-text)" />
              </span>
              <span>{{ name }}</span>
            </button>
            <p v-if="solarLoading" class="empty-tip">{{ t('form.loadingSolar') }}</p>
            <p v-else-if="!filteredIcons.length" class="empty-tip">{{ t('form.noMatchIcon') }}</p>
            <div ref="iconSentinel" style="height: 1px" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.picker-root {
  position: relative;
  display: inline-flex;
}

.picker-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: clamp(38px, 6vw, 42px);
  padding: 0 clamp(var(--space-2), 1.5vw, 12px);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: clamp(13px, 1.8vw, 15px);
  cursor: pointer;
  transition: border-color var(--transition-fast);
  font-family: inherit;
}
.picker-trigger:hover {
  border-color: var(--color-primary);
}
.trigger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(22px, 4vw, 28px);
  height: clamp(22px, 4vw, 28px);
  border-radius: var(--radius-sm);
  background: var(--color-bg-alt);
}
.trigger-placeholder {
  color: var(--color-text-muted);
  font-size: var(--ctrl-font-size);
}
.trigger-arrow {
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}
.trigger-arrow.rotated {
  transform: rotate(180deg);
}

/* 提供者切换 Tab */
.provider-switch {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.provider-tab {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  font-size: clamp(11px, 1.5vw, 14px);
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--color-text-muted);
  font-family: inherit;
  transition: all var(--transition-fast);
  border-bottom: 2px solid transparent;
}
.provider-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: 600;
}
.provider-tab:hover:not(.active) {
  color: var(--color-text-secondary);
}
</style>

<style>
.picker-panel {
  width: clamp(300px, 48vw, 380px);
  max-height: clamp(400px, 64vw, 520px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-search {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-light);
  color: var(--color-text-muted);
  flex-shrink: 0;
}
.panel-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: var(--ctrl-font-size);
  outline: none;
}

.panel-colors {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-1);
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.color-group {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  flex-shrink: 0;
}
.color-label {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.native-picker {
  width: clamp(18px, 3vw, 22px);
  height: clamp(18px, 3vw, 22px);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  padding: 0;
}
.native-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}
.native-picker::-webkit-color-swatch {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.hex-input {
  width: clamp(52px, 8vw, 62px);
  height: clamp(18px, 3vw, 22px);
  padding: var(--space-1) var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: clamp(10px, 1.3vw, 13px);
  font-family: monospace;
  background: var(--color-surface);
  color: var(--color-text-secondary);
}
.transparent-btn {
  padding: var(--space-1) var(--space-2);
  height: clamp(18px, 3vw, 22px);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.transparent-btn:hover {
  border-color: var(--color-text-muted);
  color: var(--color-text-secondary);
}
.transparent-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-light);
}

/* 选中预览行 */
.panel-preview {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.preview-icon-bg {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(32px, 5vw, 40px);
  height: clamp(32px, 5vw, 40px);
  border-radius: var(--radius-md);
  flex-shrink: 0;
}
.preview-name {
  font-size: var(--ctrl-font-size);
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.preview-hex {
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-muted);
  font-weight: 400;
  font-family: monospace;
  white-space: nowrap;
}
.preset-colors {
  display: flex;
  gap: var(--space-1);
  margin-left: auto;
  flex-shrink: 0;
  align-items: center;
}
.preset-dot {
  width: clamp(12px, 2vw, 16px);
  height: clamp(12px, 2vw, 16px);
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.preset-dot:hover {
  transform: scale(1.2);
}
.preset-dot.active {
  border-color: var(--color-text);
  transform: scale(1.25);
}
.panel-preview .confirm-btn {
  padding: var(--space-1) var(--space-3);
  height: clamp(22px, 4vw, 28px);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: white;
  font-size: clamp(11px, 1.5vw, 14px);
  white-space: nowrap;
  cursor: pointer;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}
.panel-preview .confirm-btn:hover {
  opacity: 0.85;
}

.panel-icons {
  flex: 1;
  overflow-y: auto;
  background: var(--color-bg);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(clamp(44px, 6vw, 54px), 1fr));
  gap: var(--space-1);
  padding: var(--space-1);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}
/* 自定义滚动条样式 */
.panel-icons::-webkit-scrollbar {
  width: var(--space-1);
}
.panel-icons::-webkit-scrollbar-track {
  background: transparent;
}
.panel-icons::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-lg);
}
.panel-icons::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
.icon-item-bg {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(22px, 4vw, 28px);
  height: clamp(22px, 4vw, 28px);
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}
.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-1);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: clamp(10px, 1.3vw, 13px);
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: inherit;
}
.icon-item:hover {
  border-color: var(--color-border);
  background: var(--color-bg-alt);
}
.icon-item.selected {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.empty-tip {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-5);
  font-size: clamp(11px, 1.5vw, 14px);
}

/* 面板动画：弹性缓动 + 微缩放，进场 200ms 退场 150ms（退场快于进场） */
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
  transform: translateY(calc(-1 * var(--space-2))) scale(0.97);
}
.drop-leave-to {
  opacity: 0;
  transform: translateY(calc(-1 * var(--space-1))) scale(0.97);
}
/* 向上展开时动画方向反转 */
.flip-up.drop-enter-from {
  transform: translateY(var(--space-2)) scale(0.97);
}
.flip-up.drop-leave-to {
  transform: translateY(var(--space-1)) scale(0.97);
}
</style>
