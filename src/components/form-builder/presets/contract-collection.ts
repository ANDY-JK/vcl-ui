/**
 * 预置 Schema：门店合同收集
 *
 * 从 ContractCollectionDemo.vue 抽取为 Schema 驱动表单。
 * 资质字段头 + 备注由 store-profile 共享工厂提供，本文件只声明业务差异：
 * 「是否已签合同」开关 → 合同照片上传位（条件显隐）。
 *
 * 门店列表数据不在此定义（业务数据由调用方通过 v-model 注入）。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { useT } from '@/components/_internal/i18n'
import { buildStoreCollectionSchema, storePhotoProps } from './store-profile'

const t = useT()

/** 预置模板：合同收集表单 Schema（返利函/合同类场景的字段编排） */
export function contractCollectionSchema(): FormSchema {
  return buildStoreCollectionSchema({
    titleKey: 'fbPre.ctTitle',
    descKey: 'fbPre.ctDesc',
    submitTextKey: 'fbPre.ctSubmit',
    remarkPlaceholderKey: 'fbPre.ctRemarkPh',
    businessFields: [
      {
        key: 'hasContract',
        label: t('fbPre.ctHasContract'),
        type: 'switch',
        default: false,
      },
      {
        key: 'contractPhoto',
        label: t('fbPre.ctContractPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.ctContractPhotoHint'),
        visibleWhen: { field: 'hasContract', equals: true },
        props: storePhotoProps(),
      },
    ],
  })
}
