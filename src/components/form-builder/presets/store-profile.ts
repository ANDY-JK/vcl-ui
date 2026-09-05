/**
 * 门店收集类模板共享资质字段工厂
 *
 * 合同收集 / 返利函收集 / 陈列收集 / 门店收集四个模板的公共部分：
 * 资质字段头（Apple ID/门店名称/营业执照/地址/电话/开始日期/门店分类）+ 照片位 props + 备注尾。
 * 业务差异（上传位数量与标签、条件显隐字段）由各模板以 businessFields 追加。
 *
 * 历史：四个 preset 曾各自复制同一段资质字段，已发生 name/storeName 键名漂移（2026-09-05 收编）。
 * 键名即收集记录的数据列名，保持稳定：storeName（合同模板历史用 name，已统一）。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormField, FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

const t = useT()

/** 照片上传位公共 props（卡片形态/拍照+相册/10MB/压缩） */
export function storePhotoProps(): Record<string, unknown> {
  return { variant: 'card', accept: 'image/*', maxSize: 10, mobileMenu: true, compress: true }
}

/** 门店资质公共字段头（7 个字段，键名 = 收集记录数据列名，保持稳定） */
export function storeProfileFields(): FormField[] {
  return [
    {
      key: 'appleId',
      label: 'Apple ID',
      type: 'number',
      required: true,
      placeholder: t('fbPre.scAppleIdPh'),
      props: { stepper: false },
    },
    {
      key: 'storeName',
      label: t('fbPre.scStoreName'),
      type: 'text',
      required: true,
      placeholder: t('fbPre.scStoreNamePh'),
      span: 24,
    },
    {
      key: 'license',
      label: t('fbPre.scLicenseName'),
      type: 'text',
      required: true,
      placeholder: t('fbPre.scLicenseNamePh'),
    },
    {
      key: 'address',
      label: t('fbPre.scLicenseAddr'),
      type: 'textarea',
      required: true,
      placeholder: t('fbPre.scLicenseAddrPh'),
      span: 24,
      props: { rows: 2 },
    },
    {
      key: 'phone',
      label: t('fbPre.scPhone'),
      type: 'tel',
      placeholder: t('fbPre.scPhonePh'),
      rules: [validators.phone()],
    },
    {
      key: 'startDate',
      label: t('fbPre.scStartDate'),
      type: 'date',
      placeholder: t('fbPre.scStartDatePh'),
      props: { format: 'YYYY-MM-DD' },
    },
    {
      key: 'category',
      label: t('fbPre.scCategory'),
      type: 'select',
      required: true,
      placeholder: t('fbPre.scCategoryPh'),
      options: [
        { value: '汇荣达', label: '汇荣达' },
        { value: '立炎卓', label: '立炎卓' },
      ],
    },
  ]
}

export interface StoreCollectionSchemaConfig {
  titleKey: string
  descKey: string
  submitTextKey: string
  /** 业务差异字段（上传位/条件开关等），插在资质头之后、备注之前 */
  businessFields: FormField[]
  remarkPlaceholderKey: string
}

/** 组装一张门店收集类表单：资质头 + 业务字段 + 备注 */
export function buildStoreCollectionSchema(config: StoreCollectionSchemaConfig): FormSchema {
  const remark: FormField = {
    key: 'remark',
    label: t('fbPre.regRemark'),
    type: 'textarea',
    placeholder: t(config.remarkPlaceholderKey),
    span: 24,
    props: { rows: 3 },
  }
  return {
    title: t(config.titleKey),
    description: t(config.descKey),
    layout: 'single',
    submitText: t(config.submitTextKey),
    validateOnChange: true,
    fields: [...storeProfileFields(), ...config.businessFields, remark],
  }
}
