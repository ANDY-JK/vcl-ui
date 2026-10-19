/**
 * 设计器字段类型清单（2026-10-18 拆分自 domain.ts）
 *
 * 为什么单独成文件：domain.ts 已贴近 form-builder 域的 800 行止涨线。
 * 这里是**纯数据清单**，没有逻辑依赖，最适合外移；domain.ts 用 re-export 保持
 * 既有导入路径（`from './types/domain'`）不变，公开 API 不受影响。
 *
 * 权威来源是 `fieldRegistry.ts` 的注册表——新增类型时两边都要加：注册表负责
 * 渲染/面板元数据，本清单负责对外枚举。`check:constants` 与文档生成都会读它。
 */
import type { DesignerFieldType } from './domain'

/** 全部字段类型（顺序即设计器面板的默认分组内顺序） */
export const FIELD_NODE_TYPES: DesignerFieldType[] = [
  'text',
  'textarea',
  'number',
  'password',
  'tel',
  'email',
  'url',
  'search',
  'color',
  'select',
  'combobox',
  'tree-select',
  'radio',
  'checkbox',
  'cascader',
  'switch',
  'date',
  'date-range',
  'time',
  'rate',
  'slider',
  'upload',
  'image-upload',
  'camera',
  'scan-code',
  'divider',
  'title',
  'paragraph',
  'subform',
  'relate',
  'richtext',
  'signature',
  'address',
  'idcard',
  'matrix',
  'serial',
  // 展示类（2026-10-18）
  'image',
  'avatar',
  'progress',
  'tag',
  'data-table',
  'chart',
  'chart-table',
  'amap',
  'empty',
  'skeleton',
]
