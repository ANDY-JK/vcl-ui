# nav + layout 域功能清单

> 行号以 2026-08-25 工作区为准。

---

## nav/Pagination.vue（189 行）

**定位**：分页器——页码窗口（首/尾/±2）+ 省略号 + 快速跳转。

**Props**：`modelValue`(number,必填)、`total`(number,必填)、`pageSize`(10)、`showQuickJumper`(false)。
**Emits**：`update:modelValue`。**Slots**：无。

**功能点**
- 页码窗口算法：1、total、current±2，多余折叠为 '...' 单省略号（:28-42）。
- `calcTotalPages` 守卫：pageSize≤0 按 1 处理，避免 Infinity 死循环；total 为 0/NaN 兜底 1 页（pagination-utils.ts:5-7）。
- 快速跳转 Enter 触发、钳制 1..totalPages（:51-57）。
- a11y：nav role + aria-label、aria-current="page"、上下页 aria-label（:61-93）。
- i18n：t('pagination.total'/'items')（:107）。

**测试**：utils.spec 覆盖 calcTotalPages（16 用例之一）。**未测**：组件挂载、窗口折叠、jumper。

**问题**：无。

---

## nav/Steps.vue（182 行）

**定位**：步骤条——横向/纵向、done/active/pending 状态、clickable 跳转。

**Props**：`steps`(Step[]，{label,desc?},必填)、`current`(number,必填)、`direction`('horizontal')、`clickable`(false)。
**Emits**：`stepClick: [index, step]`。**Slots**：无。

**功能点**
- 状态判定 idx<current done / idx===current active / idx>current pending（:40-44）。
- done 步骤渲染 circle-check 图标（:54-57）；连线 filled（:67,152-154）。
- clickable：role="button" + tabindex + Enter/Space 键盘（:46-51）；focus-visible 轮廓（:163-167）。
- 纵向连线 absolute 定位（:172-180）。
- aria-label「步骤 N: label」（:48）。

**测试**：无直接 spec。**未测**：全部。

**问题**：无。

---

## nav/Breadcrumb.vue（83 行）

**定位**：面包屑——路由链接（RouterLink）/普通链接/当前项 + 自定义分隔符。

**Props**：`items`(Crumb[]，{label,path?,to?},必填)、`separator`(自定义文本分隔符)。
**Emits/Slots**：无。

**功能点**
- 路由判定：path/to 以 # 或 / 开头 → RouterLink，normalizeTo 去 # 补前导 /（:22-29,35-41）。
- 非路由 path → 普通 `<a href>`（:42）；无链接 → span aria-current="page"（:43）。
- 分隔符：自定义文本或 chevron 图标（:44-45）。

**测试**：无直接 spec。**未测**：全部。

**问题**
1. `items` 含 `to` 属性但传给 normalizeTo 的是 `(item.path || item.to)`——两者均有时优先 path，语义轻微混乱。低危。

---

## nav/Menu.vue（425 行）

**定位**：多级菜单——vertical/horizontal 双模式、inline/overlay 双子菜单、hover 延迟、dark 主题、折叠浮层。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| items | MenuItem[]（{key,label,icon?,children?,disabled?,divided?,action?}，必填） | — |
| mode | 'vertical'\|'horizontal' | 'vertical' |
| selectedKey | string\|number? | — |
| collapsed | boolean | false |
| multiple | boolean | false |
| level | number | 0 |
| theme | 'light'\|'dark' | 'light' |

**Emits**：`select: [item]`、`update:selectedKey`
**Slots**：无

**功能点**
1. **递归子菜单**：inline（vertical 点击展开）与 overlay（horizontal/collapsed 浮层）双形态（:197-241）。
2. **hover 延迟**：enter 150ms 延迟、leave 150ms 延迟、浮层 hover 取消离开（cancelLeave）（:43-70,163-164,218-219）。
3. **展开管理**：expandedKeys Set，multiple 控制互斥（:77-87）。
4. **键盘导航**：Enter/Space 选择、Esc 收起、方向键在兄弟 menuitem 间聚焦（focusSibling，:101-131）。
5. **折叠模式**：vertical+collapsed → 只显示图标 + 右侧浮层子菜单（:135-141,179,365-373）。
6. **divided**：分隔线项；纯分隔线（无 label 无 children）只渲染 separator（:156-159）。
7. **a11y**：role=menu/menuitem/separator、aria-expanded/disabled、tabindex（:153-181）。
8. **层级视觉**：level 透明度衰减 1-0.1×level（≥0.5）（:145-149）。
9. dark 主题浮层深色适配（:344-348）。
10. overlay 选中后关闭浮层（:228-239）。

