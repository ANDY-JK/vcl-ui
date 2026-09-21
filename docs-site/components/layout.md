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
| `navTree` | — |
| `flattenNodes` | 扁平化所有叶子节点（用于路由匹配和上下导航） |
| `getPrevNext` | 根据当前路由获取上一个/下一个组件 |
| `getCategory` | 根据路由获取当前组件所在分类名（返回经 i18n 翻译的显示文案） |
| `getCurrentLabel` | 根据路由获取当前组件名（返回经 i18n 翻译的显示文案） |

---

## `AppLayout`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `navItems` | `NavNode[]` | — | 否 | — |
| `logoText` | `string` | `() => t('appLayout.logoText')` | 否 | — |
| `username` | `string` | `''` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `logout` | `无` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `topbar-right` | — | {{ username.charAt(0).toUpperCase() }} { |
| `topbar-tools` | — | — |

## `AccordionNav`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `collapsed` | `boolean` | — | 否 | — |
| `items` | `NavNode[]` | — | 否 | — |

## `ModalBox`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `visible` | `boolean` | — | 是 | — |
| `title` | `string` | `''` | 否 | — |
| `modalType` | `'default' \| 'confirm' \| 'form' \| 'detail' \| 'select'` | `'default'` | 否 | — |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | 否 | — |
| `closable` | `boolean` | `true` | 否 | — |
| `maskClosable` | `boolean` | `true` | 否 | — |
| `zIndex` | `number \| string` | — | 否 | — |
| `internal` | `boolean` | `false` | 否 | 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） |
| `mutexScope` | `string` | — | 否 | 弹窗互斥域。同一 scope 的弹窗"新开即关旧"，不同 scope 互不影响。 默认不传 → 全页面全局互斥（历史行为）。需要与其它弹窗共存（如 Drawer 内开确认框）时传独立 scope。 |
| `confirmMessage` | `string` | — | 否 | — |
| `confirmVariant` | `'warning' \| 'danger' \| 'info' \| 'success'` | `'warning'` | 否 | — |
| `confirmDanger` | `boolean` | `false` | 否 | — |
| `confirmLoading` | `boolean` | `false` | 否 | — |
| `detailItems` | `DetailItem[]` | `() => []` | 否 | — |
| `selectItems` | `SelectItem[]` | `() => []` | 否 | — |
| `selectValue` | `(string \| number)[]` | `() => []` | 否 | — |
| `selectMultiple` | `boolean` | `false` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:visible'` | `v: boolean` | — |
| `confirm` | `无` | — |
| `cancel` | `无` | — |
| `'form-submit'` | `无` | — |
| `'select-confirm'` | `v: (string \| number)[]` | — |
| `close` | `无` | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |
| `footer` | — | — |

## `ConfirmContent`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `variant` | `'danger' \| 'warning' \| 'primary'` | `'danger'` | 否 | — |
| `message` | `string` | — | 是 | — |
| `loading` | `boolean` | `false` | 否 | — |
| `confirmText` | `string` | — | 否 | — |
| `cancelText` | `string` | — | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `confirm` | `无` | — |
| `cancel` | `无` | — |

## `Flex`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `direction` | `'row' \| 'column' \| 'horizontal' \| 'vertical'` | `'row'` | 否 | 排列方向：'row'/'column'（Flex 原生）或 'horizontal'/'vertical'（Space 兼容） |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | `'start'` | 否 | — |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch' \| 'baseline'` | `'stretch'` | 否 | — |
| `gap` | `string` | `'var(--space-2)'` | 否 | — |
| `wrap` | `boolean` | `false` | 否 | — |
| `flex` | `string` | `'1'` | 否 | — |
| `inline` | `boolean` | `false` | 否 | — |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |

