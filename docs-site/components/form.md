# 表单输入（form）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `Input` | 22 | 6 | 0 |
| `Select` | 24 | 5 | 2 |
| `Group` | 16 | 2 | 0 |
| `IconPicker` | 6 | 5 | 0 |
| `Upload` | 17 | 5 | 2 |
| `CameraCapture` | 6 | 5 | 0 |
| `CodeCapture` | 7 | 5 | 0 |
| `CaptureFallbackPanel` | 9 | 3 | 0 |
| `CaptureFallbackSheet` | 11 | 5 | 0 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `useBarcodeScanner` | 扫码 composable：相机取流 + 识别框区域抽帧（zxing-wasm 解码）+ 连扫确认/冷却，返回状态与起停控制 |
| `DEFAULT_CAPTURE_REGION` | 默认识别框（画面中下部横条，占位比例 0-1，对准条码常见位置） |
| `detectCaptureCapability` | 探测当前环境能力（SSR / 测试环境安全回退，不抛错） |
| `classifyCaptureError` | 浏览器摄像头错误 → 归因（与 CameraCapture / useBarcodeScanner 的文案映射同源） |
| `captureChainFrom` | 从某级起的可用子链（按 allow* 裁剪掉被禁用的级） |
| `nextCaptureLevel` | 下一级；已是终点或存在被禁用的级时返回 null |
| `resolveEntryLevel` | 入口级：不满足页面内取流条件就直接从系统级起步。 |
| `openSystemCapture` | 调起系统相机 / 相册（隐藏 file input），返回用户选中的文件。 |
| `cancelPendingSystemCapture` | 强制结算上一次未完成的系统采集（视作用户取消）并清理残留临时 input。 |
| `CAPTURE_CHAIN` | 默认链路顺序 |

---

