# data 域展示类组件功能清单（Avatar/Card/Collapse/Divider/Empty/Image/ImagePreview/ProgressBar/Skeleton/ToggleList/Tree）

> DataTable 与 composables 见单独分片；行号以 2026-08-25 工作区为准。

---

## data/Avatar.vue（82 行）

**定位**：头像，图片加载失败自动回退首字母文字头像。

**Props**

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | string? | — | 图片地址 |
| name | string? | — | 姓名 → 首字母 fallback（取前两词首字母大写，无则 '?'） |
| size | 'sm'\|'md'\|'lg'\|'xl' | 'md' | 32/40/56/72px |
| shape | 'circle'\|'rounded' | 'circle' | — |

**功能点**：img @error → imgError 回退文字（:33-37,46-49）；alt 回退 name 或 'avatar'（:46）。

**测试**：无直接 spec（basic-components 未 import Avatar）。**问题**：无。

---

## data/Card.vue（207 行）

**定位**：双模式卡片——grid（容器卡：header/body/footer）与 stat（统计卡：值+标签+趋势）。

**Props**（交集类型，两种模式共用）

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| type | 'grid'\|'stat' | 'grid' | 模式 |
| title | string? | — | grid 标题 |
| highlight | boolean | false | 高亮（border-left 色条 / 描边） |
| summary | boolean | false | 汇总底色（grid） |
| overflowVisible | boolean | false | 允许内容溢出（含下拉组件场景） |
| value | string\|number? | — | stat 数值 |
| label | string? | — | stat 标签 |
| icon | string? | 'circle-alert' | stat 图标 |
| color | string? | — | stat 自定义色（bg 自动加 '20' 透明度后缀） |
| trend | number\|string? | — | 趋势（正/负/零 → 上/下/横箭头 + 红绿灰） |

**Emits**：`click`（stat 模式）
**Slots**：默认、`header`（grid）、`footer`（grid）

**功能点**
- trend 字符串解析（去 %、parseFloat、NaN→0）（:36-41）；trendUi 图标/颜色映射（:42-52）。
- stat 卡片 role="button" tabindex=0 + Enter/Space 键盘触发（:61-66）——**已修复 07 审计的"卡片点击无键盘"**。

**测试**：basic-components.spec（渲染类）；keyboard-a11y.spec（键盘可达）。**未测**：trend 解析分支、stat/grid 切换。

**问题**：无。

---

## data/Collapse.vue（186 行）

**定位**：折叠面板，JS 测量 max-height 精确动画（非硬编码 1000px），手风琴模式支持。

**Props**：`title`(必填)、`open`(false)、`disabled`(false)、`id`(''，aria 关联)、`accordion`(false，配合外部 CollapseGroup)。
**Emits**：`update:open`、`accordion-expand`（手风琴展开通知外部关闭同组）。
**Slots**：默认。

**功能点**
- 有 v-model 时同步 prop → 内部 _open；无则自主管理（:31-37）。
- max-height 动态测量 scrollHeight（:43-53），ResizeObserver 在内容尺寸变化/窗口 resize 时重测（:66-77）。
- a11y 完整：按钮 aria-expanded/aria-controls + 面板 role="region" aria-labelledby + 随机 id（:40-41,93-114）。
- disabled 阻止 toggle（:79-88）。

**测试**：basic-components.spec 覆盖。**未测**：accordion-expand、watch open 同步。

**问题**：无。

---

## data/Divider.vue（66 行）

**定位**：分割线，横向（可带文字）/纵向。

**Props**：`text`、`direction`('horizontal')、`dashed`(false)。
**功能点**：横向带文字时用 ::before/::after 双线夹文字（:37-46）；纵向 text 无效（:21）。
**测试**：basic-components.spec 覆盖。**问题**：无。

---

## data/Empty.vue（74 行）

**定位**：空状态占位（无数据/无搜索/空列表）。

**Props**：`icon`('file')、`title`、`description`。**Slots**：默认（操作区）。
**功能点**：role="status" aria-live="polite"（:23）。
**测试**：basic-components.spec 覆盖。**问题**：无。

---

## data/Image.vue（190 行）

