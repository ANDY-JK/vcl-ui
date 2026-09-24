# 反馈提示（feedback）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `Toast` | 8 | 0 | 0 |
| `Loading` | 9 | 0 | 0 |
| `Popover` | 6 | 0 | 2 |
| `Result` | 5 | 1 | 2 |
| `Drawer` | 11 | 4 | 3 |
| `OfflineIndicator` | 0 | 0 | 0 |
| `ReadOnlyOverlay` | 2 | 0 | 0 |
| `ErrorBoundary` | 3 | 1 | 2 |
| `ConfirmModal` | 8 | 3 | 0 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `beepSuccess` | 成功提示音（上行双音） |
| `beepError` | 错误提示音（低频方波） |
| `beepNotify` | 通知提示音（三连中性音） |
| `beepWarning` | 警告提示音（下行双音） |
| `unlockAudio` | 首次用户交互后显式解锁 AudioContext（浏览器自动播放策略要求；一次解锁永久可用） |
| `speak` | 播报文字；rate 0.1~10，pitch 0~2；lang 指定语言（默认 'zh'），'auto' 为自动检测 |
| `stopSpeak` | 立即停止当前语音播报并丢弃挂起请求 |
| `unlockVoice` | 首次播报/显式解锁时才挂监听并预热 —— 库不得在 import 期改宿主全局状态 |
| `notify` | 发送系统通知——首次调用时请求权限 |
| `getNotifyStatus` | 获取当前通知权限状态 |
| `useToast` | inject 辅助函数 — 在子组件 setup() 中调用获取 Toast API |
| `TOAST_KEY` | provide/inject key |
| `installErrorGuard` | 安装全局错误兜底。 |
| `uninstallErrorGuard` | 注销当前兜底（幂等）：还原宿主 handler + 移除浏览器监听 |

---

## `Toast`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/toast`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `variant` | `'toast' \| 'inline'` | `'toast'` | 否 | 'toast' 全局弹幕 \| 'inline' 内联提示条（替代 Alert） |
| `type` | `'circle-alert' \| 'info' \| 'success' \| 'warning' \| 'error'` | `'circle-alert'` | 否 | 语义类型（决定图标与配色） |
| `title` | `string` | — | 否 | 标题（加粗首行） |
| `message` | `string` | — | 否 | 正文消息 |
| `closable` | `boolean` | `false` | 否 | 显示关闭按钮 |
| `showIcon` | `boolean` | `true` | 否 | 显示语义图标（默认开） |
| `position` | `'top' \| 'top-left' \| 'top-right' \| 'bottom-left' \| 'bottom-right'` | `'top'` | 否 | toast 弹幕出没方位（默认 'top'） |
| `teleportTo` | `string \| HTMLElement` | `'body'` | 否 | Teleport 目标（WC/Shadow DOM 宿主指向自身容器），默认 'body' |

## `Loading`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/loading`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `variant` | `'spinner' \| 'skeleton' \| 'skeleton-text' \| 'skeleton-card'` | `'spinner'` | 否 | 'spinner' 旋转图标 \| 'skeleton' 骨架屏 \| 'skeleton-text' 文字骨架 \| 'skeleton-card' 卡片骨架 |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 否 | spinner 尺寸档位（默认 'md'） |
| `text` | `string` | — | 否 | 加载提示文字 |
| `rows` | `number` | `3` | 否 | skeleton 模式 — 行数 |
| `width` | `string` | `'100%'` | 否 | skeleton 模式 — 自定义宽高 |
| `height` | `string` | `'14px'` | 否 | 骨架块高度（默认 '14px'） |
| `fullscreen` | `boolean` | `false` | 否 | 全屏加载遮罩：fixed 定位 + backdrop-filter + spinner 居中 |
| `overlay` | `boolean` | `true` | 否 | fullscreen 模式 — 遮罩背景色（CSS 颜色或变量，默认半透明黑） |
| `teleportTo` | `string \| HTMLElement` | `'body'` | 否 | Teleport 目标（WC/Shadow DOM 宿主指向自身容器），默认 'body' |

## `Popover`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/popover`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `variant` | `'popover' \| 'tooltip'` | `'popover'` | 否 | 'popover' 卡片弹层 \| 'tooltip' 文字气泡 |
| `title` | `string` | — | 否 | — |
| `trigger` | `'click' \| 'hover' \| 'focus'` | `'click'` | 否 | 'click' \| 'hover' \| 'focus' — tooltip 模式（有 text）时强制 hover |
| `text` | `string` | — | 否 | 纯文字快捷模式 → tooltip 行为 |
| `position` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | 否 | tooltip 方向 |
| `zIndex` | `number \| string` | — | 否 | 浮层 z-index（数字或 CSS 变量字符串）；默认走 --z-dropdown 变量 |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |
| `trigger` | — | — |