## `Input`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/input`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'text' \| 'password' \| 'email' \| 'tel' \| 'number' \| 'textarea' \| 'search' \| 'url' \| 'color'` | `'text'` | 否 | 统一类型：text \| password \| email \| tel \| number \| textarea \| search \| url \| color |
| `modelValue` | `string \| number \| null` | — | 是 | 受控值：数字模式回传 number，其余 string；可为 null |
| `label` | `string` | — | 否 | 浮动标签文案 |
| `icon` | `string` | — | 否 | 输入框前置图标（IconSvg 图标名） |
| `placeholder` | `string` | `''` | 否 | 占位文案 |
| `disabled` | `boolean` | `false` | 否 | 禁用 |
| `readonly` | `boolean` | `false` | 否 | 只读 |
| `rules` | `((v: string) => string \| undefined)[]` | `() => []` | 否 | 校验规则 |
| `hint` | `string` | — | 否 | 控件下方帮助文案 |
| `name` | `string` | — | 否 | HTML name 属性 |
| `autocomplete` | `string` | `'off'` | 否 | HTML autocomplete |
| `stepper` | `boolean` | `false` | 否 | 数字模式：显示加减按钮 |
| `min` | `number \| null` | `null` | 否 | 数字模式：最小值 |
| `max` | `number \| null` | `null` | 否 | 数字模式：最大值 |
| `step` | `number` | `1` | 否 | 数字模式：步进值 |
| `precision` | `number` | `undefined` | 否 | 数字模式：小数位数 |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 否 | 数字模式：尺寸 |
| `clearable` | `boolean` | `false` | 否 | 显示一键清空按钮（默认关） |
| `maxlength` | `number` | — | 否 | 原生 maxlength |
| `minlength` | `number` | — | 否 | 原生 minlength |
| `rows` | `number` | `3` | 否 | textarea 行数 |
| `suffix` | `string` | — | 否 | 后缀文字（输入框内右侧固定显示，如单位 "元" / "kg"） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: string \| number \| null` | v-model——受控值 |
| `focus` | `e: FocusEvent` | 获得焦点（原生事件） |
| `blur` | `e: FocusEvent` | 失去焦点（原生事件） |
| `keyup` | `e: KeyboardEvent` | 按键抬起（原生事件） |
| `clear` | `无` | 点击清空按钮后触发 |
| `change` | `v: string \| number \| null` | 值提交（失焦/回车，语义同原生 change） |

## `Select`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/select`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'select' \| 'menu' \| 'combobox' \| 'cascader' \| 'tree-select' \| 'date' \| 'date-range' \| 'time'` | `'select'` | 否 | 模式：select 下拉 \| menu 菜单 \| combobox 可输入 \| cascader 级联 \| tree-select 树选 \| date \| date-range \| time |
| `modelValue` | `string \| number \| (string \| number \| boolean)[] \| [string, string] \| null` | — | 否 | 受控值：单选 string\|number；多选数组；date-range 为 [起, 止] |
| `options` | `Option[]` | `() => []` | 否 | 选项表（select/combobox）：{ value, label, disabled? } |
| `label` | `string` | — | 否 | 浮动标签文案（上浮骑缝样式） |
| `rules` | `((v: string) => string \| undefined)[]` | `() => []` | 否 | 校验规则：返回错误文案即不通过 |
| `error` | `string` | — | 否 | 外部注入错误提示（覆盖 rules 结果） |
| `multiple` | `boolean` | `false` | 否 | 多选：tags 展示，值为数组 |
| `placeholder` | `string` | `() => t('form.pleaseSelect')` | 否 | 占位文案（默认内置「请选择」） |
| `searchable` | `boolean` | `true` | 否 | 触发器可输入过滤（默认开） |
| `pinyinEnabled` | `boolean` | `true` | 否 | 过滤启用拼音匹配（默认开） |
| `isLoading` | `boolean` | `false` | 否 | 面板加载态 |
| `emptyText` | `string` | `() => t('form.noMatch')` | 否 | 无匹配文案（默认内置） |
| `allowCreate` | `boolean` | `true` | 否 | 允许创建选项表外的自定义值（默认开）；选项精确命中不受此开关限制 |
| `clearOnFocus` | `boolean` | `false` | 否 | 多选下聚焦即清空已选 tags、重新输入（默认关） |
| `items` | `MenuItem[]` | `() => []` | 否 | menu 模式的菜单项 |
| `cascaderOptions` | `CascaderOption[]` | — | 否 | cascader 模式的级联选项（value/label/children/disabled） |
| `disabled` | `boolean` | `false` | 否 | 禁用 |
| `zIndex` | `string` | — | 否 | 浮层面板 z-index 覆盖 |
| `format` | `string` | `'YYYY-MM-DD'` | 否 | date/date-range 模式的值格式（默认 'YYYY-MM-DD'） |
| `dateMin` | `string` | `''` | 否 | 可选日期下限（同 format 格式） |
| `dateMax` | `string` | `''` | 否 | 可选日期上限（同 format 格式） |
| `rangePlaceholder` | `[string, string]` | `() => [t('form.startDate'), t('form.endDate')] as [string, string]` | 否 | date-range 双占位（默认内置起/止文案） |
| `timeStep` | `number` | `1` | 否 | time 模式分钟步进（默认 1） |
| `clearable` | `boolean` | `false` | 否 | 显示清除按钮（默认关） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: SelectModelValue` | v-model——受控值 |
| `change` | `v: SelectModelValue` | 值提交（选中/清除后；与 update:modelValue 同步抛出） |
| `focus` | `无` | 触发器获得焦点 |
| `blur` | `无` | 触发器失去焦点 |
| `'visible-change'` | `v: boolean` | 下拉面板展开/收起：[true=展开] |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `empty` | — | 下拉面板空选项态内容 | &#123;&#123; t('form.enterToUse', &#123; text: comboTex |
| `option` | `opt, selected` | 单个选项的自定义渲染（作用域：opt、selected） | &#123;&#123; opt.label &#125;&#125; &#123;&#123; opt.desc &#125;&#125; |

