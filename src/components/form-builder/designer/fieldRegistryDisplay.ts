/**
 * 展示类字段的注册条目（2026-10-18 拆分自 fieldRegistry.ts）
 *
 * 为什么单独成文件：fieldRegistry.ts 已接近 form-builder 域的 800 行止涨线，
 * 而「把组件库的展示能力接进低代码」后续还会继续加（表格 / 图表 / 地图…）。
 * 按主题拆出去，比压缩注释或放宽止涨线都更可持续——止涨线的意义就是逼出这种拆分。
 *
 * 这些类型与 divider/title/paragraph 同属 `isLayout: true`：**纯展示、不进提交数据**。
 * 于是它们不需要 key、不参与校验、不污染收集记录。
 */
import Divider from '@/components/data/Divider.vue'
import type { FieldRegistration } from '../fieldRegistry'

/** 展示类字段注册条目（由 fieldRegistry 的 REGISTRY 展开合并） */
export const DISPLAY_FIELD_REGISTRATIONS: Record<string, FieldRegistration> = {
  image: {
    type: 'image',
    category: 'layout',
    component: Divider,
    componentType: 'image',
    isLayout: true,
    label: 'fbType.image',
    icon: 'image',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, src: '', alt: '' }),
  },
  avatar: {
    type: 'avatar',
    category: 'layout',
    component: Divider,
    componentType: 'avatar',
    isLayout: true,
    label: 'fbType.avatar',
    icon: 'user',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, src: '', name: '', size: 'md' }),
  },
  progress: {
    type: 'progress',
    category: 'layout',
    component: Divider,
    componentType: 'progress',
    isLayout: true,
    label: 'fbType.progress',
    icon: 'trending-up',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, percent: 60 }),
  },
  tag: {
    type: 'tag',
    category: 'layout',
    component: Divider,
    componentType: 'tag',
    isLayout: true,
    label: 'fbType.tag',
    icon: 'tag',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, text: '', tone: 'default', size: 'md' }),
  },
  // 明细表：要取数的展示元素，默认走"静态配置"（设计时手填），可切成绑定字段或接口
  'data-table': {
    type: 'data-table',
    category: 'layout',
    component: Divider,
    componentType: 'data-table',
    isLayout: true,
    label: 'fbType.dataTable',
    icon: 'table',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, displaySource: { kind: 'static', staticData: [] }, columns: [] }),
  },
  // 图表：与明细表同一套数据源；数据是完整 option 就原样用，否则按行推导 categories/series
  chart: {
    type: 'chart',
    category: 'layout',
    component: Divider,
    componentType: 'chart',
    isLayout: true,
    label: 'fbType.chart',
    icon: 'chart-line',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, displaySource: { kind: 'static', staticData: [] } }),
  },
  empty: {    type: 'empty',
    category: 'layout',
    component: Divider,
    componentType: 'empty',
    isLayout: true,
    label: 'fbType.empty',
    icon: 'inbox',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, text: '' }),
  },
  skeleton: {
    type: 'skeleton',
    category: 'layout',
    component: Divider,
    componentType: 'skeleton',
    isLayout: true,
    label: 'fbType.skeleton',
    icon: 'loader',
    group: 'fbGroup.display',
    defaults: () => ({ span: 24, text: '' }),
  },
}
