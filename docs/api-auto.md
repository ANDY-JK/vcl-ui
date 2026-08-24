# API 文档

> **本文档为历史快照（生成时间 2026-08-19，组件数量 55）。原生成脚本 `scripts/gen-api-docs.mjs` 已不在仓库，如需更新请手动编辑本文档。**

---

## 基础组件

### Button

保护 — 按钮，禁止：clamp() 尺寸 → px，variant/size 枚举修改

> 源码：`src/components/basic/Button.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| text | — | `string` | — |
| variant | — | `'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'` | `'primary'` |
| size | — | `'sm' | 'md' | 'lg'` | `'md'` |
| icon | — | `string` | — |
| disabled | — | `boolean` | `false` |
| loading | — | `boolean` | `false` |
| block | — | `boolean` | `false` |
| showArrow | — | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| click | `e: MouseEvent` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| default | 默认插槽 |

---

### IconSvg

> 源码：`src/components/basic/IconSvg.vue`

*无 Props/Emits/Slots*

---

### Tag

保护 — 标签+徽标合一，禁止：clamp() → px，variant 枚举修改

> 源码：`src/components/basic/Tag.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| text | 文字内容（内联模式） | `string` | — |
| variant | 变体颜色 | `'default' | 'primary' | 'success' | 'danger' | 'warning' | 'info'` | `'default'` |
| size | 尺寸 | `'sm' | 'md'` | `'md'` |
| closable | 可关闭 | `boolean` | `false` |
| rounded | 圆角药丸 | `boolean` | `false` |
| dot | 纯圆点模式 | `boolean` | `false` |
| max | 数字溢出上限，如 99 → 99+，仅当 text 为纯数字或 count 生效时生效 | `number` | `99` |
| count | 数字徽标：显示数量；与 text 同时传入时 text 优先 | `number` | — |
| color | 自定义背景色（CSS 颜色或变量，默认随 variant） | `string` | — |
| offset | 角标偏移 [x, y]：正 x 向右、正 y 向下（仅 sup 角标模式生效） | `[number, number]` | — |
| showZero | count=0 时仍显示（默认 count=0 隐藏） | `boolean` | `false` |
| hidden | 强制隐藏 | `boolean` | `false` |
| sup | 角标模式：包裹内容时角标定位在右上角（原 Badge 的核心功能） | `boolean` | `false` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| default | 默认插槽 |

---

## 表单组件

### CameraCapture

保护 — 页面内拍照组件，参照原生相机布局：中间快门键，取消/重拍/翻转等

> 源码：`src/components/form/CameraCapture.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| modelValue | 显隐控制（v-model） | `boolean` | `false` |
| quality | JPEG 输出质量 0-1，默认 0.9 | `number` | `0.9` |
| fallbackOnError | 页面内相机不可用（权限拒绝/无摄像头/非 HTTPS）时自动降级调起设备系统相机，默认 true | `boolean` | `true` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: boolean` |
| capture | `file: File` |
| error | `message: string` |

---

### Group

════════════════════════════════════════════════

> 源码：`src/components/form/Group.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| type | 统一类型：radio | checkbox | switch | rate | slider | `'radio' | 'checkbox' | 'switch' | 'rate' | 'slider'` | `'radio'` |
| modelValue | — | `string | number | boolean | (string | number | boolean)[] | [number, number]` | — |
| options | radio / checkbox 模式选项列表 | `Option[]` | `() => []` |
| direction | radio / checkbox 排列方向 | `'vertical' | 'horizontal'` | `'vertical'` |
| disabled | — | `boolean` | `false` |
| max | checkbox 最多选几项，0 = 不限 | `number` | `0` |
| ariaLabel | 分组标签（无障碍） | `string` | `''` |
| label | switch 标签文字 | `string` | — |
| size | switch 尺寸 | `'sm' | 'md'` | `'md'` |
| rateMax | rate 最大值，默认 5 | `number` | `5` |
| allowHalf | rate 是否允许半星 | `boolean` | `false` |
| color | rate 颜色 | `string` | `'#F59E0B'` |
| min | slider 最小值 | `number` | `0` |
| sliderMax | slider 最大值（与 checkbox max 区分） | `number` | `100` |
| step | slider 步进 | `number` | `1` |
| showValue | slider 显示当前值 | `boolean` | `true` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: GroupValue` |
| change | `v: GroupValue` |

---

### IconPicker

保护 — 图标选择器，禁止：clamp() → px，搜索过滤逻辑删除，图标列表导入

