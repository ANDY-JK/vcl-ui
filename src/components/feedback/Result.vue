<script setup lang="ts">
// ⛔ 保护 — 结果页，禁止：clamp() → px，slot 层级修改
//    需我确认：status 图标映射、extra slot 结构
import IconSvg from '@/components/basic/IconSvg.vue'
import Button from '@/components/basic/Button.vue'

interface Props {
  /** 结果类型（决定图标与配色） */
  status: 'success' | 'error' | 'info' | 'warning' | '404' | 'empty'
  /** 主标题 */
  title: string
  /** 描述文案 */
  description?: string
  /** 操作按钮文字（非空才渲染按钮，点击抛 action） */
  actionText?: string
  /** 操作按钮占满宽度 */
  fullWidth?: boolean
}

withDefaults(defineProps<Props>(), {
  description: '',
  actionText: '',
  fullWidth: false,
})

const emit = defineEmits<{
  /** 点击操作按钮 */
  action: []
}>()

const iconMap: Record<string, string> = {
  success: 'circle-check',
  error: 'x',
  info: 'circle-alert',
  warning: 'circle-alert',
  '404': 'file',
  empty: 'file',
}

const colorMap: Record<string, string> = {
  success: 'var(--vcl-color-success)',
  error: 'var(--vcl-color-danger)',
  info: 'var(--vcl-color-info)',
  warning: 'var(--vcl-color-warning)',
  '404': 'var(--vcl-color-text-muted)',
  empty: 'var(--vcl-color-text-muted)',
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
      <!-- @slot extra: 结果区底部追加操作按钮（与 actionText 按钮并存） -->
      <slot name="extra" />
    </div>
    <!-- @slot default: 结果区底部扩展内容 -->
    <slot />
  </div>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: calc(64px * var(--vcl-scale)) var(--vcl-space-5);
}

.result.fullWidth {
  grid-column: 1 / -1;
}

.result-icon {
  width: calc(64px * var(--vcl-scale));
  height: calc(64px * var(--vcl-scale));
  margin-bottom: calc(20px * var(--vcl-scale));
}

.result-title {
  font-size: calc(36px * var(--vcl-scale));
  font-weight: 600;
  margin-bottom: calc(8px * var(--vcl-scale));
  color: var(--vcl-color-text);
}

.result-desc {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  max-width: calc(480px * var(--vcl-scale));
  line-height: 1.6;
}

.result-actions {
  display: flex;
  gap: calc(12px * var(--vcl-scale));
  margin-top: calc(24px * var(--vcl-scale));
}
</style>
