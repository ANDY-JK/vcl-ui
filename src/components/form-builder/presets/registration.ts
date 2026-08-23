/**
 * 预置 Schema：用户登记表单
 *
 * 展示 grid 布局 + 多种表单组件 + 校验规则组合
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'

export const registrationSchema: FormSchema = {
  title: '用户信息登记',
  description: 'Grid 布局示例 — 双列表单，实时校验',
  layout: 'grid',
  columns: 2,
  submitText: '提交登记',
  validateOnChange: true,
  fields: [
    {
      key: 'name',
      label: '姓名',
      type: 'text',
      required: true,
      placeholder: '真实姓名',
      rules: [validators.minLen(2, '姓名')],
      group: '基本信息',
    },
    {
      key: 'gender',
      label: '性别',
      type: 'radio',
      props: { direction: 'horizontal' },
      options: [
        { value: 'male', label: '男' },
        { value: 'female', label: '女' },
      ],
      group: '基本信息',
    },
    {
      key: 'phone',
      label: '手机号',
      type: 'tel',
      required: true,
      placeholder: '11 位手机号',
      rules: [validators.phone()],
      group: '基本信息',
    },
    {
      key: 'email',
      label: '邮箱',
      type: 'email',
      placeholder: 'example@domain.com',
      rules: [validators.email()],
      group: '基本信息',
    },
    {
      key: 'birthday',
      label: '出生日期',
      type: 'date',
      props: { format: 'YYYY-MM-DD' },
      group: '基本信息',
    },
    {
      key: 'idCard',
      label: '身份证号',
      type: 'text',
      placeholder: '18 位身份证号',
      rules: [validators.idCard()],
      group: '基本信息',
    },
    {
      key: 'province',
      label: '所在地区',
      type: 'cascader',
      placeholder: '选择省/市/区',
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
      group: '联系地址',
    },
    {
      key: 'address',
      label: '详细地址',
      type: 'text',
      placeholder: '街道门牌号',
      span: 24,
      group: '联系地址',
    },
    {
      key: 'hobbies',
      label: '兴趣爱好',
      type: 'checkbox',
      props: { direction: 'horizontal' },
      options: [
        { value: 'reading', label: '阅读' },
        { value: 'sports', label: '运动' },
        { value: 'music', label: '音乐' },
        { value: 'travel', label: '旅行' },
        { value: 'coding', label: '编程' },
      ],
      span: 24,
      group: '补充信息',
    },
    {
      key: 'subscribe',
      label: '订阅通知',
      type: 'switch',
      default: true,
      group: '补充信息',
    },
    {
      key: 'channel',
      label: '通知方式',
      type: 'checkbox',
      visibleWhen: { field: 'subscribe', equals: true },
      options: [
        { value: 'sms', label: '短信' },
        { value: 'email', label: '邮件' },
        { value: 'push', label: 'App 推送' },
      ],
      span: 24,
      group: '补充信息',
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      placeholder: '其他需要说明的信息（可选）',
      span: 24,
      props: { rows: 3 },
      rules: [validators.maxLen(200, '备注')],
      group: '补充信息',
    },
  ],
}
