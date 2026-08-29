/**
 * 预置 Schema：设备巡检表单
 *
 * 展示 FormBuilder 的多步骤（steps）模式 + 字段联动 + 分组 + 多种字段类型
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

export function inspectionSchema(): FormSchema {
  return {
    title: t('fbPre.inspTitle'),
    description: t('fbPre.inspDesc'),
    layout: 'steps',
    submitText: t('fbPre.inspSubmit'),
    steps: [
      { title: t('fbPre.groupBasic'), fields: ['inspector', 'date', 'site', 'shift'] },
      { title: t('fbPre.inspStepDevice'), fields: ['deviceName', 'deviceStatus', 'issues', 'severity'] },
      { title: t('fbPre.inspStepSite'), fields: ['photos', 'remark'] },
    ],
    fields: [
      // ─── 步骤1：基本信息 ───
      {
        key: 'inspector',
        label: t('fbPre.inspInspector'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.inspInspectorPh'),
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'date',
        label: t('fbPre.inspDate'),
        type: 'date',
        required: true,
        props: { format: 'YYYY-MM-DD' },
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'site',
        label: t('fbPre.inspSite'),
        type: 'select',
        required: true,
        placeholder: t('fbPre.inspSitePh'),
        options: [
          { value: 'site-a', label: t('fbPre.inspSiteA') },
          { value: 'site-b', label: t('fbPre.inspSiteB') },
          { value: 'site-c', label: t('fbPre.inspSiteC') },
        ],
        group: t('fbPre.groupBasic'),
      },
      {
        key: 'shift',
        label: t('fbPre.inspShift'),
        type: 'radio',
        required: true,
        props: { direction: 'horizontal' },
        options: [
          { value: 'morning', label: t('fbPre.inspDay') },
          { value: 'evening', label: t('fbPre.inspNight') },
        ],
        group: t('fbPre.groupBasic'),
      },

      // ─── 步骤2：设备状态 ───
      {
        key: 'deviceName',
        label: t('fbPre.inspDeviceName'),
        type: 'text',
        required: true,
        placeholder: t('fbPre.inspDeviceNamePh'),
        group: t('fbPre.inspStepDevice'),
      },
      {
        key: 'deviceStatus',
        label: t('fbPre.inspStatus'),
        type: 'select',
        required: true,
        options: [
          { value: 'normal', label: t('fbPre.inspStatusNormal') },
          { value: 'warning', label: t('fbPre.inspStatusWarning') },
          { value: 'down', label: t('fbPre.inspStatusDown') },
        ],
        group: t('fbPre.inspStepDevice'),
      },
      {
        key: 'issues',
        label: t('fbPre.inspIssues'),
        type: 'switch',
        default: false,
        group: t('fbPre.inspStepDevice'),
      },
      {
        key: 'severity',
        label: t('fbPre.inspSeverity'),
        type: 'rate',
        visibleWhen: { field: 'issues', equals: true },
        props: { rateMax: 5, allowHalf: true },
        group: t('fbPre.inspStepDevice'),
      },

      // ─── 步骤3：现场记录 ───
      {
        key: 'photos',
        label: t('fbPre.inspPhotos'),
        type: 'image-upload',
        required: true,
        hint: t('fbPre.inspPhotosHint'),
        props: {
          variant: 'card',
          accept: 'image/*',
          multiple: true,
          maxSize: 10,
          mobileMenu: true,
          compress: true,
        },
        group: t('fbPre.inspStepSite'),
      },
      {
        key: 'remark',
        label: t('fbPre.inspRemark'),
        type: 'textarea',
        placeholder: t('fbPre.inspRemarkPh'),
        props: { rows: 4 },
        rules: [validators.maxLen(500, t('fbPre.regRemark'))],
        group: t('fbPre.inspStepSite'),
      },
    ],
  }
}
