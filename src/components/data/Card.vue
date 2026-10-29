<script setup lang="ts">
// ⛔ 保护 — 卡片，禁止：clamp() → px，grid/flex 模式切换逻辑
//    需我确认：variant 类型扩展、actions slot 结构
import { computed } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'

/* ====== grid 模式 Props ====== */
interface GridProps {
  /** 模式：grid 内容卡片（默认）| stat 统计卡片 */
  type?: 'grid' | 'stat'
  /** 卡片标题（grid 模式） */
  title?: string
  /**
   * title 的标题标签级。默认 h3：卡片通常是「页标题(h1) → 区块(h2) → 卡片」的第三级。
   * 硬编码某一级会在宿主层级不同时跳级（axe heading-order），故把选择权交给调用方；
   * 传 'div' 表示纯展示标题（卡片不承担文档结构职责时用）。
   */
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div'
  /** 高亮描边（强调当前选中/活动卡片） */
  highlight?: boolean
  /** 摘要形态：压缩内边距的紧凑布局 */
  summary?: boolean
  /** 允许内容溢出卡片边界（用于包含下拉/弹出组件的场景） */
  overflowVisible?: boolean
  /** 卡片头部标题左侧的状态竖条颜色（accent bar）。不传 = 无竖条。
   *  常用于列表/看板里按状态给卡片分类着色（2026-10-04 用户需求）。 */
  accent?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  /** 角标文案（如「NEW」「热」「异常」）。传入即渲染；dot 形态下文字视觉隐藏、读屏仍读。
   *  折角形态属装饰性几何三角；语义三角（排序/涨跌/警告）请用 IconSvg。
   *  依赖卡片 overflow:hidden 裁切——与 overflowVisible 同用时丝带两端会露出卡外。 */
  corner?: string
  /** 角标底色（语义色，默认 primary） */
  cornerColor?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  /** 角标形态：ribbon 45° 折角丝带（实心底，装饰三角）| pill 透明浅底胶囊（-bg 底 + -text 字，
   *  悬浮不遮挡内容）| dot 状态圆点（-solid 饱和点 + pulse 扩散环，文字读屏可读）。默认 ribbon。 */
  cornerVariant?: 'ribbon' | 'pill' | 'dot'
  /** 角标位置（默认 top-right）。悬浮定位不占布局空间。 */
  cornerPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}
/* ====== stat 模式 Props ====== */
interface StatProps {
  /** 模式：grid 内容卡片 | stat 统计卡片（默认 'grid'） */
  type?: 'grid' | 'stat'
  /** 统计数值 */
  value?: string | number
  /** 数值下方的标签文案 */
  label?: string
  /** 统计图标（IconSvg 图标名） */
  icon?: string
  /** 数值/图标语义色（CSS 颜色值或令牌名） */
  color?: string
  /** 趋势：数字或 '12%' 类字符串；正=上涨箭头、负=下跌箭头、0/非法值=持平。
   *  非有限值（如分母为 0 得到的 Infinity）与不可解析的字符串（'1,234'/'12px'）一律按持平处理——
   *  它们不能变成「Infinity%」或一个看起来正常的错数（第 169 轮）。 */
  trend?: number | string
}

// 使用交集而非联合类型：保留两种模式的 IDE 自动补全，运行时不区分
const props = withDefaults(defineProps<GridProps & StatProps>(), {
  type: 'grid',
  icon: 'circle-alert',
  titleAs: 'h3',
  cornerColor: 'primary',
  cornerVariant: 'ribbon',
  cornerPosition: 'top-right',
})

const emit = defineEmits<{
  /** 卡片点击 */
  (e: 'click'): void
}>()

const isStat = computed(() => props.type === 'stat')

