<script setup lang="ts">
// ⛔ 保护 — 加载状态，禁止：skeleton 动画时序，spinner 尺寸比例
//    需我确认：variant 类型扩展、颜色/尺寸默认值


interface Props {
  /** 'spinner' 旋转图标 | 'skeleton' 骨架屏 | 'skeleton-text' 文字骨架 | 'skeleton-card' 卡片骨架 */
  variant?: 'spinner' | 'skeleton' | 'skeleton-text' | 'skeleton-card'
  size?: 'sm' | 'md' | 'lg'
  text?: string
  /** skeleton 模式 — 行数 */
  rows?: number
  /** skeleton 模式 — 自定义宽高 */
  width?: string
  height?: string
}

withDefaults(defineProps<Props>(), {
  variant: 'spinner',
  size: 'md',
  rows: 3,
  width: '100%',
  height: '14px',
})
</script>

<template>
  <!-- spinner -->
  <div v-if="variant === 'spinner'" class="loading-spinner" :class="[`spinner-${size}`]">
    <div class="spinner-ring" />
    <span v-if="text" class="spinner-text">{{ text }}</span>
  </div>

  <!-- 骨架卡片 -->
  <div v-else-if="variant === 'skeleton-card'" class="skel-card" aria-hidden="true">
    <div class="skel-line" v-for="i in rows" :key="i" :style="{ width: i === rows ? '60%' : '100%' }" />
  </div>

  <!-- 骨架文字 -->
  <div v-else-if="variant === 'skeleton-text'" class="skel-text" aria-hidden="true" :style="{ width, height }" />

  <!-- 骨架行 -->
  <div v-else class="skel-lines" aria-hidden="true">
    <div class="skel-line" v-for="i in rows" :key="i" :style="{ width: i === rows ? '40%' : '100%' }" />
  </div>
</template>

<style scoped>
/* ===== spinner ===== */
.loading-spinner { display: inline-flex; flex-direction: column; align-items: center; gap: var(--space-2); }
.spinner-ring { border: 3px solid var(--color-border); border-top-color: var(--color-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
.spinner-sm .spinner-ring { width: clamp(14px, 2vw, 16px); height: clamp(14px, 2vw, 16px); }
.spinner-md .spinner-ring { width: clamp(20px, 3vw, 24px); height: clamp(20px, 3vw, 24px); }
.spinner-lg .spinner-ring { width: clamp(32px, 5vw, 40px); height: clamp(32px, 5vw, 40px); }
.spinner-text { font-size: clamp(11px, 1.8vw, 13px); color: var(--color-text-muted); }

/* ===== skeleton ===== */
.skel-line,
.skel-text {
  height: clamp(12px, 1.8vw, 14px);
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-bg-alt) 25%, var(--color-border) 50%, var(--color-bg-alt) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.skel-card { display: flex; flex-direction: column; gap: clamp(8px, 1.5vw, 12px); padding: clamp(10px, 1.8vw, 16px); }
.skel-text { display: block; }
.skel-lines { display: flex; flex-direction: column; gap: clamp(8px, 1.5vw, 12px); }
</style>