**测试**：无直接 spec。**未测**：全部（hover 时序/键盘/递归）。

**问题**
1. `focusSibling` 用 `[role="menuitem"]` 查兄弟，但分组项（有 children）也是 menuitem——跨层级聚焦可能跳到子菜单项。低危。
2. 点击分组项 toggleExpand 后不 emit select——语义正确（展开而非选择）。

---

## nav/Tabs.vue（186 行）

**定位**：标签页——underline/pills/card/tabbar 四变体 + WAI-ARIA Tab 键盘导航。

**Props**：`modelValue`(必填)、`items`(TabItem[]，{label,value?,icon?},必填)、`variant`('underline')。
**Emits**：`update:modelValue`。**Slots**：无。

**功能点**
- 键盘：ArrowLeft/Right 循环切换 + Home/End 首尾，切换后聚焦新 tab 按钮（:29-57）。
- role=tablist/tab + aria-selected/aria-controls（:61-70）。
- icon 仅 tabbar 变体渲染（:73,7）。

**测试**：无直接 spec。**未测**：全部（含键盘导航）。

**问题**
1. `aria-controls` 指向 `tabpanel-${value}`，但组件**不渲染 tabpanel**——关联悬空。低危 a11y。
2. card 变体依赖 `:first-child/:last-child` 圆角，若被包裹结构变化会失效。低危。

---

## nav/utils/pagination-utils.ts（8 行）

**导出**：`calcTotalPages(total, pageSize)` —— `Math.ceil(total / Math.max(1, pageSize)) || 1`。
**测试**：utils.spec 覆盖（含 pageSize=0/负值边界）。**问题**：无。

---

## layout/AppLayout.vue（879 行）⭐

**定位**：桌面应用布局骨架——侧栏（折叠/移动抽屉）+ 顶栏（面包屑/工具插槽/用户区）+ 内容滚动区 + 底栏（上下篇导航 + 可拖拽阅读进度条）。

**Props**：`navItems`(NavNode[])、`logoText`('Vue 组件库')、`username`。
**Emits**：`logout`。
**Slots**：`topbar-tools`、`topbar-right`（默认含用户区+退出按钮）。
**provide**：`isMobile`、`toggleSidebar`、`toggleCollapse`（供子组件注入）。

**功能点**
1. **响应式断点**：<768 移动（侧栏抽屉+遮罩）、768–1024 自动折叠、≥1024 展开（checkScreen，:41-52）；resize 监听（:62）。
2. **侧栏**：AccordionNav 递归导航，折叠时仅图标；移动端抽屉 + overlay 遮罩（:149-153,301-341）。
3. **顶栏**：面包屑（分类/标题来自 navData getCategory/getPrevNext）、hamburger、`~` 提示符、工具插槽（内置 .topbar-tool-btn/text/label 预设类 + active/is-danger 状态，:519-709）、用户区。
4. **滚动进度条**：内容滚动 + MutationObserver 自动重测 + 30ms 节流（:107-118）；**可拖拽跳转**（mousedown/mousemove/mouseup，:120-144）。
5. **路由联动**：afterEach 关闭移动侧栏 + 更新滚动进度（:79-83）；ErrorBoundary 包裹 RouterView（:264-266）。
6. 上下篇导航 goDemo（:270-287）。
7. i18n：logoText 默认中文硬编码，但 collapse/menu/logout 走 t()（:176-177,204,255）。

**测试**：无直接 spec（AppLayout 未在任何 spec import）。**未测**：全部（断点/进度条拖拽/路由联动）。

**问题**
1. `contain: layout style` + `100dvh` 现代特性，旧浏览器降级可接受。
2. MutationObserver 观察 body 子树全量 childList——大页面变化频繁时 50ms 节流仍可能频繁触发。低危。

