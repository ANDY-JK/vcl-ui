/**
 * 预置 Schema：门店返利函收集
 *
 * 从旧版 RebateLetterDemo.vue（487 行）抽取为 Schema 驱动表单。
 * 资质字段头 + 备注由 store-profile 共享工厂提供，本文件只声明业务差异：返利函照片上传位。
 * 存储/收集/导出能力由 form-builder 的 FormCollect 统一承接。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { useT } from '@/components/_internal/i18n'
import { buildStoreCollectionSchema, storePhotoProps } from './store-profile'

const t = useT()

export function rebateLetterSchema(): FormSchema {
  return buildStoreCollectionSchema({
    titleKey: 'fbPre.rbTitle',
    descKey: 'fbPre.rbDesc',
    submitTextKey: 'fbPre.rbSubmit',
    remarkPlaceholderKey: 'fbPre.rbRemarkPh',
    businessFields: [
      {
        key: 'rebatePhoto',
        label: t('fbPre.rbPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.rbPhotoHint'),
        props: storePhotoProps(),
      },
    ],
  })
}
