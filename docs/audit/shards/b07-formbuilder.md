# form-builder 域功能清单（低代码表单平台）

> 11 vue + 15 ts。行号以 2026-08-25 为准。**历史 P0 安全项核实：new Function 已移除、富文本 v-html 已消毒——两个安全硬伤均已在 8-24 整改中修复。**

---

## form-builder/expression-evaluator.ts（317 行）⭐ 安全核心

**定位**：受限表达式求值器（**替代 new Function，杜绝代码注入**——历史 P0 已修复）。

**导出**：`extractFields(formula)`、`safeEvaluate(expr)`、`evaluateFormula(formula, data)`。

**功能点**
- **白名单求值**：只识别数字/字符串/布尔/null 字面量 + 白名单运算符（算术 +-*/%、比较 ==/!=/===/!==/>/</>=/<=、逻辑 and/or/&&/||、括号、! 取反）（:4-6,102-107）。
- **词法分析**：任何标识符/属性访问/函数调用抛错 → 调用方降级纯字符串拼接（:76-87,107）。
- **递归下降解析器**：parseOr→And→Compare→Add→Mul→Unary→Primary 优先级链（:175-249）。
- **evaluateFormula**：`{{fieldName}}` 替换为字面量（纯数字字符串→数字、其余引号包裹+转义）→ safeEvaluate → 失败降级去引号拼接（:281-316）。

**测试**：expression-evaluator.spec（19 用例：算术/比较/字符串拼接/标识符拒绝/括号等）。

**问题**：无。实现严谨（解析器对 '==' 宽松相等做了 数字/字符串/布尔 三种混合语义 :120-125）。

---

## form-builder/useFormLinkage.ts（288 行）

**定位**：表单联动引擎——followValue（值跟随）/showHide（显隐）/followOptions（选项过滤）/dataSource（远程选项）。

**导出**：`useFormLinkage(fields, formData)` → `{hiddenByLinkage, dynamicOptions, isHiddenByLinkage, getFieldOptions, processLinkages, loadRemoteOptions, initDataSources, setupWatchers, isFieldVisibleWithLinkage, init}`。

**功能点**
- **followValue**：`evaluateFormula` 计算目标字段值（targetField 或自身）（:102-110）。
- **showHide**：条件求值为假 → targetField 加入 hidden 集合（:113-121）。
- **followOptions**：按依赖字段值过滤原始选项（值或标签匹配）（:123-141）。
- **dataSource API**：apiUrl + linkageField 查询参数 + cacheData 缓存（Map）+ labelField/valueField 映射 + 4 种响应结构兼容（:159-205）。
- **watcher**：formData deep watch 全量联动 + 各 dataSource 联动字段独立 watch（:232-263）。
- **综合可见性**：isFieldVisibleWithLinkage = 联动隐藏 + 原 visibleWhen（:268-273）。

**测试**：linkage-eval.spec（5 用例）、expression-evaluator 间接。**未测**：followOptions/dataSource 网络。

**问题**：无显著问题。

---

## form-builder/useFormSchema.ts（191 行）

**定位**：Schema 解析归一化——合并默认值、初始数据生成、visibleWhen 条件、fieldRegistry 重导出。

**导出**：`SCHEMA_VERSION`(2)、`normalizeSchema`、`createInitialData`、`isFieldVisible`、`useFormSchema`、getComponentCategory/isLayoutField。

**功能点**
- 归一化：layout/columns/submitText 等默认填充；steps 数组规范化（:45-73）。
- **类型→空值映射**：checkbox/upload→[]、switch→false、rate→0、slider→min、date-range→['','']、radio→''（避免 Group 拒 null）（:80-102）。
- 布局字段（divider/title）不参与数据（:114）。
- visibleWhen 单条件 + not 取反（:130-136）。
- useFormSchema：normalized/fieldMap/groupedFields/initialData/defaultSpan（grid 12 / single 24）（:147-190）。

**测试**：form-schema.spec（11 用例）。**问题**：无。

