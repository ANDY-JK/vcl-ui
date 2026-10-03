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
            <!-- @slot logo: 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） -->
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
    /** 外部控制加载态（如 API 请求中） */
    loading?: boolean
    /** 外部注入错误/提示信息 */
    error?: string
    /** 重置成功提示（非空时切成功态视图） */
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
  /** 重置提交：[表单载荷]（宿主调 API） */
  submit: [payload: ResetPasswordPayload]
  /** 点击「去登录」 */
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

<style src="./forgot-password-scoped.css" scoped></style>
