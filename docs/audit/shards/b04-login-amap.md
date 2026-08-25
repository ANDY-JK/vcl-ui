# login + amap 域功能清单

> 行号以 2026-08-25 工作区为准。

---

## login/_shared.ts（19 行）

**定位**：login 域对其它域的唯一横向依赖点（4 页共用 Input/Button/IconSvg/Toast/Divider/useT/useTm/isValidPhone/isValidEmail/storageGet/Set/Delete）。注释明确"页面禁止直接 import 其他域内部路径"。

**测试**：login-i18n.spec 间接覆盖（import login.vue）。**问题**：无。

---

## login/login.vue（683 行）⭐

**定位**：完整登录页模板——双栏品牌+表单、租户模式、记住用户名、失败锁定倒计时、社交登录、忘记密码/注册入口。

**Props**

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| maxWidth | string? | '960px' | 容器宽 |
| hideBrand | boolean | false | 隐藏左品牌面板 |
| minHeight | string? | '100%' | — |
| tenantMode | boolean | false | 租户模式（品牌/特性文案切换） |
| loading | boolean | false | 外部加载态 |
| error | string? | — | 外部注入错误 |
| maxAttempts | number | 5 | 失败锁定阈值，0 禁用 |
| lockMinutes | number | 15 | 锁定分钟 |
| brandTitle / brandSubtitle | string? | — | 自定义品牌文案 |
| features | string[]? | — | 自定义特性列表 |
| showSocialLogin | boolean | true | — |
| showForgotPassword | boolean | true | — |
| showRegister | boolean | true | — |

**Emits**：`submit: [{username,password,rememberMe}]`、`forgot-password`、`register`、`social-login: [provider]`
**Slots**：`logo`、`welcome-title`、`subtitle`、`remember-text`、`forgot-text`、`social-phone-text`、`tenant-footer-text`、`register-prompt`、`register-text`
**Expose**：`notifyFailed`（触发锁定计数）、`notifySuccess`（清锁定）、`resetForm`

**功能点**
1. **失败锁定**：attempts 计数存 localStorage（_login_attempts/_login_lock_until），达阈值锁 lockMinutes，倒计时 setInterval 每秒刷新（:257-294）；注释明示"客户端辅助防护可被清除绕过，服务端锁定才是核心"（:250）。
2. **记住用户名**：remembered_username 存储，onMounted 恢复（:302-314,336-340）。
3. **提交防抖**：internalLoading 置位 + 15s 兜底超时（:342-346）；重复点击忽略（:326）。
4. **校验**：用户名≥3、密码≥6，hint 渐进提示（:229-241,329-333）。
5. **Enter 提交**（:318-320）。
6. **租户模式**：品牌/副标题/特性/底部文案切换 + 隐藏社交/忘记密码（:21-23,33,85,104）。
7. **i18n 全覆盖**：t()/tm()（复数特性列表用 tm）（:33）。
8. a11y：记住用户名用**真实 checkbox** 视觉隐藏（:75-83,567-577）——已修复历史"伪 checkbox"审计点；社交按钮是真实 button。

**测试**：login-i18n.spec（3 用例，locale 切换后文案）。**未测**：锁定倒计时、rememberMe、submit 载荷、社交按钮。

**问题**
1. 锁定状态存 localStorage 可被清除绕过——设计已注释，属已知取舍。
2. 密码为 `reactive` 明文暂存于内存（Vue 组件实例），提交后未清空——无持久化，风险可控。

---

## login/register.vue（482 行）

**定位**：注册页——卡密 + 账号 + 密码 + 选填邮箱/手机号。

**Props**：`maxWidth`/`hideBrand`/`minHeight`('100vh')/`loading`/`error`/`brandTitle`/`brandSubtitle`、`requireCardKey`(true)、`showOptionalFields`(true)、`requireEmail`(false)、`requirePhone`(false)。
**Emits**：`submit: [RegisterPayload]`、`go-login`。
**Expose**：`resetForm`。**Slots**：`logo`、`extra-fields`。

**功能点**
- 校验：显示名≥2、账号≥3、密码≥6、邮箱 isValidEmail、手机 isValidPhone；必填随 requireEmail/requirePhone 条件化（:184-218,222-262）。
- 卡密可选 required（:198,239-242）。
- payload 中卡密/邮箱/手机按条件收窄 undefined（:264-271）。
- **全 i18n**。

