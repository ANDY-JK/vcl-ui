/**
 * 预置 Schema：用户登记表单
 *
 * 展示 grid 布局 + 多种表单组件 + 校验规则组合
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function registrationSchema(): FormSchema {
  return {
    title: t('fbPre.regTitle'),
    description: t('fbPre.regDesc'),
    layout: 'grid',
    columns: 2,
    submitText: t('fbPre.regSubmit'),
    validateOnChange: true,
    fields: [
      {
        key: 'name',
        label: t('fb.sampleName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.regNamePh'),
        rules: [validators.minLen(2, t('fb.sampleName'))],
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'gender',
        label: t('fbPre.regGender'),
        type: 'radio',
        props: { direction: 'horizontal' },
        options: [
          { value: 'male', label: t('fbPre.regMale') },
          { value: 'female', label: t('fbPre.regFemale') },
        ],
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'phone',
        label: t('fbPre.regPhone'),
        type: 'tel',
        required: true,
        placeholder: t('fbPre.regPhonePh'),
        rules: [validators.phone()],
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'email',
        label: t('fbPre.regEmail'),
        type: 'email',
        placeholder: 'example@domain.com',
        rules: [validators.email()],
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'birthday',
        label: t('fbPre.regBirthday'),
        type: 'date',
        props: { format: 'YYYY-MM-DD' },
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'idCard',
        label: t('fbPre.regIdCard'),
        type: 'text',
        placeholder: t('fbPre.regIdCardPh'),
        rules: [validators.idCard()],
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'province',
        label: t('fbPre.regRegion'),
        type: 'cascader',
        placeholder: t('fbPre.regRegionPh'),
        cascaderOptions: [
          {
            value: 'hunan',
            label: '湖南省',
            children: [
              {
                value: 'changsha',
                label: '长沙市',
                children: [
                  { value: 'yuelu', label: '岳麓区' },
                  { value: 'kaifu', label: '开福区' },
                  { value: 'tianxin', label: '天心区' },
                ],
              },
              {
                value: 'yueyang',
                label: '岳阳市',
                children: [
                  { value: 'yueyanglou', label: '岳阳楼区' },
                  { value: 'yunxi', label: '云溪区' },
                ],
              },
            ],
          },
          {
            value: 'guangdong',
            label: '广东省',
            children: [
              {
                value: 'guangzhou',
                label: '广州市',
                children: [
                  { value: 'tianhe', label: '天河区' },
                  { value: 'yuexiu', label: '越秀区' },
                ],
              },
            ],
          },
        ],
        group: t('fbPre.groupAddress'),
      },
      {
        key: 'address',
        label: t('formBuilder.addressPlaceholder'),
        type: 'text',
        placeholder: t('fbPre.regAddressPh'),
        span: 24,
        group: t('fbPre.groupAddress'),
      },
      {
        key: 'hobbies',
        label: t('fbPre.regHobbies'),
        type: 'checkbox',
        props: { direction: 'horizontal' },
        options: [
          { value: 'reading', label: t('fbPre.regOptReading') },
          { value: 'sports', label: t('fbPre.regOptSports') },
          { value: 'music', label: t('fbPre.regOptMusic') },
          { value: 'travel', label: t('fbPre.regOptTravel') },
          { value: 'coding', label: t('fbPre.regOptCoding') },
        ],
        span: 24,
        group: t('fbPre.groupExtra'),
      },
      {
        key: 'subscribe',
        label: t('fbPre.regSubscribe'),
        type: 'switch',
        default: true,
        group: t('fbPre.groupExtra'),
      },
      {
        key: 'channel',
        label: t('fbPre.regChannel'),
        type: 'checkbox',
        visibleWhen: { field: 'subscribe', equals: true },
        options: [
          { value: 'sms', label: t('fbPre.regOptSms') },
          { value: 'email', label: t('fbPre.regOptEmail') },
          { value: 'push', label: t('fbPre.regOptPush') },
        ],
        span: 24,
        group: t('fbPre.groupExtra'),
      },
      {
        key: 'remark',
        label: t('fbPre.regRemark'),
        type: 'textarea',
        placeholder: t('fbPre.regRemarkPh'),
        span: 24,
        props: { rows: 3 },
        rules: [validators.maxLen(200, t('fbPre.regRemark'))],
        group: t('fbPre.groupExtra'),
      },
    ],
  }
}
