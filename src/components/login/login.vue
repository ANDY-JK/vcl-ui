<!-- ⛔ 保护 — 登录页模板，禁止：clamp() → px，表单结构/校验逻辑，slot 层级
     需我确认：login 接口签名、社交登录按钮布局 -->
<template>
  <div class="login-page" :style="{ minHeight: props.minHeight }">
    <div class="floating-shapes">
      <div class="shape" />
      <div class="shape" />
      <div class="shape" />
      <div class="shape" />
    </div>

    <div class="login-container" :style="{ '--login-max-width': props.maxWidth }">
      <!-- 左侧品牌面板 -->
      <div v-if="!props.hideBrand" class="login-left">
        <div class="brand-logo">
          <div class="logo-icon">
            <!-- @slot logo: 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） -->
            <slot name="logo">
              <IconSvg :type="tenantMode ? 'house' : 'layout-dashboard'" size="lg" color="#fff" />
            </slot>
          </div>
          <h2>{{ brandTitle || (tenantMode ? t('login.brandTitleTenant') : t('login.brandTitle')) }}</h2>
          <p>
            {{ brandSubtitle || (tenantMode ? t('login.brandSubtitleTenant') : t('login.brandSubtitle')) }}
          </p>
        </div>

        <ul v-if="features && features.length" class="features-list">
          <li v-for="f in features" :key="f">
            {{ f }}
          </li>
        </ul>
        <ul v-else class="features-list">
          <li v-for="f in tenantMode ? tm('login.featuresTenant') : tm('login.featuresSaaS')" :key="f">
            {{ f }}
          </li>
        </ul>
      </div>

      <!-- 右侧表单面板 -->
      <div class="login-right">
        <div class="login-header">
          <h1>
            <!-- @slot welcome-title: 欢迎标题区；不传则回退按 tenantMode 拼接的内置文案 -->
            <slot name="welcome-title">{{ t('login.welcomeTitle') }}</slot>
          </h1>
          <p>
            <!-- @slot subtitle: 副标题区 -->
            <slot name="subtitle">
              {{ tenantMode ? t('login.welcomeSubtitleTenant') : t('login.welcomeSubtitle') }}
            </slot>
          </p>
        </div>

        <div class="login-form">
          <Input
            v-model="form.username"
            :label="usernameLabel"
            type="text"
            icon="user"
            autocomplete="username"
            :rules="usernameRules"
            :hint="usernameHint"
            @keyup="handleEnter"
          />

          <Input
            v-model="form.password"
            :label="passwordLabel"
            type="password"
            icon="lock"
            autocomplete="current-password"
            :rules="passwordRules"
            @keyup="handleEnter"
          />

          <div class="form-options">
            <label class="remember-me">
              <input v-model="rememberMe" type="checkbox" class="remember-checkbox" />
              <span class="checkbox-icon" :class="{ checked: rememberMe }">
                <IconSvg v-if="rememberMe" type="circle-check" size="sm" />
              </span>
              <span>
                <!-- @slot remember-text: 记住用户名选项文案区 -->
                <slot name="remember-text">{{ t('login.rememberUsername') }}</slot></span
              >
            </label>
            <button
              v-if="showForgotPassword && !tenantMode"
              type="button"
              class="forgot-password"
              @click="emit('forgot-password')"
            >
              <!-- @slot forgot-text: 忘记密码入口文案区 -->
              <slot name="forgot-text">{{ t('login.forgotPasswordQ') }}</slot>
            </button>
          </div>

          <Button
            :text="submitText"
            variant="primary"
            :loading="internalLoading || loading || externalLoading"
            block
            @click="handleSubmit"
          />

          <Toast v-if="displayError" variant="inline" :type="errorType" :message="displayError" closable />

          <template v-if="showSocialLogin && !tenantMode">
            <Divider :text="socialDividerText" />

            <div class="social-login">
              <button type="button" class="social-btn" @click="emit('social-login', 'phone')">
                <IconSvg type="house" size="md" class="social-icon" />
                <span class="social-text">
                  <!-- @slot social-phone-text: 社交登录手机号文案区 -->
                  <slot name="social-phone-text">{{ t('login.socialPhone') }}</slot></span
                >
              </button>
              <button type="button" class="social-btn" @click="emit('social-login', 'wechat')">
                <IconSvg type="user" size="md" class="social-icon" />
                <span class="social-text">{{ t('login.socialWechat') }}</span>
              </button>
              <button type="button" class="social-btn" @click="emit('social-login', 'sso')">
                <IconSvg type="key" size="md" class="social-icon" />
                <span class="social-text">SSO</span>
              </button>
            </div>
          </template>
        </div>

        <div class="footer-text">
          <template v-if="tenantMode">
            <span>
              <!-- @slot tenant-footer-text: 租户模式底部文案区 -->
              <slot name="tenant-footer-text">{{ t('login.tenantFooter') }}</slot></span
            >
          </template>
          <template v-else>
            <template v-if="showRegister">
              <!-- @slot register-prompt: 注册提示文案区 -->
              <slot name="register-prompt">{{ t('login.registerPrompt') }}</slot
              ><button type="button" class="register-link" @click="emit('register')">
                <!-- @slot register-text: 注册入口文案区 -->
                <slot name="register-text">{{ t('login.registerNow') }}</slot>
              </button>
            </template>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
import {
  Input,
  Button,
  IconSvg,
  Toast,
  Divider,
  useT,
  useTm,
  storageGet,
  storageSet,
  storageDelete,
  SUBMIT_UNLOCK_FALLBACK_MS,
} from './_shared'

/** 锁定倒计时的刷新节拍（只做显示，能不能重试按 lockUntil 时间戳判） */
const _LOCK_TICK_MS = 1000

const t = useT()
const tm = useTm()

// ======================== Props ========================

const props = withDefaults(
  defineProps<{
    // === 布局 ===
    /** 容器最大宽度，CSS 值，默认 960px */
    maxWidth?: string
    /** 强制隐藏左侧品牌面板 */
    hideBrand?: boolean
    /** 容器最小高度，CSS 值，默认 100% */
    minHeight?: string

    // === 内容 ===
    /** 租户登录模式 */
    tenantMode?: boolean
    /** 外部控制加载态（如 API 请求中） */
    loading?: boolean
    /** 外部注入错误/提示信息 */
    error?: string
    /** 最大尝试次数，0 禁用锁定 */
    maxAttempts?: number
    /** 锁定分钟数 */
    lockMinutes?: number
    /** 品牌标题 */
    brandTitle?: string
    /** 品牌副标题 */
    brandSubtitle?: string
    /** 自定义特性列表 */
    features?: string[]
    /** 是否显示社交登录 */
    showSocialLogin?: boolean
    /** 是否显示忘记密码入口 */
    showForgotPassword?: boolean
    /** 是否显示注册入口 */
    showRegister?: boolean
    /** 宿主登录结果回写（v2 Q18 收敛，取代 notifyFailed/notifySuccess 两个暴露方法）：
     *  宿主自行完成登录后回传——{ ok: false, message? } 记一次失败尝试（message 为服务端错误文案），
     *  { ok: true } 清错误/计数/锁定。每次回写传新对象（或先置 null 再传），同一引用重复赋值不重复触发 */
    authResult?: { ok: boolean; message?: string } | null
  }>(),
  {
    maxWidth: '960px',
    hideBrand: false,
    minHeight: '100%',
    tenantMode: false,
    loading: false,
    maxAttempts: 5,
    lockMinutes: 15,
    showSocialLogin: true,
    showForgotPassword: true,
    showRegister: true,
    authResult: null,
  },
)

// ======================== Emits ========================

