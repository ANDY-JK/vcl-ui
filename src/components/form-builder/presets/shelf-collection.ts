/**
 * 预置 Schema：门店陈列收集
 *
 * 从旧版 ShelfCollectionDemo.vue（524 行）抽取为 Schema 驱动表单。
 * 资质字段头 + 备注由 store-profile 共享工厂提供，本文件只声明业务差异：
 * 陈列正面 / 陈列反面两个照片上传位。
 * 存储/收集/导出能力由 form-builder 的 FormCollect 统一承接。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { useT } from '@/components/_internal/i18n'
import { buildStoreCollectionSchema, storePhotoProps } from './store-profile'

const t = useT()

export function shelfCollectionSchema(): FormSchema {
  return buildStoreCollectionSchema({
    titleKey: 'fbPre.sfTitle',
    descKey: 'fbPre.sfDesc',
    submitTextKey: 'fbPre.sfSubmit',
    remarkPlaceholderKey: 'fbPre.sfRemarkPh',
    businessFields: [
      {
        key: 'frontPhoto',
        label: t('fbPre.sfFrontPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.sfFrontPhotoHint'),
        props: storePhotoProps(),
      },
      {
        key: 'backPhoto',
        label: t('fbPre.sfBackPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.sfBackPhotoHint'),
        props: storePhotoProps(),
      },
    ],
  })
}
