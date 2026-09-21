# 导航（nav）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `Tabs` | 3 | 1 | 0 |
| `TabPanel` | 3 | 0 | 1 |
| `Steps` | 4 | 1 | 0 |
| `Pagination` | 4 | 1 | 0 |
| `Breadcrumb` | 2 | 0 | 0 |
| `Menu` | 7 | 2 | 0 |

---

## `Tabs`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `string \| number` | — | 是 | — |
| `items` | `TabItem[]` | — | 是 | — |
| `variant` | `'underline' \| 'pills' \| 'card' \| 'tabbar'` | `'underline'` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: string \| number` | — |

## `TabPanel`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string \| number` | — | 是 | 对应 Tabs items 里的 value（item 未设 value 时与 label 一致） |
| `lazy` | `boolean` | `false` | 否 | 懒渲染：首次激活前不渲染内容（重内容/异步内容推荐）；默认 false 全量渲染 |
| `keepAlive` | `boolean` | `true` | 否 | 切走后是否保留 DOM（true = 仅隐藏，表单输入等状态不丢）；默认 true。false = 切走即卸载 |

### Slots

| 插槽 | 作用域参数 | 兜底内容预览 |
| --- | --- | --- |
| `default` | — | — |

## `Steps`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `steps` | `Step[]` | — | 是 | — |
| `current` | `number` | — | 是 | — |
| `direction` | `'horizontal' \| 'vertical'` | `'horizontal'` | 否 | — |
| `clickable` | `boolean` | `false` | 否 | 是否允许点击步骤跳转 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'step-click'` | `index: number, step: Step` | 点击步骤项时触发（clickable=true 时生效）；kebab-case 与全库事件命名一致 |

## `Pagination`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `number` | — | 是 | — |
| `total` | `number` | — | 是 | — |
| `pageSize` | `number` | `10` | 否 | — |
| `showQuickJumper` | `boolean` | `false` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: number` | — |

## `Breadcrumb`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `Crumb[]` | — | 是 | — |
| `separator` | `string` | — | 否 | 自定义分隔符文本；不传时使用 chevron 图标 |

## `Menu`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `MenuItem[]` | — | 是 | — |
| `mode` | `'vertical' \| 'horizontal'` | `'vertical'` | 否 | — |
| `selectedKey` | `string \| number` | — | 否 | — |
| `collapsed` | `boolean` | — | 否 | — |
| `multiple` | `boolean` | `false` | 否 | — |
| `level` | `number` | `0` | 否 | — |
| `theme` | `'light' \| 'dark'` | `'light'` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `select` | `item: MenuItem` | — |
| `'update:selectedKey'` | `key: string \| number` | — |