const emit = defineEmits<{
  /** 提交登录 */
  submit: [payload: { username: string; password: string; rememberMe: boolean }]
  /** 点击忘记密码 */
  'forgot-password': []
  /** 点击注册 */
  register: []
  /** 点击社交登录按钮 */
  'social-login': [provider: string]
}>()

// ======================== 表单 & 校验 ========================

const form = reactive({ username: '', password: '' })
const rememberMe = ref(false)
const externalLoading = computed(() => props.loading)
/** 内部提交中状态：点击后立即反馈，防重复提交 */
const internalLoading = ref(false)

// 标签走 computed：setup 期直接 t() 会把文案固化成快照，切换语言后页面中英混杂
const usernameLabel = computed(() => t('login.username'))
const passwordLabel = computed(() => t('login.password'))
const submitText = computed(() => t('login.submitBtn'))
const socialDividerText = computed(() => t('login.socialDivider'))

const usernameHint = computed(() =>
  form.username.length > 0 && form.username.length < 3 ? t('login.usernameHint') : '',
)

const usernameRules = [
  (v: string) => (v.trim() ? undefined : t('login.usernameRequired')),
  (v: string) => (v.length >= 3 ? undefined : t('login.usernameHint')),
]

const passwordRules = [
  (v: string) => (v ? undefined : t('login.passwordRequired')),
  (v: string) => (v.length >= 6 ? undefined : t('login.passwordHint')),
]

// ======================== 锁定逻辑（内置，依赖 indexedDB 存储） ========================

const lockUntil = ref(0)
const internalError = ref('')
const errorType = ref<'circle-alert' | 'success' | 'warning' | 'error'>('error')
let lockTimer: ReturnType<typeof setInterval> | null = null

// 锁定状态存 localStorage，属客户端辅助防护可被清除绕过，服务端锁定才是核心
const ATTEMPT_KEY = '_login_attempts'
const LOCK_KEY = '_login_lock_until'

/** 最终展示的错误：外部注入优先，否则内部锁定/校验错误 */
const displayError = computed(() => props.error || internalError.value)

function recordFailedAttempt(serverMsg?: string) {
  internalLoading.value = false
  if (props.maxAttempts <= 0) return
  const attempts = (Number(storageGet<string>(ATTEMPT_KEY)) || 0) + 1
  storageSet(ATTEMPT_KEY, String(attempts))

  if (attempts >= props.maxAttempts) {
    const until = Date.now() + props.lockMinutes * 60 * 1000
    storageSet(LOCK_KEY, String(until))
    storageSet(ATTEMPT_KEY, '0')
    lockUntil.value = until
    startLockCountdown()
  } else {
    internalError.value = serverMsg || t('login.attemptsLeft', { attempts, max: props.maxAttempts })
    errorType.value = 'error'
  }
}

function startLockCountdown() {
  if (lockTimer) clearInterval(lockTimer)
  lockTimer = setInterval(() => {
    const remaining = Math.max(0, lockUntil.value - Date.now())
    if (remaining <= 0) {
      lockUntil.value = 0
      storageDelete(LOCK_KEY)
      internalError.value = ''
      if (lockTimer) {
        clearInterval(lockTimer)
        lockTimer = null
      }
    } else {
      const min = Math.floor(remaining / 60000)
      const sec = Math.floor((remaining % 60000) / 1000)
      internalError.value = t('login.lockedCountdown', { time: `${min}:${String(sec).padStart(2, '0')}` })
      errorType.value = 'warning'
    }
  }, _LOCK_TICK_MS)
}

onUnmounted(() => {
  if (lockTimer) clearInterval(lockTimer)
})

// ======================== 初始化 ========================

onMounted(() => {
  const savedUsername = storageGet<string>('remembered_username')
  if (savedUsername) {
    form.username = savedUsername
    rememberMe.value = true
  }

  const lkUntil = Number(storageGet<string>(LOCK_KEY)) || 0
  if (lkUntil > Date.now()) {
    lockUntil.value = lkUntil
    startLockCountdown()
  }
})

