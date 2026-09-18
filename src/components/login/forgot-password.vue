<!-- ⛔ 保护 — 忘记密码模板，禁止：clamp() → px，表单结构/校验逻辑，slot 层级
     需我确认：reset 接口签名、倒计时逻辑 -->
<template>
  <div class="login-page" :style="{ minHeight: props.minHeight }">
    <div class="floating-shapes">
      <div class="shape" />
      <div class="shape" />
      <div class="shape" />
      <div class="shape" />
    </div>

    <div class="login-container" :style="{ '--login-max-width': props.maxWidth }">
      <div v-if="!props.hideBrand" class="login-left">
        <div class="brand-logo">
          <div class="logo-icon">
            <slot name="logo">
              <IconSvg type="lock" size="lg" color="#fff" />
            </slot>
          </div>
          <h2>{{ t('login.resetTitle') }}</h2>
          <p>{{ t('login.resetHeroSubtitle') }}</p>
        </div>

        <ul class="features-list">
          <li>{{ t('login.resetStep1') }}</li>
          <li>{{ t('login.resetStep2') }}</li>
          <li>{{ t('login.resetStep3') }}</li>
        </ul>
      </div>

      <div class="login-right">
        <div class="login-header">
          <h1>{{ t('login.resetHeroTitle') }}</h1>
          <p>{{ t('login.resetSubtitle') }}</p>
        </div>

        <div class="forgot-form">
          <Input
            v-model="form.card_key"
            :label="t('login.resetCardKey')"
            type="text"
            icon="key"
            :rules="cardKeyRules"
            :hint="t('login.resetCardKeyHint')"
            @keyup="handleEnter"
          />

          <Input
            v-model="form.new_password"
            :label="t('login.newPassword')"
            type="password"
            icon="lock"
            autocomplete="new-password"
            :rules="passwordRules"
            :hint="passwordHint"
            @keyup="handleEnter"
          />

          <Input
            v-model="form.confirm_password"
            :label="t('login.confirmPassword')"
            type="password"
            icon="lock"
            autocomplete="new-password"
            :rules="confirmPasswordRules"
            :hint="confirmPasswordHint"
            @keyup="handleEnter"
          />

          <Button :text="t('login.resetBtn')" variant="primary" :loading="_busy" block @click="handleSubmit" />

          <Toast v-if="displayError" variant="inline" type="error" :message="displayError" closable />

          <Toast v-if="displaySuccess" variant="inline" type="success" :message="displaySuccess" closable />
        </div>

        <div class="footer-text">
          {{ t('login.rememberPassword')
          }}<button type="button" class="register-link" @click="emit('go-login')">{{ t('login.goLogin') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Input, Button, IconSvg, Toast, useT, SUBMIT_UNLOCK_FALLBACK_MS } from './_shared'

const t = useT()

// ======================== 类型 ========================

export interface ResetPasswordPayload {
  card_key: string
  password: string
}

// ======================== Props ========================

const props = withDefaults(
  defineProps<{
    // === 布局 ===
    /** 容器最大宽度，CSS 值，默认 960px */
    maxWidth?: string
    /** 强制隐藏左侧品牌面板 */
    hideBrand?: boolean
    /** 容器最小高度，CSS 值，默认 100vh */
    minHeight?: string

    // === 内容 ===
    loading?: boolean
    error?: string
    success?: string
  }>(),
  {
    maxWidth: '960px',
    hideBrand: false,
    minHeight: '100vh',
    loading: false,
  },
)

// ======================== Emits ========================

const emit = defineEmits<{
  submit: [payload: ResetPasswordPayload]
  'go-login': []
}>()

// ======================== 表单 & 校验 ========================

const form = reactive({
  card_key: '',
  new_password: '',
  confirm_password: '',
})

const internalError = ref('')
const displayError = computed(() => props.error || internalError.value)
const displaySuccess = computed(() => props.success || '')

const passwordHint = computed(() =>
  form.new_password.length > 0 && form.new_password.length < 6 ? t('login.passwordMinLength') : '',
)
const confirmPasswordHint = computed(() =>
  form.confirm_password.length > 0 && form.new_password !== form.confirm_password ? t('login.passwordMismatch') : '',
)

const cardKeyRules = [(v: string) => (v.trim() ? undefined : t('login.cardKeyRequired'))]
const passwordRules = [
  (v: string) => (v ? undefined : t('login.newPasswordRequired')),
  (v: string) => (v.length >= 6 ? undefined : t('login.passwordMinLength')),
]
const confirmPasswordRules = [
  (v: string) => (v ? undefined : t('login.confirmPasswordRequired')),
  (v: string) => (v === form.new_password ? undefined : t('login.passwordMismatch')),
]

// ======================== 提交 ========================

/** 内部防重复提交（对齐 register.vue）：父组件不传 loading 时连点/回车会重复 emit */
const _submitting = ref(false)
const _busy = computed(() => props.loading || _submitting.value)

const handleSubmit = () => {
  internalError.value = ''

  if (_busy.value) return

  if (!form.card_key.trim()) {
    internalError.value = t('login.cardKeyRequired')
    return
  }
  if (!form.new_password || form.new_password.length < 6) {
    internalError.value = t('login.newPasswordRequired') + ' (' + t('login.passwordMinLength') + ')'
    return
  }
  if (form.new_password !== form.confirm_password) {
    internalError.value = t('login.passwordMismatch')
    return
  }

  _submitting.value = true
  setTimeout(() => (_submitting.value = false), SUBMIT_UNLOCK_FALLBACK_MS)

  emit('submit', {
    card_key: form.card_key,
    password: form.new_password,
  })
}

/** 回车提交（login/portal_login/register 均已支持） */
function handleEnter(e: KeyboardEvent) {
  if (e.key === 'Enter') handleSubmit()
}

defineExpose({
  /** 重置表单为初始空状态，清空错误提示 */
  resetForm: () => {
    form.card_key = ''
    form.new_password = ''
    form.confirm_password = ''
    internalError.value = ''
  },
})
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary) 0%, #3b56e0 50%, #e54545 100%);
  padding: var(--space-5);
  position: relative;
}