## `Group`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/group`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'radio' \| 'checkbox' \| 'switch' \| 'rate' \| 'slider'` | `'radio'` | 否 | 统一类型：radio \| checkbox \| switch \| rate \| slider |
| `modelValue` | `string \| number \| boolean \| (string \| number \| boolean)[] \| [number, number]` | — | 是 | 受控值：radio/switch 为单值，checkbox 为数组，rate 为数值，slider 为数值或 [起, 止] |
| `options` | `Option[]` | `() => []` | 否 | radio / checkbox 模式选项列表 |
| `direction` | `'vertical' \| 'horizontal'` | `'vertical'` | 否 | radio / checkbox 排列方向 |
| `disabled` | `boolean` | `false` | 否 | 整组禁用 |
| `max` | `number` | `0` | 否 | checkbox 最多选几项，0 = 不限 |
| `ariaLabel` | `string` | `''` | 否 | 分组标签（无障碍） |
| `label` | `string` | — | 否 | switch 标签文字 |
| `size` | `'sm' \| 'md'` | `'md'` | 否 | switch 尺寸 |
| `rateMax` | `number` | `5` | 否 | rate 最大值，默认 5 |
| `allowHalf` | `boolean` | `false` | 否 | rate 是否允许半星 |
| `color` | `string` | `'#F59E0B'` | 否 | rate 颜色 |
| `min` | `number` | `0` | 否 | slider 最小值 |
| `sliderMax` | `number` | `100` | 否 | slider 最大值（与 checkbox max 区分） |
| `step` | `number` | `1` | 否 | slider 步进 |
| `showValue` | `boolean` | `true` | 否 | slider 显示当前值 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: GroupValue` | v-model——受控值（形状随 type：checkbox 为数组、range 滑块为 [起, 止]） |
| `change` | `v: GroupValue` | 值提交（与 update:modelValue 同步抛出） |

## `IconPicker`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/icon`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `string` | `'star'` | 否 | 受控图标名（kebab-case，默认 'star'） |
| `color` | `string` | `'var(--color-primary)'` | 否 | 图标颜色（CSS 颜色值或令牌，默认主色令牌） |
| `bgColor` | `string` | `'#EAECF0'` | 否 | 触发按钮底色（默认 #EAECF0） |
| `placeholder` | `string` | `() => t('form.selectIcon')` | 否 | 触发按钮占位文字 |
| `presetColors` | `string[]` | `() => ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4']` | 否 | 预定义色板 |
| `provider` | `'lucide' \| 'solar' \| 'morphicons'` | `'lucide'` | 否 | 图标提供者：lucide/solar 为静态图标，morphicons 在图标切换时做形变动画 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: string` | v-model——选中图标名 |
| `'update:color'` | `v: string` | v-model:color——图标颜色 |
| `'update:bgColor'` | `v: string` | v-model:bgColor——触发按钮底色 |
| `'update:provider'` | `v: 'lucide' \| 'solar' \| 'morphicons'` | v-model:provider——图标提供者切换 |
| `change` | `v: { icon: string; color: string; bgColor: string }` | 任一选择提交：[图标名 + 颜色 + 底色] 快照 |

## `Upload`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/upload`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `accept` | `string` | `'image/*'` | 否 | 接受的文件类型：默认图片；传空字符串 = 全部类型（含目录里的文件） |
| `multiple` | `boolean` | `false` | 否 | 多文件 |
| `maxSize` | `number` | `10` | 否 | 单文件大小上限（MB，默认 10） |
| `minSize` | `number` | — | 否 | 单文件大小下限（KB） |
| `disabled` | `boolean` | `false` | 否 | 禁用 |
| `drag` | `boolean` | `true` | 否 | 拖拽上传（默认开） |
| `modelValue` | `UploadFile[]` | `() => []` | 否 | 受控文件列表（v-model:modelValue，UploadFile[]） |
| `customRequest` | `(file: File) => Promise<{ url: string }>` | `undefined` | 否 | 自定义上传：替代内置请求，返回 { url }；失败时 reject 走 error 事件 |
| `variant` | `'default' \| 'card'` | `'default'` | 否 | 'default' 标准上传区 \| 'card' 紧凑方块卡片 |
| `label` | `string` | `''` | 否 | card 模式下的显示标签 |
| `directory` | `boolean` | `false` | 否 | 目录选择模式（webkitdirectory）：选择整个文件夹上传（隐式多文件），仍按 accept 校验每个文件 |
| `mobileMenu` | `boolean` | `false` | 否 | 触屏设备点击弹「拍照/相册/文件」菜单（安卓系统选择器无相机入口，以此补齐拍照能力）；桌面不受影响 |
| `compress` | `boolean` | `false` | 否 | 图片压缩：开启后图片文件会经过 canvas 压缩再上传（移动端尤其需要） |
| `maxWidth` | `number` | `1920` | 否 | 图片压缩最大宽度（px），超过时等比缩小；默认 1920 |
| `compressQuality` | `number` | `0.85` | 否 | 图片压缩质量 0-1；默认 0.85 |
| `maxConcurrent` | `number` | — | 否 | 同时在飞的文件数（压缩+上传）。默认 3：按浏览器同源约 6 条连接取半， 给页面其它请求留通道；服务端有并发/限流策略时按更严的那个设 |
| `previewMode` | `'builtin' \| 'event'` | `'builtin'` | 否 | 图片预览：'builtin' 点击图片直接打开内置全屏预览（默认）；'event' 仅抛 preview 事件由消费方自行处理 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `change` | `files: UploadFile[]` | 文件列表变化（新增/删除/状态流转后抛全量） |
| `remove` | `file: UploadFile` | 移除单个文件 |
| `error` | `message: string` | 校验/上传失败提示文案 |
| `'update:modelValue'` | `files: UploadFile[]` | v-model——受控文件列表 |
| `preview` | `url: string` | card 模式：点击图片预览 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| `file-item` | `key, file, index` | 单个文件项的自定义渲染（作用域：key、file、index） | &#123;&#123; f.name &#125;&#125; &#123;&#123; formatSize(f.size) &#125;&#125; ✓  |
| `trigger` | `open-file-dialog` | 上传触发区（作用域：open-file-dialog 手动选择文件入口） | &#123;&#123; t('form.dropHint') &#125;&#125; &#123;&#123; t('form.drag |