// ======================== 提交 ========================

const handleEnter = (event: KeyboardEvent) => {
  if (event.key === 'Enter') handleSubmit()
}

const handleSubmit = () => {
  internalError.value = ''

  // 提交中：忽略重复点击
  if (internalLoading.value) return
  if (lockUntil.value > Date.now()) return

  // 与 rules 的 v.trim() 口径一致：纯空格用户名不放行
  if (!form.username.trim() || form.username.length < 3 || !form.password || form.password.length < 6) {
    internalError.value = t('login.invalidCredentialsFull')
    errorType.value = 'warning'
    return
  }

  // 记住用户名立即生效
  if (rememberMe.value) {
    storageSet('remembered_username', form.username)
  } else {
    storageDelete('remembered_username')
  }

  // 点击后立即进入加载态（按钮转圈 + 禁点），父组件回调或兜底超时后恢复
  internalLoading.value = true
  window.setTimeout(() => {
    internalLoading.value = false
  }, SUBMIT_UNLOCK_FALLBACK_MS)
  emit('submit', {
    username: form.username,
    password: form.password,
    rememberMe: rememberMe.value,
  })
}

// ======================== 宿主登录结果回写（v2 Q18：事件化收口） ========================
// v1 的 notifyFailed()/notifySuccess() 是宿主回写钩子而非组件行为，暴露在方法面上与
// resetForm 这类真组件行为混在一起；v2 收敛为 authResult 数据 prop——父→子本就该走
// 响应式数据通道，watch 在变化时驱动同一套锁定计数状态机。
watch(
  () => props.authResult,
  (res) => {
    if (!res) return
    if (res.ok) {
      internalLoading.value = false
      storageDelete(ATTEMPT_KEY)
      storageDelete(LOCK_KEY)
      internalError.value = ''
    } else {
      recordFailedAttempt(res.message)
    }
  },
  { deep: true },
)

// ======================== 暴露方法 ========================
// ⛔ 契约（Q18，v2 已收敛）：宿主登录结果回写走 authResult prop（见上），不再占暴露方法面；
// 暴露面只剩 resetForm 一个真组件行为。全表以 README「defineExpose 公开契约」一节为对账单。
defineExpose({
  /** 清除表单 */
  resetForm: () => {
    form.username = ''
    form.password = ''
    rememberMe.value = false
    internalError.value = ''
  },
})
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--vcl-color-primary) 0%, #3b56e0 50%, #e54545 100%);
  padding: calc(20px * var(--vcl-scale));
  position: relative;
  overflow-x: hidden;
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
  width: calc(80px * var(--vcl-scale));
  height: calc(80px * var(--vcl-scale));
  left: 10%;
  top: 20%;
}
.shape:nth-child(2) {
  width: calc(120px * var(--vcl-scale));
  height: calc(120px * var(--vcl-scale));
  right: 15%;
  top: 60%;
}
.shape:nth-child(3) {
  width: calc(60px * var(--vcl-scale));
  height: calc(60px * var(--vcl-scale));
  left: 25%;
  bottom: 15%;
}
.shape:nth-child(4) {
  width: calc(100px * var(--vcl-scale));
  height: calc(100px * var(--vcl-scale));
  right: 30%;
  top: 10%;
}

