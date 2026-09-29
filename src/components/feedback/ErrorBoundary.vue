<!-- ⛔ 保护 — 错误边界，禁止修改 fallback slot 结构，禁止删除 onErrorCaptured
     需我确认：retry 重试逻辑、错误信息展示格式 -->
<template>
  <div v-if="hasError" class="error-boundary-fallback" role="alert" aria-live="assertive">
    <!-- @slot fallback: 自定义错误兜底 UI（作用域：error、retry）；不传则回退内置图标 + 标题 + 重试按钮 -->
    <slot name="fallback" :error="error" :retry="retry">
      <div class="eb-icon">!</div>
      <p class="eb-title">
        {{ title || t('errorBoundary.title') }}
      </p>
      <p class="eb-desc">
        {{ error?.message || t('errorBoundary.unknownError') }}
      </p>
      <button class="eb-btn" @click="retry">
        {{ retryText || t('errorBoundary.retry') }}
      </button>
    </slot>
  </div>
  <!-- @slot default: 正常态子内容（作用域：key，重置时强制重建） -->
  <slot v-else :key="resetKey" />
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, onErrorCaptured } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface Props {
  /** 错误面板标题（空串用内置 i18n） */
  title?: string
  /** 重试按钮文字（空串用内置 i18n） */
  retryText?: string
  /** 监听值变化时自动重置错误状态（如路由参数、组件 key 等） */
  watchKey?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  retryText: '',
  watchKey: undefined,
})

const emit = defineEmits<{
  /** 子树抛错时通知（已捕获，不冒泡到全局；retry 或 watchKey 变化后恢复） */
  error: [err: Error]
}>()

const hasError = ref(false)
const error = ref<Error | null>(null)
const resetKey = ref(0)

/** 重挂后该时间窗口内再次抛错 → 判定「原地复发」（错误不来自本组件树）；窗口内没再抛错 → 认定重挂已救回，标记清零 */
const RECURRING_WINDOW_MS = 3000
/** 上次点击重新加载的时间戳 */
let lastRetryAt = 0
/** 原地复发标记：再点一次转整页重载，不再无限重挂 */
let deadEnd = false
/** 静默期计时器：到期未再抛错即解除升级状态 */
let settleTimer: ReturnType<typeof setTimeout> | null = null

function clearError() {
  hasError.value = false
  error.value = null
  resetKey.value++
}

function clearEscalation() {
  lastRetryAt = 0
  deadEnd = false
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

onErrorCaptured((err: Error) => {
  if (settleTimer) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
  if (lastRetryAt && Date.now() - lastRetryAt < RECURRING_WINDOW_MS) deadEnd = true
  hasError.value = true
  error.value = err
  console.error('[ErrorBoundary] 捕获组件错误:', err.message)
  emit('error', err)
  return false
})

function retry() {
  if (deadEnd) {
    // 先复位再重载：重载被沙箱 iframe / 微前端宿主拦下时，按钮退化成再重挂一次而不是彻底无响应
    clearEscalation()
    clearError()
    if (typeof window !== 'undefined') window.location.reload()
    return
  }
  lastRetryAt = Date.now()
  clearError()
  settleTimer = setTimeout(clearEscalation, RECURRING_WINDOW_MS)
}

/** watchKey 变化时自动重置，避免错误状态残留到新内容 */
watch(
  () => props.watchKey,
  () => {
    clearEscalation()
    if (hasError.value) clearError()
  },
)

onUnmounted(clearEscalation)
</script>

<style scoped>
.error-boundary-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(var(--space-12), 6vw, 64px);
  text-align: center;
}
.eb-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  /* 实心底压白色图标：用 solid 令牌（暗色下 --color-warning 被提亮，白字对比度仅 1.67） */
  background: var(--color-warning-solid, var(--color-warning));
  color: white;
  font-size: clamp(24px, calc(24px + var(--vcl-fit) * 12), 36px);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-4);
}
.eb-title {
  font-size: clamp(16px, calc(16px + var(--vcl-fit) * 12), 28px);
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-1);
}
.eb-desc {
  font-size: clamp(13px, calc(13px + var(--vcl-fit) * 2), 15px);
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
  max-width: 400px;
  word-break: break-all;
}
.eb-btn {
  padding: var(--space-2) 24px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: white;
  font-size: clamp(14px, calc(14px + var(--vcl-fit) * 1), 15px);
  cursor: pointer;
  font-family: inherit;
}
.eb-btn:hover {
  opacity: 0.9;
}
</style>
