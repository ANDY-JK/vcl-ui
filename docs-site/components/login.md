# 登录（login）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `LoginPage` | 15 | 4 | 9 |
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
| `authResult` | `{ ok: boolean; message?: string } \| null` | `null` | 否 | 宿主登录结果回写（v2 Q18 收敛，取代 notifyFailed/notifySuccess 两个暴露方法）： 宿主自行完成登录后回传——{ ok: false, message? } 记一次失败尝试（message 为服务端错误文案）， { ok: true } 清错误/计数/锁定。每次回写传新对象（或先置 null 再传），同一引用重复赋值不重复触发 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: { username: string; password: string; rememberMe: boolean }` | 提交登录 |
| `'forgot-password'` | `无` | 点击忘记密码 |
| `register` | `无` | 点击注册 |
| `'social-login'` | `provider: string` | 点击社交登录按钮 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `forgot-text` | — | 忘记密码入口文案区 | &#123;&#123; t('login.forgotPasswordQ') &#125;&#125; |
| `logo` | — | 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） | — |
| `register-prompt` | — | 注册提示文案区 | &#123;&#123; t('login.registerPrompt') &#125;&#125; &#123;&#123; t('lo |
| `register-text` | — | 注册入口文案区 | &#123;&#123; t('login.registerNow') &#125;&#125; |
| `remember-text` | — | 记住用户名选项文案区 | &#123;&#123; t('login.rememberUsername') &#125;&#125; |
| `social-phone-text` | — | 社交登录手机号文案区 | &#123;&#123; t('login.socialPhone') &#125;&#125; |
| `subtitle` | — | 副标题区 | &#123;&#123; tenantMode ? t('login.welcomeSubtitle |
| `tenant-footer-text` | — | 租户模式底部文案区 | &#123;&#123; t('login.tenantFooter') &#125;&#125; |
| `welcome-title` | — | 欢迎标题区；不传则回退按 tenantMode 拼接的内置文案 | &#123;&#123; t('login.welcomeTitle') &#125;&#125; |

## `RegisterPage`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/login`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `maxWidth` | `string` | `'960px'` | 否 | 容器最大宽度，CSS 值，默认 960px |
| `hideBrand` | `boolean` | `false` | 否 | 强制隐藏左侧品牌面板 |
| `minHeight` | `string` | `'100vh'` | 否 | 容器最小高度，CSS 值，默认 100vh |
| `loading` | `boolean` | `false` | 否 | 外部控制加载态（如 API 请求中） |
| `error` | `string` | — | 否 | 外部注入错误/提示信息 |
| `brandTitle` | `string` | — | 否 | 品牌标题（左侧品牌面板；空串用内置 i18n） |
| `brandSubtitle` | `string` | — | 否 | 品牌副标题 |
| `requireCardKey` | `boolean` | `true` | 否 | 是否需要卡密字段 |
| `showOptionalFields` | `boolean` | `true` | 否 | 是否显示邮箱 & 手机号字段 |
| `requireEmail` | `boolean` | `false` | 否 | 邮箱是否必填 |
| `requirePhone` | `boolean` | `false` | 否 | 手机号是否必填 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: RegisterPayload` | 注册提交：[表单载荷]（宿主调 API，成功后自行跳转） |
| `'go-login'` | `无` | 点击「去登录」 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `extra-fields` | — | 基础表单之后追加的扩展字段区 | — |
| `logo` | — | 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） | — |

## `ForgotPasswordPage`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/login`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `maxWidth` | `string` | `'960px'` | 否 | 容器最大宽度，CSS 值，默认 960px |
| `hideBrand` | `boolean` | `false` | 否 | 强制隐藏左侧品牌面板 |
| `minHeight` | `string` | `'100vh'` | 否 | 容器最小高度，CSS 值，默认 100vh |
| `loading` | `boolean` | `false` | 否 | 外部控制加载态（如 API 请求中） |
| `error` | `string` | — | 否 | 外部注入错误/提示信息 |
| `success` | `string` | — | 否 | 重置成功提示（非空时切成功态视图） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: ResetPasswordPayload` | 重置提交：[表单载荷]（宿主调 API） |
| `'go-login'` | `无` | 点击「去登录」 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `logo` | — | 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） | — |

## `PortalLogin`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/login`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `maxWidth` | `string` | `'380px'` | 否 | 卡片最大宽度，CSS 值，默认 380px |
| `minHeight` | `string` | `'100vh'` | 否 | 容器最小高度，CSS 值，默认 100vh |
| `loading` | `boolean` | `false` | 否 | 外部控制加载态（如 API 请求中） |
| `error` | `string` | — | 否 | 外部注入错误/提示信息 |
| `title` | `string` | — | 否 | 卡片标题（空串用内置 i18n） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `payload: { username: string; password: string }` | 登录提交：[用户名 + 密码]（宿主调 API，成功后自行跳转） |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `footer` | — | 底部区域（如版权/帮助链接） | — |
| `logo` | — | 品牌 Logo；不传则回退内置图标（可替换为企业 Logo 图片） | — |

