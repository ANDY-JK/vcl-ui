# basic + feedback 域功能清单

> 审计方式：逐文件全读（主模型直做）；行号以 2026-08-25 工作区为准。

---

## basic/Button.vue（176 行）

**定位**：全库最基础按钮，5 变体 × 3 尺寸，支持图标/加载/通栏/箭头。

**Props**

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| text | string? | — | 按钮文字（内联模式） |
| variant | 'primary'\|'secondary'\|'outline'\|'danger'\|'ghost' | 'primary' | 变体 |
| size | 'sm'\|'md'\|'lg' | 'md' | 尺寸 |
| icon | string? | — | 前置图标（IconSvg type，lucide 名） |
| disabled | boolean | false | 禁用 |
| loading | boolean | false | 加载态（替换图标为 spinner，禁用点击） |
| block | boolean | false | 通栏 |
| showArrow | boolean | false | 尾部箭头 |

**Emits**：`click: [e: MouseEvent]`

**Slots**：默认插槽（text 之后渲染）。

**功能点**
- 5 变体样式映射（:111-157）；尺寸用 `clamp()` 弹性高度，`.btn-md` 挂 `--ctrl-*` 设计令牌（:98-108）。
- loading 显示旋转 spinner 并自动禁用（:43,48-50）。
- 错误边界：onErrorCaptured 捕获异常渲染"⚠ 按钮异常"替代按钮（:6-11,37），与 ErrorBoundary 策略一致。
- aria：无 text 且无插槽时以 icon 名作 aria-label（:44）；loading 置 aria-busy（:45）。

**测试**：basic-components.spec（26 用例）覆盖渲染/variant/size/disabled/loading 等。**未测**：showArrow、aria-label 逻辑、onErrorCaptured 分支。

**问题**
1. 注释与实现冲突：头部注释说"禁止 clamp() → px"，但代码大量使用 clamp()（:93-107）——注释是给未来改动的禁令，无功能问题。
2. `showArrow` 无独立测试。

---

## basic/IconSvg.vue（104 行）

**定位**：图标渲染核心，双提供者（Lucide 同步 / Solar 异步按需），未命中时渲染占位网格。

**Props**（Options API defineComponent）

| 名称 | 类型 | 默认值 |
|------|------|--------|
| type | string（required） | — |
| size | string | 'md' |
| color | string | 'currentColor' |
| provider | string | 'lucide' |

size 映射：xs 12 / sm 16 / md 20 / lg 24 / xl 28（:8）。

**功能点**
- Lucide：kebab-case → PascalCase 查找 `@lucide/vue` 组件（:11-13,77-87）。
- Solar：`@iconify/vue` 动态加载 235KB 数据，`ensureSolarIcons()` 异步就绪前渲染占位（:60-74）；变体后缀自动补全 `-linear`（:46-53）。
- 兜底：两 provider 均未命中时 4 宫格占位 SVG（:16-30,90）。
- 全部图标 `aria-hidden`（:23,72,85）。

**测试**：无直接 spec；basic-components 不覆盖（未 import）。**未测**：solar provider 异步路径、变体后缀逻辑。

**问题**
1. `lucideIcons as Record<string, any>` 有 any（历史 P2 项，仍存在）。
2. Solar 就绪前每次渲染都触发 `ensureSolarIcons().then()`（:63），多次渲染会重复注册/加载请求——有 isSolarReady 守卫，但 promise 链未缓存，可能重复加载。低危。

---

## basic/Tag.vue（271 行）

**定位**：标签 + 徽标（Badge 已合并）二合一。6 色 variant、sm/md、closable、dot 圆点、sup 角标、count 溢出。

**Props**

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| text | string? | — | 内联文字 |
| variant | 6 枚举 | 'default' | 颜色 |
| size | 'sm'\|'md' | 'md' | — |
| closable | boolean | false | 显示关闭按钮 |
| rounded | boolean | false | 药丸圆角 |
| dot | boolean | false | 纯圆点 |
| max | number | 99 | 数字溢出上限 → `99+` |
| count | number? | — | 徽标数字（Badge 兼容） |
| color | string? | — | 自定义背景色 |
| offset | [number,number]? | — | 角标偏移 |
| showZero | boolean | false | count=0 仍显示 |
| hidden | boolean | false | 强制隐藏 |
| sup | boolean | false | 角标模式 |

**Emits**：`close: []`（closable 关闭按钮 @click.stop）。