---

## layout/MiniLayout.vue（415 行）

**定位**：H5 小程序风布局——TabBar（4 tab + 中央扫码按钮）+ 子页面返回头 + 扫码类型选择底部弹层。

**Props**：无。**Slots**：无（内容走 RouterView）。
**内部数据**：tabs（home/category/favorites/profile，i18n labelKey）、scanTypes（5 类扫码，各带色）。

**功能点**
- 子页面模式：route.meta.subPage → 显示返回头（:48,87-93）；goBack 有历史则 back 否则回 home（:61-67）。
- TabBar：左右各 2 tab + 中央扫码凸起按钮（:114-141,300-319）。
- 扫码弹层：Teleport + 底部 sheet + 5 类型网格 → 跳 /mini/scan/{type}（:144-161,71-78）。
- **全 i18n**（miniLayout.* 词条，labelOf）（:42,88,103 等）。
- 安全区 env(safe-area-inset-bottom)（:81,336）。
- activeTab 前缀匹配（:51-55）。

**测试**：无直接 spec。**未测**：全部。

**问题**
1. 搜索框 readonly + focus 跳转 `/mini/products`——可点但无键盘 Enter 语义；a11y 中低危。
2. 弹层无 focus trap / Esc 关闭（@click.self 关闭遮罩）；a11y 缺口（历史弹层问题同类）。

---

## layout/ModalBox.vue（453 行）⭐

**定位**：通用模态框——5 种 modalType（default/confirm/form/detail/select）+ 4 尺寸 + 焦点陷阱 + 弹窗互斥；**confirm 模式已委托 ConfirmModal**。

**Props**

| 名称 | 类型 | 默认值 |
|------|------|--------|
| visible | boolean（必填） | — |
| title | string? | '' |
| modalType | 5 枚举 | 'default' |
| size | 'sm'\|'md'\|'lg'\|'xl' | 'md' |
| closable / maskClosable | boolean | true |
| zIndex | number\|string? | — |
| internal | boolean | false |
| mutexScope | string? | — |
| confirmMessage / confirmVariant / confirmDanger / confirmLoading | — | —（委托 ConfirmModal） |
| detailItems | DetailItem[] | [] |
| selectItems | SelectItem[] | [] |
| selectValue | (string\|number)[] | [] |
| selectMultiple | boolean | false |

**Emits**：`update:visible`、`confirm`、`cancel`、`form-submit`、`select-confirm: [values]`、`close`
**Slots**：默认、`footer`

**功能点**
1. **confirm 委托**：modalType='confirm' 时直接渲染 ConfirmModal，变体映射 confirmVariant→danger/warning/primary（:190-201,174-183）。
2. **焦点管理**：autofocus 首选 footer 最后按钮，Tab 循环 trap，关闭恢复焦点；被 registerModal 同步关闭时不抢焦点（:96-101）。
3. **弹窗互斥**：registerModal(close, mutexScope)，confirm 模式跳过（:104-118）。
4. **遮罩防误关**：mousedown+mouseup 都必须在 overlay 上才 close（_maskPressed，:142-157）——修复"弹窗内按下→移出→松开误关闭"。
5. **select 模式**：单选/多选切换、确认 emit select-confirm（:159-171）；打开时同步 selectValue（:84-89）。
6. **detail 模式**：label/value 行 + mono 字体（:242-249）。
7. **form 模式**：默认 footer 取消/提交按钮 → form-submit（:280-283）。
8. ESC 关闭（confirm 模式跳过）（:127-135）；role=dialog aria-modal（:222-223）。

**测试**：无直接 spec（coupling-fix.spec 测的是 store/useModalManager 组合）。**未测**：全部挂载级。

**问题**
1. detail/select 模式的文案「取消/提交/确认」硬编码中文（:281-287），未 i18n。
2. 无独立 spec，且 confirm 委托链（ModalBox→ConfirmModal→ModalBox）递归渲染需注意——ConfirmModal 内部 ModalBox modalType='default'，互斥已正确跳过。逻辑正确。

---

## layout/Flex.vue（70 行）

**定位**：弹性布局容器（吸收原 Space：horizontal/vertical → row/column）。

