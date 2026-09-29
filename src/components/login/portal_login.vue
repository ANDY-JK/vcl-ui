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
import { ref, reactive, computed } from 'vue'
import { Input, Button, IconSvg, Toast, useT } from './_shared'

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

const handleEnter = (event: KeyboardEvent) => {
  if (event.key === 'Enter') handleSubmit()
}

const handleSubmit = () => {
  internalError.value = ''
  if (!canSubmit.value) {
    internalError.value = t('login.invalidCredentialsFull')
    return
  }

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
  background: linear-gradient(180deg, var(--color-primary) 0%, var(--color-bg) 35%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
}

.login-container {
  width: 100%;
  max-width: var(--login-max-width, calc(380px * var(--vcl-scale)));
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  padding: var(--space-12);
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
  margin-bottom: var(--space-8);
}
.logo-icon {
  width: calc(64px * var(--vcl-scale));
  height: calc(64px * var(--vcl-scale));
  margin: 0 auto var(--space-4);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(79, 110, 247, 0.3);
}
.logo-section h1 {
  font-size: calc(36px * var(--vcl-scale));
  font-weight: 600;
  color: var(--color-text);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