> 源码：`src/components/form/IconPicker.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| modelValue | — | `string` | `'star'` |
| color | — | `string` | `'#6366F1'` |
| bgColor | — | `string` | `'#EAECF0'` |
| placeholder | 触发按钮占位文字 | `string` | `'选择图标'` |
| presetColors | 预定义色板 | `string[]` | `() => ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4']` |
| provider | 图标提供者 | `'lucide' | 'solar'` | `'lucide'` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: string` |
| update:color | `v: string` |
| update:bgColor | `v: string` |
| update:provider | `v: 'lucide' | 'solar'` |
| change | `v: { icon: string; color: string; bgColor: string }` |

---

### Input

保护 — 统一输入组件，禁止：clamp() → px，浮动标签动画时序，type 枚举修改

> 源码：`src/components/form/Input.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| type | 统一类型：text | password | email | tel | number | textarea | search | url | `'text' | 'password' | 'email' | 'tel' | 'number' | 'textarea' | 'search' | 'url'` | `'text'` |
| modelValue | — | `string | number | null` | — |
| label | — | `string` | — |
| icon | — | `string` | — |
| placeholder | — | `string` | `''` |
| disabled | — | `boolean` | `false` |
| readonly | — | `boolean` | `false` |
| rules | 校验规则 | `((v: string) => string | undefined)[]` | `() => []` |
| hint | — | `string` | — |
| name | HTML name 属性 | `string` | — |
| autocomplete | HTML autocomplete | `string` | `'off'` |
| stepper | 数字模式：显示加减按钮 | `boolean` | `false` |
| min | 数字模式：最小值 | `number | null` | `null` |
| max | 数字模式：最大值 | `number | null` | `null` |
| step | 数字模式：步进值 | `number` | `1` |
| precision | 数字模式：小数位数 | `number` | `undefined` |
| size | 数字模式：尺寸 | `'sm' | 'md' | 'lg'` | `'md'` |
| clearable | — | `boolean` | `false` |
| maxlength | — | `number` | — |
| minlength | — | `number` | — |
| rows | textarea 行数 | `number` | `3` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: string | number | null` |
| focus | `e: FocusEvent` |
| blur | `e: FocusEvent` |
| keyup | `e: KeyboardEvent` |
| change | `v: string | number | null` |

---

### Select

触发器

> 源码：`src/components/form/Select.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| type | 模式 | `'select' | 'menu' | 'combobox' | 'cascader' | 'tree-select' | 'date' | 'date-range' | 'time'` | `'select'` |
| modelValue | — | `string | number | (string | number | boolean)[] | [string, string] | null` | — |
| options | — | `Option[]` | `() => []` |
| label | — | `string` | — |
| rules | — | `((v: string) => string | undefined)[]` | `() => []` |
| error | — | `string` | — |
| multiple | — | `boolean` | `false` |
| placeholder | — | `string` | `'请选择'` |
| searchable | — | `boolean` | `true` |
| pinyinEnabled | — | `boolean` | `true` |
| isLoading | — | `boolean` | `false` |
| emptyText | — | `string` | `'暂无匹配项'` |
| allowCreate | — | `boolean` | `true` |
| clearOnFocus | — | `boolean` | `false` |
| items | — | `MenuItem[]` | `() => []` |
| cascaderOptions | — | `CascaderOption[]` | — |
| disabled | — | `boolean` | `false` |
| zIndex | — | `string` | — |
| format | — | `string` | `'YYYY-MM-DD'` |
| dateMin | — | `string` | `''` |
| dateMax | — | `string` | `''` |
| rangePlaceholder | — | `[string, string]` | `() => ['开始日期', '结束日期'] as [string, string]` |
| timeStep | — | `number` | `1` |
| clearable | — | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: SelectModelValue` |
| change | `v: SelectModelValue` |
| visibleChange | `v: boolean` |

---

### Upload

保护 — 文件上传，禁止：clamp() → px，拖拽区尺寸比例，进度条动画

> 源码：`src/components/form/Upload.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| accept | 接受的文件类型：默认图片；传空字符串 = 全部类型（含目录里的文件） | `string` | `'image/*'` |
| multiple | — | `boolean` | `false` |
| maxSize | — | `number // MB` | `10` |
| minSize | — | `number // KB` | — |
| disabled | — | `boolean` | `false` |
| drag | — | `boolean` | `true` |
| modelValue | — | `UploadFile[]` | `() => []` |
| customRequest | — | `(file: File) => Promise<{ url: string }>` | `undefined` |
| variant | 'default' 标准上传区 | 'card' 紧凑方块卡片 | `'default' | 'card'` | `'default'` |
| label | card 模式下的显示标签 | `string` | `''` |
| directory | 目录选择模式（webkitdirectory）：选择整个文件夹上传（隐式多文件），仍按 accept 校验每个文件 | `boolean` | `false` |
| mobileMenu | 触屏设备点击弹「拍照/相册/文件」菜单（安卓系统选择器无相机入口，以此补齐拍照能力）；桌面不受影响 | `boolean` | `false` |
| compress | 图片压缩：开启后图片文件会经过 canvas 压缩再上传（移动端尤其需要） | `boolean` | `false` |
| maxWidth | 图片压缩最大宽度（px），超过时等比缩小；默认 1920 | `number` | `1920` |
| compressQuality | 图片压缩质量 0-1；默认 0.85 | `number` | `0.85` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| change | `files: UploadFile[]` |
| remove | `file: UploadFile` |
| error | `message: string` |
| update:modelValue | `files: UploadFile[]` |
| preview | `url: string` |

---

## 布局组件

### AccordionNav

保护 — 手风琴导航，禁止：展开/折叠逻辑修改，navData 结构破坏

> 源码：`src/components/layout/AccordionNav.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| collapsed | — | `boolean; items?: NavNode[]` | — |

---

### AppLayout

保护 — 布局骨架，禁止：clamp() → px，侧边栏结构/宽度 → 硬编码，slot 层级修改

> 源码：`src/components/layout/AppLayout.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| navItems | — | `NavNode[]` | — |
| logoText | — | `string` | `'Vue 组件库'` |
| username | — | `string` | `''` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| topbar-tools | — |
| topbar-right | — |

---

### Flex

Flex — 弹性布局容器（已合并原 Space 组件功能：direction='horizontal'/'vertical' 自动映射）

> 源码：`src/components/layout/Flex.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| direction | 排列方向：'row'/'column'（Flex 原生）或 'horizontal'/'vertical'（Space 兼容） | `'row' | 'column' | 'horizontal' | 'vertical'` | `'row'` |
| justify | — | `'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'` | `'start'` |
| align | — | `'start' | 'center' | 'end' | 'stretch' | 'baseline'` | `'stretch'` |
| gap | — | `string` | `'var(--space-2)'` |
| wrap | — | `boolean` | `false` |
| flex | — | `string` | `'1'` |
| inline | — | `boolean` | `false` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| default | 默认插槽 |

---

### MiniLayout

保护 — 最小化布局骨架，禁止：clamp() → px，结构层级修改

> 源码：`src/components/layout/MiniLayout.vue`

*无 Props/Emits/Slots*

---

### ModalBox

保护 — 模态框，禁止：clamp() → px，动画时序修改，z-index 层级

> 源码：`src/components/layout/ModalBox.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| visible | — | `boolean` | — |
| title | — | `string` | `''` |
| modalType | — | `'default' | 'confirm' | 'form' | 'detail' | 'select'` | `'default'` |
| size | — | `'sm' | 'md' | 'lg' | 'xl'` | `'md'` |
| closable | — | `boolean` | `true` |
| maskClosable | — | `boolean` | `true` |
| zIndex | — | `number | string` | — |
| internal | 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） | `boolean` | `false` |
| confirmMessage | — | `string` | — |
| confirmVariant | — | `'warning' | 'danger' | 'info' | 'success'` | `'warning'` |
| confirmDanger | — | `boolean` | `false` |
| confirmLoading | — | `boolean` | `false` |
| detailItems | — | `DetailItem[]` | `() => []` |
| selectItems | — | `SelectItem[]` | `() => []` |
| selectValue | — | `(string | number)[]` | `() => []` |
| selectMultiple | — | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:visible | `v: boolean` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| default | 默认插槽 |

