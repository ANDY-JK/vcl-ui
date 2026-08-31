/**
 * 预置 Schema：门店收集（通用模板）
 *
 * 合并原 rebate-letter / shelf-collection / contract-collection 三个高度相似模板：
 * 三者本质相同（门店资料 + N 个照片位），差别仅在照片位数量与标签。
 * 本模板提供门店资料基线 + 1 个通用照片位；需要多照片位时在设计器里自行增删/改标签
 * （目标收集模式 collectType=target 下，照片位字段自动成为表格列）。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function storeCollectionSchema(): FormSchema {
  return {
    title: t('fbPre.stTitle'),
    description: t('fbPre.stDesc'),
    layout: 'single',
    submitText: t('fbPre.stSubmit'),
    validateOnChange: true,
    fields: [
      {
        key: 'appleId',
        label: 'Apple ID',
        type: 'number',
        required: true,
        placeholder: t('fbPre.stAppleIdPh'),
        props: { stepper: false },
      },
      {
        key: 'storeName',
        label: t('fbPre.stStoreName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.stStoreNamePh'),
        span: 24,
      },
      {
        key: 'license',
        label: t('fbPre.stLicenseName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.stLicenseNamePh'),
      },
      {
        key: 'address',
        label: t('fbPre.stLicenseAddr'),
        type: 'textarea',
        required: true,
        placeholder: t('fbPre.stLicenseAddrPh'),
        span: 24,
        props: { rows: 2 },
      },
      {
        key: 'phone',
        label: t('fbPre.stPhone'),
        type: 'tel',
        placeholder: t('fbPre.stPhonePh'),
        rules: [validators.phone()],
      },
      {
        key: 'startDate',
        label: t('fbPre.stStartDate'),
        type: 'date',
        placeholder: t('fbPre.stStartDatePh'),
        props: { format: 'YYYY-MM-DD' },
      },
      {
        key: 'category',
        label: t('fbPre.stCategory'),
        type: 'select',
        required: true,
        placeholder: t('fbPre.stCategoryPh'),
        options: [
          { value: '汇荣达', label: '汇荣达' },
          { value: '立炎卓', label: '立炎卓' },
        ],
      },
      {
        key: 'photo',
        label: t('fbPre.stPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.stPhotoHint'),
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
        placeholder: t('fbPre.stRemarkPh'),
        span: 24,
        props: { rows: 3 },
      },
    ],
  }
}
