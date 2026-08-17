<script setup lang="ts">
// Empty — 空状态占位
// 用于无数据、无搜索结果、空列表等场景
import IconSvg from '@/components/basic/IconSvg.vue'

interface Props {
  /** 图标类型，默认 'file' */
  icon?: string
  /** 标题 */
  title?: string
  /** 描述文本 */
  description?: string
}

withDefaults(defineProps<Props>(), {
  icon: 'file',
  title: '',
  description: '',
})
</script>

<template>
  <div class="empty" role="status" aria-live="polite">
    <IconSvg :type="icon" size="lg" class="empty-icon" />
    <p v-if="title" class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-description">{{ description }}</p>
    <div v-if="$slots.default" class="empty-action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(24px, 5vw, 48px) clamp(12px, 3vw, 24px);
  text-align: center;
  gap: var(--space-2);
  min-height: clamp(120px, 20vh, 200px);
  width: 100%;
}

.empty-icon {
  color: var(--color-text-muted);
  opacity: 0.6;
  flex-shrink: 0;
}

.empty-title {
  margin: 0;
  font-size: clamp(14px, 2vw, 16px);
  font-weight: 500;
  color: var(--color-text);
}

.empty-description {
  margin: 0;
  font-size: clamp(12px, 1.6vw, 13px);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.empty-action {
  margin-top: var(--space-2);
}
</style>
