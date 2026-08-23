/**
 * 预置 Schema：设备巡检表单
 *
 * 展示 FormBuilder 的多步骤（steps）模式 + 字段联动 + 分组 + 多种字段类型
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'

export const inspectionSchema: FormSchema = {
  title: '设备巡检登记',
  description: '多步骤巡检流程：基本信息 → 设备状态 → 现场记录',
  layout: 'steps',
  submitText: '提交巡检报告',
  steps: [
    { title: '基本信息', fields: ['inspector', 'date', 'site', 'shift'] },
    { title: '设备状态', fields: ['deviceName', 'deviceStatus', 'issues', 'severity'] },
    { title: '现场记录', fields: ['photos', 'remark'] },
  ],
  fields: [
    // ─── 步骤1：基本信息 ───
    {
      key: 'inspector',
      label: '巡检人',
      type: 'text',
      required: true,
      placeholder: '请输入巡检人姓名',
      group: '基本信息',
    },
    {
      key: 'date',
      label: '巡检日期',
      type: 'date',
      required: true,
      props: { format: 'YYYY-MM-DD' },
      group: '基本信息',
    },
    {
      key: 'site',
      label: '巡检站点',
      type: 'select',
      required: true,
      placeholder: '选择站点',
      options: [
        { value: 'site-a', label: 'A 区机房' },
        { value: 'site-b', label: 'B 区机房' },
        { value: 'site-c', label: 'C 区机房' },
      ],
      group: '基本信息',
    },
    {
      key: 'shift',
      label: '班次',
      type: 'radio',
      required: true,
      props: { direction: 'horizontal' },
      options: [
        { value: 'morning', label: '白班' },
        { value: 'evening', label: '夜班' },
      ],
      group: '基本信息',
    },

    // ─── 步骤2：设备状态 ───
    {
      key: 'deviceName',
      label: '设备名称',
      type: 'text',
      required: true,
      placeholder: '设备编号或名称',
      group: '设备状态',
    },
    {
      key: 'deviceStatus',
      label: '设备运行状态',
      type: 'select',
      required: true,
      options: [
        { value: 'normal', label: '✓ 正常运行' },
        { value: 'warning', label: '⚠ 异常但可运行' },
        { value: 'down', label: '✗ 停机故障' },
      ],
      group: '设备状态',
    },
    {
      key: 'issues',
      label: '是否存在异常',
      type: 'switch',
      default: false,
      group: '设备状态',
    },
    {
      key: 'severity',
      label: '严重程度',
      type: 'rate',
      visibleWhen: { field: 'issues', equals: true },
      props: { rateMax: 5, allowHalf: true },
      group: '设备状态',
    },

    // ─── 步骤3：现场记录 ───
    {
      key: 'photos',
      label: '现场照片',
      type: 'image-upload',
      required: true,
      hint: '至少上传 1 张现场照片',
      props: {
        variant: 'card',
        accept: 'image/*',
        multiple: true,
        maxSize: 10,
        mobileMenu: true,
        compress: true,
      },
      group: '现场记录',
    },
    {
      key: 'remark',
      label: '巡检备注',
      type: 'textarea',
      placeholder: '描述巡检发现的问题、处理措施等',
      props: { rows: 4 },
      rules: [validators.maxLen(500, '备注')],
      group: '现场记录',
    },
  ],
}
