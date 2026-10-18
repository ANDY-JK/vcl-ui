# 低代码表单（form-builder）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 | Slots 数 |
| --- | --- | --- | --- |
| `FormDesigner` | 5 | 4 | 0 |
| `FormBuilder` | 8 | 6 | 0 |
| `FormRenderer` | 7 | 2 | 0 |
| `FieldError` | 1 | 0 | 0 |
| `FormCollect` | 6 | 1 | 0 |
| `FormTargetCollect` | 4 | 1 | 0 |
| `FormShareView` | 4 | 1 | 0 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `useFormSchema` | Schema 解析 composable |
| `isFieldVisible` | 判断字段在当前数据下是否可见 |
| `createInitialData` | 从 Schema 的 fields 提取默认值，生成初始 form data |
| `normalizeSchema` | 归一化 Schema：合并默认值，填充缺失字段 |
| `SCHEMA_VERSION` | Schema 版本常量 |
| `useFormValidator` | 表单校验 composable |
| `validateField` | 校验单个字段 |
| `validateAll` | 校验全部字段 |
| `validators` | 预置校验规则工厂函数 |
| `useFormStorage` | 表单存储 composable |
| `getFieldRegistration` | 获取字段类型的注册信息（未注册回退 text） |
| `getComponentCategory` | 获取字段类型对应的组件分类 |
| `isLayoutField` | 判断字段是否为纯布局元素（divider/title） |
| `getComponentType` | 获取透传给原子组件的 type prop 值 |
| `getFieldComponent` | 获取渲染组件 |
| `getRegisteredTypes` | 获取所有已注册的字段类型列表 |
| `registerField` | 注册自定义字段类型 |
| `isFieldRegistered` | 判断字段类型是否已注册 |
| `toDynamicFormSchema` | 旧版 DynamicForm 配置 → 新版 FormSchema |
| `contractCollectionSchema` | 预置模板：合同收集表单 Schema（返利函/合同类场景的字段编排） |
| `containerDemoNodes` | 预置模板：容器演示节点树（grid/flex/tabs/collapse/steps 五类容器的编排示例） |
| `containerDemoMeta` | 预置模板：容器演示的表单元信息（标题/描述等 meta） |
| `storeReportSchema` | 预置模板：门店提报表单 Schema（陈列检查/提报类场景的字段编排） |
| `getFieldTypes` | 节点类型注册表 — 从 fieldRegistry 派生（单一事实源）新增/修改字段类型只需改 fieldRegistry，此处自动同步。label/group 在调用时翻译（fieldRegistry 存 i18n key），函数形式保证响应语言切换。 |
| `createField` | 按注册表 defaults 创建新节点实例（defaults 来自 fieldRegistry 单一事实源） |
| `genFieldId` | 生成节点实例 id |
| `genRecordId` | 生成收集记录 id |
| `collectStorageKey` | 收集记录存储 key：基于字段结构指纹。 仅用于无表单 id 的场景（FormCollect 独立嵌入、完整分享码）， 已保存表单一律用 formCollectStorageKey(id)——指纹相同会让不同表单共用一个数据桶。 |
| `toFormSchema` | 设计数据 → FormSchema（FormBuilder 可渲染格式） |
| `parseCascaderOptions` | 解析 cascader JSON 文本；失败返回 null（原在 domain.ts，随 schema 转换职责迁入本文件） |
| `getTypeLabel` | 节点类型 → 中文标签（委托 fieldRegistry，单一事实源） |
| `flattenNodes` | 深度优先遍历节点树，返回所有节点（扁平化） |
| `findNode` | 查找节点（深度优先） |
| `findParent` | 查找节点的父节点和索引 |
| `updateNodeInTree` | 不可变更新：替换节点树中指定 id 的节点 |
| `removeNodeFromTree` | 不可变更新：删除节点树中指定 id 的节点 |
| `insertNode` | 不可变更新：在指定位置插入节点@param nodes 节点列表@param node 要插入的节点@param index 插入位置（-1 或超出长度则追加到末尾） |
| `insertChildNode` | 不可变更新：在容器节点的 children 中插入子节点 |
| `moveNodeInTree` | 不可变更新：移动节点（从原位置移到新位置） |
| `isContainerNode` | 判断节点是否为容器节点 |
| `isFieldNode` | 判断节点是否为字段节点（非容器） |
| `migrateFieldsToNodes` | v2 → v3 兼容：将旧版 DesignerField[] 转为 DesignerNode[] |
| `CONTAINER_TYPES` | 获取所有容器类型 |
| `FIELD_NODE_TYPES` | 全部字段类型（顺序即设计器面板的默认分组内顺序） |
| `createLocalFormStore` | 创建 localStorage 形态的表单存储（草稿/表单列表/收集数据全走本机） |
| `createCloudFormStore` | 创建云端 FormStore（Supabase Storage bucket 存 JSON 对象）。 |
| `createFormStore` | 工厂：按模式创建 store（配置非法时抛错，调用方决定降级） |
| `getActiveFormStore` | 获取全局活动 FormStore：首次调用按持久化偏好初始化（云端配置缺失时诚实回退本地） |
| `setActiveFormStore` | 覆盖全局活动 FormStore（设计器切换存储方式 / 宿主注入自定义实现） |
| `loadStoreMode` | 读取存储方式偏好（无记录/非法值回退 local） |
| `saveStoreMode` | 持久化存储模式选择（local / cloud，启动时恢复） |
| `loadCloudConfig` | 读取云端配置偏好（未配置返回 null） |
| `saveCloudConfig` | 持久化云端存储配置（传 null 清除，回落本地模式） |
| `envCloudConfig` | 云端配置 env 兜底：仅开发期生效（VITE_SUPABASE_* 已配置时「云端」选项免手填），生产构建恒为 null |
| `createRestFormStore` | 创建一个由 REST 后端支撑的 FormStore |
| `useFormNav` | 组合式函数：从当前 FormStore 加载表单列表并转成导航项。 |
| `buildFormNavItems` | 纯函数：表单元信息列表 → 导航项列表。 |
| `useDisplayData` | 解析展示类字段的数据源。三种模式统一在这里收敛。 |
| `extractByPath` | 按点路径取值：`dataPath='data.rows'` 从 `{data:{rows:[...]}}` 取出数组。 |
| `toRows` | 归一化成"行数组"： |
| `useFormManager` | 表单管理编排：存储实现选择（宿主注入优先）、列表/草稿/收集数据的增删改查与落库调度 |
| `encodeShareCode` | FormDesign → 分享码（内容不加密：仅传输编码，敏感表单请勿外发） |
| `decodeShareCode` | 分享码 → FormDesign；非分享码/损坏内容返回 null（导入面板据此走 JSON 路径或报错） |
| `parseShareCode` | 解析分享码（含签名分段），成功返回结构，失败返回 null。 |
| `signShareCode` | 把未签名分享码升级为已签名（FD1.⟨content⟩ → FD2.⟨content⟩.⟨sig⟩）；已是签名码则重签 |
| `decodeShareCodeVerified` | 验签：已签名码必须验过才返回 design；未签名的码返回 null（requireSigned 语义） |
| `signPayload` | 计算签名（HMAC-SHA256，输出 base64url） |
| `signShareCodeWith` | 用签发者把分享码升级为 FD2（已是签名码则重签） |
| `verifyShareCodeWith` | 用签发者验签。 |
| `shareFullLink` | 完整分享链接（编码全部设计，跨设备可靠但长）；SSR 下返回相对链接 |
| `shareShortLink` | 短链链接（设计存 store，短到二维码能放下）；SSR 下返回相对链接 |
| `encodeShareId` | 生成短链标识（设计已存 store，仅带 id） |
| `parseShareId` | 解析短链标识 → 表单 id；非短链返回 null |
| `SHARE_CODE_PREFIX` | 设计分享码前缀：FD1 + base64 串，指向单份完整表单设计（容量大，与 S + id 短链互补） |
| `SHARE_CODE_SIGNED_PREFIX` | 已签名分享码前缀（第二段是内容、第三段是签名） |
| `SHARE_ID_PREFIX` | 短链前缀：S + formId，指向 store 中已保存的表单设计（JSDoc/文档说明文字忌写裸尖括号，VitePress 会当 HTML 标签） |
| `createHmacSigner` | 浏览器内 HMAC-SHA256 签发者。 |
| `createHttpSigner` | 服务端签发者（**接缝**）：密钥留在后端，前端只收发原文/签名。 |
| `setActiveShareSigner` | 设置当前签发者；传 null 恢复"不签名" |
| `getActiveShareSigner` | 读取当前签发者（未设置返回 null） |
| `timingSafeEqualStr` | 定长比较（字符串长度不同直接 false；长度相同逐字符异或累积） |
| `createIndexedDbDraftStorage` | 本地实现：IndexedDB + TTL（默认，与改造前逐字节同行为） |
| `createHttpDraftStorage` | 云实现（**接缝**）：把草稿存到后端，实现跨设备续填。 |
| `setActiveDraftStorage` | 设置当前草稿存储；传 null 恢复默认（本地 IndexedDB） |
| `getActiveDraftStorage` | 读取当前草稿存储（未显式设置时返回默认的本地实现） |
| `DRAFT_STORE` | IndexedDB store 名（设计器草稿专用，与运行时 form-drafts 区分） |
| `DRAFT_KEY` | 草稿存储键（单设计器全局一份：恢复「最近一次未保存的设计」语义） |
| `setStorageScope` | 设置当前作用域。 |
| `getStorageScope` | 读取当前作用域（未设置返回空串） |
| `scopedKey` | 给一个存储键加上当前作用域。 |
| `createIdempotencyKey` | 生成幂等键。优先 randomUUID（安全上下文），否则退化为时间戳 + 强随机。 |
| `makeIdempotencyKey` | 取一个幂等键：配了自定义生成器就用它，否则用默认实现 |
| `setIdempotencyKeyFactory` | 设置自定义幂等键生成器；传 null 恢复默认（randomUUID） |
| `IDEMPOTENCY_HEADER` | 请求头名（宿主要在服务端读同名头） |
| `checkApiUrl` | 判定一个 URL 是否允许被 fetch。 |
| `isApiUrlAllowed` | 便捷判定：只要布尔 |
| `policyFromOrigins` | 从宿主的 origin 白名单构造策略（空数组 = 同源 only） |

