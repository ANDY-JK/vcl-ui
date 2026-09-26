# 基础组件（basic）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `Button` | 8 | 1 | 1 |
| `IconSvg` | 0 | 0 | 0 |
| `Tag` | 13 | 1 | 1 |

---

## `Button`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/button`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | — | 否 | 按钮文字（与 default 插槽二选一，插槽优先） |
| `variant` | `'primary' \| 'secondary' \| 'outline' \| 'danger' \| 'ghost'` | `'primary'` | 否 | 语义形态：primary 实心主色 \| secondary 实心次色 \| outline 描边 \| danger 危险 \| ghost 幽灵 |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 否 | 尺寸档位（默认 'md'） |
| `icon` | `string` | — | 否 | 前置图标（IconSvg 图标名） |
| `disabled` | `boolean` | `false` | 否 | 禁用 |
| `loading` | `boolean` | `false` | 否 | 加载态（转圈 + 禁点，不改变宽度） |
| `block` | `boolean` | `false` | 否 | 块级（撑满整行） |
| `showArrow` | `boolean` | `false` | 否 | 文字后显示箭头（「下一步」类场景） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `click` | `e: MouseEvent` | 点击（loading/disabled 期间不触发） |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 按钮内容（文字 + 图标组合亦可） | — |

## `IconSvg`

> 该组件无 props / events / slots API（纯展示组件）。

## `Tag`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/tag`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | — | 否 | 文字内容（内联模式） |
| `variant` | `'default' \| 'primary' \| 'success' \| 'danger' \| 'warning' \| 'info'` | `'default'` | 否 | 变体颜色 |
| `size` | `'sm' \| 'md'` | `'md'` | 否 | 尺寸 |
| `closable` | `boolean` | `false` | 否 | 可关闭 |
| `rounded` | `boolean` | `false` | 否 | 圆角药丸 |
| `dot` | `boolean` | `false` | 否 | 纯圆点模式 |
| `max` | `number` | `99` | 否 | 数字溢出上限，如 99 → 99+，仅当 text 为纯数字或 count 生效时生效 |
| `count` | `number` | — | 否 | 数字徽标：显示数量；与 text 同时传入时 text 优先 |
| `color` | `string` | — | 否 | 自定义背景色（CSS 颜色或变量，默认随 variant） |
| `offset` | `[number, number]` | — | 否 | 角标偏移 [x, y]：正 x 向右、正 y 向下（仅 sup 角标模式生效） |
| `showZero` | `boolean` | `false` | 否 | count=0 时仍显示（默认 count=0 隐藏） |
| `hidden` | `boolean` | `false` | 否 | 强制隐藏 |
| `sup` | `boolean` | `false` | 否 | 角标模式：包裹内容时角标定位在右上角（原 Badge 的核心功能） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `close` | `无` | 点击关闭按钮（仅 closable 时出现） |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 内联标签显示内容；不传则回退 text 属性 | &#123;&#123; displayText &#125;&#125; |