---

## form-builder/useFormValidator.ts（259 行）

**定位**：校验引擎——required + rules 全量/单字段校验 + 预置规则工厂。

**导出**：`validateField`、`validateAll`、`validators`、`useFormValidator`。

**功能点**
- **双签名规则**：函数.length≥2 → 上下文签名 (v, data)，否则简单签名 (v: string)（:84-87）。
- required 空值判定：0/false 为合法值，数组判空（:40-47）。
- 不可见/布局字段跳过（:64-67）。
- requiredOnly 模式（步骤间快速校验跳过 rules）（:74-75）。
- **validators 工厂**：minLen/maxLen/phone/email/idCard/url/pattern/custom/minVal/maxVal/range/minSelect（:134-201）。
- useFormValidator：errors 响应式 + validate/validateOne/clearErrors/clearError（:212-258）。

**测试**：form-validator.spec（15 用例）、validator-i18n.spec（2 用例）。**问题**：无。

---

## form-builder/fieldRegistry.ts（241 行）⭐

**定位**：字段注册表（**单一事实源**）——FieldType → 组件/分类/原子 type/布局标记/面板元数据/默认值，全部在此注册。

**导出**：ComponentCategory、FieldRegistration、getFieldRegistration/getComponentCategory/isLayoutField/isContainerField/getComponentType/getFieldComponent/getTypeLabel/getTypeIcon/getFieldDefaults/getRegisteredTypes/getFieldMeta/**registerField/unregisterField/isFieldRegistered**。

**功能点**
- **36 种内置类型**：input 8 / select 7 / group 5 / upload 2+camera / layout 2 / advanced 8（subform/relate/richtext/signature/address/idcard/matrix/serial）/ 容器 5（card/grid/tabs/collapse/steps）（:67-119）。
- **外部扩展**：registerField/unregisterField，内置类型不可注销（BUILTIN_TYPES 守卫）（:206-235）。
- 容器节点 isContainer=true + containerConfig 默认结构（:114-118）。

**测试**：field-registry.spec（4 用例）。**问题**：无。

---

## form-builder/FormRenderer.vue（1057 行）⭐

**定位**：字段渲染器——按 FieldType 映射原子组件，v3 高级字段 8 种内联渲染。

**Props**：`field`、`modelValue`、`error`、`dynamicOptions`。**Emits**：`update:modelValue`、`change`。
**Slots**：无。

**功能点**
1. **category 分支**：input/select/group/upload/camera/layout/advanced（:377-638）。
2. **富文本**：contenteditable + document.execCommand 工具栏（B/I/U/列表/H/P）+ **v-html 输出经 sanitizeHTML 白名单消毒**（:490-511）——**历史 P0 XSS 已修复**；@input 也过 sanitize（:506）。
3. **签名**：canvas 指针绘制，结束即回写 dataURL，编辑回显 loadSignatureImage（:149-209,514-533）。
4. **子表单**：subformColumns 文本解析（label|key|type）+ 动态行增删（:86-99,443-473）。
5. **地址**：省份/城市硬编码数据 + 详情拼接（:123-133,536-565）。
6. **矩阵**：radio 网格评分（:591-615）。
7. **流水号**：prefix+日期+随机 4 位（非持久序号）（:231-237,618-627）。
8. **styleConfig 落地**：CSS 变量（圆角/边框/控件宽度）+ 尺寸映射 + customClass（:317-359,648-695）。
9. **签名/子表单等**值绑定用 computed get/set（:64-79）。

**测试**：无直接 spec（richtext-xss.spec 测 sanitize.ts；form-schema 间接）。**未测**：全部渲染分支。

**问题**
1. **流水号非持久**：随机数每次重渲染变化——若用于正式编号有稳定性问题。中低危。
2. 地址省市数据硬编码 10 省——扩展性受限。
3. 富文本依赖 document.execCommand（已废弃 API 但浏览器仍支持）——技术债。

---

## form-builder/FormBuilder.vue（962 行）⭐

**定位**：Schema 驱动动态表单引擎——校验/联动/草稿持久化/步骤模式/提交模式。

**Props**：`schema`(FormSchema)、`modelValue`(v-model)、`storageKey`(草稿)、`readonly`、`disabled`。
**Emits**：`update:modelValue`、`submit`、`change`、`validate: [isValid]`、`reset`。
**Slots**：无（FieldList/Steps/Tabs/Collapse/Card 组织布局）。

**功能点**
1. **数据同步**：initialData + modelValue 合并（shallowEqual 防抖），首帧 watchEffect（:110-134）。
2. **实时校验**：validateOnChange 模式只校验已填/已错字段（避免全红）（:150-161）。
3. **草稿自动保存**：storageKey → IndexedDB，1s 防抖（:163-169）；onMounted 加载 + Toast 提示（:200-206）。
4. **步骤模式**：步骤字段过滤 + 步骤校验通过才 next（:216-245）。
5. **提交**：全量校验 → 滚动到首个错误（限定组件实例）→ 隐藏字段不提交 → submitMode（once/unique/multiple）+ 3s 自动恢复 submitting + stopSubmit/setSubmitting expose（:256-328）。
6. **布局**：single/grid/steps 三种 + FieldList 字段包装。

**测试**：无直接 spec（form-schema/validator/linkage/storage 间接）。**未测**：提交流/步骤/草稿。

**问题**：无显著问题。

---

## form-builder/FormDesigner.vue（921 行）⭐

**定位**：低代码表单设计器（v3）——四栏布局、撤销/重做、容器嵌套、设备切换、设计/预览/Schema 查看。

**Props**：`nodes`(v-model)、`fields`(@deprecated v2 兼容自动转 nodes)、`meta`(v-model)、`height`('600px')。
**Emits**：`update:nodes/fields/meta`。
**Slots**：无。

**功能点**
1. **四栏**：字段面板 + 大纲树 + 画布 + 属性面板（:1-17）。
2. **撤销/重做**：不可变更新栈（deepClone 快照，上限 50），连续属性编辑合并为一个撤销单元（editingPropId）（:131-160）。
3. **节点操作**：add/insertAt/insertIntoContainer（含 slot 槽位）/moveNodeRelative/assignSlot（:166-197）。
4. **容器嵌套**：card/grid/tabs/collapse/steps，删除容器带子需确认（pendingRemoveId）（:199）。
5. **多选**：Ctrl/Cmd+点选多选集合（:96-117）。
6. **设备切换**：desktop/tablet/mobile 画布宽度。
7. **Schema 导出**：toFormSchema 生成 + downloadBlob/copyText。

**测试**：无直接 spec。**未测**：全部。

**问题**：无显著问题（v2/v3 兼容层设计良好）。

---

## form-builder/FormCollect.vue（830 行）

**定位**：数据收集组件——渲染表单 + 提交成记录 + 记录列表/详情/搜索/删除 + Excel 导出 + 统计。

**Props**：`fields`(DesignerField[])、`meta`、`storageKey`(默认按字段指纹)、`store`(FormStore 接口，默认 localStorage)、`exportColumns`、`exportFileName`。
**Emits**：`submit: [data, record]`。
**Slots**：无。

**功能点**
- **存储抽象**：FormStore 接口（依赖倒置，可注入 SaaS 实现）（store.ts:22-41）。
- 记录 CRUD + 搜索（时间/数据 JSON 匹配）（:146-159）。
- Excel 导出（xlsx 动态加载）+ ZIP（jszip）。
- 统计卡：总记录/今日/字段数（:99-112）。
- 收集 key 指纹：collectStorageKey(字段结构)（store.ts:105）。

**测试**：无直接 spec（contract-storage 是另一域）。**未测**：全部。

**问题**：无。

---

## form-builder/designer/

| 文件 | 行数 | 职责 | 关键点 |
|------|-----:|------|--------|
| store.ts | 151 | FormStore 接口 + localStorage 实现（表单设计 CRUD + 收集记录） | 依赖倒置；collectKey 指纹与 FormCollect 一致 |
| types.ts | 938 | DesignerNode/DesignerNodeType/FormMeta/FormDesign/CollectRecord + FIELD_TYPES/createField/toFormSchema/flattenNodes/insertNode/moveNodeRelative 等树操作 + collectStorageKey/genFieldId/genRecordId | 设计器数据模型 + 树算法 |
| DesignerCanvas.vue | 602 | 画布渲染（容器嵌套/拖拽插入/选中高亮） | 容器结构渲染 |
| DesignerChildCard.vue | 43 | 画布内字段卡片 | 轻量 |
| DesignerPanel.vue | 104 | 左侧字段面板（分组拖拽源） | 注册表驱动 |
| OutlineTree.vue | 327 | 大纲树（选中/多选/拖拽排序/删除） | 树导航 |
| PropsPanel.vue | 998 | 属性面板（字段/容器/表单设置，tabs/collapse/steps 配置） | 最大设计器子组件 |

**测试**：coupling-fix.spec（14 用例，测 store + types 组合）。**未测**：全部 vue。

---

## form-builder/useFormStorage.ts（173 行）

**定位**：草稿持久化——复用 indexedDB 封装 + TTL + 存储状态检测。

**导出**：`useFormStorage()` → `{loadDraft, saveDraft, clearDraft, estimateStorage, checkStorageStatus}`。

**功能点**：dbGet/dbPut/dbDelete + DRAFT_TTL（:106-115）；isValidDraft 结构校验（:38）；estimateStorage/checkStorageStatus（ok/warning/critical，:140-171）。
**测试**：form-storage.spec（5 用例）。**问题**：无。

---

## form-builder/FieldError.vue（58 行）/ FieldList.vue（50 行）

- **FieldError**：错误提示（图标+文案），渲染条件 message 非空。**测试**：无。
- **FieldList**：字段包装器（label 星号 + FieldError + 栅格 span）——表单布局单元。**测试**：无。

---

## form-builder/presets/（5 ts）

| 文件 | 导出 | 用途 |
|------|------|------|
| registration.ts | registrationSchema | 用户信息登记（170 行） |
| inspection.ts | inspectionSchema | 设备巡检登记（128 行，3 步骤） |
| contract-collection.ts | contractCollectionSchema | 门店合同收集（106 行） |
| container-demo.ts | containerDemoNodes | 容器嵌套演示节点（117 行） |
| index.ts | 聚合导出 | — |

**测试**：无直接 spec。

---

## 域汇总

| 指标 | 值 |
|------|-----|
| 组件数 | 11（FormBuilder/FormDesigner/FormRenderer/FormCollect/FieldError/FieldList + designer 5） |
| ts 模块 | 15（含 4 composable + 注册表 + 表达式求值器 + 存储） |
| 直接 spec 覆盖 | expression-evaluator(19)、linkage-eval(5)、form-schema(11)、form-validator(15)、validator-i18n(2)、field-registry(4)、form-storage(5)、coupling-fix(14)、richtext-xss(测 sanitize) |
| 未测 | 5 个 vue 组件挂载级 0 覆盖 |
| 安全 | ✅ new Function 移除；✅ 富文本 v-html 消毒；✅ 外部自定义字段注册白名单 |
| 遗留 | 流水号随机非持久；地址省市硬编码；execCommand 技术债 |

**最重要发现**
1. **历史两大 P0 安全硬伤已修复**（表达式求值器白名单化 + 富文本 sanitizeHTML 消毒），本域安全基线已达标。
2. **fieldRegistry 单一事实源 + 外部注册 API** 是架构亮点——新增字段类型只需注册一处。
3. **5 个核心 vue 组件（FormBuilder/Designer/Renderer/Collect）挂载级 0 测试**——联动/校验/撤销重做/收集流全靠手工，是全库第二大测试欠账域（仅次于 Select）。