---

### Space

Space — 已合并到 Flex，此文件为语法糖（direction='horizontal'/'vertical' → Flex）

> 源码：`src/components/layout/Space.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| direction | 排列方向，默认 'horizontal' | `'horizontal' | 'vertical'` | `'horizontal'` |
| gap | 间距（CSS 值），默认 'var(--space-2)' | `string` | `'var(--space-2)'` |
| align | 对齐方式，默认 'start' | `'start' | 'center' | 'end' | 'stretch'` | `'start'` |
| wrap | 是否换行，默认 false | `boolean` | `false` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| default | 默认插槽 |

---

## 导航组件

### Breadcrumb

保护 — 面包屑，禁止：clamp() → px，RouterLink 路径逻辑

> 源码：`src/components/nav/Breadcrumb.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| items | — | `Crumb[]` | — |
| separator | 自定义分隔符文本；不传时使用 chevron 图标 | `string` | — |

---

### Menu

保护 — 多级菜单，禁止：递归渲染结构，hover/click 展开逻辑

> 源码：`src/components/nav/Menu.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| items | — | `MenuItem[]` | — |
| mode | — | `'vertical' | 'horizontal'` | `'vertical', multiple: false, level: 0, theme: 'light'` |
| selectedKey | — | `string | number` | — |
| collapsed | — | `boolean` | — |
| multiple | — | `boolean` | — |
| level | — | `number` | — |
| theme | — | `'light' | 'dark'` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| select | `item: MenuItem` |
| update:selectedKey | `key: string | number` |

---

### Pagination

保护 — 分页，禁止：clamp() → px，页码计算逻辑，ellipsis 行为

> 源码：`src/components/nav/Pagination.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| modelValue | — | `number` | — |
| total | — | `number` | — |
| pageSize | — | `number` | `10` |
| showQuickJumper | — | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: number` |

---

### Steps

保护 — 步骤条，禁止：clamp() → px，Step 接口，连线样式

> 源码：`src/components/nav/Steps.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| steps | — | `Step[]` | — |
| current | — | `number` | — |
| direction | — | `'horizontal' | 'vertical'` | `'horizontal'` |
| clickable | 是否允许点击步骤跳转 | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| stepClick | `index: number, step: Step` |

---

### Tabs

保护 — 标签页，禁止：clamp() → px，active 指示器动画，TabItem 接口

> 源码：`src/components/nav/Tabs.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| modelValue | — | `string | number` | — |
| items | — | `TabItem[]` | — |
| variant | — | `'underline' | 'pills' | 'card' | 'tabbar'` | `'underline'` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: string | number` |

---

## 数据展示

### Avatar

保护 — 头像，禁止：clamp() 尺寸 → px，fallback 文字逻辑

> 源码：`src/components/data/Avatar.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| src | — | `string` | — |
| name | — | `string` | — |
| size | — | `'sm' | 'md' | 'lg' | 'xl'` | `'md'` |
| shape | — | `'circle' | 'rounded'` | `'circle'` |

---

### Card

保护 — 卡片，禁止：clamp() → px，grid/flex 模式切换逻辑

> 源码：`src/components/data/Card.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| type | — | `'grid' | 'stat'` | `'grid'` |
| title | — | `string` | — |
| highlight | — | `boolean` | — |
| summary | — | `boolean` | — |
| overflowVisible | 允许内容溢出卡片边界（用于包含下拉/弹出组件的场景） | `boolean` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| click | `—` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| header | — |
| footer | — |
| default | 默认插槽 |

---

### Collapse

保护 — 折叠面板，禁止：动画时序，展开/折叠逻辑，chevron 旋转

