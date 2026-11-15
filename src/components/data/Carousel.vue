<script setup lang="ts">
/**
 * Carousel — 卡片/公告轮播（CSS scroll-snap 实现）
 *
 * ## 为什么不用 JS 位移
 *
 * 常见写法是 `transform: translateX(-index * 100%)`，代价：要自己算宽度、处理 RTL 镜像、
 * 接管滚动与回弹、缩放变化时重算。这里改用 **CSS scroll-snap**：轨道是横向滚动容器，
 * 每个直接子元素 `scroll-snap-align: start` —— 吸附、触屏滑动、RTL 方向、等比缩放都交给浏览器，
 * 组件只做「箭头 / 圆点 / 键盘」三件事。
 *
 * ## 用法（子元素即页）
 *
 * ```vue
 * <Carousel :count="3" height="200px">
 *   <div>第一页</div><div>第二页</div><div>第三页</div>
 * </Carousel>
 * ```
 *
 * 之所以用「n 个直接子元素」而不是 `items` + 作用域插槽：宿主写出来的就是普通 DOM，
 * 不需要为每次使用定义插槽模板；`count` 只为圆点/箭头/循环提供数字，不做内容渲染。
 *
 * ## 减弱动效
 *
 * 自动播放在 `prefers-reduced-motion: reduce` 下**不启动** —— 全局令牌只能压掉过渡时长，
 * 压不掉"自己会动"这件事。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useRovingTabindex } from '@/components/_internal/useRovingTabindex'

interface Props {
  /** 页数（= 直接子元素个数）。用于圆点/箭头/循环判定 */
  count: number
  /** 受控当前页（可选）；不传则内部自管 */
  modelValue?: number
  /** 自动播放间隔（毫秒）。0 = 不自动播放 */
  autoplay?: number
  /** 是否循环（末页→首页） */
  loop?: boolean
  /** 显示左右箭头 */
  arrows?: boolean
  /** 显示底部圆点 */
  dots?: boolean
  /** 轨道高度（CSS 长度；不传则 180px 等比） */
  height?: string
  /** 无障碍名：读屏念「<名字>，轮播，第 2 页 / 共 5 页」 */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  autoplay: 0,
  loop: true,
  arrows: true,
  dots: true,
  height: '',
  ariaLabel: '',
})

const emit = defineEmits<{
  /** 当前页变化（用户滑动 / 点箭头 / 自动播放都会触发） */
  'update:modelValue': [index: number]
  /** 当前页变化（附页码与总页数，便于宿主埋点） */
  change: [index: number, total: number]
}>()

const t = useT()

/**
 * 滚动停稳判定窗口（ms）。
 * <60ms：一次吸附的连续 scroll 事件会被拆成多次回写，索引抖动；
 * >150ms：手指停下与圆点更新之间出现可感迟滞。90ms 是实测折中。
 */
const SCROLL_SETTLE_MS = 90

/**
 * 圆点是 tablist：按 roving tabindex 规矩，整组只留 1 个 Tab 停靠点。
 *
 * ⚠️ `useRovingTabindex` 的两条契约（#509，参照 `Tabs` / `SegmentedControl` /
 * `NotificationCenter` 三处调用）：
 *   ① keydown 必须挂在**容器**上 —— 它内部用 `e.currentTarget.querySelector(...)`
 *      找目标，`currentTarget` 得是能搜到所有项的容器；挂在某一项上就只会搜自己，
 *      查到 null → `el?.focus()` 空转，**方向键推不动真实焦点**（停靠点动了、焦点没动）。
 *   ② 每个项要有 `data-roving-key="<key>"` —— 它就是被 querySelector 找的标记。
 * 以前这两条都没有：方向键只推进内部停靠点，真实焦点一动不动，用户按右键看不到反应，
 * 而 Tab 的落点已经悄悄挪走。
 */
const dotRoving = useRovingTabindex({
  keys: () => Array.from({ length: total.value }, (_, i) => i),
  activeKey: () => activeIndex.value,
  orientation: 'horizontal',
})
const trackRef = ref<HTMLElement | null>(null)
const innerIndex = ref(0)

const total = computed(() => Math.max(0, props.count || 0))
const activeIndex = computed(() => {
  const v = props.modelValue ?? innerIndex.value
  return Math.max(0, Math.min(v, Math.max(0, total.value - 1)))
})
const heightStyle = computed(() => (props.height ? props.height : `calc(180px * var(--vcl-scale))`))

/** 运行时取直接子元素当作页（不依赖宿主加 ref） */
function slideEls(): HTMLElement[] {
  const track = trackRef.value
  if (!track) return []
  return Array.from(track.children).filter((c): c is HTMLElement => c instanceof HTMLElement)
}

/**
 * 立刻把索引落到目标页并通知宿主（乐观更新），再让轨道滚过去。
 *
 * 为什么不"等滚动停稳再 emit"：程序化翻页（箭头/键盘/圆点/自动播放）本该即时生效，
 * 等 90ms 的滚动 settle 会带来可感的迟钝，也依赖浏览器真的发出 scroll 事件。
 * 滚动 settle 那条路径只用来**校正手指拖拽**（用户拖到别处时的索引回写）。
 */
function setIndex(i: number) {
  const clamped = Math.max(0, Math.min(i, Math.max(0, total.value - 1)))
  if (clamped === activeIndex.value) return
  innerIndex.value = clamped
  emit('update:modelValue', clamped)
  emit('change', clamped, total.value)
}

function goTo(i: number, behavior: ScrollBehavior = 'smooth') {
  const track = trackRef.value
  const slides = slideEls()
  const target = slides[Math.max(0, Math.min(i, slides.length - 1))]
  setIndex(i)
  if (!track || !target) return
  track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior })
}

