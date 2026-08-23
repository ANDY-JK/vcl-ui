<script setup lang="ts">
/**
 * 导入进度条
 */
defineProps<{
  current: number
  total: number
  label?: string
}>()

const percent = (current: number, total: number): number => {
  if (total === 0) return 0
  return Math.min(100, Math.round((current / total) * 100))
}
</script>

<template>
  <div class="import-progress">
    <div class="progress-header">
      <span class="progress-label">{{ label || '处理中...' }}</span>
      <span class="progress-count">{{ current }} / {{ total }}</span>
    </div>
    <div class="progress-bar">
      <div
        class="progress-fill"
        :style="{ width: percent(current, total) + '%' }"
      />
    </div>
  </div>
</template>

<style scoped>
.import-progress {
  padding: var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-2);
  font-size: clamp(13px, 1.8vw, 15px);
  color: var(--color-text);
}

.progress-count {
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  height: 6px;
  background: var(--color-border);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 3px;
  transition: width 0.3s ease;
}
</style>
