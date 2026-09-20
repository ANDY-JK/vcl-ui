<script setup lang="ts">
// ⛔ 保护 — 卡片，禁止：clamp() → px，grid/flex 模式切换逻辑
//    需我确认：variant 类型扩展、actions slot 结构
import { computed } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'

/* ====== grid 模式 Props ====== */
interface GridProps {
  type?: 'grid' | 'stat'
  title?: string
  /**
   * title 的标题标签级。默认 h3：卡片通常是「页标题(h1) → 区块(h2) → 卡片」的第三级。
   * 硬编码某一级会在宿主层级不同时跳级（axe heading-order），故把选择权交给调用方；
   * 传 'div' 表示纯展示标题（卡片不承担文档结构职责时用）。
   */
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div'
  highlight?: boolean
  summary?: boolean
  /** 允许内容溢出卡片边界（用于包含下拉/弹出组件的场景） */
  overflowVisible?: boolean
}
/* ====== stat 模式 Props ====== */
interface StatProps {
  type?: 'grid' | 'stat'
  value?: string | number
  label?: string
  icon?: string
  color?: string
  trend?: number | string
}

// 使用交集而非联合类型：保留两种模式的 IDE 自动补全，运行时不区分
const props = withDefaults(defineProps<GridProps & StatProps>(), {
  type: 'grid',
  icon: 'circle-alert',
  titleAs: 'h3',
})

const emit = defineEmits<{ (e: 'click'): void }>()

const isStat = computed(() => props.type === 'stat')

const trendNum = computed(() => {
  const v = props.trend
  if (v === undefined || v === null) return 0
  const n = typeof v === 'string' ? parseFloat(v.replace('%', '')) : Number(v)
  return isNaN(n) ? 0 : n
})
const trendUi = computed(() => ({
  icon: trendNum.value > 0 ? 'chevron-up' : trendNum.value < 0 ? 'chevron-down' : 'minus',
  style: {
    color:
      trendNum.value > 0
        ? 'var(--color-success)'
        : trendNum.value < 0
          ? 'var(--color-danger)'
          : 'var(--color-text-muted)',
  },
}))

/** 图标底色：color-mix 兼容任意 CSS 颜色格式（旧写法 color+'20' 只对 6 位 hex 成立，
    传 rgb()/8 位 hex/CSS 变量会生成非法颜色，背景静默丢失） */
const iconBg = computed(() =>
  props.color ? `color-mix(in srgb, ${props.color} 12%, transparent)` : 'var(--color-primary-light)',
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
        color: color || 'var(--color-primary)',
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
  <div v-else class="grid-card" :class="{ summary, highlight, 'grid-card--overflow-visible': overflowVisible }">
    <div v-if="title || $slots.header" class="grid-header">
      <component :is="titleAs" v-if="title" class="grid-title">
        {{ title }}
      </component>
      <slot name="header" />
    </div>
    <div class="grid-body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="grid-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
/* ===== stat ===== */
.stat-card {
  display: flex;
  align-items: center;
  gap: clamp(var(--space-3), 2vw, 16px);
  padding: clamp(var(--space-3), 2.5vw, 20px);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
}
.stat-card:hover {
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}
.stat-card.highlight {
  border-left: 3px solid var(--color-primary);
}
.stat-icon {
  width: clamp(36px, 6vw, 44px);
  height: clamp(36px, 6vw, 44px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
}
.stat-body {
  flex: 1;
}
.stat-value {
  font-size: clamp(18px, 3.2vw, 36px);
  font-weight: 700;
  line-height: 1.2;
}
.stat-label {
  font-size: clamp(11px, 1.8vw, 15px);
  color: var(--color-text-muted);
  margin-top: var(--space-1);
}
.stat-trend {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: clamp(11px, 1.8vw, 15px);
  font-weight: 500;
}

/* ===== grid ===== */
.grid-card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: box-shadow var(--transition-fast);
}
.grid-card:hover {
  box-shadow: var(--shadow-sm);
}
.grid-card.highlight {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}
.grid-card.summary {
  background: var(--color-primary-light);
  border-color: transparent;
}
.grid-card--overflow-visible {
  overflow: visible;
}
.grid-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(var(--space-2), 1.5vw, 14px) clamp(10px, 1.8vw, 16px);
  border-bottom: 1px solid var(--color-border-light);
}
.grid-title {
  font-size: clamp(13px, 2vw, 15px);
  font-weight: 600;
}
.grid-body {
  flex: 1;
  padding: clamp(var(--space-1), 1.8vw, 8px);
}
.grid-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: clamp(var(--space-1), 1vw, 10px) clamp(10px, 1.8vw, 16px);
  border-top: 1px solid var(--color-border-light);
  background: var(--color-bg-alt);
}
</style>
