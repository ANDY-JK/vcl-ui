# 表单输入（form）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 |
| --- | --- | --- |
| `Input` | 22 | 6 |
| `Select` | 24 | 5 |
| `Group` | 16 | 2 |
| `IconPicker` | 6 | 5 |
| `Upload` | 17 | 5 |
| `CameraCapture` | 6 | 5 |
| `CodeCapture` | 7 | 5 |
| `CaptureFallbackPanel` | 9 | 3 |
| `CaptureFallbackSheet` | 11 | 5 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `useBarcodeScanner` | — |
| `DEFAULT_CAPTURE_REGION` | — |
| `detectCaptureCapability` | 探测当前环境能力（SSR / 测试环境安全回退，不抛错） |
| `classifyCaptureError` | 浏览器摄像头错误 → 归因（与 CameraCapture / useBarcodeScanner 的文案映射同源） |
| `captureChainFrom` | 从某级起的可用子链（按 allow* 裁剪掉被禁用的级） |
| `nextCaptureLevel` | 下一级；已是终点或存在被禁用的级时返回 null |
| `resolveEntryLevel` | 入口级：不满足页面内取流条件就直接从系统级起步。 |
| `openSystemCapture` | 调起系统相机 / 相册（隐藏 file input），返回用户选中的文件。 |
| `cancelPendingSystemCapture` | 强制结算上一次未完成的系统采集（视作用户取消）并清理残留临时 input。 |
| `CAPTURE_CHAIN` | — |

---

