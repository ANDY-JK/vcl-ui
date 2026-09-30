<script setup lang="ts">
import { ref, reactive } from 'vue'
import LoginPage from '@/components/login/login.vue'
import RegisterPage from '@/components/login/register.vue'
import ForgotPasswordPage from '@/components/login/forgot-password.vue'
import PortalLogin from '@/components/login/portal_login.vue'
import Card from '@/components/data/Card.vue'
import Button from '@/components/basic/Button.vue'
import type { RegisterPayload, ResetPasswordPayload } from '@/components/index'

// ---- 模拟状态 ----
const loginLoading = ref(false)
const loginError = ref('')
/** v2（Q18）：宿主登录结果回写 prop——失败记一次尝试（累积到 maxAttempts 即锁定），成功清计数 */
const loginAuthResult = ref<{ ok: boolean; message?: string } | null>(null)
const registerLoading = ref(false)
const registerError = ref('')
const forgotLoading = ref(false)
const forgotError = ref('')
const forgotSuccess = ref('')

const lastEvent = ref('')

function logEvent(name: string, payload?: any) {
  lastEvent.value = `${name} → ${JSON.stringify(payload)}`
  console.log(`[LoginDemo] ${name}:`, payload)
}

// 模拟登录流程
async function handleLogin(payload: { username: string; password: string; rememberMe?: boolean }) {
  logEvent('login.submit', payload)
  loginLoading.value = true
  loginError.value = ''
  await new Promise((r) => setTimeout(r, 1000))
  loginLoading.value = false
  if (payload.password.length < 6) {
    loginError.value = '模拟错误：密码至少6位'
    // 回写失败结果：驱动组件内的尝试计数（连续失败到 maxAttempts 会锁定并倒计时）
    loginAuthResult.value = { ok: false }
  } else {
    loginAuthResult.value = { ok: true }
  }
}

async function handleRegister(payload: RegisterPayload) {
  logEvent('register.submit', payload)
  registerLoading.value = true
  registerError.value = ''
  await new Promise((r) => setTimeout(r, 1000))
  registerLoading.value = false
}

async function handleForgot(payload: ResetPasswordPayload) {
  logEvent('forgot.submit', payload)
  forgotLoading.value = true
  forgotError.value = ''
  forgotSuccess.value = ''
  await new Promise((r) => setTimeout(r, 1500))
  forgotLoading.value = false
  forgotSuccess.value = '模拟：密码重置成功！'
}

// ---- 演示配置开关 ----
const demoConfig = reactive({
  hideBrand: false,
  tenantMode: false,
  maxWidth: '960px',
  showSocial: true,
  showForgot: true,
  showRegister: true,
  requireCardKey: true,
})

const currentView = ref<'login' | 'register' | 'forgot' | 'portal'>('login')
const loginRef = ref<InstanceType<typeof LoginPage> | null>(null)
const registerRef = ref<InstanceType<typeof RegisterPage> | null>(null)
const forgotRef = ref<InstanceType<typeof ForgotPasswordPage> | null>(null)
const portalRef = ref<InstanceType<typeof PortalLogin> | null>(null)

