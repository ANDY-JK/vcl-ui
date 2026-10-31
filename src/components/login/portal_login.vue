<!-- ⛔ 保护 — 极简登录模板，禁止：clamp() → px，表单结构，maxWidth 逻辑
     需我确认：portal 接口签名、logo 区域布局 -->
<template>
  <div class="simple-login" :style="{ minHeight: props.minHeight }">
    <div class="login-container" :style="{ '--login-max-width': props.maxWidth }">
      <div class="logo-section">
        <div class="logo-icon">
          <!-- @slot logo: 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） -->
          <slot name="logo">
            <IconSvg type="layout-dashboard" size="lg" color="#fff" />
          </slot>
        </div>
        <h1>{{ title || t('login.title') }}</h1>
      </div>

      <div class="login-form">
        <Input
          v-model="form.username"
          :label="t('login.account')"
          type="text"
          icon="user"
          autocomplete="username"
          :rules="usernameRules"
          @keyup="handleEnter"
        />

        <Input
          v-model="form.password"
          :label="t('login.password')"
          type="password"
          icon="lock"
          autocomplete="current-password"
          :rules="passwordRules"
          @keyup="handleEnter"
        />

        <Toast v-if="displayError" variant="inline" type="error" :message="displayError" closable />

        <Button
          :text="t('login.submitBtn')"
          variant="primary"
          :loading="loading"
          :disabled="loading || !canSubmit"
          block
          @click="handleSubmit"
        />
      </div>

      <!-- @slot footer: 底部区域（如版权/帮助链接） -->
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { isImeComposing } from '@/components/_internal/ime'
import { ref, reactive, computed } from 'vue'
import { Input, Button, IconSvg, Toast, useT, SUBMIT_UNLOCK_FALLBACK_MS } from './_shared'

const t = useT()

// ======================== Props ========================

const props = withDefaults(
  defineProps<{
    // === 布局 ===
    /** 卡片最大宽度，CSS 值，默认 380px */
    maxWidth?: string
    /** 容器最小高度，CSS 值，默认 100vh */
    minHeight?: string

    // === 内容 ===
    /** 外部控制加载态（如 API 请求中） */
    loading?: boolean
    /** 外部注入错误/提示信息 */
    error?: string
    /** 卡片标题（空串用内置 i18n） */
    title?: string
  }>(),
  {
    maxWidth: '380px',
    minHeight: '100vh',
    loading: false,
  },
)

// ======================== Emits ========================

const emit = defineEmits<{
  /** 登录提交：[用户名 + 密码]（宿主调 API，成功后自行跳转） */
  submit: [payload: { username: string; password: string }]
}>()

// ======================== 表单 & 校验 ========================

const form = reactive({ username: '', password: '' })
const internalError = ref('')
const displayError = computed(() => props.error || internalError.value)

const canSubmit = computed(() => form.username.trim().length >= 3 && form.password.length >= 6)

const usernameRules = [
  (v: string) => (v.trim() ? undefined : t('login.accountRequired')),
  (v: string) => (v.length >= 3 ? undefined : t('login.accountHint')),
]
const passwordRules = [
  (v: string) => (v ? undefined : t('login.passwordRequired')),
  (v: string) => (v.length >= 6 ? undefined : t('login.passwordHint')),
]

// ======================== 提交 ========================

/**
 * 内部防重复提交（2026-10-21 补，审查 6.3 / TD-03 发现的一致性缺陷）。
 *
 * ## 为什么必须补
 *
 * 四个登录页里，`login.vue` 有 `internalLoading + lockUntil` 双机制、
 * `register.vue` 与 `forgot-*.vue` 有 `_submitting` + 超时兜底，
 * **只有 portal_login.vue 什么都没有** —— 父组件不传 `loading` 时，
 * 连点两次就会 emit 两次，宿主会收到两个登录请求（在"记住我"关闭、
 * 后端有幂等保护缺失时，表现为两条登录日志）。
 *
 * ## 为什么不能只靠 props.loading
 *
 * 那是**父组件的义务**，库不能假定它一定传。也不能永久锁死 ——
 * 父组件可能既没传 loading 也没在失败后通知，所以必须有超时解锁，
 * 否则用户点一次失败后就再也点不动了。
 *
 * 本实现对齐 `forgot-*.vue`（同一个"父组件可能忘了传 loading"的场景）。
 */
const _submitting = ref(false)

const handleEnter = (event: KeyboardEvent) => {
  // 输入法合成期放行：中文用户名/找回答案上屏时按回车，不能当提交（#276）
  if (isImeComposing(event)) return
  if (event.key === 'Enter') handleSubmit()
}

const handleSubmit = () => {
  internalError.value = ''
  if (_submitting.value) return
  if (!canSubmit.value) {
    internalError.value = t('login.invalidCredentialsFull')
    return
  }

  _submitting.value = true
  window.setTimeout(() => {
    _submitting.value = false
  }, SUBMIT_UNLOCK_FALLBACK_MS)

  emit('submit', {
    username: form.username,
    password: form.password,
  })
}

defineExpose({
  resetForm: () => {
    form.username = ''
    form.password = ''
    internalError.value = ''
  },
})
</script>

<style scoped>
.simple-login {
  background: linear-gradient(180deg, var(--vcl-color-primary) 0%, var(--vcl-color-bg) 35%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--vcl-space-5);
}

.login-container {
  width: 100%;
  max-width: var(--login-max-width, calc(380px * var(--vcl-scale)));
  background: var(--vcl-color-surface);
  border-radius: var(--vcl-radius-xl);
  padding: var(--vcl-space-12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  animation: slideUp 0.4s ease-out;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.logo-section {
  text-align: center;
  margin-bottom: var(--vcl-space-8);
}
.logo-icon {
  width: calc(64px * var(--vcl-scale));
  height: calc(64px * var(--vcl-scale));
  margin: 0 auto var(--vcl-space-4);
  background: linear-gradient(135deg, var(--vcl-color-primary), var(--vcl-color-primary-hover));
  border-radius: var(--vcl-radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(79, 110, 247, 0.3);
}
.logo-section h1 {
  font-size: calc(36px * var(--vcl-scale));
  font-weight: 600;
  color: var(--vcl-color-text);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--vcl-space-5);
}
</style>