## `Result`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/result`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `status` | `'success' \| 'error' \| 'info' \| 'warning' \| '404' \| 'empty'` | — | 是 | 结果类型（决定图标与配色） |
| `title` | `string` | — | 是 | 主标题 |
| `description` | `string` | `''` | 否 | 描述文案 |
| `actionText` | `string` | `''` | 否 | 操作按钮文字（非空才渲染按钮，点击抛 action） |
| `fullWidth` | `boolean` | `false` | 否 | 操作按钮占满宽度 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `action` | `无` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |
| `extra` | — | — |

## `Drawer`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/drawer`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `visible` | `boolean` | — | 是 | 显隐（v-model:visible） |
| `title` | `string` | `''` | 否 | 抽屉标题（标题栏；空串不渲染标题行） |
| `placement` | `'left' \| 'right' \| 'top' \| 'bottom'` | `'right'` | 否 | 滑出方位（默认右侧） |
| `width` | `string` | `'min(380px, 88vw)'` | 否 | 抽屉宽度（默认 'min(380px, 88vw)'） |
| `height` | `string` | `'min(300px, 60vh)'` | 否 | 抽屉高度（上下方位时生效，默认 'min(300px, 60vh)'） |
| `closable` | `boolean` | `true` | 否 | 显示右上角关闭按钮（默认开） |
| `maskClosable` | `boolean` | `true` | 否 | 点遮罩关闭（默认开） |
| `zIndex` | `number` | — | 否 | 遮罩 z-index 覆盖 |
| `destroyOnClose` | `boolean` | `true` | 否 | 关闭即销毁内容（默认开；关掉可保留表单等内部状态） |
| `internal` | `boolean` | `false` | 否 | 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） |
| `mutexScope` | `string` | — | 否 | 弹窗互斥域。同一 scope 的弹窗"新开即关旧"，不同 scope 互不影响。 默认不传 → 全页面全局互斥（历史行为）。需要与其它弹窗共存（如 Drawer 内开确认框）时传独立 scope。 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:visible'` | `v: boolean` | v-model:visible——显隐 |
| `close` | `无` | 请求关闭（关闭按钮/遮罩/Esc） |
| `'after-open'` | `无` | 打开动画完成后（内容需要测量尺寸的场景接这个） |
| `'after-close'` | `无` | 关闭动画完成后 |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |
| `footer` | — | — |
| `header` | — | &#123;&#123; title &#125;&#125; |

## `OfflineIndicator`

> 该组件无 props / events / slots API（纯展示组件）。

## `ReadOnlyOverlay`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `visible` | `boolean` | — | 是 | 显隐 |
| `reason` | `string` | `''` | 否 | 只读原因（空串用内置 i18n 文案） |

## `ErrorBoundary`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/error-boundary`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | `''` | 否 | 错误面板标题（空串用内置 i18n） |
| `retryText` | `string` | `''` | 否 | 重试按钮文字（空串用内置 i18n） |
| `watchKey` | `string \| number` | `undefined` | 否 | 监听值变化时自动重置错误状态（如路由参数、组件 key 等） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `error` | `err: Error` | 子树抛错时通知（已捕获，不冒泡到全局；retry 或 watchKey 变化后恢复） |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | `key` | — |
| `fallback` | `error, retry` | ! &#123;&#123; title \|\| t('errorBoundary.title') &#125; |

## `ConfirmModal`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/confirm-modal`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `visible` | `boolean` | — | 是 | 显隐（v-model:visible） |
| `title` | `string` | — | 否 | 弹窗标题（空串用内置 i18n，语言切换实时跟随） |
| `message` | `string` | — | 是 | 正文消息 |
| `confirmText` | `string` | — | 否 | 确认按钮文字（空串用内置 i18n） |
| `cancelText` | `string` | — | 否 | 取消按钮文字（空串用内置 i18n） |
| `variant` | `'danger' \| 'warning' \| 'primary'` | `'danger'` | 否 | 语义色：danger 危险操作（默认）\| warning 谨慎 \| primary 常规确认 |
| `loading` | `boolean` | `false` | 否 | 确认按钮 loading（等待宿主异步操作期间防重复提交） |
| `closable` | `boolean` | `true` | 否 | 显示右上角关闭按钮（默认开） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:visible'` | `val: boolean` | v-model:visible——显隐 |
| `confirm` | `无` | 点击确认（loading 态由宿主控制） |
| `cancel` | `无` | 点击取消 / 关闭 |

