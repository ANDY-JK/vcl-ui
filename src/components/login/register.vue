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
            <!-- @slot logo: 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） -->
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

          <!-- @slot extra-fields: 基础表单之后追加的扩展字段区 -->
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
import { Input, Button, IconSvg, Toast, isValidPhone, isValidEmail, useT, SUBMIT_UNLOCK_FALLBACK_MS } from './_shared'

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
    /** 外部控制加载态（如 API 请求中） */
    loading?: boolean
    /** 外部注入错误/提示信息 */
    error?: string
    /** 品牌标题（左侧品牌面板；空串用内置 i18n） */
    brandTitle?: string
    /** 品牌副标题 */
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
  /** 注册提交：[表单载荷]（宿主调 API，成功后自行跳转） */
  submit: [payload: RegisterPayload]
  /** 点击「去登录」 */
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
  setTimeout(() => (_submitting.value = false), SUBMIT_UNLOCK_FALLBACK_MS)

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

<style src="./register-scoped.css" scoped></style>
