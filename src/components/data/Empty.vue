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
    <p v-if="title" class="empty-title">
      {{ title }}
    </p>
    <p v-if="description" class="empty-description">
      {{ description }}
    </p>
    <div v-if="$slots.default" class="empty-action">
      <!-- @slot default: 空状态底部操作区（如「刷新/重试」按钮） -->
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
  padding: calc(48px * var(--vcl-scale)) calc(24px * var(--vcl-scale));
  text-align: center;
  gap: var(--vcl-space-2);
  min-height: clamp(120px * var(--vcl-scale), 20vh, 200px * var(--vcl-scale));
  width: 100%;
}

.empty-icon {
  color: var(--vcl-color-text-muted);
  opacity: 0.6;
  flex-shrink: 0;
}

.empty-title {
  margin: 0;
  font-size: calc(36px * var(--vcl-scale));
  line-height: 1.2;
  font-weight: 500;
  color: var(--vcl-color-text);
}

.empty-description {
  margin: 0;
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  line-height: 1.5;
}

.empty-action {
  margin-top: var(--vcl-space-2);
}
</style>