> 源码：`src/components/data/Collapse.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| title | — | `string` | — |
| open | — | `boolean` | `false` |
| disabled | — | `boolean` | `false` |
| id | 面板唯一标识，用于 aria-controls / aria-labelledby 关联 | `string` | `''` |
| accordion | 手风琴模式标记：配合外部 CollapseGroup 使用，展开时自动关闭同组其他面板 | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:open | `v: boolean` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| default | 默认插槽 |

---

### DataTable

内部异常兜底 — 组件内部异常不导致页面崩溃

> 源码：`src/components/data/DataTable.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| columns | — | `Column[]` | — |
| data | — | `T[]` | — |
| rowKey | — | `string` | `'seq'` |
| striped | — | `boolean` | `true` |
| bordered | — | `boolean` | `true` |
| hoverable | — | `boolean` | `true` |
| isLoading | — | `boolean` | `false` |
| emptyText | — | `string` | `''` |
| sortKey | — | `string` | — |
| sortOrder | — | `'asc' | 'desc'` | — |
| pinyinSearch | — | `boolean` | `true` |
| truncateThreshold | — | `number` | `0` |
| selectable | — | `boolean` | `false` |
| selectedKeys | — | `string[]` | `() => []` |
| excelExportable | — | `boolean` | `false` |
| pageSize | 导出范围：'all' 筛选后全量（默认），'page' 仅当前页 | `number` | `0` |
| currentPage | — | `number` | `1` |
| total | — | `number` | — |
| cardBreakpoint | — | `number` | `768` |
| maxHeight | — | `string` | `''` |
| autoHeight | 自适应高度：填充父容器剩余空间（需父容器有明确高度） | `boolean` | `true` |
| virtualScroll | — | `boolean` | `true` |
| autoFit | — | `boolean` | `true` |
| truncateMode | — | `'ellipsis' | 'wrap' | 'none'` | `'ellipsis'` |
| dense | — | `boolean` | `false` |
| colSettings | 列设置按钮（默认显示，false 可隐藏） | `boolean` | `true` |
| cellSelection | 单元格矩形选区：长按/拖拽框选 + 拖选自动滚动（默认开启） | `boolean` | `true` |
| keyboardNav | 键盘导航：方向键移动/Shift 扩展/Enter 编辑/Delete 清空/Ctrl+Home/End（默认开启） | `boolean` | `true` |
| cellContextMenu | 单元格右键菜单：复制/粘贴/清空（默认开启） | `boolean` | `true` |
| summary | 汇总行：函数形式用 props.data 计算（仅客户端模式可用）；服务端分页请传对象（后端算好汇总值） | `((rows: T[]) => Record<string, string | number>) | Record<string, string | number>` | — |
| storage | 存储适配器，默认 localStorage；SaaS 场景可传入按账号隔离的实现 | `TableStorage` | — |
| namespace | 存储命名空间，同页面多实例时用于隔离持久化数据 | `string` | — |
| persistence | 持久化模式：'auto' 自动判断（sortKey 受控/searchMode='server'/filterMode='server' → 禁用），'none' 强制禁用内部 IndexedDB | `'auto' | 'none'` | `'auto' as 'auto' | 'none'` |
| editable | 单元格编辑模式：双击进入编辑，Enter 确认，Escape 取消 | `boolean` | `false` |
| noteMode | 备注提示模式：hover 显示备注，点击填写 | `boolean` | `false` |
| notes | 外部传入的备注数据 | `Record<string, Record<string, string>>` | `() => ({})` |
| rowActions | 行操作按钮：添加后在每行末尾渲染操作列 | `RowAction[]` | — |
| rowContextActions | 行右键菜单项：右键点击数据行时显示的自定义操作 | `RowContextAction[]` | — |
| originalTooltip | @patch 2026-07-15 原始值气泡：hover 已编辑单元格时弹出原始值供对比（需 editable 开启） | `boolean` | `false` |
| modifiedMark | @patch 2026-07-15 已编辑标记：被修改过的单元格右上角显示三角角标 | `boolean` | `false` |
| imageDomains | 图片域名白名单，isImageUrl 判图用。默认覆盖常见 CDN | `string[]` | `() => []` |
| searchMode | 搜索模式：'client' 客户端本地过滤，'server' 抛 search 事件由后端处理 | `'client' | 'server'` | `'client'` |
| filterMode | 筛选模式：'client' 客户端本地过滤，'server' 只抛 filter 事件由后端处理 | `'client' | 'server'` | `'client'` |
| filters | 外部筛选状态（v-model:filters）：服务端模式下父组件可程序化控制筛选，变化时自动同步到内部 filterState | `Record<string, string[]>` | — |
| onExport | 服务端导出回调：存在时点击导出按钮调用此函数（后端返全量数据下载），不执行内置 CSV 导出 | `() => void` | — |
| rowClass | — | `(row: T, index: number) => string` | — |
| rowStyle | — | `(row: T, index: number) => Record<string, string>` | — |
| cellClass | — | `(colKey: string, row: T, index: number) => string` | — |
| cellStyle | — | `(colKey: string, row: T, index: number) => Record<string, string>` | — |
| shotMode | 截图行为模式：'preview' 弹窗预览 | 'download' 直接下载 | 'copy' 直接复制到剪贴板 | `'preview' | 'download' | 'copy'` | `'preview' as 'preview' | 'download' | 'copy'` |
| screenshotMaxRows | 截图最大行数（超过提醒用户先筛选，避免生成超大 canvas 卡死） | `number` | `400` |
| onToggleSidebar | 全屏时收起宿主侧边栏的回调（不传则尝试 inject('toggleCollapse') 降级） | `() => void` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| sort | `key: string, order: 'asc' | 'desc'` |
| filter | `filters: Record<string, string[]>` |
| update:filters | `filters: Record<string, string[]>` |
| rowClick | `row: Record<string, any>, index: number` |
| update:selectedKeys | `keys: string[]` |
| update:currentPage | `page: number` |
| pageChange | `page: number, pageSize: number` |
| selectionChange | `keys: string[], rows: Record<string, any>[]` |
| cellChange | `rowKey: string, colKey: string, newValue: string` |
| cellNote | `rowKey: string, colKey: string, note: string` |
| batchChange | `colKey: string, newValue: string, rowKeys: string[]` |
| rowAction | `actionKey: string, row: Record<string, any>, index: number` |
| rowContextAction | `actionKey: string, row: Record<string, any>, index: number` |
| search | `term: string` |
| fullscreenChange | `isFullscreen: boolean` |

---

### Divider

保护 — 分割线，禁止：clamp() margin → px，dashed/solid 样式

> 源码：`src/components/data/Divider.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| text | — | `string` | — |
| direction | — | `'horizontal' | 'vertical'` | `'horizontal'` |
| dashed | — | `boolean` | `false` |

---

### Empty

Empty — 空状态占位

> 源码：`src/components/data/Empty.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| icon | 图标类型，默认 'file' | `string` | `'file'` |
| title | 标题 | `string` | `''` |
| description | 描述文本 | `string` | `''` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| default | 默认插槽 |

---

### Image

保护 — 图片，禁止：lazy loading 逻辑删除，尺寸比例，fallback 占位

