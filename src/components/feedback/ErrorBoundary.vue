<!-- ⛔ 保护 — 错误边界，禁止修改 fallback slot 结构，禁止删除 onErrorCaptured
     需我确认：retry 重试逻辑、错误信息展示格式 -->
<template>
  <div v-if="hasError" class="error-boundary-fallback">
    <slot name="fallback" :error="error" :retry="retry">
      <div class="eb-icon">!</div>
      <p class="eb-title">{{ title }}</p>
      <p class="eb-desc">{{ error?.message || '未知错误' }}</p>
      <button class="eb-btn" @click="retry">{{ retryText }}</button>
    </slot>
  </div>
  <slot v-else :key="resetKey" />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

interface Props {
  title?: string
  retryText?: string
}

withDefaults(defineProps<Props>(), {
  title: '页面加载异常',
  retryText: '重新加载',
})

const emit = defineEmits<{
  error: [err: Error]
}>()

const hasError = ref(false)
const error = ref<Error | null>(null)
const resetKey = ref(0)

onErrorCaptured((err: Error) => {
  hasError.value = true
  error.value = err
  console.error('[ErrorBoundary] 捕获组件错误:', err.message)
  emit('error', err)
  return false
})

function retry() {
  hasError.value = false
  error.value = null
  resetKey.value++
}
</script>

<style scoped>
.error-boundary-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(32px, 6vw, 64px);
  text-align: center;
}
.eb-icon {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: var(--color-warning, #f59e0b);
  color: white;
  font-size: 24px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: var(--space-4);
}
.eb-title { font-size: 16px; font-weight: 600; color: var(--color-text); margin-bottom: var(--space-1); }
.eb-desc { font-size: 13px; color: var(--color-text-muted); margin-bottom: var(--space-4); max-width: 400px; word-break: break-all; }
.eb-btn {
  padding: var(--space-2) 24px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: white;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
}
.eb-btn:hover { opacity: 0.9; }
</style>
