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
  padding: 12px;
  background: var(--color-surface, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--color-border, #e2e8f0);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--color-text, #334155);
}

.progress-count {
  color: var(--color-text-muted, #94a3b8);
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  height: 6px;
  background: var(--color-border, #e2e8f0);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary, #3b82f6);
  border-radius: 3px;
  transition: width 0.3s ease;
}
</style>