**功能点**
- 双模式自动判定：有默认插槽且 count/dot/text/color → sup 角标模式，否则内联标签（:54-58）。
- 可见性链 hidden > dot > text > count（showZero 控制 0 显示）（:61-68）。
- 数字溢出 `count>max → max+`；纯数字 text 同样溢出截断（:74-85）。
- 角标右上定位 `translate(50%,-50%)` + offset 偏移（:94-102,257）。
- 无障碍：角标 role="status" + aria-label（:115）；关闭按钮为真实 button。

**测试**：basic-components.spec 覆盖基础渲染/variant/closable。**未测**：sup/offset/max 溢出/计数模式/showZero。

---

## feedback/Toast.vue（343 行）

**定位**：全局通知 + 内联提示条（替代 Alert）双模式；队列由 provide/inject 共享，多实例同队列。

**Props**

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| variant | 'toast'\|'inline' | 'toast' | 弹幕/内联 |
| type | 'circle-alert'\|'info'\|'success'\|'warning'\|'error' | 'circle-alert' | — |
| title | string? | — | inline 模式标题 |
| message | string? | — | inline 模式内容 |
| closable | boolean | false | inline 关闭按钮 |
| showIcon | boolean | true | — |
| position | 5 枚举 | 'top' | toast 容器位置 |

**Emits/Expose**：无 emits；expose `show(message,type,duration,options)` / `remove(id)`（:145-150）。
**provide**：`TOAST_KEY` 提供 `{toasts, show, remove, clearAll}`（:122）；子组件 `useToast()` inject（toast-context.ts）。

**功能点**
- `show` 入队：默认时长 error 5s 其余 3s，duration≤0 常驻需手动 remove（:82-115,147）；返回 id。
- action/undo 按钮：`actionText` 优先于废弃的 `undoText`（:105-107）；点击触发回调并移除（:185）。
- 全局 id 递增放模块级普通 `<script>`，避免多实例 id 冲突（:1-8）。
- 兼容 `window.__toast`（@deprecated），卸载时清理防 dangling（:126-142）。
- toast 容器 aria-live="polite"（:176）；容器 pointer-events none、item auto（:208,246）。
- position 5 方向 CSS 定位（:213-235）；z-index `var(--z-top, 9999)`。
- inline 模式本地显隐（:40,169）。

**测试**：无直接 spec（composables.spec 测 useCopy/useModalManager/useTreeFlatten，未测 Toast）。**未测**：show/remove/clearAll、action 回调、多实例 id、duration 计时。

**问题**
1. `setTimeout` 后组件卸载，timer 未清理（:112），卸载后 setState 于已卸载 ref——Vue ref 仍可写，不报错，但为 dangling 隐患。低危。
2. `iconMap['circle-alert']` 键值冗余（:48-54）。

---

## feedback/Drawer.vue（272 行）

**定位**：四方向抽屉，Teleport + 遮罩 + 方向滑入动画；焦点陷阱 + 弹窗互斥。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| visible | boolean（required） | — |
| title | string? | '' |
| placement | 'left'\|'right'\|'top'\|'bottom' | 'right' |
| width | string? | 'min(380px, 88vw)' |
| height | string? | 'min(300px, 60vh)' |
| closable | boolean | true |
| maskClosable | boolean | true |
| zIndex | number | 1000 |
| destroyOnClose | boolean | true |
| internal | boolean | false（不参与全局互斥） |
| mutexScope | string? | —（同 scope 新开即关旧） |

**Emits**：`update:visible` / `close` / `afterOpen` / `afterClose`

**Slots**：默认（body）、`header`（含标题默认内容）、`footer`（有则显示）。

**功能点**
- 焦点管理：打开聚焦面板（autofocus:'container'），Tab 循环 trap，关闭恢复焦点到打开按钮；被 registerModal 同步关闭时不抢焦点（:54-62, 注释 55-57）。
- 弹窗互斥：非 internal 时 registerModal(close, mutexScope) 注册竞态管理（:83-103）；注释说明焦点 trap 须先于 registerModal watch 创建。
- ESC 关闭（useEscClose，closable 为条件）（:106-113）。
- 数字 width/height 自动加 px（:50-51）。
- 四方向滑入动画（:242-270）；遮罩 backdrop-filter。
- role="dialog" aria-modal + aria-label（:132-134）。

**测试**：focus-trap.spec 测 useFocusTrap（4 用例）；keyboard-a11y 未覆盖 Drawer。**未测**：Drawer 挂载级、互斥行为（coupling-fix.spec 测的是 store 与 modalManager 组合）。

**问题**：无独立 Drawer spec；互斥/焦点恢复为手工验证逻辑。

---

## feedback/Popover.vue（217 行）