## `Input`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'text' \| 'password' \| 'email' \| 'tel' \| 'number' \| 'textarea' \| 'search' \| 'url' \| 'color'` | `'text'` | 否 | 统一类型：text \| password \| email \| tel \| number \| textarea \| search \| url \| color |
| `modelValue` | `string \| number \| null` | — | 是 | — |
| `label` | `string` | — | 否 | — |
| `icon` | `string` | — | 否 | — |
| `placeholder` | `string` | `''` | 否 | — |
| `disabled` | `boolean` | `false` | 否 | — |
| `readonly` | `boolean` | `false` | 否 | — |
| `rules` | `((v: string) => string \| undefined)[]` | `() => []` | 否 | 校验规则 |
| `hint` | `string` | — | 否 | — |
| `name` | `string` | — | 否 | HTML name 属性 |
| `autocomplete` | `string` | `'off'` | 否 | HTML autocomplete |
| `stepper` | `boolean` | `false` | 否 | 数字模式：显示加减按钮 |
| `min` | `number \| null` | `null` | 否 | 数字模式：最小值 |
| `max` | `number \| null` | `null` | 否 | 数字模式：最大值 |
| `step` | `number` | `1` | 否 | 数字模式：步进值 |
| `precision` | `number` | `undefined` | 否 | 数字模式：小数位数 |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | 否 | 数字模式：尺寸 |
| `clearable` | `boolean` | `false` | 否 | — |
| `maxlength` | `number` | — | 否 | — |
| `minlength` | `number` | — | 否 | — |
| `rows` | `number` | `3` | 否 | textarea 行数 |
| `suffix` | `string` | — | 否 | 后缀文字（输入框内右侧固定显示，如单位 "元" / "kg"） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: string \| number \| null` | — |
| `focus` | `e: FocusEvent` | — |
| `blur` | `e: FocusEvent` | — |
| `keyup` | `e: KeyboardEvent` | — |
| `clear` | `无` | — |
| `change` | `v: string \| number \| null` | — |

## `Select`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'select' \| 'menu' \| 'combobox' \| 'cascader' \| 'tree-select' \| 'date' \| 'date-range' \| 'time'` | `'select'` | 否 | 模式 |
| `modelValue` | `string \| number \| (string \| number \| boolean)[] \| [string, string] \| null` | — | 否 | — |
| `options` | `Option[]` | `() => []` | 否 | — |
| `label` | `string` | — | 否 | — |
| `rules` | `((v: string) => string \| undefined)[]` | `() => []` | 否 | — |
| `error` | `string` | — | 否 | — |
| `multiple` | `boolean` | `false` | 否 | — |
| `placeholder` | `string` | `() => t('form.pleaseSelect')` | 否 | — |
| `searchable` | `boolean` | `true` | 否 | — |
| `pinyinEnabled` | `boolean` | `true` | 否 | — |
| `isLoading` | `boolean` | `false` | 否 | — |
| `emptyText` | `string` | `() => t('form.noMatch')` | 否 | — |
| `allowCreate` | `boolean` | `true` | 否 | — |
| `clearOnFocus` | `boolean` | `false` | 否 | — |
| `items` | `MenuItem[]` | `() => []` | 否 | — |
| `cascaderOptions` | `CascaderOption[]` | — | 否 | — |
| `disabled` | `boolean` | `false` | 否 | — |
| `zIndex` | `string` | — | 否 | — |
| `format` | `string` | `'YYYY-MM-DD'` | 否 | — |
| `dateMin` | `string` | `''` | 否 | — |
| `dateMax` | `string` | `''` | 否 | — |
| `rangePlaceholder` | `[string, string]` | `() => [t('form.startDate'), t('form.endDate')] as [string, string]` | 否 | — |
| `timeStep` | `number` | `1` | 否 | — |
| `clearable` | `boolean` | `false` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: SelectModelValue` | — |
| `change` | `v: SelectModelValue` | — |
| `focus` | `无` | — |
| `blur` | `无` | — |
| `visibleChange` | `v: boolean` | — |

## `Group`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | `'radio' \| 'checkbox' \| 'switch' \| 'rate' \| 'slider'` | `'radio'` | 否 | 统一类型：radio \| checkbox \| switch \| rate \| slider |
| `modelValue` | `string \| number \| boolean \| (string \| number \| boolean)[] \| [number, number]` | — | 是 | — |
| `options` | `Option[]` | `() => []` | 否 | radio / checkbox 模式选项列表 |
| `direction` | `'vertical' \| 'horizontal'` | `'vertical'` | 否 | radio / checkbox 排列方向 |
| `disabled` | `boolean` | `false` | 否 | — |
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
| `'update:modelValue'` | `v: GroupValue` | — |
| `change` | `v: GroupValue` | — |

## `IconPicker`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `string` | `'star'` | 否 | — |
| `color` | `string` | `'var(--color-primary)'` | 否 | — |
| `bgColor` | `string` | `'#EAECF0'` | 否 | — |
| `placeholder` | `string` | `() => t('form.selectIcon')` | 否 | 触发按钮占位文字 |
| `presetColors` | `string[]` | `() => ['#6366F1', '#F59E0B', '#10B981', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4']` | 否 | 预定义色板 |
| `provider` | `'lucide' \| 'solar' \| 'morphicons'` | `'lucide'` | 否 | 图标提供者：lucide/solar 为静态图标，morphicons 在图标切换时做形变动画 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: string` | — |
| `'update:color'` | `v: string` | — |
| `'update:bgColor'` | `v: string` | — |
| `'update:provider'` | `v: 'lucide' \| 'solar' \| 'morphicons'` | — |
| `change` | `v: { icon: string; color: string; bgColor: string }` | — |

## `Upload`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `accept` | `string` | `'image/*'` | 否 | 接受的文件类型：默认图片；传空字符串 = 全部类型（含目录里的文件） |
| `multiple` | `boolean` | `false` | 否 | — |
| `maxSize` | `number` | `10` | 否 | — |
| `minSize` | `number` | — | 否 | — |
| `disabled` | `boolean` | `false` | 否 | — |
| `drag` | `boolean` | `true` | 否 | — |
| `modelValue` | `UploadFile[]` | `() => []` | 否 | — |
| `customRequest` | `(file: File) => Promise<{ url: string }>` | `undefined` | 否 | — |
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
| `change` | `files: UploadFile[]` | — |
| `remove` | `file: UploadFile` | — |
| `error` | `message: string` | — |
| `'update:modelValue'` | `files: UploadFile[]` | — |
| `preview` | `url: string` | card 模式：点击图片预览 |

## `CameraCapture`

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
| `'update:modelValue'` | `v: boolean` | — |
| `capture` | `file: File` | 确认使用照片（页面内拍照或降级系统相机拍照均交付 File；multiple 模式下降级路径也走这里） |
| `finish` | `files: File[]` | multiple 模式：按「完成」一次性交付队列全部照片 |
| `cancel` | `无` | 取消 / 关闭 |
| `error` | `message: string` | 相机不可用提示；fallbackOnError 时附带说明已切换系统相机 |

## `CodeCapture`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | — | 是 | 显隐（v-model） |
| `formats` | `BarcodeFormats` | `'all'` | 否 | 识别格式：all / qr / barcode，可传 Ref 实时切换 |
| `prefix` | `string` | `undefined` | 否 | 条码前缀过滤 |
| `length` | `number` | `undefined` | 否 | 条码长度过滤 |
| `multiple` | `boolean` | `false` | 否 | 连扫模式：扫到不关闭、结果累积，关闭时经 finish 一次性交付 |
| `autoFallback` | `boolean` | `true` | 否 | 是否启用自动兜底链（失败后自动下探系统相机），默认 true；关掉则失败仅报错，兜底面板保留手动入口 |
| `title` | `string` | `''` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: boolean` | — |
| `scan` | `code: string` | 识别到一条码（逐条交付） |
| `finish` | `codes: string[]` | multiple 模式关闭时一次性交付全部结果 |
| `error` | `msg: string` | 降级/失败提示（相机不可用、识别失败等） |
| `close` | `无` | — |

## `CaptureFallbackPanel`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `mode` | `'scan' \| 'photo'` | `'scan'` | 否 | scan = 上传识别 + 手工输入；photo = 仅上传（相册/文件） |
| `disabled` | `boolean` | `false` | 否 | — |
| `busy` | `boolean` | `false` | 否 | 识别中（控件禁用 + 显示进度提示） |
| `error` | `string` | `''` | 否 | 识别失败等错误提示（留在面板内，方便直接改用输入） |
| `uploadHint` | `string` | `''` | 否 | 上传条文案 |
| `hint` | `string` | `''` | 否 | 面板顶部说明（通常由宿主传入降级原因） |
| `placeholder` | `string` | `''` | 否 | 手工输入占位 |
| `accept` | `string` | `'image/*'` | 否 | — |
| `multiple` | `boolean` | `false` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `files` | `files: File[]` | 用户选好文件：宿主负责识别 / 交付 |
| `submit` | `code: string` | scan 模式手工输入提交 |
| `retry` | `无` | 重试上一级采集（宿主决定怎么重开：页面内相机 / 系统相机） |

## `CaptureFallbackSheet`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `modelValue` | `boolean` | — | 是 | 显隐（v-model） |
| `mode` | `'scan' \| 'photo'` | `'scan'` | 否 | — |
| `disabled` | `boolean` | `false` | 否 | — |
| `busy` | `boolean` | `false` | 否 | — |
| `error` | `string` | `''` | 否 | — |
| `uploadHint` | `string` | `''` | 否 | — |
| `hint` | `string` | `''` | 否 | — |
| `placeholder` | `string` | `''` | 否 | — |
| `accept` | `string` | `'image/*'` | 否 | — |
| `multiple` | `boolean` | `false` | 否 | — |
| `title` | `string` | `''` | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: boolean` | — |
| `files` | `files: File[]` | — |
| `submit` | `code: string` | — |
| `retry` | `无` | 重试上一级采集（转发自 CaptureFallbackPanel，宿主自行接线） |
| `close` | `无` | — |

