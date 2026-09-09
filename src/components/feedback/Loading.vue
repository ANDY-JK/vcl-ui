<script setup lang="ts">
// ⛔ 保护 — 加载状态，禁止：skeleton 动画时序，spinner 尺寸比例
//    需我确认：variant 类型扩展、颜色/尺寸默认值
import { useT } from '@/components/_internal/i18n'
import { useBodyScrollLock } from '@/components/_internal/useBodyScrollLock'

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
  /** 全屏加载遮罩：fixed 定位 + backdrop-filter + spinner 居中 */
  fullscreen?: boolean
  /** fullscreen 模式 — 遮罩背景色（CSS 颜色或变量，默认半透明黑） */
  overlay?: boolean
  /** Teleport 目标（WC/Shadow DOM 宿主指向自身容器），默认 'body' */
  teleportTo?: string | HTMLElement
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'spinner',
  size: 'md',
  rows: 3,
  width: '100%',
  height: '14px',
  fullscreen: false,
  overlay: true,
  teleportTo: 'body',
})

const t = useT()
// fullscreen 遮罩期间锁 body 滚动（引用计数：与其它弹层叠加时全部关闭才恢复）
useBodyScrollLock(() => props.fullscreen)
</script>

<template>
  <!-- fullscreen 全屏遮罩（teleportTo 可指向 Shadow DOM 宿主容器） -->
  <Teleport v-if="fullscreen" :to="teleportTo">
    <div
      class="loading-fullscreen"
      :class="{ 'loading-fullscreen--overlay': overlay }"
      aria-busy="true"
    >
      <div class="loading-fullscreen__content">
        <div class="spinner-ring" :class="[`spinner-${size}`]" />
        <span v-if="text" class="spinner-text">{{ text }}</span>
      </div>
    </div>
    <!-- 播报区必须放在 aria-busy 子树之外：aria-busy=true 会让 AT 挂起该子树内 live region 的播报，
         而本遮罩是卸载而非翻回 false，放里面等于永不播报 -->
    <div class="loading-fullscreen__live sr-only" role="status" aria-live="polite">
      {{ text || t('common.loading') }}
    </div>
  </Teleport>

  <!-- spinner -->
  <div
    v-else-if="variant === 'spinner'"
    class="loading-spinner"
    :class="[`spinner-${size}`]"
    role="status"
    aria-live="polite"
  >
    <div class="spinner-ring" />
    <span v-if="text" class="spinner-text">{{ text }}</span>
  </div>

  <!-- 骨架卡片 -->
  <div v-else-if="variant === 'skeleton-card'" class="skel-card" aria-hidden="true">
    <div v-for="i in rows" :key="i" class="skel-line" :style="{ width: i === rows ? '60%' : '100%' }" />
  </div>

  <!-- 骨架文字 -->
  <div v-else-if="variant === 'skeleton-text'" class="skel-text" aria-hidden="true" :style="{ width, height }" />

  <!-- 骨架行 -->
  <div v-else class="skel-lines" aria-hidden="true">
    <div v-for="i in rows" :key="i" class="skel-line" :style="{ width: i === rows ? '40%' : '100%' }" />
  </div>
</template>

<style scoped>
/* ===== fullscreen ===== */
.loading-fullscreen {
  position: fixed;
  inset: 0;
  z-index: var(--z-top, 9999);
  display: flex;
  align-items: center;
  justify-content: center;
}
.loading-fullscreen--overlay {
  background: rgba(0, 0, 0, 0.45);
}
@supports (backdrop-filter: blur(4px)) {
  .loading-fullscreen--overlay {
    backdrop-filter: blur(4px);
  }
}
.loading-fullscreen__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: clamp(var(--space-5), 4vw, 32px) clamp(24px, 5vw, 40px);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}
.loading-fullscreen--overlay .loading-fullscreen__content {
  background: var(--color-surface);
}

/* 无障碍：仅读屏器可见的兜底文案 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ===== spinner ===== */
.loading-spinner {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}
.spinner-ring {
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.spinner-sm .spinner-ring {
  width: clamp(14px, 2vw, 16px);
  height: clamp(14px, 2vw, 16px);
}
.spinner-md .spinner-ring {
  width: clamp(20px, 3vw, 24px);
  height: clamp(20px, 3vw, 24px);
}
.spinner-lg .spinner-ring {
  width: clamp(32px, 5vw, 40px);
  height: clamp(32px, 5vw, 40px);
}
.spinner-text {
  font-size: clamp(11px, 1.8vw, 15px);
  color: var(--color-text-muted);
}

/* ===== skeleton ===== */
.skel-line,
.skel-text {
  height: clamp(12px, 1.8vw, 14px);
  border-radius: var(--radius-sm);
  background: linear-gradient(90deg, var(--color-bg-alt) 25%, var(--color-border) 50%, var(--color-bg-alt) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
.skel-card {
  display: flex;
  flex-direction: column;
  gap: clamp(var(--space-2), 1.5vw, 12px);
  padding: clamp(var(--space-2), 1.8vw, 16px);
}
.skel-text {
  display: block;
}
.skel-lines {
  display: flex;
  flex-direction: column;
  gap: clamp(var(--space-2), 1.5vw, 12px);
}
</style>
