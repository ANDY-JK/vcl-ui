<!-- ⛔ 保护 — 注册页模板，禁止：clamp() → px，表单结构/校验逻辑，slot 层级
     需我确认：register 接口签名、字段类型扩展 -->
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
              <IconSvg type="layout-dashboard" size="lg" color="#fff" />
            </slot>
          </div>
          <h2>{{ brandTitle || t('login.brandTitle') }}</h2>
          <p>{{ brandSubtitle || t('login.brandSubtitle') }}</p>
        </div>
      </div>

      <div class="login-right">
        <div class="login-header">
          <h1>{{ t('login.registerTitle') }}</h1>
          <p>{{ t('login.registerSubtitle') }}</p>
        </div>

        <div class="register-form">
          <Input
            v-model="form.display_name"
            :label="t('login.displayName')"
            type="text"
            icon="house"
            :rules="displayNameRules"
            :hint="displayNameHint"
          />

          <Input
            v-if="requireCardKey"
            v-model="form.card_key"
            :label="t('login.cardKey')"
            type="text"
            icon="key"
            :rules="cardKeyRules"
            :hint="t('login.cardKeyHint')"
          />

          <Input
            v-model="form.username"
            :label="t('login.account')"
            type="text"
            icon="user"
            autocomplete="username"
            :rules="usernameRules"
            :hint="usernameHint"
            @keyup="handleEnter"
          />

          <Input
            v-model="form.password"
            :label="t('login.password')"
            type="password"
            icon="lock"
            autocomplete="new-password"
            :rules="passwordRules"
            :hint="passwordHint"
            @keyup="handleEnter"
          />

          <!-- 选填字段 -->
          <template v-if="showOptionalFields">
            <Input
              v-model="form.email"
              :label="requireEmail ? t('login.email') : t('login.emailOptional')"
              type="email"
              icon="bell"
              autocomplete="email"
              :rules="emailRules"
            />

            <Input
              v-model="form.phone"
              :label="requirePhone ? t('login.socialPhone') : t('login.phoneOptional')"
              type="tel"
              icon="settings"
              autocomplete="tel"
              :rules="phoneRules"
            />
          </template>

          <slot name="extra-fields" />

          <Button :text="t('login.registerBtn')" variant="primary" :loading="_busy" block @click="handleSubmit" />

          <Toast v-if="displayError" variant="inline" type="error" :message="displayError" closable />
        </div>

        <div class="footer-text">
          {{ t('login.haveAccount')
          }}<button type="button" class="register-link" @click="emit('go-login')">{{ t('login.goLogin') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { Input, Button, IconSvg, Toast, isValidPhone, isValidEmail, useT } from './_shared'

const t = useT()

// ======================== 类型 ========================

export interface RegisterPayload {
  display_name: string
  card_key?: string
  username: string
  password: string
  email?: string
  phone?: string
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
    brandTitle?: string
    brandSubtitle?: string
    /** 是否需要卡密字段 */
    requireCardKey?: boolean
    /** 是否显示邮箱 & 手机号字段 */
    showOptionalFields?: boolean
    /** 邮箱是否必填 */
    requireEmail?: boolean
    /** 手机号是否必填 */
    requirePhone?: boolean
  }>(),
  {
    maxWidth: '960px',
    hideBrand: false,
    minHeight: '100vh',
    loading: false,
    requireCardKey: true,
    showOptionalFields: true,
    requireEmail: false,
    requirePhone: false,
  },
)

// ======================== Emits ========================

const emit = defineEmits<{
  submit: [payload: RegisterPayload]
  'go-login': []
}>()

// ======================== 表单 & 校验 ========================

const form = reactive({
  display_name: '',
  card_key: '',
  username: '',
  password: '',
  email: '',
  phone: '',
})

const internalError = ref('')
const displayError = computed(() => props.error || internalError.value)

const displayNameHint = computed(() =>
  form.display_name.length > 0 && form.display_name.length < 2 ? t('login.displayNameHint') : '',
)
const usernameHint = computed(() =>
  form.username.length > 0 && form.username.length < 3 ? t('login.usernameMinLength') : '',
)
const passwordHint = computed(() =>
  form.password.length > 0 && form.password.length < 6 ? t('login.passwordMinLength') : '',
)

const displayNameRules = [
  (v: string) => (v.trim() ? undefined : t('login.displayNameRequired')),
  (v: string) => (v.length >= 2 ? undefined : t('login.displayNameHint')),
]
const cardKeyRules = [(v: string) => (v.trim() ? undefined : t('login.cardKeyRequired'))]
const usernameRules = [
  (v: string) => (v.trim() ? undefined : t('login.accountRequired')),
  (v: string) => (v.length >= 3 ? undefined : t('login.usernameMinLength')),
]
const passwordRules = [
  (v: string) => (v ? undefined : t('login.passwordRequired')),
  (v: string) => (v.length >= 6 ? undefined : t('login.passwordMinLength')),
]
// 「可选必填」生效前提：字段实际渲染（showOptionalFields=false 时字段不渲染，
// requireEmail/requirePhone 不参与校验，否则表单永远无法提交）
const emailRequired = computed(() => props.requireEmail && props.showOptionalFields)
const phoneRequired = computed(() => props.requirePhone && props.showOptionalFields)
const emailRules = computed(() => [
  (v: string) => {
    if (!v) return emailRequired.value ? t('login.emailRequired') : undefined
    return isValidEmail(v) ? undefined : t('login.emailInvalid')
  },
])
const phoneRules = computed(() => [
  (v: string) => {
    if (!v) return phoneRequired.value ? t('login.phoneRequired') : undefined
    return isValidPhone(v) ? undefined : t('login.phoneInvalid')
  },
])

// ======================== 提交 ========================

/** 内部防重复提交：父组件不传 loading 时（Button disabled 不生效）连点/连按 Enter 会重复 emit */
const _submitting = ref(false)
const _busy = computed(() => props.loading || _submitting.value)

const handleSubmit = () => {
  internalError.value = ''

  if (_busy.value) return

  // 基础必填校验
  if (
    !form.display_name ||
    form.display_name.length < 2 ||
    !form.username ||
    form.username.length < 3 ||
    !form.password ||
    form.password.length < 6
  ) {
    internalError.value = t('login.fillAllRequired')
    return
  }

  // 卡密校验
  if (props.requireCardKey && !form.card_key.trim()) {
    internalError.value = t('login.cardKeyRequired')
    return
  }

  // 可选必填校验（仅当字段实际渲染时生效）
  if (emailRequired.value && !form.email) {
    internalError.value = t('login.emailRequired')
    return
  }
  if (phoneRequired.value && !form.phone) {
    internalError.value = t('login.phoneRequired')
    return
  }

  // 格式校验
  if (form.email && !isValidEmail(form.email)) {
    internalError.value = t('login.emailInvalid')
    return
  }
  if (form.phone && !isValidPhone(form.phone)) {
    internalError.value = t('login.phoneInvalid')
    return
  }

  // 15s 兜底自动解锁（对齐 login.vue 的 internalLoading 模式），
  // 父组件完成后通常用 resetForm / 通知驱动 UI，这里只防重复提交
  _submitting.value = true
  setTimeout(() => (_submitting.value = false), 15000)

  emit('submit', {
    display_name: form.display_name,
    card_key: props.requireCardKey ? form.card_key : undefined,
    username: form.username,
    password: form.password,
    email: form.email || undefined,
    phone: form.phone || undefined,
  })
}

/** 回车提交（注册表单字段最多，回车诉求最强；login/portal_login 均已支持） */
function handleEnter(e: KeyboardEvent) {
  if (e.key === 'Enter') handleSubmit()
}

// ======================== 暴露 ========================

defineExpose({
  resetForm: () => {
    form.display_name = ''
    form.card_key = ''
    form.username = ''
    form.password = ''
    form.email = ''
    form.phone = ''
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
  /* 移除 overflow:hidden —— 会裁掉 Input 浮动标签（top:0 translateY(-50%)） */
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

/* ---- 左侧 ---- */
.login-left {
  flex: 1;
  background: linear-gradient(135deg, var(--color-primary) 0%, #3b56e0 100%);
  border-radius: var(--radius-xl) 0 0 var(--radius-xl);
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

/* ---- 右侧 ---- */
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

.register-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  overflow: visible; /* 浮窗标签骑缝溢出，由页面级滚动处理 */
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
