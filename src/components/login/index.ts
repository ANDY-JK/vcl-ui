// 设计令牌必须先于本域组件样式（Q3 域级 CSS 自包含；与主入口 index.ts 同口径）
import '../tokens.css'
/** 登录页面按需导入入口 */
export { default as LoginPage } from './login.vue'
export { default as RegisterPage } from './register.vue'
export { default as ForgotPasswordPage } from './forgot-password.vue'
export { default as PortalLogin } from './portal_login.vue'
export type { RegisterPayload } from './register.vue'
export type { ResetPasswordPayload } from './forgot-password.vue'
