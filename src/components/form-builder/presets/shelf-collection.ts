/**
 * 预置 Schema：门店陈列收集
 *
 * 从旧版 ShelfCollectionDemo.vue（524 行）抽取为 Schema 驱动表单。
 * 原业务逻辑：每个门店两个上传位（陈列正面 / 陈列反面），支持 IndexedDB/Supabase
 * 双存储、搜索、导出 ZIP（按 id 分目录 + 门店清单 Excel）。
 *
 * 在 form-builder 低代码体系中，该业务简化为一张「陈列收集」表单模板：
 * - 门店基础信息字段（Apple ID、名称、营业执照、地址、电话、开始日期）
 * - 陈列正面照片上传位
 * - 陈列反面照片上传位
 * - 备注
 *
 * 存储/收集/导出能力由 form-builder 的 FormCollect 统一承接。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function shelfCollectionSchema(): FormSchema {
  return {
    title: t('fbPre.sfTitle'),
    description: t('fbPre.sfDesc'),
    layout: 'single',
    submitText: t('fbPre.sfSubmit'),
    validateOnChange: true,
    fields: [
      {
        key: 'appleId',
        label: 'Apple ID',
        type: 'number',
        required: true,
        placeholder: t('fbPre.sfAppleIdPh'),
        props: { stepper: false },
      },
      {
        key: 'storeName',
        label: t('fbPre.sfStoreName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.sfStoreNamePh'),
        span: 24,
      },
      {
        key: 'license',
        label: t('fbPre.sfLicenseName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.sfLicenseNamePh'),
      },
      {
        key: 'address',
        label: t('fbPre.sfLicenseAddr'),
        type: 'textarea',
        required: true,
        placeholder: t('fbPre.sfLicenseAddrPh'),
        span: 24,
        props: { rows: 2 },
      },
      {
        key: 'phone',
        label: t('fbPre.sfPhone'),
        type: 'tel',
        placeholder: t('fbPre.sfPhonePh'),
        rules: [validators.phone()],
      },
      {
        key: 'startDate',
        label: t('fbPre.sfStartDate'),
        type: 'date',
        placeholder: t('fbPre.sfStartDatePh'),
        props: { format: 'YYYY-MM-DD' },
      },
      {
        key: 'category',
        label: t('fbPre.sfCategory'),
        type: 'select',
        required: true,
        placeholder: t('fbPre.sfCategoryPh'),
        options: [
          { value: '汇荣达', label: '汇荣达' },
          { value: '立炎卓', label: '立炎卓' },
        ],
      },
      {
        key: 'frontPhoto',
        label: t('fbPre.sfFrontPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.sfFrontPhotoHint'),
        props: {
          variant: 'card',
          accept: 'image/*',
          maxSize: 10,
          mobileMenu: true,
          compress: true,
        },
      },
      {
        key: 'backPhoto',
        label: t('fbPre.sfBackPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.sfBackPhotoHint'),
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
        placeholder: t('fbPre.sfRemarkPh'),
        span: 24,
        props: { rows: 3 },
      },
    ],
  }
}