**测试**：无直接 spec（RegisterPayload 类型被 index.ts re-export）。**未测**：全部。

**问题**：无。

---

## login/forgot-password.vue（406 行）

**定位**：忘记密码页——卡密 + 新密码 + 确认密码。

**Props**：`maxWidth`/`hideBrand`/`minHeight`('100vh')/`loading`/`error`/`success`。
**Emits**：`submit: [ResetPasswordPayload{card_key,password}]`、`go-login`。
**Expose**：`resetForm`。**Slots**：`logo`。

**功能点**
- 确认密码一致校验（:143-145,152-155,170-173）。
- 成功提示 displaySuccess（:71,138）。
- **全 i18n**。

**测试**：无直接 spec。**未测**：全部。

**问题**：无。

---

## login/portal_login.vue（187 行）

**定位**：极简登录卡片（门户风）——账号/密码/错误/提交。

**Props**：`maxWidth`('380px')/`minHeight`('100vh')/`loading`/`error`/`title`。
**Emits**：`submit: [{username,password}]`。**Expose**：`resetForm`。**Slots**：`logo`、`footer`。

**功能点**
- canSubmit 预判禁用提交按钮（:42,91）。
- Enter 提交。

**测试**：无直接 spec。**问题**
1. **硬编码中文未 i18n**：'登录'/'账号'/'密码'/'登 录'/'请输入账号'/'账号至少 3 个字符'/'请输入密码'/'密码至少 6 个字符'/'请输入正确的账号和密码'（:12,18,27,39,94-99,111）——与 login.vue 的 i18n 完全不一致，是 login 域最重的 i18n 欠账。

---

## login/index.ts

**导出**：LoginPage/RegisterPage/ForgotPasswordPage/PortalLogin（见 index.ts 全文件）。

---

## amap/amap-key.ts（101 行）

**定位**：高德 Key 统一管理（唯一真相源）——**组件库不内置任何 Key**，环境变量或 setAmapKey() 注入。

**导出**：`setAmapKey`、`setAmapKeys`、`getAmapJsKey`、`getAmapRestKey`、`getAmapSecurityCode`、`onAmapKeyChange`。

**功能点**
- 环境变量 VITE_AMAP_KEY/VITE_AMAP_SECRET 兜底（:24-28）。
- 运行时 _override 优先于 env（:31,57-63）。
- 订阅者模式通知 key 变更（amap-loader 订阅）（:37-54）。
- 未设置 key 时单次 console.warn（_warned 守卫）（:80-83,90-93）。
- **安全**：未硬编码密钥 ✅（与 04-安全审计"密钥不内置"结论一致）。

**测试**：amap-loader.spec 间接覆盖。**问题**：无。

---

## amap/amap-loader.ts（66 行）

**定位**：高德 SDK 加载协调器——解决"模块加载时同步初始化导致 key 锁死"问题。

**导出**：`createAmapLoader(config)`、`amapLoader` 单例。
**接口**：`ensureInit(key)`（幂等）、`isInitialized()`、`onKeyChanged(key)→boolean`。

**功能点**
- initAMapApiLoader 全局单例锁死 key 的坑 → 协调器确保首次用当前 key、重复调用幂等（:37-42）。
- 初始化后 key 变更 → console.warn 提示需刷新（诚实提示，SDK 无法热换）（:48-53,60-65）。
- loadScript 依赖注入便于测试（:19-22,34）。

**测试**：amap-loader.spec（9 用例：ensureInit 幂等/onKeyChanged 语义等）。**问题**：无。

---

## amap/amap-service.ts（587 行）⭐

**定位**：高德 REST API 统一服务层——搜索/周边/详情/照片/驾车路线/地理编码/导航链接。

**导出**（纯函数 + 异步 API）：

| 名称 | 类型 | 职责 |
|------|------|------|
| isValidLatLon | 纯函数 | 经纬度合法性（:86-88） |
| normalizeChinaLatLon | 纯函数 | 中国范围经纬度互换纠正（:94-107） |
| calcDistance | 纯函数 | 球面余弦距离，地球半径 6371004m（:113-129） |
| keywordSearch | async | v5 place/text 首条结果（:140-165） |
| searchNearby | async | v5 place/around 两页合并+去重（:232-263） |
| fetchPoiDetail | async | v5 place/detail（:266-293） |
| batchFetchPoiPhotos | async | 批量照片：ID 详情 + 名称搜索兜底（:326-370） |
| getDrivingRoute | async | v5 driving 多途经点 polyline 解析（:382-446） |
| geocodeCalc | async | 三级重试搜索 + 最近距离（:457-507） |
| detectPlatform / buildNavLink | — | 三端导航深度链接（:514-586） |