.login-container {
  display: flex;
  width: 100%;
  max-width: var(--login-max-width, calc(960px * var(--vcl-scale)));
  border-radius: var(--vcl-radius-xl);
  box-shadow: var(--vcl-shadow-lg);
  background: var(--vcl-color-surface);
  animation: slideUp 0.5s ease-out;
  z-index: 1;
  container-type: inline-size;
  container-name: login;
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
  background: linear-gradient(135deg, var(--vcl-color-primary) 0%, #3b56e0 100%);
  border-radius: var(--vcl-radius-xl) 0 0 var(--vcl-radius-xl);
  padding: var(--vcl-space-12) calc(44px * var(--vcl-scale));
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
  margin-bottom: var(--vcl-space-12);
}
.logo-icon {
  width: calc(64px * var(--vcl-scale));
  height: calc(64px * var(--vcl-scale));
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--vcl-radius-xl);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--vcl-space-5);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.brand-logo h2 {
  font-size: calc(36px * var(--vcl-scale));
  font-weight: 600;
  margin-bottom: var(--vcl-space-3);
  letter-spacing: -0.5px;
}
.brand-logo p {
  font-size: calc(18px * var(--vcl-scale));
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
  gap: var(--vcl-space-3);
  margin-bottom: var(--vcl-space-5);
  font-size: calc(15px * var(--vcl-scale));
}
.features-list li::before {
  content: '\2713';
  width: calc(24px * var(--vcl-scale));
  height: calc(24px * var(--vcl-scale));
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(14px * var(--vcl-scale));
  flex-shrink: 0;
}

/* ---- 右侧 ---- */
.login-right {
  flex: 1;
  padding: var(--vcl-space-12);
  display: flex;
  flex-direction: column;
  background: var(--vcl-color-surface);
  border-radius: 0 var(--vcl-radius-xl) var(--vcl-radius-xl) 0;
}
.login-header {
  flex-shrink: 0;
  padding-bottom: var(--vcl-space-8);
}
.login-header h1 {
  font-size: var(--vcl-fs-22);
  font-weight: 600;
  color: var(--vcl-color-text);
  margin-bottom: var(--vcl-space-2);
}
.login-header p {
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text-secondary);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--vcl-space-5);
}

.form-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--vcl-ctrl-font-size);
}
.remember-me {
  display: flex;
  align-items: center;
  gap: var(--vcl-space-2);
  cursor: pointer;
  color: var(--vcl-color-text-secondary);
  user-select: none;
}
/* 真实 checkbox 视觉隐藏但保留键盘焦点与读屏语义 */
.remember-checkbox {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.checkbox-icon {
  width: calc(16px * var(--vcl-scale));
  height: calc(16px * var(--vcl-scale));
  border: 1.5px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: var(--vcl-color-surface);
  transition: all var(--vcl-transition-fast);
}
.checkbox-icon.checked {
  background: var(--vcl-color-primary);
  border-color: var(--vcl-color-primary);
}
.forgot-password {
  color: var(--vcl-color-primary-on-surface);
  text-decoration: none;
  font-weight: 500;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: inherit;
}
.forgot-password:hover {
  color: var(--vcl-color-primary-hover);
}

.social-login {
  display: flex;
  gap: var(--vcl-space-3);
}
.social-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--vcl-space-1);
  padding: var(--vcl-space-3);
  border: 1.5px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-md);
  background: var(--vcl-color-surface);
  cursor: pointer;
  transition: all var(--vcl-transition-fast);
  user-select: none;
  font-family: inherit;
}
.social-btn:hover {
  border-color: var(--vcl-color-primary);
  background: var(--vcl-color-bg);
  transform: translateY(-1px);
}
.social-icon {
  color: var(--vcl-color-text-muted);
}
.social-text {
  font-size: calc(14px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
}

.footer-text {
  text-align: center;
  font-size: var(--vcl-ctrl-font-size);
  color: var(--vcl-color-text-muted);
  padding-top: var(--vcl-space-8);
}
.register-link {
  color: var(--vcl-color-primary-on-surface);
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

@container login (max-width: 767px) {
  .login-left {
    display: none;
  }
  .login-container {
    max-width: min(var(--login-max-width, 960px * var(--vcl-scale)), 440px * var(--vcl-scale));
  }
  .login-right {
    padding: var(--vcl-space-10);
  }
}
@container login (max-width: 480px) {
  .login-right {
    padding: var(--vcl-space-8);
  }
  .login-header h1 {
    font-size: calc(28px * var(--vcl-scale));
  }
  .social-btn {
    padding: var(--vcl-space-2);
  }
}
</style>
