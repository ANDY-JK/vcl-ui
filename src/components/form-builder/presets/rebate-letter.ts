/**
 * 预置 Schema：门店返利函收集
 *
 * 从旧版 RebateLetterDemo.vue（487 行）抽取为 Schema 驱动表单。
 * 原业务逻辑：每个门店一个上传位（返利函照片），支持 IndexedDB/Supabase 双存储、
 * 搜索、导出 ZIP（按 id 分目录 + 门店清单 Excel）。
 *
 * 在 form-builder 低代码体系中，该业务简化为一张「返利函收集」表单模板：
 * - 门店基础信息字段（Apple ID、名称、营业执照、地址、电话、开始日期）
 * - 返利函照片上传位（image-upload + camera 拍照）
 * - 备注
 *
 * 存储/收集/导出能力由 form-builder 的 FormCollect 统一承接（本地/云端切换、
 * 导入汇总导出均已内置），不再需要单独的 rebate-storage.ts 适配层。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function rebateLetterSchema(): FormSchema {
  return {
    title: t('fbPre.rbTitle'),
    description: t('fbPre.rbDesc'),
    layout: 'single',
    submitText: t('fbPre.rbSubmit'),
    validateOnChange: true,
    fields: [
      {
        key: 'appleId',
        label: 'Apple ID',
        type: 'number',
        required: true,
        placeholder: t('fbPre.rbAppleIdPh'),
        props: { stepper: false },
      },
      {
        key: 'storeName',
        label: t('fbPre.rbStoreName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.rbStoreNamePh'),
        span: 24,
      },
      {
        key: 'license',
        label: t('fbPre.rbLicenseName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.rbLicenseNamePh'),
      },
      {
        key: 'address',
        label: t('fbPre.rbLicenseAddr'),
        type: 'textarea',
        required: true,
        placeholder: t('fbPre.rbLicenseAddrPh'),
        span: 24,
        props: { rows: 2 },
      },
      {
        key: 'phone',
        label: t('fbPre.rbPhone'),
        type: 'tel',
        placeholder: t('fbPre.rbPhonePh'),
        rules: [validators.phone()],
      },
      {
        key: 'startDate',
        label: t('fbPre.rbStartDate'),
        type: 'date',
        placeholder: t('fbPre.rbStartDatePh'),
        props: { format: 'YYYY-MM-DD' },
      },
      {
        key: 'category',
        label: t('fbPre.rbCategory'),
        type: 'select',
        required: true,
        placeholder: t('fbPre.rbCategoryPh'),
        options: [
          { value: '汇荣达', label: '汇荣达' },
          { value: '立炎卓', label: '立炎卓' },
        ],
      },
      {
        key: 'rebatePhoto',
        label: t('fbPre.rbPhoto'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.rbPhotoHint'),
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
        placeholder: t('fbPre.rbRemarkPh'),
        span: 24,
        props: { rows: 3 },
      },
    ],
  }
}
