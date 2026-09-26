# 布局（layout）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `AppLayout` | 3 | 1 | 2 |
| `AccordionNav` | 2 | 0 | 0 |
| `ModalBox` | 17 | 6 | 2 |
| `ConfirmContent` | 5 | 2 | 0 |
| `Flex` | 7 | 0 | 1 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `navTree` | demo 站默认导航树：13 域全组件的分类菜单（消费方应传自己的 navItems 覆盖） |
| `flattenNodes` | 扁平化所有叶子节点（用于路由匹配和上下导航） |
| `getPrevNext` | 根据当前路由获取上一个/下一个组件 |
| `getCategory` | 根据路由获取当前组件所在分类名（返回经 i18n 翻译的显示文案） |
| `getCurrentLabel` | 根据路由获取当前组件名（返回经 i18n 翻译的显示文案） |

---

## `AppLayout`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `navItems` | `NavNode[]` | — | 否 | 侧栏导航树（NavNode[]；不传时渲染空态，不渲染演示菜单） |
| `logoText` | `string` | `() => t('appLayout.logoText')` | 否 | 侧栏 Logo 文字（默认用内置 i18n） |
| `username` | `string` | `''` | 否 | 顶栏显示的用户名 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `logout` | `无` | 点击退出登录（导航跳转由宿主自理） |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `topbar-right` | — | 顶栏右侧用户区；不传则回退基于 username 属性的内置头像 + 用户名 | &#123;&#123; username.charAt(0).toUpperCase() &#125;&#125; &#123; |
| `topbar-tools` | — | 顶栏工具栏左端自定义按钮区 | — |

## `AccordionNav`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `collapsed` | `boolean` | — | 否 | 侧栏折叠态（收起时仅显示图标） |
| `items` | `NavNode[]` | — | 否 | 导航树（不传渲染空态） |

## `ModalBox`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/modal`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `visible` | `boolean` | — | 是 | 显隐（v-model:visible） |
| `title` | `string` | `''` | 否 | 弹窗标题 |
| `modalType` | `'default' \| 'confirm' \| 'form' \| 'detail' \| 'select'` | `'default'` | 否 | 模式：default 自由内容 \| confirm 确认框 \| form 表单 \| detail 明细 \| select 选择 |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | 否 | 尺寸档位（默认 'md'） |
| `closable` | `boolean` | `true` | 否 | 显示关闭按钮（默认开） |
| `maskClosable` | `boolean` | `true` | 否 | 点遮罩关闭（默认开） |
| `zIndex` | `number \| string` | — | 否 | 遮罩 z-index 覆盖 |
| `internal` | `boolean` | `false` | 否 | 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） |
| `mutexScope` | `string` | — | 否 | 弹窗互斥域。同一 scope 的弹窗"新开即关旧"，不同 scope 互不影响。 默认不传 → 全页面全局互斥（历史行为）。需要与其它弹窗共存（如 Drawer 内开确认框）时传独立 scope。 |
| `confirmMessage` | `string` | — | 否 | confirm 模式：正文消息 |
| `confirmVariant` | `'warning' \| 'danger' \| 'info' \| 'success'` | `'warning'` | 否 | confirm 模式：语义色 |
| `confirmDanger` | `boolean` | `false` | 否 | confirm 模式：危险操作（实心红按钮） |
| `confirmLoading` | `boolean` | `false` | 否 | confirm 模式：确认按钮 loading |
| `detailItems` | `DetailItem[]` | `() => []` | 否 | detail 模式：键值对明细列表 |
| `selectItems` | `SelectItem[]` | `() => []` | 否 | select 模式：候选项 |
| `selectValue` | `(string \| number)[]` | `() => []` | 否 | select 模式：受控选中值 |
| `selectMultiple` | `boolean` | `false` | 否 | select 模式：允许多选 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:visible'` | `v: boolean` | v-model:visible——显隐 |
| `confirm` | `无` | confirm 模式点击确认 / form 模式提交前的通用确认 |
| `cancel` | `无` | 点击取消 / 关闭 |
| `'form-submit'` | `无` | form 模式表单提交 |
| `'select-confirm'` | `v: (string \| number)[]` | select 模式点确认：[选中值集合] |
| `close` | `无` | 请求关闭（关闭按钮/遮罩/Esc） |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 模态框主体内容（detail 模式组合详情区另算） | — |
| `footer` | — | 模态框底部按钮区；不传则回退按 mode 类型的内置按钮组（form 模式为取消/提交） | — |

## `ConfirmContent`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `variant` | `'danger' \| 'warning' \| 'primary'` | `'danger'` | 否 | 语义色：danger 危险操作（默认）\| warning 谨慎 \| primary 常规确认 |
| `message` | `string` | — | 是 | 正文消息 |
| `loading` | `boolean` | `false` | 否 | 确认按钮 loading |
| `confirmText` | `string` | — | 否 | 确认按钮文字（空串用内置 i18n，语言切换实时跟随） |
| `cancelText` | `string` | — | 否 | 取消按钮文字（空串用内置 i18n） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `confirm` | `无` | 点击确认 |
| `cancel` | `无` | 点击取消 |

## `Flex`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/flex`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `direction` | `'row' \| 'column' \| 'horizontal' \| 'vertical'` | `'row'` | 否 | 排列方向：'row'/'column'（Flex 原生）或 'horizontal'/'vertical'（Space 兼容） |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | `'start'` | 否 | 主轴对齐 |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch' \| 'baseline'` | `'stretch'` | 否 | 交叉轴对齐 |
| `gap` | `string` | `'var(--space-2)'` | 否 | 子项间距（CSS 间距值，默认令牌 --space-2） |
| `wrap` | `boolean` | `false` | 否 | 允许换行 |
| `flex` | `string` | `'1'` | 否 | 自身 flex 值（默认 '1' 撑满剩余空间） |
| `inline` | `boolean` | `false` | 否 | 行内 flex（inline-flex） |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | Flex 布局子元素 | — |

