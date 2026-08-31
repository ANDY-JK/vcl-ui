/**
 * 预置 Schema：动态表单（通用）
 *
 * 承接旧版 DynamicForm 动态表单能力——字段由 schema 动态驱动，多类型覆盖：
 * 文本/数字/单选/下拉/日期/多行/图片上传/手写签名/富文本。
 * 在设计器中可在此基础上增删改字段，任意组合。
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function dynamicFormSchema(): FormSchema {
  return {
    title: t('fbPre.dyTitle'),
    description: t('fbPre.dyDesc'),
    layout: 'single',
    submitText: t('fbPre.dySubmit'),
    validateOnChange: true,
    fields: [
      {
        key: 'name',
        label: t('fbPre.dyName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.dyNamePh'),
      },
      {
        key: 'age',
        label: t('fbPre.dyAge'),
        type: 'number',
        placeholder: t('fbPre.dyAgePh'),
        props: { min: 0, max: 120, step: 1, precision: 0 },
      },
      {
        key: 'gender',
        label: t('fbPre.dyGender'),
        type: 'radio',
        required: true,
        props: { direction: 'horizontal' },
        options: [
          { value: 'male', label: t('fbPre.dyGenderMale') },
          { value: 'female', label: t('fbPre.dyGenderFemale') },
        ],
      },
      {
        key: 'city',
        label: t('fbPre.dyCity'),
        type: 'select',
        placeholder: t('fbPre.dyCityPh'),
        options: [
          { value: 'beijing', label: t('fbPre.dyCityBeijing') },
          { value: 'shanghai', label: t('fbPre.dyCityShanghai') },
          { value: 'guangzhou', label: t('fbPre.dyCityGuangzhou') },
          { value: 'shenzhen', label: t('fbPre.dyCityShenzhen') },
        ],
      },
      {
        key: 'birthday',
        label: t('fbPre.dyBirthday'),
        type: 'date',
        placeholder: t('fbPre.dyBirthdayPh'),
        props: { format: 'YYYY-MM-DD' },
      },
      {
        key: 'intro',
        label: t('fbPre.dyIntro'),
        type: 'textarea',
        placeholder: t('fbPre.dyIntroPh'),
        span: 24,
        props: { rows: 3 },
        rules: [validators.maxLen(200, t('fbPre.dyIntro'))],
      },
      {
        key: 'photo',
        label: t('fbPre.dyPhoto'),
        type: 'image-upload',
        hint: t('fbPre.dyPhotoHint'),
        props: {
          variant: 'card',
          accept: 'image/*',
          maxSize: 10,
          mobileMenu: true,
          compress: true,
        },
      },
      {
        key: 'sign',
        label: t('fbPre.dySign'),
        type: 'signature',
        hint: t('fbPre.dySignHint'),
      },
      {
        key: 'richtext',
        label: t('fbPre.dyRichtext'),
        type: 'richtext',
        span: 24,
        props: { minLength: 0 },
      },
    ],
  }
}
