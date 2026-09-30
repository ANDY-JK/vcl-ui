<script setup lang="ts">
/**
 * 导入进度条
 */
import { useT } from '@/components/_internal/i18n'

const t = useT()

defineProps<{
  /** 已完成条数 */
  current: number
  /** 总条数 */
  total: number
  /** 进度说明文字（空串用内置 i18n） */
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
      <span class="progress-label">{{ label || t('routePlanner.processing') }}</span>
      <span class="progress-count">{{ current }} / {{ total }}</span>
    </div>
    <div
      class="progress-bar"
      role="progressbar"
      :aria-valuenow="percent(current, total)"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="label || t('routePlanner.processing')"
    >
      <div class="progress-fill" :style="{ width: percent(current, total) + '%' }" />
    </div>
  </div>
</template>

<style scoped>
.import-progress {
  padding: var(--vcl-space-3);
  background: var(--vcl-color-surface);
  border-radius: var(--vcl-radius-md);
  border: 1px solid var(--vcl-color-border);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--vcl-space-2);
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text);
}

.progress-count {
  color: var(--vcl-color-text-muted);
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  height: calc(6px * var(--vcl-scale));
  background: var(--vcl-color-border);
  border-radius: calc(3px * var(--vcl-scale));
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--vcl-color-primary);
  border-radius: calc(3px * var(--vcl-scale));
  transition: width 0.3s ease;
}
</style>
