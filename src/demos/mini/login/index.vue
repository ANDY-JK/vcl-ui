<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import IconSvg from '@/components/basic/IconSvg.vue'

const router = useRouter()

const phone = ref('')
const code = ref('')
const codeSent = ref(false)
const counting = ref(false)
const countdown = ref(0)
const agreed = ref(false)

function sendCode() {
  if (!phone.value || counting.value) return
  codeSent.value = true
  counting.value = true
  countdown.value = 60
  const timer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(timer)
      counting.value = false
    }
  }, 1000)
}

function login() {
  if (!phone.value || !code.value || !agreed.value) return
  router.push('/mini/home')
}
</script>

<template>
  <div class="login-page">
    <!-- Logo -->
    <div class="logo-area">
      <div class="logo-icon">
        <IconSvg type="box" size="lg" color="white" />
      </div>
      <h1 class="logo-title">仓储管理系统</h1>
      <p class="logo-sub">WMS Mini Program</p>
    </div>

    <!-- 表单 -->
    <div class="form-area">
      <div class="input-group">
        <IconSvg type="user" size="sm" color="var(--color-text-muted)" />
        <input v-model="phone" type="tel" class="input" placeholder="请输入手机号" maxlength="11" />
      </div>

      <div class="input-group">
        <IconSvg type="lock" size="sm" color="var(--color-text-muted)" />
        <input v-model="code" type="text" class="input" placeholder="请输入验证码" maxlength="6" />
        <button class="code-btn" :disabled="counting || !phone" @click="sendCode">
          {{ counting ? `${countdown}s` : codeSent ? '重新发送' : '获取验证码' }}
        </button>
      </div>

      <label class="agree-row">
        <span class="agree-check" :class="{ on: agreed }" @click="agreed = !agreed">
          <IconSvg v-if="agreed" type="check" size="sm" color="white" />
        </span>
        <span class="agree-text">
          已阅读并同意 <a href="#" class="agree-link">《用户协议》</a> 和
          <a href="#" class="agree-link">《隐私政策》</a>
        </span>
      </label>

      <button class="login-btn" :disabled="!phone || !code || !agreed" @click="login">登录</button>

      <div class="other-login">
        <span class="other-label">其他方式登录</span>
        <div class="other-icons">
          <button class="other-btn" title="微信登录">微信</button>
          <button class="other-btn" title="账号密码登录" @click="router.push('/mini/login')">账号</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding: 40px 24px;
}

.logo-area {
  text-align: center;
  margin-bottom: 40px;
}
.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 16px;
  background: var(--color-primary);
}
.logo-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}
.logo-sub {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 4px 0 0;
}

.form-area {
  flex: 1;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border-light);
  margin-bottom: 16px;
}
.input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 15px;
  outline: none;
  color: var(--color-text);
}
.input::placeholder {
  color: var(--color-text-muted);
}

.code-btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-primary);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all 120ms;
}
.code-btn:disabled {
  border-color: var(--color-border);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

.agree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  cursor: pointer;
}
.agree-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  flex-shrink: 0;
  transition: all 120ms;
}
.agree-check.on {
  border-color: var(--color-primary);
  background: var(--color-primary);
}
.agree-text {
  font-size: 11px;
  color: var(--color-text-muted);
}
.agree-link {
  color: var(--color-primary);
  text-decoration: none;
}

.login-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 24px;
  background: var(--color-primary);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 150ms;
}
.login-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.other-login {
  text-align: center;
  margin-top: 32px;
}
.other-label {
  font-size: 12px;
  color: var(--color-text-muted);
}
.other-icons {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 12px;
}
.other-btn {
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  font-size: 11px;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-family: inherit;
}
</style>