**定位**：图片组件，懒加载 + 占位/失败态 + 内置灯箱预览。

**Props**

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| src | string? | — | 图片地址 |
| alt | string? | '' | — |
| width / height | number? | — | 像素 |
| size | number? | 80 | 未设宽高时的默认 |
| fit | 5 枚举 | 'cover' | object-fit |
| radius | number? | 4 | 圆角 px |
| round | boolean | false | 圆形 |
| lazy | boolean | true | 懒加载（IntersectionObserver + 200px rootMargin，缺 IO 时直接加载） |
| preview | boolean | true | 点击灯箱预览 |
| loadingText / errorText | string? | '' | 占位/失败文案 |

**Emits**：`load: [src]`、`error: [src]`、`click: [src]`
**Slots**：无

**功能点**
- 懒加载 IO，卸载 disconnect（:56-81）。
- 三态渲染：占位 → 失败 → 图片（v-show 控制，loaded 才显示）（:113-135）。
- 点击灯箱：preview && loaded 才开（:97-100）；内嵌 ImagePreview（:139-141）。
- role="img" aria-label（:109-110）。

**测试**：无直接 spec。**未测**：懒加载/失败态/灯箱联动。

**问题**
1. 灯箱预览复用 ImagePreview 全屏组件，但 Image.vue 内嵌时无 mutexScope 控制（ImagePreview 未用 registerModal）——多次打开预览与其它弹窗的 z-index 竞争，靠 boostZTop 缓解。低危。

---

## data/ImagePreview.vue（1477 行）⭐

**定位**：全屏图片预览器——多图导航、缩略图、缩放/平移/旋转/翻转、触摸手势（pinch/双击/轻扫）、**标注系统（矩形/圆形/画笔）**、导出合成图（下载/复制）。

**Props**：`src`(ImageSrc = string | ImageItem | 数组)、`initialIndex`(0)、`title`。
**Emits**：`close`、`change: [index]`。**Slots**：`actions`（底部工具栏追加）。

**功能点**（大组件，分系统）
1. **src 归一化**：任意 string/对象/数组组合 → ImageItem[]（:39-47）。
2. **标注系统**：rect/circle/pen 三工具（:86-119）；绘制/拖动/命中检测/删除；r/p/c 快捷键、Delete 删除、Esc 取消（:477-528）；色板 6 色 + 线宽 2/4/6（:118-119）；Canvas rAF 节流渲染（:294-316）；反方向 rect/circle 归一化（:225,324）；零尺寸/过短 pen 丢弃（:449-455）；touchcancel 清理半成品（:658-667）。
3. **窄屏工具行自适应**：色点按 scrollWidth 从后往前隐藏、选中色恒保留（fitAnnoColors，:152-177）。
4. **变换**：scale 0.25–5、拖拽平移（放大/旋转时）、旋转 0/90/180/270、水平翻转（:669-729）；滚轮缩放（:697-700）；双击 1x↔2x（:718-720）。
5. **触摸手势**：双指 pinch 以中心为锚（:583-597）、放大后单指平移、双击缩放、多图水平轻扫切图（:647-653）。
6. **导出合成**：fetch CORS 重取图避免 canvas 污染（:761-784）、SVG/blob URL 降级、标注按比例换算重绘（mapAnnoToImage）、downloadScreenshot / copyScreenshotToClipboard + useToastNotify 反馈（:813-842）。
7. **z-index 提升**：boostZTop 模块级引用计数，挂载期间临时将 Toast z-top 提到 10001（:142-145,185,197）。
8. **键盘**：方向键切图、Esc 关闭、标注快捷键（:477-528）；挂载聚焦弹层（:187）。
9. **i18n**：全部文案走 useT，$t 别名防 v-for 遮蔽（:10-12）。
10. 多图切换时重置标注与变换（:130-138,466-467）。

**测试**：image-preview.spec（7 用例）。**未测**：标注绘制流（canvas）、触摸手势、导出合成、快捷键。

