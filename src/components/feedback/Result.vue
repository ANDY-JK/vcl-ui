<script setup lang="ts">
// ⛔ 保护 — 结果页，禁止：clamp() → px，slot 层级修改
//    需我确认：status 图标映射、extra slot 结构
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'

interface Props {
  status: 'success' | 'error' | 'info' | 'warning' | '404' | 'empty'
  title: string
  description?: string
  actionText?: string
  fullWidth?: boolean
}

withDefaults(defineProps<Props>(), {
  description: '',
  actionText: '',
  fullWidth: false,
})

const emit = defineEmits<{ action: [] }>()

const iconMap: Record<string, string> = {
  success: 'circle-check',
  error: 'x',
  info: 'circle-alert',
  warning: 'circle-alert',
  '404': 'file',
  empty: 'file',
}

const colorMap: Record<string, string> = {
  success: 'var(--color-success)',
  error: 'var(--color-danger)',
  info: 'var(--color-info)',
  warning: 'var(--color-warning)',
  '404': 'var(--color-text-muted)',
  empty: 'var(--color-text-muted)',
}
</script>

<template>
  <div class="result" :class="{ fullWidth }" role="status" :aria-label="title">
    <IconSvg :type="iconMap[status]" size="lg" :color="colorMap[status]" class="result-icon" />
    <h2 class="result-title">
      {{ title }}
    </h2>
    <p v-if="description" class="result-desc">
      {{ description }}
    </p>
    <div v-if="$slots.extra || actionText" class="result-actions">
      <Button v-if="actionText" :text="actionText" variant="primary" @click="emit('action')" />
      <slot name="extra" />
    </div>
    <slot />
  </div>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: clamp(40px, 8vw, 64px) var(--space-5);
}

.result.fullWidth {
  grid-column: 1 / -1;
}

.result-icon {
  width: clamp(48px, 8vw, 64px);
  height: clamp(48px, 8vw, 64px);
  margin-bottom: clamp(var(--space-3), 2.5vw, 20px);
}

.result-title {
  font-size: clamp(18px, 3vw, 36px);
  font-weight: 600;
  margin-bottom: clamp(var(--space-1), 1vw, 8px);
  color: var(--color-text);
}

.result-desc {
  font-size: clamp(13px, 1.8vw, 15px);
  color: var(--color-text-secondary);
  max-width: clamp(340px, 64vw, 480px);
  line-height: 1.6;
}

.result-actions {
  display: flex;
  gap: clamp(var(--space-2), 1.5vw, 12px);
  margin-top: clamp(var(--space-4), 3vw, 24px);
}
</style>