**功能点**
- safeFetch：15s AbortController 超时（:75-83）。
- normalizeChinaLatLon 自动纠正经纬度写反（中国范围启发式）（:94-107）。
- searchNearby 多页 + 名称/坐标去重 key（:221-223）。
- getDrivingRoute 失败传播：infocode≠10000 或网络错误区分（:419,442-445）。
- geocodeCalc 重试策略：门店+地址 → 地址 → 地址+门店，取最近（:472-496）。
- buildNavLink 三端：web uri.amap.com/navigation、iOS iosamap://path、Android amap://route/plan/（:533-585）。

**测试**：amap-service.spec（11 用例：calcDistance 已知距离/normalizeChinaLatLon 互换/isValidLatLon 边界/buildNavLink 平台分支等——纯函数全覆盖）。**未测**：真实 API 调用（依赖网络，正确跳过）。

**问题**：无。

---

## amap/types.ts（27 行）

**定位**：MarkerItem<T> 泛型标记类型（color red/blue/green、iconUrl、iconSize、infoWindow HTML、data）。独立文件避免 dts TS4082。

---

## amap/AmapWidget.vue（238 行）

**定位**：通用高德地图组件——封装 @vuemap/vue-amap 初始化、Key、标记、信息窗。

**Props**：`center`([116.397428,39.90923])、`zoom`(13)、`markers`(MarkerItem<T>[])、`showToolBar`(true)、`showScale`(true)、`mapStyle`('')、`customClass`('')。
**Emits**：`marker-click: [marker,index]`、`map-click: [lng,lat]`、`ready: [map]`。
**Expose**：`getMap`、`setZoomAndCenter`、`clearMarkers`、`renderMarkers`、`openInfoWindow`、`closeInfoWindow`。

**功能点**
- 安全配置注入：window._AMapSecurityConfig = securityJsCode（:67-73）。
- amapLoader.ensureInit 首次渲染初始化（非模块加载时）（:76）。
- 标记渲染：颜色映射图标 URL（3 色内置 CDN 图）、自定义 iconUrl/iconSize、点击弹信息窗 + emit（:143-175）。
- markers deep watch 自动重渲染（clear+render）（:177-183）。
- center/zoom watch 同步地图（:185-201）。
- 插件：ToolBar/Scale 按 prop 加载（:96-110）。
- 信息窗 isCustom + 偏移（:112-116）。
- a11y：role="region" aria-label（:226-227）。

**测试**：无直接 spec（依赖真实地图 SDK）。**问题**
1. `ready: [map: any]` 与多处 `as any`（AMapNS）——类型 any 历史欠账（P2 项）。
2. 标记 infoWindow 为 HTML 字符串直接 setContent——若内容含用户输入未消毒，存在 XSS 面（历史 04 审计富文本类同源风险）。中危。
3. 地图无键盘操作/无障碍替代（canvas 地图通病，07 审计已列）。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | login 4 + amap 1 = 5 |
| ts 模块 | _shared / amap-key / amap-loader / amap-service / types |
| 直接 spec 覆盖 | login-i18n（login.vue 3 用例）、amap-loader（9）、amap-service（11 纯函数） |
| 未测 | register / forgot-password / portal_login / AmapWidget |
| i18n | login/register/forgot 全覆盖；**portal_login 全硬编码** |
| 安全 | amap 密钥零硬编码 ✅；AmapWidget infoWindow HTML 未消毒（中危） |

**最重要发现**
1. **portal_login.vue 是 login 域唯一 i18n 硬伤**——9 处中文硬编码，与同域其它 3 页的 i18n 基建形成鲜明反差。
2. **amap 纯函数层测试完备**（20 用例锁行为），但 AmapWidget 组件层零测试且含 infoWindow XSS 面。
3. **login.vue 的失败锁定 + 记住用户名 + 租户模式是核心差异化功能**，无挂载级测试。
