# 低代码表单（form-builder）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。

## 组件一览

| 组件 | Props 数 | Events 数 |
| --- | --- | --- |
| `FormDesigner` | 5 | 4 |
| `FormBuilder` | 6 | 6 |
| `FormRenderer` | 5 | 2 |
| `FieldError` | 1 | 0 |
| `FormCollect` | 6 | 1 |
| `FormTargetCollect` | 4 | 1 |
| `FormShareView` | 4 | 1 |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `useFormSchema` | Schema 解析 composable |
| `isFieldVisible` | 判断字段在当前数据下是否可见 |
| `createInitialData` | 从 Schema 的 fields 提取默认值，生成初始 form data |
| `normalizeSchema` | 归一化 Schema：合并默认值，填充缺失字段 |
| `SCHEMA_VERSION` | — |
| `useFormValidator` | 表单校验 composable |
| `validateField` | 校验单个字段 |
| `validateAll` | 校验全部字段 |
| `validators` | — |
| `useFormStorage` | 表单存储 composable |
| `getFieldRegistration` | 获取字段类型的注册信息（未注册回退 text） |
| `getComponentCategory` | 获取字段类型对应的组件分类 |
| `isLayoutField` | 判断字段是否为纯布局元素（divider/title） |
| `getComponentType` | 获取透传给原子组件的 type prop 值 |
| `getFieldComponent` | 获取渲染组件 |
| `getRegisteredTypes` | 获取所有已注册的字段类型列表 |
| `registerField` | 注册自定义字段类型使用示例：```tsimport { registerField } from '@/components/form-builder'import MyRichText from './MyRichText.vue'registerField({  type: 'rich-text',  category: 'input',       // 复用 Input 分支（需有 v-model + label + props）  component: MyRichText,  componentType: 'rich-text',  isLayout: false,  label: '自定义富文本',   // 原始文案或 i18n key 均可  icon: 'type',  group: '高级字段',})```注册后可在 FormSchema 中使用 `type: 'rich-text'` 字段 |
| `isFieldRegistered` | 判断字段类型是否已注册 |
| `toDynamicFormSchema` | 旧版 DynamicForm 配置 → 新版 FormSchema |
| `contractCollectionSchema` | — |
| `containerDemoNodes` | — |
| `containerDemoMeta` | — |
| `storeReportSchema` | — |
| `getFieldTypes` | — |
| `createField` | — |
| `genFieldId` | — |
| `genRecordId` | — |
| `collectStorageKey` | — |
| `toFormSchema` | — |
| `parseCascaderOptions` | — |
| `getTypeLabel` | — |
| `flattenNodes` | — |
| `findNode` | — |
| `findParent` | — |
| `updateNodeInTree` | — |
| `removeNodeFromTree` | — |
| `insertNode` | — |
| `insertChildNode` | — |
| `moveNodeInTree` | — |
| `isContainerNode` | — |
| `isFieldNode` | — |
| `migrateFieldsToNodes` | — |
| `CONTAINER_TYPES` | — |
| `FIELD_NODE_TYPES` | — |
| `createLocalFormStore` | — |
| `createCloudFormStore` | 创建云端 FormStore（Supabase Storage bucket 存 JSON 对象）。 |
| `createFormStore` | 工厂：按模式创建 store（配置非法时抛错，调用方决定降级） |
| `getActiveFormStore` | 获取全局活动 FormStore：首次调用按持久化偏好初始化（云端配置缺失时诚实回退本地） |
| `setActiveFormStore` | 覆盖全局活动 FormStore（设计器切换存储方式 / 宿主注入自定义实现） |
| `loadStoreMode` | 读取存储方式偏好（无记录/非法值回退 local） |
| `saveStoreMode` | — |
| `loadCloudConfig` | 读取云端配置偏好（未配置返回 null） |
| `saveCloudConfig` | — |
| `envCloudConfig` | 云端配置 env 兜底：仅开发期生效（VITE_SUPABASE_* 已配置时「云端」选项免手填），生产构建恒为 null |
| `useFormManager` | — |
| `encodeShareCode` | FormDesign → 分享码（内容不加密：仅传输编码，敏感表单请勿外发） |
| `decodeShareCode` | 分享码 → FormDesign；非分享码/损坏内容返回 null（导入面板据此走 JSON 路径或报错） |
| `SHARE_CODE_PREFIX` | — |

---

## `FormDesigner`

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
| `'update:nodes'` | `nodes: DesignerNode[]` | — |
| `'update:fields'` | `fields: DesignerNode[]` | — |
| `'update:meta'` | `meta: FormMeta` | — |
| `saved` | `item: FormMetaItem` | 保存成功（新建或覆盖）后通知宿主，携带存储层返回的表单元信息 |

## `FormBuilder`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `schema` | `FormSchema` | — | 是 | 表单 Schema |
| `modelValue` | `FormData` | `() => ({})` | 否 | 表单数据（v-model） |
| `storageKey` | `string` | `''` | 否 | 存储键 — 传入则自动持久化到 IndexedDB（草稿） |
| `readonly` | `boolean` | `false` | 否 | 只读模式 |
| `disabled` | `boolean` | `false` | 否 | 是否禁用全部字段 |
| `userContext` | `Record<string, unknown>` | `() => ({})` | 否 | 当前用户上下文（动态默认值 currentUser 用；宿主注入真实用户信息） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: FormData` | — |
| `submit` | `v: FormData` | 提交（校验通过后触发） |
| `change` | `v: FormData` | 数据变化 |
| `validate` | `isValid: boolean` | 校验结果变化 |
| `reset` | `无` | 重置 |
| `loaded` | `raw: Record<string, unknown>` | 远程数据加载完成（submitConfig.apiUrl GET 回填后，返回原始响应数据） |

## `FormRenderer`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `field` | `FormField` | — | 是 | 字段定义 |
| `modelValue` | `unknown` | — | 是 | 当前值 |
| `error` | `string` | — | 否 | 错误信息 |
| `dynamicOptions` | `Option[]` | — | 否 | 动态选项（联动 / 远程加载的选项，优先于 field.options） |
| `disabled` | `boolean` | — | 否 | 表单级禁用（查看模式/只读表单：FormBuilder effectiveReadonly 传入，与字段级 field.disabled 合并） |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| `'update:modelValue'` | `v: unknown` | — |
| `change` | `无` | 值变化（透传原子组件 change，供 FormBuilder 执行事件动作） |

## `FieldError`

### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| `message` | `string` | — | 是 | 错误信息（空字符串 = 无错误） |

## `FormCollect`

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
| `submit` | `data: Record<string, unknown>, record: CollectRecord` | — |

## `FormTargetCollect`

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