## `CameraCapture`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/capture`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | `false` | 否 | 显隐控制（v-model） |
| `quality` | `number` | `0.9` | 否 | JPEG 输出质量 0-1，默认 0.9 |
| `fallbackOnError` | `boolean` | `true` | 否 | 页面内相机不可用（权限拒绝/无摄像头/非 HTTPS）时自动降级调起设备系统相机，默认 true |
| `multiple` | `boolean` | `false` | 否 | 多张连拍模式：快门确认后不交付、进内部队列并回到取景继续拍下一张； 底部胶卷可回看/左右切换/重拍某张/删除，顶部「完成」经 finish 一次性交付 File[]。 降级系统相机时无法连拍（每次一张，仍走 capture 事件逐张交付）。 |
| `shotNames` | `string[]` | `() => []` | 否 | 计划拍摄的照片名称（按拍摄顺序对应，如 ['门头照','铭牌特写']）。 显示在顶部提示/胶卷/回看中，并写入交付文件名（name-时间戳.jpg）；未传则自动「照片1、照片2…」 |
| `fallbackSheet` | `boolean` | `true` | 否 | 最后兜底：系统相机也拿不到照片（取消/不可用）时自动弹上传面板，默认 true |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: boolean` | v-model——显隐 |
| `capture` | `file: File` | 确认使用照片（页面内拍照或降级系统相机拍照均交付 File；multiple 模式下降级路径也走这里） |
| `finish` | `files: File[]` | multiple 模式：按「完成」一次性交付队列全部照片 |
| `cancel` | `无` | 取消 / 关闭 |
| `error` | `message: string` | 相机不可用提示；fallbackOnError 时附带说明已切换系统相机 |

## `CodeCapture`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/capture`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | — | 是 | 显隐（v-model） |
| `formats` | `BarcodeFormats` | `'all'` | 否 | 识别格式：all / qr / barcode，可传 Ref 实时切换 |
| `prefix` | `string` | `undefined` | 否 | 条码前缀过滤 |
| `length` | `number` | `undefined` | 否 | 条码长度过滤 |
| `multiple` | `boolean` | `false` | 否 | 连扫模式：扫到不关闭、结果累积，关闭时经 finish 一次性交付 |
| `autoFallback` | `boolean` | `true` | 否 | 是否启用自动兜底链（失败后自动下探系统相机），默认 true；关掉则失败仅报错，兜底面板保留手动入口 |
| `title` | `string` | `''` | 否 | 扫码浮层标题（空串用内置 i18n） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: boolean` | v-model——显隐 |
| `scan` | `code: string` | 识别到一条码（逐条交付） |
| `finish` | `codes: string[]` | multiple 模式关闭时一次性交付全部结果 |
| `error` | `msg: string` | 降级/失败提示（相机不可用、识别失败等） |
| `close` | `无` | 关闭浮层 |

## `CaptureFallbackPanel`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/capture`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `mode` | `'scan' \| 'photo'` | `'scan'` | 否 | scan = 上传识别 + 手工输入；photo = 仅上传（相册/文件） |
| `disabled` | `boolean` | `false` | 否 | 整面板禁用（上传/输入均不可操作） |
| `busy` | `boolean` | `false` | 否 | 识别中（控件禁用 + 显示进度提示） |
| `error` | `string` | `''` | 否 | 识别失败等错误提示（留在面板内，方便直接改用输入） |
| `uploadHint` | `string` | `''` | 否 | 上传条文案 |
| `hint` | `string` | `''` | 否 | 面板顶部说明（通常由宿主传入降级原因） |
| `placeholder` | `string` | `''` | 否 | 手工输入占位 |
| `accept` | `string` | `'image/*'` | 否 | 上传接受的文件类型（默认 image/*） |
| `multiple` | `boolean` | `false` | 否 | 允许多选文件 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `files` | `files: File[]` | 用户选好文件：宿主负责识别 / 交付 |
| `submit` | `code: string` | scan 模式手工输入提交 |
| `retry` | `无` | 重试上一级采集（宿主决定怎么重开：页面内相机 / 系统相机） |

## `CaptureFallbackSheet`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/capture`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | — | 是 | 显隐（v-model） |
| `mode` | `'scan' \| 'photo'` | `'scan'` | 否 | 同 CaptureFallbackPanel：scan = 上传识别 + 手工输入；photo = 仅上传 |
| `disabled` | `boolean` | `false` | 否 | 整面板禁用（转发自面板） |
| `busy` | `boolean` | `false` | 否 | 识别中（控件禁用 + 显示进度提示） |
| `error` | `string` | `''` | 否 | 识别失败等错误提示 |
| `uploadHint` | `string` | `''` | 否 | 上传条文案 |
| `hint` | `string` | `''` | 否 | 面板顶部说明（通常由宿主传入降级原因） |
| `placeholder` | `string` | `''` | 否 | 手工输入占位 |
| `accept` | `string` | `'image/*'` | 否 | 上传接受的文件类型（默认 image/*） |
| `multiple` | `boolean` | `false` | 否 | 允许多选文件 |
| `title` | `string` | `''` | 否 | 弹层标题（空串用内置 i18n） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: boolean` | v-model——显隐 |
| `files` | `files: File[]` | 用户选好文件：宿主负责识别 / 交付（转发自面板） |
| `submit` | `code: string` | scan 模式手工输入提交（转发自面板） |
| `retry` | `无` | 重试上一级采集（转发自 CaptureFallbackPanel，宿主自行接线） |
| `close` | `无` | 关闭弹层 |