> 源码：`src/components/data/Image.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| src | — | `string` | — |
| alt | — | `string` | `''` |
| width | 图片宽度 | `number` | — |
| height | 图片高度 | `number` | — |
| size | 默认尺寸（宽高未设时） | `number` | `80` |
| fit | object-fit | `'cover' | 'contain' | 'fill' | 'none' | 'scale-down'` | `'cover'` |
| radius | 圆角 | `number` | — |
| round | 圆形 | `boolean` | — |
| lazy | 是否懒加载 | `boolean` | `true` |
| preview | 点击放大预览 | `boolean` | `true` |
| loadingText | 加载中文本 | `string` | `''` |
| errorText | 加载失败文本 | `string` | `''` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| load | `src: string` |
| error | `src: string` |
| click | `src: string` |

---

### ImagePreview

顶部栏

> 源码：`src/components/data/ImagePreview.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| src | 图片源：字符串/对象 = 单图，数组 = 多图 | `ImageSrc` | — |
| initialIndex | — | `number` | `0` |
| title | — | `string` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| change | `index: number` |

---

### ProgressBar

ProgressBar — 进度条 / 滑块（interactive 模式）

> 源码：`src/components/data/ProgressBar.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| percent | — | `number` | `0` |
| variant | — | `'primary' | 'success' | 'warning' | 'danger'` | `'primary'` |
| showText | — | `boolean` | `true` |
| height | — | `number` | `6` |
| striped | — | `boolean` | `false` |
| animated | — | `boolean` | `false` |
| interactive | — | `boolean` | `false` |
| modelValue | — | `number` | `0` |
| min | — | `number` | `0` |
| max | — | `number` | `100` |
| step | — | `number` | `1` |
| disabled | — | `boolean` | `false` |
| showInput | — | `boolean` | `false` |
| showStops | — | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:modelValue | `v: number` |
| change | `v: number` |

---

### Skeleton

保护 — 骨架屏，禁止：流光动画时序、行高/头像比例改动

> 源码：`src/components/data/Skeleton.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| loading | 加载中显示骨架；false 时渲染默认插槽的真实内容 | `boolean` | `true` |
| rows | 文本行数（title 之外） | `number` | `3` |
| animated | 流光动画（prefers-reduced-motion 下自动禁用） | `boolean` | `true` |
| avatar | 头像：false 无 | true 默认 40px | number 像素 | 'sm'|'md'|'lg' 或任意 CSS 尺寸 | `AvatarSize` | `false` |
| title | 首行加宽标题 | `boolean` | `true` |
| width | 自定义骨架块宽度 | `string` | — |
| height | 自定义骨架块高度 | `string` | — |

---

### ToggleList

保护 — 切换列表，禁止：clamp() → px，展开/折叠动画

> 源码：`src/components/data/ToggleList.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| items | — | `Record<string, any>[]` | — |
| idKey | — | `string` | `'id'` |
| titleField | — | `string` | `'display_name'` |
| descriptionField | — | `string` | `'description'` |
| iconField | — | `string` | `'icon'` |
| toggleField | — | `string` | `'is_enabled'` |
| extraColumns | — | `ExtraColumn[]` | `() => []` |
| disabled | — | `boolean` | `false` |
| isLoading | — | `boolean` | `false` |
| emptyText | — | `string` | `'暂无数据'` |
| variant | 'switch' = 开关列表, 'button' = 操作按钮（发快递等场景） | `'switch' | 'button'` | `'switch'` |
| buttonLabel | variant='button' 时按钮文字 | `string` | `'发快递'` |
| phoneField | variant='button' 时手机号字段 | `string` | `'phone'` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| toggle | `item: Record<string, any>, newValue: boolean` |
| itemClick | `item: Record<string, any>` |
| buttonClick | `payload: { name: string; phone: string; address: string; item: Record<string, any> }` |

---

### Tree

保护 — 树形控件，禁止：clamp() → px，递归渲染结构

> 源码：`src/components/data/Tree.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| data | — | `TreeNode[]` | — |
| level | — | `number` | `0` |
| checkable | — | `boolean` | `false` |
| defaultExpandedKeys | — | `(string | number)[]` | `() => []` |
| expandAll | — | `boolean` | `false` |
| selectable | — | `boolean` | `false` |
| selectedKey | — | `string | number | null` | `null` |
| lazy | 懒加载：展开节点时若无 children 且 isLeaf 非 true，触发 load 事件 | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:selectedKey | `key: string | number | null` |
| load | `node: TreeNode` |

---

## 反馈组件

### ConfirmModal

消息区：图标 + 彩色左边框

> 源码：`src/components/feedback/ConfirmModal.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| visible | — | `boolean` | — |
| title | — | `string` | `'确认操作'` |
| message | — | `string` | — |
| confirmText | — | `string` | `'确定'` |
| cancelText | — | `string` | `'取消'` |
| variant | — | `'danger' | 'warning' | 'primary'` | `'danger'` |
| loading | — | `boolean` | `false` |
| closable | — | `boolean` | `true` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:visible | `val: boolean` |

---

### Drawer

保护 — 抽屉组件，禁止：clamp() → px，动画时序，z-index，宽度断点

> 源码：`src/components/feedback/Drawer.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| visible | — | `boolean` | — |
| title | — | `string` | `''` |
| placement | — | `'left' | 'right' | 'top' | 'bottom'` | `'right'` |
| width | — | `string` | `'min(380px, 88vw)'` |
| height | — | `string` | `'min(300px, 60vh)'` |
| closable | — | `boolean` | `true` |
| maskClosable | — | `boolean` | `true` |
| zIndex | — | `number` | `1000` |
| destroyOnClose | — | `boolean` | `true` |
| internal | 设为 true 时不参与全局弹窗互斥管理（组件内部弹窗用） | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| update:visible | `v: boolean` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| header | — |
| footer | — |
| default | 默认插槽 |

---

### ErrorBoundary

