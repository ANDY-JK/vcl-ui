/**
 * 预置 Schema：门店合同收集
 *
 * 从 ContractCollectionDemo.vue 抽取为 Schema 驱动表单。
 * 原 Demo 是写死的 1045 行 Vue 文件，本 Schema 约 50 行即可描述同样的表单结构。
 *
 * 门店列表数据不在此定义（那是业务数据，由调用方通过 v-model 注入）。
 * 这里只定义表单字段结构。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function contractCollectionSchema(): FormSchema {
  return {
    title: t('fbPre.ctTitle'),
    description: t('fbPre.ctDesc'),
    layout: 'single',
    fields: [
      {
        key: 'appleId',
        label: 'Apple ID',
        type: 'number',
        required: true,
        placeholder: t('fbPre.ctAppleIdPh'),
        props: { stepper: false },
      },
      {
        key: 'name',
        label: t('fbPre.ctStoreName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.ctStoreNamePh'),
        span: 24,
      },
      {
        key: 'license',
        label: t('fbPre.ctLicenseName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.ctLicenseNamePh'),
      },
      {
        key: 'address',
        label: t('fbPre.ctLicenseAddr'),
        type: 'textarea',
        required: true,
        placeholder: t('fbPre.ctLicenseAddrPh'),
        span: 24,
        props: { rows: 2 },
      },
      {
        key: 'phone',
        label: t('fbPre.ctPhone'),
        type: 'tel',
        placeholder: t('fbPre.ctPhonePh'),
        rules: [validators.phone()],
      },
      {
        key: 'startDate',
        label: t('fbPre.ctStartDate'),
        type: 'date',
        placeholder: t('fbPre.ctStartDatePh'),
        props: { format: 'YYYY-MM-DD' },
      },
      {
        key: 'category',
        label: t('fbPre.ctCategory'),
        type: 'select',
        required: true,
        placeholder: t('fbPre.ctCategoryPh'),
        options: [
          { value: '汇荣达', label: '汇荣达' },
          { value: '立炎卓', label: '立炎卓' },
        ],
      },
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
        props: {
          variant: 'card',
          accept: 'image/*',
          maxSize: 10,
          mobileMenu: true,
          compress: true,
        },
      },
      {
        key: 'remark',
        label: t('fbPre.regRemark'),
        type: 'textarea',
        placeholder: t('fbPre.ctRemarkPh'),
        span: 24,
        props: { rows: 3 },
      },
    ],
  }
}
