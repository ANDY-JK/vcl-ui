// DynamicForm 组件类型定义

/** 内置格式化：字符串快捷方式 */
export type BuiltinFormat = 'trim' | 'number' | 'lat' | 'lng' | 'date' | 'upper' | 'lower'

/** 内置校验规则 */
export type BuiltinRule = 'isLat' | 'isLng' | 'isPhone' | 'isEmail' | 'isNumber'

/** 浮动操作栏按钮 */
export interface FloatAction {
  key: string
  label: string
  icon?: string
  /** 不传 handler 则走内置逻辑（key 为 'save'|'calc'|'exportExcel'|'exportZip'|'reset' 时） */
  handler?: () => void
  visible?: 'always' | 'edit' | 'review' | 'view'
}

/** 字段配置 */
export interface FieldConfig {
  key: string
  name: string
  type:
    | 'text'
    | 'select'
    | 'textarea'
    | 'number'
    | 'date'
    | 'radio'
    | 'switch'
    | 'checkbox'
    | 'rate'
    | 'color'
    | 'icon-picker'
    | 'cascader'
    | 'tree-select'
    | 'time'
    | 'slider'
  required?: boolean
  defaultValue?: string
  options?: string[]
  placeholder?: string
  visibleWhen?: { field: string; value: string | number | boolean }
  viewOnly?: boolean
  /** 校验规则：内置字符串快捷方式 或 自定义函数 */
  rules?: (BuiltinRule | ((v: string) => string | undefined))[]
  /** 格式化：内置字符串快捷方式 或 自定义函数，失焦时自动触发 */
  format?: BuiltinFormat | ((v: string) => string)
  /**
   * 级联下拉：选项依赖其他字段的值
   * optionsFrom: 依赖的字段 key
   * optionsMap: { 依赖字段值: [选项列表] }
   * optionsApi: 从 API 获取选项，URL 中 {value} 替换为当前依赖字段值
   */
  optionsFrom?: string
  optionsMap?: Record<string, string[]>
  optionsApi?: string
  /**
   * 计算字段：由其他字段自动算出，不可手动编辑
   * dependsOn: 依赖字段列表
   * compute: (formData) => 计算结果
   */
  dependsOn?: string[]
  compute?: (data: Record<string, string>) => string
  /** 是否导出到 Excel/ZIP，默认 true */
  exportable?: boolean
  // ---- 仅 type='rate' 时生效 ----
  /** 星星数量，默认 5 */
  rateMax?: number
  /** 是否允许半星，默认 false */
  rateAllowHalf?: boolean
  /** 星星颜色，默认 '#F59E0B' */
  rateColor?: string
  // ---- 仅 type='switch' 时生效 ----
  /** switch 尺寸，默认 'md' */
  switchSize?: 'sm' | 'md'
  // ---- 仅 type='radio' / 'checkbox' 时生效 ----
  /** 排列方向，默认 'horizontal' */
  radioDirection?: 'horizontal' | 'vertical'
  // ---- 仅 type='cascader' / 'tree-select' 时生效 ----
  // children 的 any[] 是决策：级联树的深度与节点字段由调用方决定（可递归任意层），
  // 收成具体结构会限制用法；消费方按 children?: CascaderOption[] 自行递归收窄
  cascaderOptions?: { value: string | number; label: string; children?: any[]; disabled?: boolean }[]
  // ---- 仅 type='number' 时生效 ----
  min?: number
  max?: number
  step?: number
  // ---- 仅 type='text' / 'textarea' 时生效 ----
  /** 最大输入长度 */
  maxLength?: number
  /** textarea 行数，默认 3 */
  rows?: number
  // ---- 栅格布局 ----
  /** 字段宽度：24 栅格系统，默认 6（即 1/4 宽），设为 24 占满整行 */
  span?: number
  /** 字段左侧偏移：24 栅格系统，默认 0 */
  offset?: number
  // ---- 分组（懒惰组合） ----
  /** 分组 key，相同 key 的字段归入同一组 */
  group?: string
  /** 分组显示模式：'tabs' 标签页 | 'collapse' 折叠面板 | 'card' 卡片（默认） */
  groupType?: 'tabs' | 'collapse' | 'card'
  /** 分组标题（仅当 group 存在时生效） */
  groupTitle?: string
  /** 折叠面板默认是否展开（仅 groupType='collapse'） */
  groupExpanded?: boolean
}