> 源码：`src/components/feedback/ErrorBoundary.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| title | — | `string` | `'页面加载异常'` |
| retryText | — | `string` | `'重新加载'` |
| watchKey | 监听值变化时自动重置错误状态（如路由参数、组件 key 等） | `string | number` | `undefined` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| error | `err: Error` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| fallback | — |

---

### Loading

保护 — 加载状态，禁止：skeleton 动画时序，spinner 尺寸比例

> 源码：`src/components/feedback/Loading.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| variant | 'spinner' 旋转图标 | 'skeleton' 骨架屏 | 'skeleton-text' 文字骨架 | 'skeleton-card' 卡片骨架 | `'spinner' | 'skeleton' | 'skeleton-text' | 'skeleton-card'` | `'spinner'` |
| size | — | `'sm' | 'md' | 'lg'` | `'md'` |
| text | — | `string` | — |
| rows | skeleton 模式 — 行数 | `number` | `3` |
| width | skeleton 模式 — 自定义宽高 | `string` | `'100%'` |
| height | — | `string` | `'14px'` |
| fullscreen | 全屏加载遮罩：fixed 定位 + backdrop-filter + spinner 居中 | `boolean` | `false` |
| overlay | fullscreen 模式 — 遮罩背景色（CSS 颜色或变量，默认半透明黑） | `boolean` | `true` |

---

### OfflineIndicator

保护 — 离线检测，禁止：online/offline 事件监听逻辑删除

> 源码：`src/components/feedback/OfflineIndicator.vue`

*无 Props/Emits/Slots*

---

### Popover

保护 — 气泡浮层，禁止：clamp() → px，浮动定位算法，z-index

> 源码：`src/components/feedback/Popover.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| variant | 'popover' 卡片弹层 | 'tooltip' 文字气泡 | `'popover' | 'tooltip'` | `'popover'` |
| title | — | `string` | — |
| trigger | 'click' | 'hover' | 'focus' — tooltip 模式（有 text）时强制 hover | `'click' | 'hover' | 'focus'` | `'click'` |
| text | 纯文字快捷模式 → tooltip 行为 | `string` | — |
| position | tooltip 方向 | `'top' | 'bottom' | 'left' | 'right'` | `'top'` |

---

### ReadOnlyOverlay

保护 — 只读遮罩，禁止：遮罩透明度；z-index 层级 = var(--z-readonly, 2500)（压 modal/overlay/dropdown）

> 源码：`src/components/feedback/ReadOnlyOverlay.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| visible | — | `boolean` | — |
| reason | — | `string` | `'系统维护中，当前为只读模式'` |

---

### Result

保护 — 结果页，禁止：clamp() → px，slot 层级修改

> 源码：`src/components/feedback/Result.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| status | — | `'success' | 'error' | 'info' | 'warning' | '404' | 'empty'` | — |
| title | — | `string` | — |
| description | — | `string` | `''` |
| actionText | — | `string` | `''` |
| fullWidth | — | `boolean` | `false` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| extra | — |
| default | 默认插槽 |

---

### Toast

保护 — Toast 通知系统，禁止：clamp() → px，动画时序；z-index 层级 = var(--z-top, 9999)（最高优先级通知，ImagePreview 内嵌时临时提升至 10001）

> 源码：`src/components/feedback/Toast.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| variant | 'toast' 全局弹幕 | 'inline' 内联提示条（替代 Alert） | `'toast' | 'inline'` | `'toast'` |
| type | — | `'circle-alert' | 'info' | 'success' | 'warning' | 'error'` | `'circle-alert'` |
| title | — | `string` | — |
| message | — | `string` | — |
| closable | — | `boolean` | `false` |
| showIcon | — | `boolean` | `true` |
| position | — | `'top' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'` | `'top'` |

---

## 图表组件

### BaseChart

保护 — 图表基础组件，禁止：clamp() → px，canvas resize 逻辑，ECharts dispose

> 源码：`src/components/chart/BaseChart.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| option | — | `EChartsOption | null` | `null` |
| loading | — | `boolean` | `false` |
| emptyText | — | `string` | `'暂无数据'` |
| height | — | `number | string` | `'100%'` |
| width | — | `number | string` | `'100%'` |
| darkMode | — | `boolean` | `false` |
| toolbar | — | `Array<'saveAsImage' | 'zoom' | 'dataView'> | false` | `() => ['saveAsImage', 'zoom']` |

---

### Chart

保护 — 图表封装，禁止：clamp() → px，ECharts 初始化逻辑，resize 监听删除

> 源码：`src/components/chart/Chart.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| type | — | `ChartType` | `undefined` |
| option | — | `EChartsOption` | `undefined` |
| data | — | `ChartData | number[] | number[][] | { name: string; value: number }[]` | `() => ({})` |
| categories | — | `string[]` | `() => []` |
| series | — | `ChartSeriesItem[]` | `() => []` |
| height | — | `number | string` | `'100%'` |
| width | — | `number | string` | `'100%'` |
| darkMode | — | `boolean` | `false` |
| colors | — | `string[]` | `() => []` |
| loading | — | `boolean` | `false` |
| emptyText | — | `string` | `'暂无数据'` |
| title | — | `string` | `''` |
| showLegend | — | `boolean` | `true` |
| showTooltip | — | `boolean` | `true` |
| smooth | — | `boolean` | `true` |
| showSymbol | — | `boolean` | `true` |
| showDataLabel | 在数据点上显示数值标签 | `boolean` | `false` |
| horizontal | 柱状图切换为条形图（X/Y 轴互换） | `boolean` | `false` |
| stacked | 堆叠模式 | `boolean` | `false` |
| stacked100 | 百分比堆叠模式 | `boolean` | `false` |
| legendPosition | 图例位置 | `'top' | 'bottom' | 'left' | 'right'` | `'bottom'` |
| xAxis | X 轴配置 | `AxisConfig` | `undefined` |
| yAxis | Y 轴配置 | `AxisConfig` | `undefined` |
| animation | 加载动画开关 | `boolean` | `true` |
| animationDuration | 动画时长（毫秒） | `number` | `800` |
| toolbar | 工具栏按钮，传入 false 全关 | `ToolbarButton[] | false` | `() => ['saveAsImage', 'zoom']` |
| palette | 内置色板预设 | `PalettePreset` | `undefined` |
| markLine | 标注线（均值线/目标线/警戒线），支持多条 | `MarkLineConfig | MarkLineConfig[]` | `undefined` |
| markArea | 标注区域（高亮区间） | `MarkAreaConfig | MarkAreaConfig[]` | `undefined` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| click | `params: any` |
| dblclick | `params: any` |
| mousedown | `params: any` |
| mouseup | `params: any` |
| mouseover | `params: any` |
| mouseout | `params: any` |
| globalout | `params: any` |
| contextmenu | `params: any` |
| legendselectchanged | `params: any` |
| datazoom | `params: any` |
| finished | `params: any` |

