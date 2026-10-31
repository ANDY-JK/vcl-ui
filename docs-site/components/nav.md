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

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/tabs`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `string \| number` | — | 是 | 受控激活页签值（对应 TabItem 的 value） |
| `items` | `TabItem[]` | — | 是 | 页签列表（TabItem：value/label/icon） |
| `variant` | `'underline' \| 'pills' \| 'card' \| 'tabbar'` | `'underline'` | 否 | 形态：underline 下划线（默认）\| pills 药丸 \| card 卡片 \| tabbar 底部标签栏（移动端，带 icon） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: string \| number` | v-model——切换激活页签 |

## `TabPanel`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/tabs`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string \| number` | — | 是 | 对应 Tabs items 里的 value（item 未设 value 时与 label 一致） |
| `lazy` | `boolean` | `false` | 否 | 懒渲染：首次激活前不渲染内容（重内容/异步内容推荐）；默认 false 全量渲染 |
| `keepAlive` | `boolean` | `true` | 否 | 切走后是否保留 DOM（true = 仅隐藏，表单输入等状态不丢）；默认 true。false = 切走即卸载 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `default` | — | 标签页面板内容 | — |

## `Steps`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/steps`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `steps` | `Step[]` | — | 是 | 步骤列表（Step：title/description/content） |
| `current` | `number` | — | 是 | 当前步（0 起，小于 0 全部待办、超尾全部完成） |
| `direction` | `'horizontal' \| 'vertical'` | `'horizontal'` | 否 | 排列方向（默认水平） |
| `clickable` | `boolean` | `false` | 否 | 是否允许点击步骤跳转 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'step-click'` | `index: number, step: Step` | 点击步骤项时触发（clickable=true 时生效）；kebab-case 与全库事件命名一致 |

## `Pagination`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/pagination`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `number` | — | 是 | 受控当前页（v-model:modelValue，1 起）。超出 `[1, totalPages]` 时组件会把页码拉回合法页并 emit 纠正值（典型：搜索/筛选后总数变小、宿主没重置页码） |
| `total` | `number` | — | 是 | 总条数 |
| `pageSize` | `number` | `10` | 否 | 每页行数（默认 10） |
| `showQuickJumper` | `boolean` | `false` | 否 | 显示页码快速跳转输入框 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: number` | v-model——页码变化 |

## `Breadcrumb`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/breadcrumb`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `Crumb[]` | — | 是 | 面包屑列表（Crumb：label + 可选 path/to，有路径则渲染为路由链接） |
| `separator` | `string` | — | 否 | 自定义分隔符文本；不传时使用 chevron 图标 |

## `Menu`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/menu`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `items` | `MenuItem[]` | — | 是 | 菜单树（MenuItem：key/label/children） |
| `mode` | `'vertical' \| 'horizontal'` | `'vertical'` | 否 | 排列方向（默认 vertical，纵向可折叠子级） |
| `selectedKey` | `string \| number` | — | 否 | 受控选中项 key |
| `collapsed` | `boolean` | — | 否 | 折叠态（纵向：仅显示图标 + 悬停浮层子菜单） |
| `multiple` | `boolean` | `false` | 否 | 允许多个子菜单同时展开（默认关=手风琴） |
| `level` | `number` | `0` | 否 | 嵌套层级（递归子菜单内部用，消费方勿传） |
| `theme` | `'light' \| 'dark'` | `'light'` | 否 | 配色：light 浅色 \| dark 深色（侧栏内嵌时用） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `select` | `item: MenuItem` | 选中菜单项：[MenuItem] |
| `'update:selected-key'` | `key: string \| number` | v-model:selectedKey——受控选中 |