**问题**
1. `currentIndex` 初始化在 items 未就绪时 `total.value - 1` 可能为 -1，Math.min(0,-1) → -1（:51）；initialIndex watch 修正，但首次 `currentUrl` 为空时模板 v-if 不渲染（:853），无崩溃。边界低危。
2. 标注与旋转/翻转不同步（:751 注释明示），导出时标注不跟随旋转——已知设计取舍。
3. 无 registerModal 互斥（不同于 Drawer）：多预览实例/与其它弹层并存时靠 z-index 硬扛。中低危。

---

## data/ProgressBar.vue（364 行）

**定位**：进度条 + 交互滑块（interactive）双模式，支持刻度、数字输入、键盘。

**Props**

| 名称 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| percent | number | 0 | 只读进度 |
| variant | 4 枚举 | 'primary' | — |
| showText | boolean | true | 百分比文本 |
| height | number | 6 | 轨道高 px |
| striped / animated | boolean | false | 条纹/流动 |
| interactive | boolean | false | 滑块模式 |
| modelValue | number | 0 | 滑块值（v-model） |
| min / max / step | number | 0/100/1 | 范围 |
| disabled | boolean | false | — |
| showInput | boolean | false | 数字输入框 |
| showStops | boolean | false | 刻度 |

**Emits**：`update:modelValue`、`change`

**功能点**
- 滑块：PointerEvent 捕获（setPointerCapture）拖轨道/拇指、window 级 move/up（:82-105,122-131）；snapToStep 钳制（:63-66）。
- 键盘：方向键 ±step（:107-120）；thumb role="slider" + aria-valuemin/max/now + tabindex=0（:160-171）。
- 刻度 stops：最多 50 个，active 按 modelValue 高亮（:53-61）。
- 输入框 Number 校验，NaN 忽略（:75-80）。
- 只读模式 percent 钳制 0–100、NaN→0（:181）。

**测试**：无直接 spec（ProgressBar 未在任何 spec import）。**未测**：全部。

**问题**
1. 拖拽时未阻止文本选择/轨道点击歧义，且 onPointerDown 同时挂在 thumb 与 track（:82,90），thumb 事件冒泡到 track 会重复 emit——`@pointerdown="onPointerDown"` 无 .stop，track 的 onTrackPointerDown 也会触发。**重复 emit 低危 bug**（实测路径：thumb 按下 → thumb handler + track handler 各 emit 一次）。

---

## data/Skeleton.vue（128 行）

**定位**：骨架屏（loading 为 true 显示骨架，false 渲染真实内容）。

**Props**：`loading`(true)、`rows`(3)、`animated`(true)、`avatar`(false | number | 'sm'|'md'|'lg'|CSS尺寸)、`title`(true)、`width`/`height`(自定义块尺寸)。
**Slots**：默认（loading=false 时渲染）。

**功能点**
- 行宽模式：标题 40%、末行 60%、其余 100%（:50-53）。
- avatar 尺寸解析：number→px、映射表、字符串原样（:35-40）。
- role="status" aria-label="加载中"（:62-64）。
- **prefers-reduced-motion 自动停流光**（:121-126）。

**测试**：basic-components.spec 覆盖。**问题**：无。

---

## data/ToggleList.vue（272 行）

**定位**：切换列表（开关变体）与操作列表（按钮变体，如"发快递"）。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| items | Record<string,any>[]（必填） | — |
| idKey / titleField / descriptionField / iconField / toggleField | string | 'id'/'display_name'/'description'/'icon'/'is_enabled' |
| extraColumns | ExtraColumn[] | [] |
| disabled / isLoading | boolean | false |
| emptyText | string | '暂无数据'（硬编码中文） |
| variant | 'switch'\|'button' | 'switch' |
| buttonLabel | string | '发快递' |
| phoneField | string | 'phone' |

**Emits**：`toggle: [item, newValue]`、`itemClick: [item]`、`buttonClick: [payload:{name,phone,address,item}]`

**功能点**
- toggle 同步改写 item[toggleField] 使状态即时刷新（:53-58）。
- 行 role="button" + Enter/Space 键盘（:78-82）——**已修复 07 审计"行点击无键盘"**。
- 开关用真实 checkbox（display:none 视觉隐藏但可聚焦/可键盘）；label 包裹（:99-112）。
- 三态：loading / empty / 列表（:63-72）。
- button 变体收集 name/phone/address 一键回调（:115-129）。