function next() {
  if (!total.value) return
  const atEnd = activeIndex.value >= total.value - 1
  goTo(atEnd ? (props.loop ? 0 : total.value - 1) : activeIndex.value + 1)
}

function prev() {
  if (!total.value) return
  const atStart = activeIndex.value <= 0
  goTo(atStart ? (props.loop ? total.value - 1 : 0) : activeIndex.value - 1)
}

/** 滚动停稳后回写索引：只有真正换页才 emit，避免抖动刷事件 */
let settleTimer: ReturnType<typeof setTimeout> | null = null
function onScroll() {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    const track = trackRef.value
    if (!track) return
    const left = track.scrollLeft
    let nearest = 0
    let min = Number.POSITIVE_INFINITY
    slideEls().forEach((el, i) => {
      const d = Math.abs(el.offsetLeft - track.offsetLeft - left)
      if (d < min) {
        min = d
        nearest = i
      }
    })
    // 拖拽后回写索引：setIndex 自带"值没变就不 emit"的守卫
    setIndex(nearest)
  }, SCROLL_SETTLE_MS)
}

/**
 * 轨道当前是不是 RTL（#485）。
 *
 * 运行时读，不缓存：宿主切语言时 `<html dir="rtl">` 会变，组件不该要求重建。
 * 优先用计算值（覆盖 `direction: rtl` 这种纯样式设置），再回退到最近祖先的
 * `dir` 属性 —— happy-dom 的 getComputedStyle 不解析 dir 继承，测试环境靠这一条。
 *
 * 取证（真 Chrome，RTL flex + scroll-snap）：三页的 `offsetLeft` 是 [0, -300, -600]，
 * 所以**第 0 页在右、下一页在左**；`goTo` 的 `target.offsetLeft - track.offsetLeft`
 * 在 RTL 下本来就是负的、正好对，别去"修"它。要镜像的只有键位与箭头字形。
 */
function trackRtl(): boolean {
  const el = trackRef.value
  if (!el) return false
  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    if (window.getComputedStyle(el).direction === 'rtl') return true
  }
  return el.closest('[dir]')?.getAttribute('dir') === 'rtl'
}

function onKeydown(e: KeyboardEvent) {
  // 键位是**物理方向**：右键该往视觉右边翻。RTL 下视觉右边是上一页（起始方向），
  // 所以两个键要互换 —— 否则按右键内容往左走，与浏览器原生滚动和箭头图标都相反。
  const rtl = trackRtl()
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (rtl) prev()
    else next()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (rtl) next()
    else prev()
  }
}

/* ── 自动播放：hover/focus 暂停；减弱动效下不启动 ───────────────────────── */
let timer: ReturnType<typeof setInterval> | null = null
const paused = ref(false)

function motionReduced(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
}

function startAuto() {
  stopAuto()
  if (!props.autoplay || props.autoplay <= 0) return
  if (motionReduced()) return
  timer = setInterval(() => {
    if (!paused.value) next()
  }, props.autoplay)
}

function stopAuto() {
  if (timer) clearInterval(timer)
  timer = null
}

onMounted(() => {
  startAuto()
  if (typeof props.modelValue === 'number' && props.modelValue > 0) goTo(props.modelValue, 'auto')
})

onBeforeUnmount(() => {
  stopAuto()
  if (settleTimer) clearTimeout(settleTimer)
})

watch(
  () => props.autoplay,
  () => startAuto(),
)

watch(
  () => props.modelValue,
  (v) => {
    if (typeof v === 'number') goTo(v)
  },
)

defineExpose({
  /** 翻到下一页 / 上一页（宿主做「下一个公告」按钮时用） */
  next,
  prev,
  /** 跳到指定页 */
  goTo,
})
</script>

<template>
  <div
    class="carousel"
    role="group"
    aria-roledescription="carousel"
    :aria-label="ariaLabel || undefined"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <div
      ref="trackRef"
      class="carousel-track"
      :style="{ height: heightStyle }"
      tabindex="0"
      role="group"
      :aria-label="t('carousel.trackLabel')"
      @scroll.passive="onScroll"
      @keydown="onKeydown"
    >
      <!-- @slot default: 每页内容；直接子元素个数应等于 count（滚动吸附由 CSS 负责） -->
      <slot />
    </div>

    <template v-if="arrows && total > 1">
      <button type="button" class="carousel-arrow carousel-arrow--prev" :aria-label="t('carousel.prev')" @click="prev">
        <span aria-hidden="true">‹</span>
      </button>
      <button type="button" class="carousel-arrow carousel-arrow--next" :aria-label="t('carousel.next')" @click="next">
        <span aria-hidden="true">›</span>
      </button>
    </template>

    <div
      v-if="dots && total > 1"
      class="carousel-dots"
      role="tablist"
      :aria-label="t('carousel.dotsLabel')"
      @keydown="dotRoving.onKeydown($event)"
    >
      <button
        v-for="i in total"
        :key="`dot-${i - 1}`"
        type="button"
        class="carousel-dot"
        :class="{ 'is-active': i - 1 === activeIndex }"
        role="tab"
        :aria-selected="i - 1 === activeIndex"
        :tabindex="dotRoving.tabindexFor(i - 1)"
        :data-roving-key="String(i - 1)"
        :aria-label="t('carousel.goto', { n: i })"
        @click="goTo(i - 1)"
        @focus="dotRoving.focusKey(i - 1)"
      />
    </div>
  </div>
</template>

<style src="./carousel-scoped.css" scoped></style>
