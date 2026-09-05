/**
 * 预置 Schema：门店收集（通用模板）
 *
 * 门店资料基线 + 1 个通用照片位；需要多照片位时在设计器里自行增删/改标签
 * （目标收集模式 collectType=target 下，照片位字段自动成为表格列）。
 * 资质字段头 + 备注由 store-profile 共享工厂提供（与合同/返利函/陈列模板同源）。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { useT } from '@/components/_internal/i18n'
import { buildStoreCollectionSchema, storePhotoProps } from './store-profile'

const t = useT()

export function storeCollectionSchema(): FormSchema {
  return buildStoreCollectionSchema({
    titleKey: 'fbPre.stTitle',
    descKey: 'fbPre.stDesc',
    submitTextKey: 'fbPre.stSubmit',
    remarkPlaceholderKey: 'fbPre.stRemarkPh',
    businessFields: [
      {
        key: 'photo',
        label: t('fbPre.stPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.stPhotoHint'),
        props: storePhotoProps(),
      },
    ],
  })
}