**定位**：popover 卡片 / tooltip 文字气泡双模式，click/hover/focus 触发，useFloating 定位 + 翻转。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| variant | 'popover'\|'tooltip' | 'popover' |
| title | string? | — |
| trigger | 'click'\|'hover'\|'focus' | 'click' |
| text | string? | —（有值即 tooltip 行为） |
| position | 'top'\|'bottom'\|'left'\|'right' | 'top' |

**功能点**
- isTooltip 判定：variant='tooltip' 或传 text（:28）。
- 竞态保护：`_showToken` 使 show() 的 RAF 回调晚于 hide() 时跳过 updatePosition（:31,56-69）。
- useFloating 定位 + 方向翻转（FlipDirection up/down/left/right）；offset/minSize 按模式取不同值（:33-39）。
- tooltip 模式（有 text）强制 hover 行为（:41-42,54）。
- focus 触发走 @focus/@blur（:71-79,90）。
- 点击外部关闭（useClickOutside）（:84）。
- tooltip 容器 pointer-events:none（:175）。

**测试**：无直接 spec。**未测**：三种触发、翻转、tooltip 模式。

**问题**
1. 历史 a11y 审计提"语义缺失"：popover 卡片无 role（dialog/tooltip）、触发器默认 button 无 aria-expanded/aria-haspopup。现状核实：仍无 role/aria-expanded（:90-97,102-109）。🔴 待修（与 07-可访问性审计一致）。
2. `variant='tooltip'` 但无 text 时渲染 `<slot/>`（:96）可自定义内容，但 position 仅 top/bottom/left/right，而 dirMap 映射正确。

---

## feedback/ConfirmModal.vue（214 行）

**定位**：基于 ModalBox 的确认对话框，3 变体（danger/warning/primary）。

**Props**：`visible`(bool,必填)、`title`(默认'确认操作')、`message`(必填)、`confirmText`('确定')、`cancelText`('取消')、`variant`('danger')、`loading`(false)、`closable`(true)。

**Emits**：`update:visible` / `confirm` / `cancel`。**Slots**：无。

**功能点**
- 变体元数据映射：图标/iconColor/borderColor/bg/btnClass（:34-59）。
- confirm 带 loading 禁用 + 旋转图标（:102-106,164-172）。
- onCancel/onConfirm 先 emit 后 close（:65-73）。
- 复用 ModalBox 弹层（焦点/ESC 由 ModalBox 提供，本组件无重复实现）。

**测试**：无直接 spec。**未测**：变体渲染、confirm/cancel 流、loading。

**问题**：无。

---

## feedback/Loading.vue（148 行）

**定位**：加载态四模式（spinner/skeleton/skeleton-text/skeleton-card）+ fullscreen 全屏遮罩。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| variant | 4 枚举 | 'spinner' |
| size | 'sm'\|'md'\|'lg' | 'md' |
| text | string? | — |
| rows | number | 3 |
| width | string | '100%' |
| height | string | '14px' |
| fullscreen | boolean | false |
| overlay | boolean | true |

**功能点**
- fullscreen Teleport 到 body，fixed 遮罩 + backdrop-filter + 居中卡片（:34-41,65-93）。
- skeleton 三形态：卡片（末行 60% 宽）、文字（自定义宽高）、行（末行 40% 宽）（:50-60）。
- skeleton aria-hidden（:50,55,58）；spinner 无 role（纯装饰，无 aria-live，加载完成状态变更需业务自行 announce——a11y 潜在缺口）。
- shimmer 动画（:126-133）。

**测试**：basic-components.spec 覆盖 Skeleton 基础。**未测**：fullscreen/overlay/text。

**问题**：无。

---

## feedback/ErrorBoundary.vue（123 行）

**定位**：组件错误边界，onErrorCaptured 捕获子树错误，fallback + retry。

**Props**：`title`、`retryText`、`watchKey`(变化自动重置错误状态)。

**Emits**：`error: [err: Error]`。**Slots**：默认（正常内容）、`fallback`（作用域：error/retry）。

**功能点**
- onErrorCaptured 捕获 → 置 hasError、console.error、emit('error')、return false 阻止冒泡（:48-54）。
- retry 重置错误并 +resetKey 强制重建默认槽（:56-60,18）。
- watchKey 变化自动重置（:63-72）。
- i18n：useT()（:23,8-15）。

**测试**：无直接 spec。**未测**：捕获/retry/watchKey/emit。

**问题**：无。

---

## feedback/OfflineIndicator.vue（78 行）