---

### ChartLegend

独立 HTML 图例 — flex-wrap + gap 自然撑高，永不重叠

> 源码：`src/components/chart/ChartLegend.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| items | — | `{ name: string; color: string; visible: boolean }[]` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| toggle | `name: string` |

---

### ChartTable

> 源码：`src/components/chart/ChartTable.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| type | — | `ChartProps['type']` | — |
| option | — | `ChartProps['option']` | — |
| data | — | `ChartProps['data']` | — |
| categories | — | `string[]` | — |
| series | — | `ChartProps['series']` | — |
| darkMode | — | `boolean` | `false` |
| colors | — | `string[]` | — |
| title | — | `string` | — |
| showLegend | — | `boolean` | `true` |
| showTooltip | — | `boolean` | `true` |
| smooth | — | `boolean` | `true` |
| showSymbol | — | `boolean` | `true` |
| showDataLabel | — | `boolean` | `false` |
| horizontal | — | `boolean` | `false` |
| stacked | — | `boolean` | `false` |
| stacked100 | — | `boolean` | `false` |
| legendPosition | — | `ChartProps['legendPosition']` | `'bottom'` |
| xAxis | — | `ChartProps['xAxis']` | — |
| yAxis | — | `ChartProps['yAxis']` | — |
| animation | — | `boolean` | `true` |
| animationDuration | — | `number` | `800` |
| toolbar | — | `ChartProps['toolbar']` | `() => ['saveAsImage', 'zoom']` |
| palette | — | `ChartProps['palette']` | — |
| markLine | — | `ChartProps['markLine']` | — |
| markArea | — | `ChartProps['markArea']` | — |
| columns | — | `Column[]` | `() => []` |
| tableData | — | `Record<string, any>[]` | `() => []` |
| showTable | — | `boolean` | `true` |
| tableTitle | — | `string` | `''` |
| rowKey | — | `string` | `'rank'` |
| chartRatio | — | `number` | `0.45` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| header | — |
| footer | — |

---

## 登录组件

### forgot-password

> 源码：`src/components/login/forgot-password.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| maxWidth | 容器最大宽度，CSS 值，默认 960px | `string` | `'960px'` |
| hideBrand | 强制隐藏左侧品牌面板 | `boolean` | `false` |
| minHeight | 容器最小高度，CSS 值，默认 100vh | `string` | `'100vh'` |
| loading | — | `boolean` | `false` |
| error | — | `string` | — |
| success | — | `string` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| submit | `payload: ResetPasswordPayload` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| logo | — |

---

### login

左侧品牌面板

> 源码：`src/components/login/login.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| maxWidth | 容器最大宽度，CSS 值，默认 960px | `string` | `'960px'` |
| hideBrand | 强制隐藏左侧品牌面板 | `boolean` | `false` |
| minHeight | 容器最小高度，CSS 值，默认 100% | `string` | `'100%'` |
| tenantMode | 租户登录模式 | `boolean` | `false` |
| loading | 外部控制加载态（如 API 请求中） | `boolean` | `false` |
| error | 外部注入错误/提示信息 | `string` | — |
| maxAttempts | 最大尝试次数，0 禁用锁定 | `number` | `5` |
| lockMinutes | 锁定分钟数 | `number` | `15` |
| brandTitle | 品牌标题 | `string` | — |
| brandSubtitle | 品牌副标题 | `string` | — |
| features | 自定义特性列表 | `string[]` | — |
| showSocialLogin | 是否显示社交登录 | `boolean` | `true` |
| showForgotPassword | 是否显示忘记密码入口 | `boolean` | `true` |
| showRegister | 是否显示注册入口 | `boolean` | `true` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| submit | `payload: { username: string; password: string; rememberMe: boolean }` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| logo | — |

---

### portal_login

> 源码：`src/components/login/portal_login.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| maxWidth | 卡片最大宽度，CSS 值，默认 380px | `string` | `'380px'` |
| minHeight | 容器最小高度，CSS 值，默认 100vh | `string` | `'100vh'` |
| loading | — | `boolean` | `false` |
| error | — | `string` | — |
| title | — | `string` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| submit | `payload: { username: string; password: string }` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| logo | — |
| footer | — |

---

### register

选填字段

> 源码：`src/components/login/register.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| maxWidth | 容器最大宽度，CSS 值，默认 960px | `string` | `'960px'` |
| hideBrand | 强制隐藏左侧品牌面板 | `boolean` | `false` |
| minHeight | 容器最小高度，CSS 值，默认 100vh | `string` | `'100vh'` |
| loading | — | `boolean` | `false` |
| error | — | `string` | — |
| brandTitle | — | `string` | — |
| brandSubtitle | — | `string` | — |
| requireCardKey | 是否需要卡密字段 | `boolean` | `true` |
| showOptionalFields | 是否显示邮箱 & 手机号字段 | `boolean` | `true` |
| requireEmail | 邮箱是否必填 | `boolean` | `false` |
| requirePhone | 手机号是否必填 | `boolean` | `false` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| submit | `payload: RegisterPayload` |

#### Slots

| 名称 | 说明 |
| ------ | ------ |
| logo | — |

---

## 高德地图

### AmapWidget

