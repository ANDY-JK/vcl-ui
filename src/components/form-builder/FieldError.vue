<script setup lang="ts">
/**
 * 字段级错误提示组件
 *
 * 显示在字段下方，有错误时红色文本 + 动画入场。
 * 无错误时不渲染（v-if 控制由外部负责，这里用 transition 做入场）。
 */
interface Props {
  /** 错误信息（空字符串 = 无错误） */
  message: string
}
defineProps<Props>()
</script>

<template>
  <Transition name="fb-error">
    <p v-if="message" class="fb-field-error" role="alert">
      <svg class="fb-error-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path
          d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm-.75 3.5a.75.75 0 0 1 1.5 0v4a.75.75 0 0 1-1.5 0v-4zM8 12a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
        />
      </svg>
      <span>{{ message }}</span>
    </p>
  </Transition>
</template>

<style scoped>
.fb-field-error {
  display: flex;
  align-items: center;
  gap: calc(4px * var(--vcl-scale));
  margin: calc(4px * var(--vcl-scale)) 0 0;
  padding: 0 2px;
  font-size: var(--fs-12);
  line-height: 1.4;
  color: var(--color-danger-on-surface);
}
.fb-error-icon {
  width: calc(13px * var(--vcl-scale));
  height: calc(13px * var(--vcl-scale));
  flex-shrink: 0;
}

/* 入场动画 */
.fb-error-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.fb-error-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.fb-error-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
.fb-error-leave-to {
  opacity: 0;
  transform: translateY(-2px);
}
</style>
