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
          <h2>{{ brandTitle || 'SaaS 管理系统' }}</h2>
          <p>{{ brandSubtitle || '现代化企业级业务管理平台，助力数字化转型' }}</p>
        </div>
      </div>

      <div class="login-right">
        <div class="login-header">
          <h1>创建账户</h1>
          <p>填写以下信息完成注册</p>
        </div>

        <div class="register-form">
          <Input
            v-model="form.display_name"
            label="昵称 / 公司名称"
            type="text"
            icon="house"
            :rules="displayNameRules"
            :hint="displayNameHint"
          />

          <Input
            v-if="requireCardKey"
            v-model="form.card_key"
            label="卡密"
            type="text"
            icon="key"
            :rules="cardKeyRules"
            hint="请联系管理员获取注册卡密"
          />

          <Input
            v-model="form.username"
            label="账号"
            type="text"
            icon="user"
            autocomplete="username"
            :rules="usernameRules"
            :hint="usernameHint"
          />

          <Input
            v-model="form.password"
            label="密码"
            type="password"
            icon="lock"
            autocomplete="new-password"
            :rules="passwordRules"
            :hint="passwordHint"
          />

          <!-- 选填字段 -->
          <template v-if="showOptionalFields">
            <Input
              v-model="form.email"
              :label="requireEmail ? '邮箱' : '邮箱（选填）'"
              type="email"
              icon="bell"
              autocomplete="email"
              :rules="emailRules"
            />

            <Input
              v-model="form.phone"
              :label="requirePhone ? '手机号' : '手机号（选填）'"
              type="tel"
              icon="settings"
              autocomplete="tel"
              :rules="phoneRules"
            />
          </template>

          <slot name="extra-fields" />

          <Button
            text="注 册"
            variant="primary"
            :loading="loading"
            block
            @click="handleSubmit"
          />

          <Toast
            v-if="displayError"
            variant="inline"
            type="error"
            :message="displayError"
            closable
          />
        </div>

        <div class="footer-text">
          已有账户？<a href="javascript:;" class="register-link" @click="emit('go-login')">返回登录</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import Input from '@/components/form/Input.vue'
import Button from '@/components/basic/Button.vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import Toast from '@/components/feedback/Toast.vue'

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

const props = withDefaults(defineProps<{
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
}>(), {
  maxWidth: '960px',
  hideBrand: false,
  minHeight: '100vh',
  loading: false,
  requireCardKey: true,
  showOptionalFields: true,
  requireEmail: false,
  requirePhone: false,
})

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
  form.display_name.length > 0 && form.display_name.length < 2 ? '至少 2 个字符' : ''
)
const usernameHint = computed(() =>
  form.username.length > 0 && form.username.length < 3 ? '至少 3 个字符' : ''
)
const passwordHint = computed(() =>
  form.password.length > 0 && form.password.length < 6 ? '至少 6 个字符' : ''
)

const displayNameRules = [
  (v: string) => v.trim() ? undefined : '请输入昵称或公司名称',
  (v: string) => v.length >= 2 ? undefined : '至少 2 个字符',
]
const cardKeyRules = [(v: string) => v.trim() ? undefined : '请输入注册卡密']
const usernameRules = [
  (v: string) => v.trim() ? undefined : '请输入账号',
  (v: string) => v.length >= 3 ? undefined : '至少 3 个字符',
]
const passwordRules = [
  (v: string) => v ? undefined : '请输入密码',
  (v: string) => v.length >= 6 ? undefined : '至少 6 个字符',
]
const emailRules = computed(() => [
  (v: string) => {
    if (!v) return props.requireEmail ? '请输入邮箱' : undefined
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : '邮箱格式不正确'
  },
])
const phoneRules = computed(() => [
  (v: string) => {
    if (!v) return props.requirePhone ? '请输入手机号' : undefined
    return /^1[3-9]\d{9}$/.test(v) ? undefined : '手机号格式不正确'
  },
])

// ======================== 提交 ========================