.floating-shapes {
  position: absolute;
  width: 100%;
  height: 100%;
  overflow: hidden;
  pointer-events: none;
}
.shape {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
}
.shape:nth-child(1) {
  width: 80px;
  height: 80px;
  left: 10%;
  top: 20%;
}
.shape:nth-child(2) {
  width: 120px;
  height: 120px;
  right: 15%;
  top: 60%;
}
.shape:nth-child(3) {
  width: 60px;
  height: 60px;
  left: 25%;
  bottom: 15%;
}
.shape:nth-child(4) {
  width: 100px;
  height: 100px;
  right: 30%;
  top: 10%;
}

.login-container {
  display: flex;
  width: 100%;
  max-width: var(--login-max-width, 960px);
  min-height: clamp(380px, 55vh, 600px);
  max-height: 85vh;
  border-radius: var(--radius-xl);
  /* 移除 overflow:hidden —— 会裁掉 Input 浮动标签（top:0 translateY(-50%)），对齐 register.vue */
  box-shadow: var(--shadow-lg);
  background: var(--color-surface);
  animation: slideUp 0.5s ease-out;
  z-index: 1;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-left {
  flex: 1;
  background: linear-gradient(135deg, var(--color-primary) 0%, #3b56e0 100%);
  padding: var(--space-12) 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  color: white;
  position: relative;
  overflow: hidden;
}
.login-left::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%);
}

.brand-logo {
  position: relative;
  z-index: 1;
  margin-bottom: var(--space-12);
}
.logo-icon {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-5);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.brand-logo h2 {
  font-size: clamp(32px, 4vw, 36px);
  font-weight: 600;
  margin-bottom: var(--space-3);
}
.brand-logo p {
  font-size: clamp(16px, 2.5vw, 28px);
  opacity: 0.9;
  line-height: 1.6;
}

.features-list {
  position: relative;
  z-index: 1;
  list-style: none;
}
.features-list li {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  font-size: 15px;
}
.features-list li::before {
  content: '\2713';
  width: 24px;
  height: 24px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(12px, 1.8vw, 15px);
  flex-shrink: 0;
}

.login-right {
  flex: 1;
  padding: var(--space-12);
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
}
.login-header {
  flex-shrink: 0;
  padding-bottom: var(--space-8);
}
.login-header h1 {
  font-size: 22px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-2);
}
.login-header p {
  font-size: clamp(14px, 1.8vw, 15px);
  color: var(--color-text-secondary);
}

.forgot-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.footer-text {
  text-align: center;
  font-size: clamp(14px, 1.8vw, 15px);
  color: var(--color-text-muted);
  padding-top: var(--space-8);
}
.register-link {
  color: var(--color-primary);
  text-decoration: none;
  font-weight: 500;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: inherit;
}
.register-link:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .login-left {
    display: none;
  }
  .login-container {
    max-width: min(var(--login-max-width, 960px), 440px);
  }
  .login-right {
    padding: var(--space-10);
  }
}
@media (max-width: 480px) {
  .login-right {
    padding: var(--space-8);
  }
  .login-header h1 {
    font-size: clamp(20px, 3vw, 32px);
  }
}
</style>