**Props**：`direction`('row'\|'column'\|'horizontal'\|'vertical')、`justify`(6 值)、`align`(5 值)、`gap`('var(--space-2)')、`wrap`(false)、`flex`('1')、`inline`(false)。
**Slots**：默认。
**功能点**：Space 兼容映射（:47）；justify/align 映射表（:27-42）；inline-flex 支持（:45）。
**测试**：无直接 spec。**问题**：无。

---

## layout/Space.vue（37 行）

**定位**：@deprecated 语法糖，转发到 Flex。DEV 环境 onMounted console.warn 提示迁移（:25-29）。

**测试**：无。**问题**：无（已正确废弃标记）。

---

## layout/AccordionNav.vue（170 行）

**定位**：侧栏多级导航（递归 NavItem）——分组独立展开、路由自动展开所在路径。

**Props**：`collapsed`、`items`(NavNode[]，缺省 navTree)。
**Emits**：无（内部 toggle 事件驱动）。
**Slots**：无。

**功能点**
- 递归：根叶子 button + 分组委托 NavItem 递归（:58-77）。
- **路由自动展开**：watch route.path → syncExpand，展开所有含当前路由的分组（:21-28,31-38）。
- 分组独立展开/折叠（toggleGroup，:41-49）。
- 折叠态：隐藏 label、title 提示、图标居中（:62,66,157-168）。

**测试**：无直接 spec。**问题**：无。

---

## layout/NavItem.vue（270 行）

**定位**：递归导航节点（self-reference via defineOptions name）——无限层级，公式驱动视觉。

**Props**：`node`、`level`、`collapsed`、`expandedSet`。
**Emits**：`toggle: [node]`。
**Slots**：无。

**功能点**
- **层级比例系统**：字号 15×0.8^(N-1)（≥6px）、缩进 +4px/级、透明度衰减、图标透明度、L1 无指示条（:41-75,58-75）。
- isGroup → 分组按钮（▾ 箭头旋转），否则叶子（IconSvg + label）（:89-110）。
- 折叠态递归仍展开子级（:113, v-if "collapsed || isExpanded"）。
- 路由匹配 isActive（:27-31）。

**测试**：无直接 spec。**问题**：无。

---

## layout/utils/navData.ts（211 行）

**导出**：NavNode、navTree（8 组 40+ 导航项）、flattenNodes、getCurrentLabel、getPrevNext、getCategory、getCategory 私有 findCategoryLabel。

**功能点**
- flattenNodes：只收有 route 的叶子（:15-25）。
- **WeakMap 扁平缓存**（:157-167）；默认树 _flat 预缓存。
- getCategory 递归找父组 label（:188-210）。

**测试**：无直接 spec（utils.spec 测的是 _internal 与 pagination-utils）。**问题**：
1. `findCategoryLabel` 逻辑复杂（:198-210）：当 children 含 route 匹配时返回 ''（空字符串）并让外层兜底 group.label——语义易错，但 getCategory 顶层先查直接 children 匹配，深层由 findCategoryLabel 处理，实测可用。低危可读性。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | nav 5 + layout 7 = 12 |
| utils | nav/pagination-utils.ts、layout/utils/navData.ts |
| 直接 spec 覆盖 | 仅 utils.spec（calcTotalPages + _internal） |
| 未测组件 | 全部 12 个组件挂载级零覆盖 |
| i18n | Pagination/AppLayout(部分)/MiniLayout(全) 接入；ModalBox 的 form/detail/select 默认按钮中文硬编码 |
| 关键问题 | ModalBox select/form 按钮硬编码中文；Tabs aria-controls 悬空；MiniLayout 弹层无焦点管理 |

**最重要发现**
1. **layout/nav 全域组件挂载级零测试**——12 个组件无一个直接 spec，且 AppLayout/ModalBox 是全库最常用骨架。
2. **ModalBox 是"5 模式合一"的中型上帝组件**（453 行），但 confirm 已正确委托，结构尚可。
3. **a11y 基建完善**（role/tabindex/aria 普遍），但 ModalBox select/detail 文案、MiniLayout 弹层、Tabs tabpanel 三处为残留缺口。