const trendNum = computed(() => {
  const v = props.trend
  if (v === undefined || v === null) return 0
  // 用 Number 而非 parseFloat（第 169 轮）：
  //  · parseFloat('1,234') = 1、parseFloat('12px') = 12 —— 得到一个**看起来完全正常的错数**，
  //    界面显示 "1%" / "12%"，比显示乱码更危险（没人会去质疑一个合理的百分比）；
  //    Number 对这两种输入返回 NaN，落到下面的"持平"，语义是"这不是个趋势值"。
  //  · Number('') 为 0、Number('12.5') 为 12.5，正常输入不受影响。
  const n = typeof v === 'string' ? Number(v.replace('%', '').trim()) : Number(v)
  // 非有限值一律按持平（第 169 轮）：环比增长率的分母为 0 时上游会算出 Infinity，
  // 而 isNaN(Infinity) 是 false，原实现把它原样渲染成「Infinity%」——趋势文案直接上屏。
  // 'Infinity' / '-Infinity' 字符串同样走这一条。
  return Number.isFinite(n) ? n : 0
})
const trendUi = computed(() => ({
  icon: trendNum.value > 0 ? 'chevron-up' : trendNum.value < 0 ? 'chevron-down' : 'minus',
  style: {
    color:
      trendNum.value > 0
        ? 'var(--vcl-color-success)'
        : trendNum.value < 0
          ? 'var(--vcl-color-danger)'
          : 'var(--vcl-color-text-muted)',
  },
}))

/** 图标底色：color-mix 兼容任意 CSS 颜色格式（旧写法 color+'20' 只对 6 位 hex 成立，
    传 rgb()/8 位 hex/CSS 变量会生成非法颜色，背景静默丢失） */
const iconBg = computed(() =>
  props.color ? `color-mix(in srgb, ${props.color} 12%, transparent)` : 'var(--vcl-color-primary-light)',
)
</script>

<template>
  <!-- stat 模式 -->
  <div
    v-if="isStat"
    class="stat-card"
    :class="{ highlight }"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter="emit('click')"
    @keydown.space.prevent="emit('click')"
  >
    <div
      v-if="icon"
      class="stat-icon"
      :style="{
        background: iconBg,
        color: color || 'var(--vcl-color-primary)',
      }"
    >
      <IconSvg :type="icon" size="md" color="currentColor" />
    </div>
    <div class="stat-body">
      <div class="stat-value">
        {{ value }}
      </div>
      <div v-if="label" class="stat-label">
        {{ label }}
      </div>
    </div>
    <div v-if="trend !== undefined" class="stat-trend">
      <IconSvg :type="trendUi.icon" size="sm" :style="trendUi.style" />
      <span :style="{ color: trendUi.style.color }">{{ Math.abs(trendNum) }}%</span>
    </div>
  </div>

  <!-- grid 模式 -->
  <div
    v-else
    class="grid-card"
    :class="{
      summary,
      highlight,
      'grid-card--overflow-visible': overflowVisible,
      [`grid-card--accent-${accent}`]: accent,
    }"
  >
    <span
      v-if="corner"
      class="grid-corner"
      :class="[`grid-corner--${cornerVariant}`, `grid-corner--${cornerPosition}`, `grid-corner--${cornerColor}`]"
    >
      <!-- 两层结构：外层是 0 尺寸锚点（钉在指定角），内层 mark 以锚点为中心自定位——
           对称性与文本宽度解耦，单层百分比 translate 做不到这一点 -->
      <span class="grid-corner-mark">{{ corner }}</span>
    </span>
    <div v-if="title || $slots.header" class="grid-header">
      <component :is="titleAs" v-if="title" class="grid-title">
        {{ title }}
      </component>
      <!-- @slot header: 卡片头部区域（自定义标题，与 title 属性并存） -->
      <slot name="header" />
    </div>
    <div class="grid-body">
      <!-- @slot default: 卡片主体内容 -->
      <slot />
    </div>
    <div v-if="$slots.footer" class="grid-footer">
      <!-- @slot footer: 卡片底部区域（仅传入时渲染） -->
      <slot name="footer" />
    </div>
  </div>
</template>

<style src="./card-scoped.css" scoped></style>