> 源码：`src/components/amap/AmapWidget.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| center | 地图中心 [lng, lat] | `[number, number]` | `() => [116.397428, 39.90923]` |
| zoom | 缩放级别 | `number` | `13` |
| markers | 标记列表 | `MarkerItem[]` | `() => []` |
| showToolBar | 是否显示工具条 | `boolean` | `true` |
| showScale | 是否显示比例尺 | `boolean` | `true` |
| mapStyle | 地图样式 ID | `string` | `''` |
| customClass | 自定义类名 | `string` | `''` |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| ready | `map: any` |

---

## 路线规划

### ImportProgress

> 源码：`src/components/route-planner/ImportProgress.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| current | — | `number` | — |
| total | — | `number` | — |
| label | — | `string` | — |

---

### RouteMap

空数据引导

> 源码：`src/components/route-planner/RouteMap.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| stores | — | `Store[]` | — |
| plan | — | `RoutePlan | null` | — |

---

### RouteResult

加载中

> 源码：`src/components/route-planner/RouteResult.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| plan | — | `RoutePlan | null` | — |
| loading | — | `boolean` | — |
| enriching | — | `boolean` | — |
| hasRealDriving | 是否已获取实测驾车数据（用于区分估算/实测标识） | `boolean` | — |
| startPointName | 起点名称（如"我的位置"），用于路线概览展示 | `string` | — |

---

### StoreFormModal

> 源码：`src/components/route-planner/StoreFormModal.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| visible | — | `boolean` | — |
| store | — | `Store | null` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| close | `—` |
| save | `store: Store` |

---

### StorePanel

操作栏

> 源码：`src/components/route-planner/StorePanel.vue`

#### Props

| 参数 | 说明 | 类型 | 默认值 |
| ------ | ------ | ------ | -------- |
| stores | — | `Store[]` | — |

#### Events

| 事件 | 参数 |
| ------ | ------ |
| add | `—` |
| edit | `store: Store` |
| remove | `id: string` |
| toggleSkip | `id: string` |
| skipCity | `city: string` |
| removeCity | `city: string` |

---

## 统计摘要

| 指标 | 数量 |
|------|------|
| 组件总数 | 55 |
| Props 总数 | 458 |
| Events 总数 | 86 |
| Slots 总数 | 25 |

### 各组件 API 数量明细

| 组件 | 分类 | Props | Events | Slots |
| ------ | ------ | ------ | ------ | ------ |
| DataTable | 数据展示 | 52 | 15 | 0 |
| ChartTable | 图表组件 | 31 | 0 | 2 |
| Chart | 图表组件 | 29 | 11 | 0 |
| Select | 表单组件 | 24 | 3 | 0 |
| Input | 表单组件 | 21 | 5 | 0 |
| Group | 表单组件 | 16 | 2 | 0 |
| ModalBox | 布局组件 | 16 | 1 | 1 |
| Upload | 表单组件 | 15 | 5 | 0 |
| ProgressBar | 数据展示 | 14 | 2 | 0 |
| login | 登录组件 | 14 | 1 | 1 |
| Tag | 基础组件 | 13 | 0 | 1 |
| ToggleList | 数据展示 | 13 | 3 | 0 |
| Image | 数据展示 | 12 | 3 | 0 |
| register | 登录组件 | 11 | 1 | 1 |
| Drawer | 反馈组件 | 10 | 1 | 3 |
| Button | 基础组件 | 8 | 1 | 1 |
| Tree | 数据展示 | 8 | 2 | 0 |
| ConfirmModal | 反馈组件 | 8 | 1 | 0 |
| Loading | 反馈组件 | 8 | 0 | 0 |
| Flex | 布局组件 | 7 | 0 | 1 |
| Menu | 导航组件 | 7 | 2 | 0 |
| Skeleton | 数据展示 | 7 | 0 | 0 |
| Toast | 反馈组件 | 7 | 0 | 0 |
| BaseChart | 图表组件 | 7 | 0 | 0 |
| AmapWidget | 高德地图 | 7 | 1 | 0 |
| IconPicker | 表单组件 | 6 | 5 | 0 |
| forgot-password | 登录组件 | 6 | 1 | 1 |
| Card | 数据展示 | 5 | 1 | 3 |
| Collapse | 数据展示 | 5 | 1 | 1 |
| Popover | 反馈组件 | 5 | 0 | 0 |
| Result | 反馈组件 | 5 | 0 | 2 |
| portal_login | 登录组件 | 5 | 1 | 2 |
| RouteResult | 路线规划 | 5 | 0 | 0 |
| Space | 布局组件 | 4 | 0 | 1 |
| Pagination | 导航组件 | 4 | 1 | 0 |
| Steps | 导航组件 | 4 | 1 | 0 |
| Avatar | 数据展示 | 4 | 0 | 0 |
| CameraCapture | 表单组件 | 3 | 3 | 0 |
| AppLayout | 布局组件 | 3 | 0 | 2 |
| Tabs | 导航组件 | 3 | 1 | 0 |
| Divider | 数据展示 | 3 | 0 | 0 |
| Empty | 数据展示 | 3 | 0 | 1 |
| ImagePreview | 数据展示 | 3 | 1 | 0 |
| ErrorBoundary | 反馈组件 | 3 | 1 | 1 |
| ImportProgress | 路线规划 | 3 | 0 | 0 |
| Breadcrumb | 导航组件 | 2 | 0 | 0 |
| ReadOnlyOverlay | 反馈组件 | 2 | 0 | 0 |
| RouteMap | 路线规划 | 2 | 0 | 0 |
| StoreFormModal | 路线规划 | 2 | 2 | 0 |
| AccordionNav | 布局组件 | 1 | 0 | 0 |
| ChartLegend | 图表组件 | 1 | 1 | 0 |
| StorePanel | 路线规划 | 1 | 6 | 0 |
| IconSvg | 基础组件 | 0 | 0 | 0 |
| MiniLayout | 布局组件 | 0 | 0 | 0 |
| OfflineIndicator | 反馈组件 | 0 | 0 | 0 |
