/**
 * 展示类字段在**设计器节点**上的属性（2026-10-19 拆分自 domain.ts）
 *
 * 为什么单独成一处：domain.ts 已贴近 form-builder 域 800 行止涨线，而展示类属性
 * 是"纯承载、无逻辑"的一簇，最适合外移；`DesignerNode` 用 `extends` 混入，
 * 对消费方完全透明（字段访问方式一字不变）。
 *
 * 与 `DesignerNode` 自己的属性区分：这里只放**展示类字段专属**的东西
 * （图片/头像/进度/标签的取值、数据源、表格配置、选点与回填开关）。
 */
import type { DisplayDataSource } from '../../display-data-source'

/** 展示类字段属性（由 DesignerNode 混入） */
export interface DesignerDisplayProps {
  /** 展示类：图片/头像地址（image / avatar） */
  src?: string
  /** 展示类：替代文本（image；缺省回落 label） */
  alt?: string
  /** 展示类：进度百分比 0–100（progress） */
  percent?: number
  /** 展示类：标签文本（tag） */
  text?: string
  /** 展示类：标签语义色（tag，映射到 Tag 的 variant） */
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  /** 展示类：名称（avatar；无 src 时取首字） */
  name?: string
  /** 展示类：尺寸（avatar / tag） */
  size?: 'sm' | 'md' | 'lg'
  /** 告知型展示：结果态类型（result；取值域与 tone 不同，故单列） */
  resultStatus?: 'success' | 'error' | 'info' | 'warning' | '404' | 'empty'
  /** 告知型展示：加载态形态（loading） */
  loadingVariant?: 'spinner' | 'skeleton'
  /** 地图选点：初始中心 [lng, lat]（未选点时用） */
  mapCenter?: [number, number]
  /** 地图选点：初始缩放级别 */
  mapZoom?: number
  /** 地图选点：选点后是否自动回填文字地址（需配置高德 REST key；默认关） */
  autoAddress?: boolean
  /** 地图选点：地址回填的目标字段 key（默认 `address`） */
  addressField?: string
  /** 展示类数据源（明细表/图表/地图等要取数的元素；三模式见 display-data-source.ts） */
  displaySource?: DisplayDataSource
  /** 展示表格的列定义（不填按数据首行推导） */
  columns?: { key: string; label?: string }[]
  /** 展示表格的行唯一键字段名 */
  rowKey?: string
}