**测试**：keyboard-a11y.spec（3 用例，键盘可达）。**未测**：toggle 同步、buttonClick 载荷。

**问题**
1. `emptyText`/`加载中...`/`发快递` 默认文案硬编码中文，未走 i18n。
2. 行与开关同为可点元素，行 @click 与 label @click.stop 已隔离，但开关本身在 role="button" 行内——嵌套交互元素 a11y 语义略混（label 内是原生 checkbox，行为正确）。

---

## data/Tree.vue（504 行）

**定位**：递归树形控件——展开/折叠、勾选（父子联动 + 半选）、单选、懒加载。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| data | TreeNode[]（必填） | — |
| level | number | 0（内部递归用） |
| checkable | boolean | false |
| defaultExpandedKeys | (string\|number)[] | [] |
| expandAll | boolean | false |
| selectable | boolean | false |
| selectedKey | string\|number\|null | null |
| lazy | boolean | false |

**Emits**：`node-click`、`check-change: [checkedKeys, node]`、`update:selectedKey`、`load`（懒加载展开触发）
**Slots**：无

**功能点**
1. **递归自嵌套**：子级 `<Tree :data :level+1>` 递归渲染，inject 共享根 state（TREE_KEY），max 深度 15 防栈溢出（:333,65-66）。
2. **展开管理**：useTreeFlatten composable；expandAll/defaultExpandedKeys watch（:110-114,235-252）。
3. **勾选联动**：checkState Map + indeterminateState Set；子勾选向上递归更新父半选（updateNodeCheckState，:144-160）；initCheckState 由 data.checked 初始化并向下传播（:119-130）；disabled 不可勾选（:197）。
4. **性能**：parentMap 预构建 O(1) 父查找，将 O(n²) 降 O(n)（:86-108）。
5. **懒加载**：展开无 children 且非 isLeaf → emit load（:177-182）。
6. **a11y**：role=tree/treeitem/group、aria-expanded/selected/label；tabindex 管理（选中节点 0，否则首节点 0）（:278-298）。
7. **层级视觉**：字号 14×0.85^level（≥10px）、透明度 1-0.12×level（≥0.4）、padding 按 level（:269-274）。
8. 半选样式：checkbox indeterminate DOM 属性 + 自定义样式（:315-317,447-461）。

**测试**：无直接 spec（composables.spec 测 useTreeFlatten）。**未测**：勾选联动、懒加载、半选、selectable。

**问题**
1. 递归节点使用 `provide/inject` + 根 state，但子级 `<Tree>` 组件内 props.checkable/selectable 变化不传递给递归子树（子树读根 state 的 checkable）——**以根为准**，符合常规。
2. selectable 时点击叶子节点只 emit update:selectedKey 不展开（:212-213）；无 selectable 时点击有 children 节点切换展开——语义清晰。
3. 键盘：treeitem 可 tab 到，但**无方向键导航**（仅 tab 到首/选中节点）——a11y 增强空间。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | 11 |
| 直接 spec 覆盖 | basic-components（Divider/Empty/Skeleton/Card/Collapse）、keyboard-a11y（Card/ToggleList）、image-preview（ImagePreview 7 用例） |
| 未测组件 | Avatar / Image / ProgressBar / Tree |
| i18n | 仅 ImagePreview 完整接入；ToggleList 默认文案硬编码 |
| 已修复历史问题 | Card/ToggleList 键盘可达（role+tabindex+Enter/Space） |
| 遗留 | ProgressBar 重复 emit 低危；ImagePreview 无弹窗互斥；Tree 无方向键 |

**最重要发现**
1. **ImagePreview 是全库第二复杂组件**（1477 行）：标注 + 手势 + 导出三套子系统，测试仅 7 用例且未覆盖标注/手势/导出。
2. **ProgressBar thumb 按下重复 emit**（thumb+track 双 handler 无 .stop）——可复现的交互 bug。
3. **data 展示类整体 a11y 水平高**（真实 checkbox、role、键盘），历史欠账已修复大半。