/** 拖拽上传区配置 */
export interface DropZoneConfig {
  key: string
  label: string
  folder?: string
  /** 接受的文件 MIME 类型，默认 image/* */
  accept?: string
  /** 是否允许多文件，默认 true */
  multiple?: boolean
  /** 最多文件数，默认无限制 */
  maxFiles?: number
}

/** 上传文件信息 */
export interface DropZoneFile {
  /** 文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
  /** base64 数据 */
  dataUrl: string
  /** MIME 类型 */
  type: string
}

/** 持久化存储的数据结构 */
export interface PersistedFormData {
  /** 表单字段值 */
  fields: Record<string, string>
  /** 拖拽区文件，按 zoneKey 分组 */
  files: Record<string, DropZoneFile[]>
  /** 存储时间戳 */
  _ts: number
}

/** 单元格图片 */
export interface CellImage {
  src: string // base64 或 url
  width?: number
  height?: number
}

/** 导出列定义 */
export interface ExportColumn {
  header: string
  /** 字段 key，或自定义取值函数 (row, index) => value */
  key?: string
  width?: number
  /** 值格式化：(原始值, 行, 列索引) => 显示值 */
  // val/row 的 any 与返回 any 同 DataTable render：行数据为消费方任意结构（见 data/composables/types.ts）
  format?: (val: any, row: Record<string, any>, colIndex: number) => any
  /** 值为图片时的列宽高 */
  imageWidth?: number
  imageHeight?: number
}

/** Excel 工作表定义 */
export interface ExportSheet {
  name?: string
  /**
   * 布局模式：
   * - 'horizontal'（默认）：表头行 + 数据行
   * - 'vertical'：字段名列-值列（A=字段名 B=值）
   * - 'multi'：多列配对，1/3/5…列=表头，2/4/6…列=值
   */
  layout?: 'horizontal' | 'vertical' | 'multi'
  /** columns（horizontal/vertical/multi 通用） */
  columns?: ExportColumn[]
  /** 行数据（horizontal 模式，优先级高于 columns） */
  rows?: Record<string, any>[]
  /** 从字段 key 快速生成列 */
  fields?: string[]
  /** multi 模式每行配对列数，默认 2（即 4 列/行：H V H V） */
  pairsPerRow?: number
}

/** Excel 导出配置 */
export interface ExportExcelOptions {
  filename?: string
  /** 多 sheet 支持 */
  sheets?: ExportSheet[]
  /** 单 sheet 快捷写法 */
  sheetName?: string
  columns?: ExportColumn[]
  rows?: Record<string, any>[]
  layout?: ExportSheet['layout']
  /** 导出为 CSV（忽略多 sheet） */
  asCSV?: boolean
}

/** ZIP 文件映射 */
export interface ZipFileEntry {
  /** zip 内路径，如 '资料/营业执照.jpg' */
  path: string
  data: Blob | string
}

/** 文件组织上下文 */
export interface ZipFileContext {
  zoneKey: string
  zone: { label: string; folder?: string; accept?: string }
  file: { name: string; url: string; size?: number }
  index: number
  formData: Record<string, string>
}

/** ZIP 导出配置 */
export interface ExportZipOptions {
  filename?: string | ((formData: Record<string, string>) => string)
  excel?: ExportExcelOptions | false
  /** 自定义 zip 内文件列表 */
  files?: ZipFileEntry[]
  /** 上传区过滤：只打包这些 key，不传则全部 */
  zoneKeys?: string[]
  /** 是否包含上传文件，默认 true */
  includeUploads?: boolean
  /**
   * 文件路径生成：
   * - 字符串：如 'flat' 全部平铺，'folder' 按 DropZoneConfig.folder 分组
   * - 函数：(ctx) => zip内路径，返回 '' 跳过该文件
   */
  filePath?: 'flat' | 'folder' | ((ctx: ZipFileContext) => string)
  /** 共用文件夹名（folder 模式下），默认 '共用' */
  sharedDirName?: string
  /** 是否生成 说明.txt，默认 true */
  generateReadme?: boolean
  /**
   * 批量导出：传入多个 config 生成多个 ZIP
   * 每个 config 会依次执行，可通过 filename 区分
   */
  batch?: ExportZipOptions[]
}