**定位**：在线/离线监听，离线时顶部横幅 + 手动关闭。

**Props**：无。**Slots**：无。

**功能点**
- window online/offline 监听，onMounted 挂、onUnmounted 摘（:21-29）。
- 离线横幅 z-index var(--z-top,9999) 顶部固定 + slide-down 动画（:33-41,44-77）。
- dismissed 手动关闭；重连自动复位（:12-19）。
- i18n：t('offline.disconnected')（:36）。

**测试**：无直接 spec。**未测**：online/offline 事件流。

**问题**：无。

---

## feedback/Result.vue（97 行）

**定位**：结果页（成功/错误/404/空态等 6 状态）。

**Props**：`status`(6 枚举,必填)、`title`(必填)、`description`、`actionText`、`fullWidth`。
**Emits**：`action`。**Slots**：默认、`extra`（action 区）。

**功能点**
- 状态→图标/颜色映射（:23-39）。
- actionText 渲染 Button + extra slot 同区（:51-54）。
- fullWidth 用于 grid 布局跨列（:44,68-71）。

**测试**：basic-components.spec 覆盖 Result 渲染。**未测**：action emit、extra slot。

**问题**：无。

---

## feedback/ReadOnlyOverlay.vue（58 行）

**定位**：全屏只读遮罩（系统维护态），锁图标 + reason 文案。

**Props**：`visible`(必填)、`reason`(默认'系统维护中，当前为只读模式')。
**功能点**：z-index var(--z-readonly,2500) 压过 modal/overlay/dropdown（:31）；fade 过渡。硬编码中文默认 reason（未 i18n）。

**测试**：无。**问题**：默认文案未走 i18n（历史 i18n 欠账的一部分）。

---

## feedback/composables

| 模块 | 导出 | 职责 | 问题 |
|------|------|------|------|
| toast-context.ts | ToastItem/ToastAPI/TOAST_KEY/useToast | Toast provide/inject 上下文；undo 字段标 @deprecated | 无 |
| useBeep.ts | beepSuccess/beepError/beepNotify/beepWarning/unlockAudio | Web Audio 蜂鸣；自动解锁（首次交互）；`__vueLibBeepInited` 幂等防多份拷贝；play() 频率序列（0.08s 间隔） | 播放无音量/频率参数出口；`ctx.state==='closed'` 重建逻辑存在（:50-53） |
| useVoice.ts | speak/stopSpeak/unlockVoice + VoiceLang | SpeechSynthesis 播报；语言检测（中日韩正则）；rate/pitch 钳制；localStorage 预热持久化；`__vueLibVoiceInited` 幂等 | speak 无停止队列管理；voice 匹配不到时回落 lang 前缀 |
| useNotify.ts | notify/getNotifyStatus | Web Notification 系统通知；首次请求权限；点击默认聚焦/开 URL；autoClose 定时 | 权限 denied 仅 console.warn |

**测试**：composables.spec（9 用例）测 useCopy/useModalManager/useTreeFlatten，**未覆盖** useBeep/useVoice/useNotify（音频/通知类通常依赖浏览器能力）。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | basic 3 + feedback 9 = 12 |
| composable | 4（toast-context/useBeep/useVoice/useNotify） |
| Props 总数 | Button 9 / IconSvg 4 / Tag 13 / Toast 6 / Drawer 10 / Popover 5 / ConfirmModal 8 / Loading 8 / ErrorBoundary 3 / Result 5 / ReadOnlyOverlay 2 |
| 直接 spec 覆盖 | basic-components（Button/Tag/Divider/Empty/Skeleton/Card/Collapse/Result）、keyboard-a11y（Card/ToggleList/TimeColumns） |
| 未覆盖组件 | Toast/Drawer/Popover/ConfirmModal/ErrorBoundary/OfflineIndicator/Loading(fullscreen)/ReadOnlyOverlay/IconSvg |
| i18n | ErrorBoundary/OfflineIndicator 接入 useT；ReadOnlyOverlay 默认文案硬编码 |
| 关键问题 | Popover 缺 role/aria-expanded（a11y）；Toast setTimeout 未清理；IconSvg any + solar 重复加载 |

**最重要发现**
1. **Popover 语义缺口未修**：触发器无 aria-haspopup/aria-expanded、卡片无 role——07 审计点仍存在。
2. **测试覆盖偏斜**：12 个组件中仅 4 个有直接挂载 spec，反馈域 7 个组件零直接测试。
3. **Toast/useVoice/useBeep 模块级副作用**：自动挂事件监听 + window 标记，SSR 守卫已处理，但多实例/热更时需注意。
