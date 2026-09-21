# 登录（login）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `LoginPage` | 14 | 4 | 9 |
| `RegisterPage` | 11 | 2 | 2 |
| `ForgotPasswordPage` | 6 | 2 | 1 |
| `PortalLogin` | 5 | 1 | 2 |

---

## `LoginPage`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/login`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `maxWidth` | `string` | `'960px'` | 否 | 容器最大宽度，CSS 值，默认 960px |
| `hideBrand` | `boolean` | `false` | 否 | 强制隐藏左侧品牌面板 |
| `minHeight` | `string` | `'100%'` | 否 | 容器最小高度，CSS 值，默认 100% |
| `tenantMode` | `boolean` | `false` | 否 | 租户登录模式 |
| `loading` | `boolean` | `false` | 否 | 外部控制加载态（如 API 请求中） |
| `error` | `string` | — | 否 | 外部注入错误/提示信息 |
| `maxAttempts` | `number` | `5` | 否 | 最大尝试次数，0 禁用锁定 |
| `lockMinutes` | `number` | `15` | 否 | 锁定分钟数 |
| `brandTitle` | `string` | — | 否 | 品牌标题 |
| `brandSubtitle` | `string` | — | 否 | 品牌副标题 |
| `features` | `string[]` | — | 否 | 自定义特性列表 |
| `showSocialLogin` | `boolean` | `true` | 否 | 是否显示社交登录 |
| `showForgotPassword` | `boolean` | `true` | 否 | 是否显示忘记密码入口 |
| `showRegister` | `boolean` | `true` | 否 | 是否显示注册入口 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: { username: string; password: string; rememberMe: boolean }` | 提交登录 |
| `'forgot-password'` | `无` | 点击忘记密码 |
| `register` | `无` | 点击注册 |
| `'social-login'` | `provider: string` | 点击社交登录按钮 |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `forgot-text` | — | {{ t('login.forgotPasswordQ') }} |
| `logo` | — | — |
| `register-prompt` | — | {{ t('login.registerPrompt') }} {{ t('lo |
| `register-text` | — | {{ t('login.registerNow') }} |
| `remember-text` | — | {{ t('login.rememberUsername') }} |
| `social-phone-text` | — | {{ t('login.socialPhone') }} |
| `subtitle` | — | {{ tenantMode ? t('login.welcomeSubtitle |
| `tenant-footer-text` | — | {{ t('login.tenantFooter') }} |
| `welcome-title` | — | {{ t('login.welcomeTitle') }} |

## `RegisterPage`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/login`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `maxWidth` | `string` | `'960px'` | 否 | 容器最大宽度，CSS 值，默认 960px |
| `hideBrand` | `boolean` | `false` | 否 | 强制隐藏左侧品牌面板 |
| `minHeight` | `string` | `'100vh'` | 否 | 容器最小高度，CSS 值，默认 100vh |
| `loading` | `boolean` | `false` | 否 | — |
| `error` | `string` | — | 否 | — |
| `brandTitle` | `string` | — | 否 | — |
| `brandSubtitle` | `string` | — | 否 | — |
| `requireCardKey` | `boolean` | `true` | 否 | 是否需要卡密字段 |
| `showOptionalFields` | `boolean` | `true` | 否 | 是否显示邮箱 & 手机号字段 |
| `requireEmail` | `boolean` | `false` | 否 | 邮箱是否必填 |
| `requirePhone` | `boolean` | `false` | 否 | 手机号是否必填 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: RegisterPayload` | — |
| `'go-login'` | `无` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `extra-fields` | — | — |
| `logo` | — | — |

## `ForgotPasswordPage`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/login`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `maxWidth` | `string` | `'960px'` | 否 | 容器最大宽度，CSS 值，默认 960px |
| `hideBrand` | `boolean` | `false` | 否 | 强制隐藏左侧品牌面板 |
| `minHeight` | `string` | `'100vh'` | 否 | 容器最小高度，CSS 值，默认 100vh |
| `loading` | `boolean` | `false` | 否 | — |
| `error` | `string` | — | 否 | — |
| `success` | `string` | — | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: ResetPasswordPayload` | — |
| `'go-login'` | `无` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `logo` | — | — |

## `PortalLogin`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/login`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `maxWidth` | `string` | `'380px'` | 否 | 卡片最大宽度，CSS 值，默认 380px |
| `minHeight` | `string` | `'100vh'` | 否 | 容器最小高度，CSS 值，默认 100vh |
| `loading` | `boolean` | `false` | 否 | — |
| `error` | `string` | — | 否 | — |
| `title` | `string` | — | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: { username: string; password: string }` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `footer` | — | — |
| `logo` | — | — |

