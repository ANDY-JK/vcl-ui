<!-- ⛔ 保护 — 极简登录模板，禁止：clamp() → px，表单结构，maxWidth 逻辑
     需我确认：portal 接口签名、logo 区域布局 -->
<template>
  <div class="simple-login" :style="{ minHeight: props.minHeight }">
    <div class="login-container" :style="{ '--login-max-width': props.maxWidth }">
      <div class="logo-section">
        <div class="logo-icon">
          <slot name="logo">
            <IconSvg type="layout-dashboard" size="lg" color="#fff" />
          </slot>
        </div>
        <h1>{{ title || '登录' }}</h1>
      </div>

      <div class="login-form">
        <Input
          v-model="form.username"
          label="账号"
          type="text"
          icon="user"
          autocomplete="username"
          :rules="usernameRules"
          @keyup="handleEnter"
        />

        <Input
          v-model="form.password"
          label="密码"
          type="password"
          icon="lock"
          autocomplete="current-password"
          :rules="passwordRules"
          @keyup="handleEnter"
        />

        <Toast v-if="displayError" variant="inline" type="error" :message="displayError" closable />

        <Button
          text="登 录"
          variant="primary"
          :loading="loading"
          :disabled="loading || !canSubmit"
          block
          @click="handleSubmit"
        />
      </div>

      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import Input from '@/components/form/Input.vue'
import Button from '@/components/basic/Button.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Toast from '@/components/feedback/Toast.vue'

// ======================== Props ========================

const props = withDefaults(
  defineProps<{
    // === 布局 ===
    /** 卡片最大宽度，CSS 值，默认 380px */
    maxWidth?: string
    /** 容器最小高度，CSS 值，默认 100vh */
    minHeight?: string

    // === 内容 ===
    loading?: boolean
    error?: string
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
  submit: [payload: { username: string; password: string }]
}>()

// ======================== 表单 & 校验 ========================

const form = reactive({ username: '', password: '' })
const internalError = ref('')
const displayError = computed(() => props.error || internalError.value)

const canSubmit = computed(() => form.username.trim().length >= 3 && form.password.length >= 6)

const usernameRules = [
  (v: string) => (v.trim() ? undefined : '请输入账号'),
  (v: string) => (v.length >= 3 ? undefined : '账号至少 3 个字符'),
]
const passwordRules = [
  (v: string) => (v ? undefined : '请输入密码'),
  (v: string) => (v.length >= 6 ? undefined : '密码至少 6 个字符'),
]

// ======================== 提交 ========================

const handleEnter = (event: KeyboardEvent) => {
  if (event.key === 'Enter') handleSubmit()
}

const handleSubmit = () => {
  internalError.value = ''
  if (!canSubmit.value) {
    internalError.value = '请输入正确的账号和密码'
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
  max-width: var(--login-max-width, 380px);
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
  width: 64px;
  height: 64px;
  margin: 0 auto var(--space-4);
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px rgba(79, 110, 247, 0.3);
}
.logo-section h1 {
  font-size: clamp(24px, 3.5vw, 36px);
  font-weight: 600;
  color: var(--color-text);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
