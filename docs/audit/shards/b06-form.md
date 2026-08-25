# form 域功能清单

> 6 组件 + date-panel×2 + utils×4。行号以 2026-08-25 为准。

---

## form/Input.vue（932 行）⭐

**定位**：统一输入组件——text/password/email/tel/number(textarea/search/url 8 类型合一；浮动标签；校验规则；数字步进（原 InputNumber）；自动填充检测。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| type | 8 枚举 | 'text' |
| modelValue | string\|number\|null（必填） | — |
| label / icon / placeholder / name / autocomplete | string? | ''/—/''/—/'off' |
| disabled / readonly / stepper / clearable | boolean | false |
| rules | 校验函数[] | [] |
| hint | string? | — |
| min / max | number\|null | null |
| step | number | 1 |
| precision | number? | 自动从 step 推断 |
| size | 'sm'\|'md'\|'lg' | 'md' |
| maxlength / minlength / rows | number? | —/—/3 |

**Emits**：`update:modelValue`、`focus`、`blur`、`keyup`、`clear`、`change`
**Slots**：无

**功能点**
1. **四模板**：stepper（数字+按钮）/ 纯数字 / textarea / 标准文本（:413-601）。
2. **浮动标签**：label for=inputId（useId）关联，focus/hasValue/autoFilled 上浮（:394-398,496）。
3. **校验**：rules 数组首个错误，blur 触发 + modelValue watch 重验（touched 守卫）（:124-149）。
4. **数字步进**：正则过滤非法字符、precision/roundTo/clampRound、Enter 提交、**长按连加**（400ms 延迟 + 100ms 间隔）、边界 disabled（:234-391）。
5. **自动填充检测**：MutationObserver 监听 value 属性 + animationstart + 300ms 兜底 + CSS autofill 样式联动标签上浮（:156-197,787-829）。
6. **密码显隐**：eye/eye-off 切换 + aria-live 播报（:109-113,573-593）。
7. **错误边界**：onErrorCaptured → "⚠ 输入异常"（:9-13,402-408）。

**测试**：label-association.spec（5 用例：text/textarea/number 标签关联、无 label 不渲染、Select）、form-i18n.spec（1 用例：密码显隐文案）、keyboard-a11y.spec（TimeColumns）。**未测**：数字步进/长按/校验/自动填充。

**问题**
1. 数字模式 `type="text" + inputmode=decimal`（:482）——不挡非数字字符但已正则过滤，行为 OK。
2. `@blur="(isCombobox?...)"` 是 Select 的，Input 无此问题。
3. 密码显隐按钮无 aria-pressed（仅 sr-only 播报），中低危 a11y。

---

## form/Select.vue（1419 行）⭐

**定位**：统一选择器——8 模式（select/menu/combobox/cascader/tree-select/date/date-range/time）+ 搜索（拼音）+ 校验 + 浮动标签。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| type | 8 枚举 | 'select' |
| modelValue | 复合类型 | — |
| options / items / cascaderOptions | Option[]/MenuItem[]/CascaderOption[] | [] |
| label / placeholder | string? | —/'请选择' |
| rules | 函数[] | [] |
| error | string? | — |
| multiple | boolean | false |
| searchable / pinyinEnabled | boolean | true |
| isLoading / allowCreate / clearOnFocus / clearable | boolean | false |
| emptyText | string | '暂无匹配项' |
| zIndex / format / dateMin / dateMax | string | —/'YYYY-MM-DD'/''/'' |
| rangePlaceholder | [string,string] | ['开始日期','结束日期'] |
| timeStep | number | 1 |

**Emits**：`update:modelValue`、`change`、`focus`、`blur`、`visibleChange`
**Expose**：`openMenu`（右键菜单）
**Slots**：`empty`、`option`（作用域 opt/selected）

**功能点**（核心重写注释 :1-13）
1. **面板开关策略**：只用 @click（非 @focus）消除双重触发；useClickOutside 加 openedAt 150ms 防抖（:146-169）；外部滚动 300ms 防抖关闭（:171-177）。
2. **拼音搜索**：共享 createPinyinMatcher（缓存 + pruneCache 防泄漏）+ 200ms debounce（:244-299）。
3. **combobox**：自由输入 + allowCreate、Enter 提交、失焦 commit/blur 150ms 恢复（:498-638）。
4. **键盘导航**：方向键高亮 + Enter 选中、Esc 关闭（:646-675）。
5. **tree-select/cascader**：useTreeFlatten 扁平化 + 路径显示 + 多选（:448-496）。
6. **date/date-range/time**：DatePanel/TimeColumns 集成 + 范围 hover 预览 + timeStep（:680-791）。
7. **菜单模式**：openMenu 右键定位（x/y 浮动）（:420-443）。
8. **a11y**：role=combobox/listbox/tree/menu + aria-expanded/haspopup/activedescendant/controls（:826-834）。

**测试**：label-association.spec（Select 标签关联 1 用例）。**未测**：全部交互（搜索/键盘/combobox/date）。

**问题**
1. `aria-controls="'select-dropdown-list'"` 是固定 id——多个 Select 同页会重复 id（:832,869）。🔴 a11y 中危。
2. 面板无 aria-multiselectable（multiple 时）。
3. tree-select 的 `:aria-selected` 仅叶子——符合 tree 语义。
4. 无挂载级测试，8 模式全手工验证——全库风险最高的组件之一。

---

## form/Group.vue（687 行）⭐

**定位**：统一选择组——radio/checkbox/switch/rate/slider 5 模式合一。

**Props**：`type`('radio')、`modelValue`(复合)、`options`(Option[])、`direction`('vertical')、`disabled`、`max`(checkbox 上限,0=不限)、`ariaLabel`、`label`(switch)、`size`(switch)、`rateMax`(5)/`allowHalf`/`color`('#F59E0B')、`min`/`sliderMax`(100)/`step`/`showValue`。

**Emits**：`update:modelValue`、`change`
**Slots**：无

**功能点**
1. **radio/checkbox 真实 input**（sr-only 视觉隐藏但保焦点/读屏）+ label 包裹（:314-363）——**已修复历史"伪控件"审计点**。
2. **radio 分组唯一 name**（useId）（:75,323）。
3. **checkbox max 上限**（:100）。
4. **switch**：role=switch + Enter/Space 键盘 + focus-visible（:366-382）。
5. **rate**：半星（mousemove 判半）、hover 预览、role=slider（:131-157,385-415）。
6. **slider**：单/双拇指、PointerEvent 捕获、键盘方向键/Home/End、step 对齐（alignStep 浮点安全）、fill 区间（:190-308,418-439）。

**测试**：group.spec（4 用例：radio/checkbox 真实 input、disabled、点击单选）。**未测**：switch/rate/slider 全交互。

**问题**
1. rate 的半星逻辑 `i - 0.5 === activeVal`（:153）对浮点 0.5 倍数精确相等——getHalfVal 产出 0.5 步进，精确匹配 OK。
2. slider 双拇指在 modelValue 非数组时 norm() 返回 [v,v]，thumbs 单元素——语义正确。
3. rate 组件 role=slider 但键盘仅能点击按钮（按钮本身可 Tab）——aria-valuenow 无键盘调节，中低危。

---

## form/IconPicker.vue（667+ 行）

**定位**：图标选择器——Lucide/Solar 双提供者、搜索、颜色（fg/bg）、预设色板、分批渲染。

**Props**：`modelValue`('star')、`color`('#6366F1')、`bgColor`('#EAECF0')、`placeholder`('选择图标')、`presetColors`(8 色)、`provider`('lucide')。
**Emits**：`update:modelValue/color/bgColor/provider` + `change: [{icon,color,bgColor}]`
**Slots**：无

**功能点**
1. **Lucide 全量 1500+ 图标**：预构建 JSON 加载避免运行时 Object.keys（:15-16）。
2. **Solar 在线加载**：Iconify CDN 拉取 + 失败降级内置 SOLAR_ICONS（:58-73）。
3. **分批渲染**：PAGE_SIZE 200 + IntersectionObserver 触底追加（:105-139）。
4. **colorTarget 机制**：预设色板作用于 fg/bg 当前目标（:52,288-291）。
5. 点击外部/滚动自动 confirm 提交（:82-94）。
6. 提供者切换 tab（role=tablist/tab）（:199-218）。

**测试**：无直接 spec。**未测**：全部。**问题**：面板 v-show 常驻 Teleport（非 v-if）——图标 DOM 始终挂载（分批后可控）。

---

## form/Upload.vue（910 行）⭐

**定位**：文件上传——拖拽/点击/粘贴/目录选择，default+card 双变体，图片压缩、自定义请求/模拟上传、移动端拍照菜单 + CameraCapture 集成。

**Props**：`accept`('image/*')、`multiple`、`maxSize`(10MB)/`minSize`、`disabled`、`drag`(true)、`modelValue`(UploadFile[])、`customRequest`、`variant`('default'/'card')、`label`、`directory`、`mobileMenu`、`compress`(false)/`maxWidth`(1920)/`compressQuality`(0.85)。
**Emits**：`change`、`remove`、`error`、`update:modelValue`、`preview`(card 点击预览)
**Expose**：`retryFile`、`triggerFileInput`
**Slots**：`trigger`(open-file-dialog)、`file-item`(file/index)

**功能点**
1. **accept 白名单**：MIME 通配/扩展名/精确匹配（isMimeAccepted）（:292-300）；拖拽/粘贴/目录选择全走统一校验（:180,313）。
2. **图片压缩**：canvas resize + quality，压缩后大于原图返回原文件（:120-161）。
3. **customRequest / simulateUpload**：真实请求失败置 error + 重试；模拟上传进度条（:231-264,319-326）。
4. **粘贴上传**：排除 INPUT/TEXTAREA 目标 + accept 过滤防恶意 SVG/HTML（:302-317）。
5. **移动端菜单**：触屏 + mobileMenu → 底部「拍照/相册/文件」sheet + 焦点陷阱（:335-374,619-628）。
6. **页面内拍照**：集成 CameraCapture（避免 Android/Edge 调系统相机杀进程白屏）（:376-399）。
7. **card 变体**：预览/翻页/双击替换/删除、单击 280ms 防抖预览（:410-452）。
8. **竞态防护**：外部空数组同步不打断进行中的上传（:89-107 注释详述）——防"拍照返回刷新后图片丢失"。
9. **资源清理**：Blob URL revoke + interval 清理（:462-469）。

**测试**：无直接 spec。**未测**：全部（accept 校验/压缩/粘贴/card 交互/拍照降级）。

**问题**：无显著问题；逻辑相当健壮（注释详尽）。

---

## form/CameraCapture.vue（450 行）

**定位**：页面内拍照（原生相机布局）——避免系统相机杀进程；失败自动降级系统相机。

**Props**：`modelValue`(v-model 显隐)、`quality`(0.9)、`fallbackOnError`(true)。
**Emits**：`update:modelValue`、`capture: [File]`、`cancel`、`error: [msg]`。
**Slots**：无。

**功能点**
1. **取流**：4:3 + 3264×2448 ideal 高清；OverconstrainedError/TypeError 去掉 facingMode 重试（:86-100）。
2. **翻转**：enumerateDevices 检测前置摄像头，授权前后各刷一次（iOS 未授权不全）（:75-82,123）。
3. **拍照**：canvas 整帧（与取景一致）、toBlob JPEG、videoWidth=0 重试一帧再降级（:193-207）。
4. **降级**：fallbackOnError → close + 调系统相机（capture input）；微信 X5 内核不传 capture（自带拍摄入口）（:131-165）。
5. **错误映射**：8 类摄像头错误 → 中文文案（:254-264）。
6. **焦点陷阱**（P2-5 已实现）（:14-18）。
7. 前置自拍镜像（:289,363-365）。

**测试**：无直接 spec（依赖真实摄像头）。**未测**：全部。

**问题**：无。

---

## form/date-panel/DatePanel.vue（337 行）

**定位**：日历面板（Select date/date-range 共用）——42 格、范围高亮/悬停预览、min/max、今天。

**Props**：`modelMonth`(v-model)、`selected`(string\|string[])、`hoverEnd`、`min`/`max`(format 同格式字符串比较)、`range`、`format`('YYYY-MM-DD')。
**Emits**：`select`、`hover`、`update:modelMonth`。**Slots**：`actions`。

**功能点**
- 42 格补全（本地时区 new Date(y,m,d)，避免 UTC 偏移）（:60-85）。
- min/max 字符串比较（format 决定字典序）（:93-98）。
- 范围模式：start/end/hover 三态 + 区间高亮 + 两端圆角（:102-125,280-301）。
- 今天按钮受 min/max 约束（:150-154）。
- **全 i18n**：t('form.*') + tm('form.weekdays')（星期数组）。

**测试**：无直接 spec。**问题**：min/max 依赖 format 字符串字典序——自定义 format 顺序变化时比较失效（文档需注明）。低危。

---

## form/date-panel/TimeColumns.vue（210 行）

**定位**：时间三列滚动选择（HH:mm / HH:mm:ss）——分钟按 step 对齐。

**Props**：`value`、`format`('HH:mm')、`step`(1)。
**Emits**：`select: [time]`。
**功能点**：分钟列按 step 步进（:42-46）；选中值滚动居中（scrollToValue，:65-77）；列内点击/键盘选择（:87-95,107-111）；sticky 表头。
**测试**：keyboard-a11y.spec（TimeColumns tp-cell 键盘 1 用例）。**问题**：无。

---

## form/utils

| 模块 | 导出 | 职责/问题 |
|------|------|------|
| date-utils.ts | pad2/formatDate/parseDate/isValidDate/todayISO/formatDateZh/formatDateTimeZh | 本地时区格式化；parseDate 不校验真实日期（注释注明）；isValidDate 用 setFullYear 避免 0-99 年歧义。**测试**：utils.spec 覆盖（formatDateZh/formatDateTimeZh 等） |
| slider-utils.ts | clamp/alignStep | 浮点安全 step 对齐。**测试**：无直接 |
| types.ts | BuiltinFormat/BuiltinRule/FieldConfig/DropZoneConfig/DropZoneFile/PersistedFormData/ExportColumn/ExportSheet/ExportExcelOptions/ZipFileEntry/ZipFileContext/ExportZipOptions | DynamicForm/导出配置类型（xlsx/zip 相关） |
| useBarcodeScanner.ts | useBarcodeScanner/DEFAULT_CAPTURE_REGION/CaptureRegion/BarcodeScannerOptions | zxing-wasm 扫码：**自适应间隔**（设备性能评估 60-200ms 基准 + 成功缩短/失败增大 40-300ms）；confirmCount 连续命中；cooldown 冷却；scanPhoto 图片扫码；8 类错误中文映射；start 幂等 + play() 抛错释放流 |

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | 6 + date-panel×2 |
| utils | 4 ts |
| 直接 spec 覆盖 | group.spec(4)、label-association.spec(Input 4 + Select 1)、form-i18n.spec(1)、keyboard-a11y(TimeColumns 1) |
| 未测组件 | Select(全部 8 模式)、Upload、IconPicker、CameraCapture、DatePanel |
| i18n | Input/Select/Group/Upload/CameraCapture/DatePanel/TimeColumns 全接入 useT；**useBarcodeScanner 错误文案硬编码中文**（模块非组件） |
| 安全 | Upload 粘贴 accept 白名单 ✅；压缩 canvas 无 XSS 面 |
| 关键问题 | Select aria-controls 固定 id 冲突；Select 0 挂载测试 |

**最重要发现**
1. **Select 是全库最复杂交互组件**（1419 行 8 模式），却只有 1 个标签关联测试——交互回归风险全库最高。
2. **Upload 是本域工程亮点**：accept 白名单统一校验、竞态防护注释、资源清理、移动端三件套（菜单+拍照+降级）都做得很扎实。
3. **历史"伪控件"审计点在 Group/Input 已用真实 input 修复**，仅 Select 的 aria-controls 固定 id 为新增残留。