const handleSubmit = () => {
  internalError.value = ''

  // 基础必填校验
  if (!form.display_name || form.display_name.length < 2
    || !form.username || form.username.length < 3
    || !form.password || form.password.length < 6) {
    internalError.value = '请完整填写所有必填项'
    return
  }

  // 卡密校验
  if (props.requireCardKey && !form.card_key.trim()) {
    internalError.value = '请输入注册卡密'
    return
  }

  // 可选必填校验
  if (props.requireEmail && !form.email) {
    internalError.value = '请输入邮箱'
    return
  }
  if (props.requirePhone && !form.phone) {
    internalError.value = '请输入手机号'
    return
  }

  // 格式校验
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    internalError.value = '邮箱格式不正确'
    return
  }
  if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone)) {
    internalError.value = '手机号格式不正确'
    return
  }

  emit('submit', {
    display_name: form.display_name,
    card_key: props.requireCardKey ? form.card_key : undefined,
    username: form.username,
    password: form.password,
    email: form.email || undefined,
    phone: form.phone || undefined,
  })
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
  background: linear-gradient(135deg, var(--color-primary) 0%, #3B56E0 50%, #E54545 100%);
  padding: var(--space-5);
  position: relative;
}

.floating-shapes { position: absolute; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
.shape { position: absolute; border-radius: 50%; background: rgba(255, 255, 255, 0.08); }
.shape:nth-child(1) { width: 80px; height: 80px; left: 10%; top: 20%; }
.shape:nth-child(2) { width: 120px; height: 120px; right: 15%; top: 60%; }
.shape:nth-child(3) { width: 60px; height: 60px; left: 25%; bottom: 15%; }
.shape:nth-child(4) { width: 100px; height: 100px; right: 30%; top: 10%; }

.login-container {
  display: flex;
  width: 100%;
  max-width: var(--login-max-width, 960px);
  min-height: clamp(380px, 55vh, 600px);
  max-height: 85vh;
  border-radius: var(--radius-xl);
  /* 移除 overflow:hidden —— 会裁掉 Input 浮动标签（top:0 translateY(-50%)） */
  box-shadow: var(--shadow-lg);
  background: rgba(255, 255, 255, 0.98);
  animation: slideUp 0.5s ease-out;
  z-index: 1;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ---- 左侧 ---- */
.login-left {
  flex: 1;
  background: linear-gradient(135deg, var(--color-primary) 0%, #3B56E0 100%);
  border-radius: var(--radius-xl) 0 0 var(--radius-xl);
  padding: var(--space-12) 44px;
  display: flex; flex-direction: column; justify-content: center;
  color: white;
  position: relative; overflow: hidden;
}
.login-left::before {
  content: '';
  position: absolute; top: -50%; right: -50%;
  width: 200%; height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%);
}

.brand-logo { position: relative; z-index: 1; margin-bottom: var(--space-12); }
.logo-icon {
  width: 64px; height: 64px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-xl);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: var(--space-5);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.brand-logo h2 { font-size: 32px; font-weight: 600; margin-bottom: var(--space-3); }
.brand-logo p { font-size: 16px; opacity: 0.9; line-height: 1.6; }

/* ---- 右侧 ---- */
.login-right {
  flex: 1;
  padding: var(--space-12);
  display: flex; flex-direction: column;
  background: white;
  border-radius: 0 var(--radius-xl) var(--radius-xl) 0;
}
.login-header { flex-shrink: 0; padding-bottom: var(--space-8); }
.login-header h1 { font-size: 22px; font-weight: 600; color: var(--color-text); margin-bottom: var(--space-2); }
.login-header p { font-size: 14px; color: var(--color-text-secondary); }

.register-form {
  display: flex; flex-direction: column;
  gap: var(--space-5);
  overflow: visible; /* 浮窗标签骑缝溢出，由页面级滚动处理 */
}

.footer-text { text-align: center; font-size: 14px; color: var(--color-text-muted); padding-top: var(--space-8); }
.register-link { color: var(--color-primary); text-decoration: none; font-weight: 500; }
.register-link:hover { text-decoration: underline; }

@media (max-width: 768px) {
  .login-left { display: none; }
  .login-container { max-width: min(var(--login-max-width, 960px), 440px); }
  .login-right { padding: var(--space-10); }
}
@media (max-width: 480px) {
  .login-right { padding: var(--space-8); }
  .login-header h1 { font-size: 20px; }
}
</style>
