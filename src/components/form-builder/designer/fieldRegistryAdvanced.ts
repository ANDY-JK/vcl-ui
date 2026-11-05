/**
 * fieldRegistryAdvanced — v3 高级字段注册（#456 从 fieldRegistry.ts 拆出）
 *
 * 复用 Input 组件做 fallback、实际由 FormRenderer 的 advanced 分支渲染的 8 个类型：
 * subform / relate / richtext / signature / address / idcard / matrix / serial。
 *
 * label/group 存 formBuilder 域的 i18n key（getTypeLabel 在调用时翻译）；
 * defaults 是 thunk，占位文案按创建时刻语言本地化 —— 与主注册表同一约定。
 */
import type { FieldRegistration } from '../fieldRegistry'
import Input from '@/components/form/Input.vue'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：defaults thunk 求值走当前语言 */
const t = useT()

export const ADVANCED_FIELD_REGISTRATIONS: Record<string, FieldRegistration> = {
  subform: {
    type: 'subform',
    category: 'advanced',
    component: Input,
    componentType: 'subform',
    isLayout: false,
    label: 'fbType.subform',
    icon: 'table',
    group: 'fbGroup.advancedFields',
    defaults: () => ({
      span: 24,
      placeholder: t('fb.multiRowHint'),
      subformColumns: `${t('fb.sampleName')}|name|text\n${t('fb.samplePhone')}|phone|number`,
    }),
  },
  relate: {
    type: 'relate',
    category: 'advanced',
    component: Input,
    componentType: 'relate',
    isLayout: false,
    label: 'fbType.relate',
    icon: 'link',
    group: 'fbGroup.advancedFields',
    defaults: () => ({ span: 24, placeholder: t('formBuilder.clickSelect'), relateEntityType: 'user' }),
  },
  richtext: {
    type: 'richtext',
    category: 'advanced',
    component: Input,
    componentType: 'richtext',
    isLayout: false,
    label: 'fbType.richtext',
    icon: 'type',
    group: 'fbGroup.advancedFields',
    defaults: () => ({ span: 24, richtextToolbar: 'simple' }),
  },
  signature: {
    type: 'signature',
    category: 'advanced',
    component: Input,
    componentType: 'signature',
    isLayout: false,
    label: 'fbType.signature',
    icon: 'pen-tool',
    group: 'fbGroup.advancedFields',
    defaults: () => ({ span: 24 }),
  },
  address: {
    type: 'address',
    category: 'advanced',
    component: Input,
    componentType: 'address',
    isLayout: false,
    label: 'fbType.address',
    icon: 'map-pin',
    group: 'fbGroup.advancedFields',
    defaults: () => ({ span: 24, addressDetail: true }),
  },
  idcard: {
    type: 'idcard',
    category: 'advanced',
    component: Input,
    componentType: 'idcard',
    isLayout: false,
    label: 'fbType.idcard',
    icon: 'credit-card',
    group: 'fbGroup.advancedFields',
    defaults: () => ({ span: 24, idcardTypes: `${t('fb.idType1')}\n${t('fb.idType2')}\n${t('fb.idType3')}` }),
  },
  matrix: {
    type: 'matrix',
    category: 'advanced',
    component: Input,
    componentType: 'matrix',
    isLayout: false,
    label: 'fbType.matrix',
    icon: 'grid-3x3',
    group: 'fbGroup.advancedFields',
    defaults: () => ({
      span: 24,
      matrixRows: `${t('fb.matrixR1')}\n${t('fb.matrixR2')}\n${t('fb.matrixR3')}`,
      matrixCols: `${t('fb.matrixC1')}\n${t('fb.matrixC2')}\n${t('fb.matrixC3')}`,
    }),
  },
  serial: {
    type: 'serial',
    category: 'advanced',
    component: Input,
    componentType: 'serial',
    isLayout: false,
    label: 'fbType.serial',
    icon: 'bar-chart',
    group: 'fbGroup.advancedFields',
    defaults: () => ({ span: 12, serialPrefix: 'NO', serialDateFormat: 'YYYYMMDD' }),
  },
}
