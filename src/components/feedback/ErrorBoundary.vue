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
      <button type="button" class="eb-btn" @click="retry">
        {{ retryText || t('errorBoundary.retry') }}
      </button>
    </slot>
  </div>
  <!-- @slot default: 正常态子内容（作用域：key，重置时强制重建） -->
  <slot v-else :key="resetKey" />
</template>

<script setup lang="ts">
import { reportError } from '@/components/_internal/runtime-observer'
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
  reportError('[ErrorBoundary] 捕获组件错误:', err.message)
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
  padding: calc(64px * var(--vcl-scale));
  text-align: center;
}
.eb-icon {
  width: calc(48px * var(--vcl-scale));
  height: calc(48px * var(--vcl-scale));
  border-radius: 50%;
  /* 实心底压白色图标：用 solid 令牌（暗色下 --vcl-color-warning 被提亮，白字对比度仅 1.67） */
  background: var(--vcl-color-warning-solid, var(--vcl-color-warning));
  color: white;
  font-size: calc(36px * var(--vcl-scale));
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--vcl-space-4);
}
.eb-title {
  font-size: calc(28px * var(--vcl-scale));
  line-height: 1.3;
  font-weight: 600;
  color: var(--vcl-color-text);
  margin-bottom: var(--vcl-space-1);
}
.eb-desc {
  font-size: calc(15px * var(--vcl-scale));
  line-height: var(--vcl-text-subtitle-line);
  color: var(--vcl-color-text-muted);
  margin-bottom: var(--vcl-space-4);
  max-width: calc(400px * var(--vcl-scale));
  word-break: break-all;
}
.eb-btn {
  padding: var(--vcl-space-2) calc(24px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-primary);
  border-radius: var(--vcl-radius-md);
  background: var(--vcl-color-primary);
  color: white;
  font-size: calc(15px * var(--vcl-scale));
  cursor: pointer;
  font-family: inherit;
}
@media (hover: hover) {
  .eb-btn:hover {
    opacity: 0.9;
  }
}
</style>