function resetCurrentForm() {
  loginRef.value?.resetForm()
  registerRef.value?.resetForm()
  forgotRef.value?.resetForm()
  portalRef.value?.resetForm()
  loginError.value = ''
  registerError.value = ''
  forgotError.value = ''
  forgotSuccess.value = ''
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Login 登录系列</h1>
    <p class="demo-desc">
      4 个登录相关组件，纯 props/emits 驱动，不依赖外部 API。 支持 maxWidth / minHeight / hideBrand 布局参数。
    </p>

    <!-- ===== 控制面板 ===== -->
    <Card title="配置开关" title-as="h2" style="margin-bottom: calc(20px * var(--vcl-scale))">
      <div class="control-bar">
        <div class="control-group">
          <label class="ctrl-label">当前组件</label>
          <div class="ctrl-btns">
            <Button
              :text="'LoginPage'"
              :variant="currentView === 'login' ? 'primary' : 'outline'"
              size="sm"
              @click="currentView = 'login'"
            />
            <Button
              :text="'RegisterPage'"
              :variant="currentView === 'register' ? 'primary' : 'outline'"
              size="sm"
              @click="currentView = 'register'"
            />
            <Button
              :text="'ForgotPassword'"
              :variant="currentView === 'forgot' ? 'primary' : 'outline'"
              size="sm"
              @click="currentView = 'forgot'"
            />
            <Button
              :text="'PortalLogin'"
              :variant="currentView === 'portal' ? 'primary' : 'outline'"
              size="sm"
              @click="currentView = 'portal'"
            />
          </div>
        </div>

        <template v-if="currentView !== 'portal'">
          <label class="ctrl-label" @click="demoConfig.hideBrand = !demoConfig.hideBrand">
            <input v-model="demoConfig.hideBrand" type="checkbox" /> hideBrand
          </label>
          <label class="ctrl-label">
            maxWidth
            <select v-model="demoConfig.maxWidth" class="ctrl-select">
              <option value="960px">960px</option>
              <option value="720px">720px</option>
              <option value="100%">100%</option>
            </select>
          </label>
        </template>

        <template v-if="currentView === 'login'">
          <label class="ctrl-label" @click="demoConfig.tenantMode = !demoConfig.tenantMode">
            <input v-model="demoConfig.tenantMode" type="checkbox" /> tenantMode
          </label>
          <label class="ctrl-label" @click="demoConfig.showSocial = !demoConfig.showSocial">
            <input v-model="demoConfig.showSocial" type="checkbox" /> showSocialLogin
          </label>
          <label class="ctrl-label" @click="demoConfig.showForgot = !demoConfig.showForgot">
            <input v-model="demoConfig.showForgot" type="checkbox" /> showForgotPassword
          </label>
          <label class="ctrl-label" @click="demoConfig.showRegister = !demoConfig.showRegister">
            <input v-model="demoConfig.showRegister" type="checkbox" /> showRegister
          </label>
        </template>

        <template v-if="currentView === 'register'">
          <label class="ctrl-label" @click="demoConfig.requireCardKey = !demoConfig.requireCardKey">
            <input v-model="demoConfig.requireCardKey" type="checkbox" /> requireCardKey
          </label>
        </template>

        <Button text="重置表单" variant="ghost" size="sm" @click="resetCurrentForm" />
      </div>

      <div v-if="lastEvent" class="event-log">
        <code>{{ lastEvent }}</code>
      </div>
    </Card>

    <!-- ===== 组件渲染区 ===== -->
    <div class="preview-area">
      <!-- LoginPage -->
      <LoginPage
        v-if="currentView === 'login'"
        ref="loginRef"
        :max-width="demoConfig.maxWidth"
        :hide-brand="demoConfig.hideBrand"
        min-height="auto"
        :tenant-mode="demoConfig.tenantMode"
        :loading="loginLoading"
        :error="loginError"
        :auth-result="loginAuthResult"
        :show-social-login="demoConfig.showSocial"
        :show-forgot-password="demoConfig.showForgot"
        :show-register="demoConfig.showRegister"
        @submit="handleLogin"
        @forgot-password="logEvent('login.forgot-password')"
        @register="logEvent('login.register')"
        @social-login="(p) => logEvent('login.social-login', p)"
      />

      <!-- RegisterPage -->
      <RegisterPage
        v-else-if="currentView === 'register'"
        ref="registerRef"
        :max-width="demoConfig.maxWidth"
        :hide-brand="demoConfig.hideBrand"
        min-height="auto"
        :loading="registerLoading"
        :error="registerError"
        :require-card-key="demoConfig.requireCardKey"
        @submit="handleRegister"
        @go-login="logEvent('register.go-login')"
      />

      <!-- ForgotPasswordPage -->
      <ForgotPasswordPage
        v-else-if="currentView === 'forgot'"
        ref="forgotRef"
        :max-width="demoConfig.maxWidth"
        :hide-brand="demoConfig.hideBrand"
        min-height="auto"
        :loading="forgotLoading"
        :error="forgotError"
        :success="forgotSuccess"
        @submit="handleForgot"
        @go-login="logEvent('forgot.go-login')"
      />

      <!-- PortalLogin -->
      <PortalLogin
        v-else
        ref="portalRef"
        max-width="420px"
        min-height="auto"
        :loading="loginLoading"
        :error="loginError"
        title="演示登录"
        @submit="handleLogin"
      />
    </div>

    <!-- ===== Props 说明表 ===== -->
    <Card
      title="通用布局 Props（LoginPage / RegisterPage / ForgotPasswordPage）"
      title-as="h2"
      style="margin-top: calc(24px * var(--vcl-scale))"
    >
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认值</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>maxWidth</code></td>
            <td>string</td>
            <td>'960px'</td>
            <td>容器最大宽度</td>
          </tr>
          <tr>
            <td><code>hideBrand</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>强制隐藏左侧品牌面板</td>
          </tr>
          <tr>
            <td><code>minHeight</code></td>
            <td>string</td>
            <td>'100vh' / '100%'</td>
            <td>容器最小高度</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="LoginPage 独有 Props" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认值</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>tenantMode</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>租户登录模式</td>
          </tr>
          <tr>
            <td><code>loading</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>外部控制加载态</td>
          </tr>
          <tr>
            <td><code>error</code></td>
            <td>string</td>
            <td>—</td>
            <td>外部注入错误</td>
          </tr>
          <tr>
            <td><code>maxAttempts</code></td>
            <td>number</td>
            <td>5</td>
            <td>最大尝试次数（0 禁用锁定）</td>
          </tr>
          <tr>
            <td><code>lockMinutes</code></td>
            <td>number</td>
            <td>15</td>
            <td>锁定分钟数</td>
          </tr>
          <tr>
            <td><code>showSocialLogin</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>是否显示社交登录</td>
          </tr>
          <tr>
            <td><code>showForgotPassword</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>是否显示忘记密码</td>
          </tr>
          <tr>
            <td><code>showRegister</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>是否显示注册入口</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Events" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table class="props-table">
        <thead>
          <tr>
            <th>组件</th>
            <th>事件</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>LoginPage</td>
            <td><code>submit</code></td>
            <td><code>{ username, password, rememberMe }</code></td>
          </tr>
          <tr>
            <td>LoginPage</td>
            <td><code>forgot-password</code></td>
            <td>—</td>
          </tr>
          <tr>
            <td>LoginPage</td>
            <td><code>register</code></td>
            <td>—</td>
          </tr>
          <tr>
            <td>LoginPage</td>
            <td><code>social-login</code></td>
            <td><code>provider: string</code></td>
          </tr>
          <tr>
            <td>RegisterPage</td>
            <td><code>submit</code></td>
            <td><code>RegisterPayload</code></td>
          </tr>
          <tr>
            <td>RegisterPage</td>
            <td><code>go-login</code></td>
            <td>—</td>
          </tr>
          <tr>
            <td>ForgotPasswordPage</td>
            <td><code>submit</code></td>
            <td><code>ResetPasswordPayload</code></td>
          </tr>
          <tr>
            <td>ForgotPasswordPage</td>
            <td><code>go-login</code></td>
            <td>—</td>
          </tr>
          <tr>
            <td>PortalLogin</td>
            <td><code>submit</code></td>
            <td><code>{ username, password }</code></td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Exposed Methods" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table class="props-table">
        <thead>
          <tr>
            <th>方法</th>
            <th>适用组件</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>resetForm()</code></td>
            <td>全部 4 个</td>
            <td>清空表单 &amp; 错误</td>
          </tr>
        </tbody>
      </table>
      <p class="demo-hint" style="margin-top: calc(12px * var(--vcl-scale))">
        v2（Q18）起宿主登录结果回写改走 <code>authResult</code> prop（<code>{ ok, message? }</code>，
        每次回写传新对象），不再经暴露方法：<code>{ ok: false, message }</code> 记一次失败尝试并透传服务端文案，
        <code>{ ok: true }</code> 清错误/计数/锁定。
      </p>
    </Card>
  </div>
</template>

<style scoped>
.demo-title {
  font-size: calc(22px * var(--vcl-scale));
  font-weight: 700;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.demo-desc {
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
}

/* ---- 控制面板 ---- */
.control-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(12px * var(--vcl-scale));
}
.control-group {
  display: flex;
  align-items: center;
  gap: calc(6px * var(--vcl-scale));
}
.ctrl-label {
  display: flex;
  align-items: center;
  gap: calc(4px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-text-secondary);
  cursor: pointer;
  user-select: none;
}
.ctrl-label input[type='checkbox'] {
  cursor: pointer;
}
.ctrl-btns {
  display: flex;
  gap: calc(4px * var(--vcl-scale));
}
.ctrl-select {
  padding: 2px calc(6px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-sm);
  background: var(--vcl-color-surface);
}

/* 事件日志 */
.event-log {
  margin-top: calc(10px * var(--vcl-scale));
  padding: calc(8px * var(--vcl-scale)) calc(10px * var(--vcl-scale));
  background: var(--vcl-color-bg-alt);
  border-radius: var(--vcl-radius-md);
  font-size: calc(12px * var(--vcl-scale));
}
.event-log code {
  color: var(--vcl-color-primary);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

/* ---- 预览区 ---- */
.preview-area {
  border: 2px dashed var(--vcl-color-border);
  border-radius: var(--vcl-radius-lg);
  overflow: hidden;
  background: var(--vcl-color-bg);
}

/* ---- Props 表 ---- */
.props-table {
  width: 100%;
  font-size: calc(13px * var(--vcl-scale));
  border-collapse: collapse;
}
.props-table thead tr {
  border-bottom: 2px solid var(--vcl-color-border);
  text-align: left;
}
.props-table th {
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
}
.props-table td {
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
}
.props-table code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: var(--vcl-radius-sm);
  font-size: calc(12px * var(--vcl-scale));
  color: var(--vcl-color-primary);
}
</style>