---

## `FormDesigner`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/form-builder`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `nodes` | `DesignerNode[]` | `() => []` | 否 | 设计节点树（v-model:nodes） |
| `fields` | `DesignerNode[]` | `() => []` | 否 | @deprecated v2 兼容，会自动转换为 nodes |
| `meta` | `FormMeta` | `() => ({})` | 否 | 表单元信息（v-model:meta） |
| `height` | `string` | `'600px'` | 否 | 画布高度 |
| `store` | `FormStore` | `undefined` | 否 | 宿主注入的存储实现（注入后「存储方式」切换 UI 隐藏，保存/列表/收集全部走此实现） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:nodes'` | `nodes: DesignerNode[]` | v-model:nodes——设计器节点树变化（拖拽/编辑/删除后抛全量） |
| `'update:fields'` | `fields: DesignerNode[]` | v-model:fields——旧版字段列表视图（与 nodes 同源同步） |
| `'update:meta'` | `meta: FormMeta` | v-model:meta——表单元信息变化（标题/描述） |
| `saved` | `item: FormMetaItem` | 保存成功（新建或覆盖）后通知宿主，携带存储层返回的表单元信息 |

## `FormBuilder`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/form-builder`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `schema` | `FormSchema` | — | 是 | 表单 Schema |
| `modelValue` | `FormData` | `() => ({})` | 否 | 表单数据（v-model） |
| `storageKey` | `string` | `''` | 否 | 存储键 — 传入则自动持久化到 IndexedDB（草稿） |
| `readonly` | `boolean` | `false` | 否 | 只读模式 |
| `disabled` | `boolean` | `false` | 否 | 是否禁用全部字段 |
| `hideHeader` | `boolean` | `false` | 否 | 隐藏标题/描述头部（宿主已自行渲染头部时用，避免双重标题） |
| `userContext` | `Record<string, unknown>` | `() => ({})` | 否 | 当前用户上下文（动态默认值 currentUser 用；宿主注入真实用户信息） |
| `apiAllowOrigins` | `string[]` | `() => []` | 否 | 允许外发的跨域源；**默认空 = 只允许同源**（schema 的 apiUrl 可经无签名分享码流入，默认放行等于把「把填表人输入发到任意域」的能力交给分享者）。 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: FormData` | v-model——表单数据（受控回写） |
| `submit` | `v: FormData` | 提交（校验通过后触发） |
| `change` | `v: FormData` | 数据变化 |
| `validate` | `isValid: boolean` | 校验结果变化 |
| `reset` | `无` | 重置 |
| `loaded` | `raw: Record<string, unknown>` | 远程数据加载完成（submitConfig.apiUrl GET 回填后，返回原始响应数据） |

## `FormRenderer`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/form-renderer`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `field` | `FormField` | — | 是 | 字段定义 |
| `modelValue` | `unknown` | — | 是 | 当前值 |
| `error` | `string` | — | 否 | 错误信息 |
| `dynamicOptions` | `Option[]` | — | 否 | 动态选项（联动 / 远程加载的选项，优先于 field.options） |
| `disabled` | `boolean` | — | 否 | 表单级禁用（查看模式/只读表单：FormBuilder effectiveReadonly 传入，与字段级 field.disabled 合并） |
| `apiUrlPolicy` | `ApiUrlPolicy` | — | 否 | 外发 URL 安全策略（展示类字段的 api 数据源用）。 不传 = 只允许同源——与提交/联动/远程选项同一套默认值，展示类不开新口子。 |
| `formData` | `Record<string, unknown>` | — | 否 | 整个表单的数据（展示类字段的 `field` 模式据此取值：展示"用户填出来的东西"） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: unknown` | v-model——受控值（渲染字段的当前数据） |
| `change` | `无` | 值变化（透传原子组件 change，供 FormBuilder 执行事件动作） |

## `FieldError`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `message` | `string` | — | 是 | 错误信息（空字符串 = 无错误） |

## `FormCollect`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/form-builder`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `fields` | `DesignerField[]` | — | 是 | 设计器产出的字段配置 |
| `meta` | `FormMeta` | `() => ({})` | 否 | 表单元信息 |
| `storageKey` | `string` | — | 否 | 收集数据存储 key（默认按字段结构自动生成） |
| `store` | `FormStore` | `() => getActiveFormStore()` | 否 | 存储实现（默认全局活动 store；设计器切换本地/云端后自动跟随，接入 SaaS 时注入 API 实现） |
| `exportColumns` | `{ key: string; label: string }[]` | — | 否 | 导出 Excel 时的列配置 不传则按 fields 顺序 + field.label 自动生成列 传入则按指定顺序和列名导出 |
| `exportFileName` | `string` | — | 否 | 导出 Excel 的自定义文件名（不含扩展名，默认用表单标题） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submit` | `data: Record<string, unknown>, record: CollectRecord` | 收集提交：[表单数据, 收集记录（含时间戳/指纹等）]（落库由内置存储完成，宿主可接此上报） |

## `FormTargetCollect`

> 🔗 在线示例：`npm run dev` 启动 demo 站后访问 `#/contract-target-collect`（Props 表与交互行为以 demo 页为准）

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `schema` | `FormSchema` | — | 是 | 表单 Schema（照片位字段 + 可选填字段；非照片位字段仅作展示/说明） |
| `targets` | `TargetItem[]` | — | 是 | 目标清单（门店们），来源由宿主给（静态/API/Excel） |
| `storageConfig` | `StorageConfig` | `undefined` | 否 | 存储配置（本地/云端），缺省纯本地 |
| `readonly` | `boolean` | `false` | 否 | 只读模式（查看收集结果，禁上传） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `change` | `targetId: number, slotKey: string, file: StoreFile \| undefined` | 某目标某照片位上传/删除后触发 |

## `FormShareView`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `code` | `string` | `''` | 否 | 发布链接中的标识（FD1.分享码 或 S.表单id；与 design 二选一，design 优先） |
| `design` | `FormDesign` | `undefined` | 否 | 直接传设计对象（宿主内嵌场景；与 code 二选一，优先于此） |
| `store` | `FormStore` | `undefined` | 否 | 存储实现（默认全局活动 store：设计器切换本地/云端后自动跟随） |
| `title` | `string` | `''` | 否 | 覆盖表单标题（不传用 meta.title） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `submitted` | `record: CollectRecord` | 提交成功，携带写入的收集记录 |

