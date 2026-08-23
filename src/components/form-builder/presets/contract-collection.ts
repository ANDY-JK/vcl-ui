/**
 * 预置 Schema：门店合同收集
 *
 * 从 ContractCollectionDemo.vue 抽取为 Schema 驱动表单。
 * 原 Demo 是写死的 1045 行 Vue 文件，本 Schema 约 50 行即可描述同样的表单结构。
 *
 * 门店列表数据不在此定义（那是业务数据，由调用方通过 v-model 注入）。
 * 这里只定义表单字段结构。
 */

import type { FormSchema } from '../types'
import { validators } from '../useFormValidator'

export const contractCollectionSchema: FormSchema = {
  title: '门店合同收集',
  description: '分批收集苹果专柜租赁协议，支持拍照上传与云端同步',
  layout: 'single',
  fields: [
    {
      key: 'appleId',
      label: 'Apple ID',
      type: 'number',
      required: true,
      placeholder: '请输入 Apple ID',
      props: { stepper: false },
    },
    {
      key: 'name',
      label: '授权门店名称',
      type: 'text',
      required: true,
      placeholder: '如：汇荣达汨罗市长乐镇姚献忠手机店',
      span: 24,
    },
    {
      key: 'license',
      label: '营业执照名称',
      type: 'text',
      required: true,
      placeholder: '营业执照上的名称',
    },
    {
      key: 'address',
      label: '营业执照地址',
      type: 'textarea',
      required: true,
      placeholder: '营业执照注册地址',
      span: 24,
      props: { rows: 2 },
    },
    {
      key: 'phone',
      label: '联系电话',
      type: 'tel',
      placeholder: '手机号码',
      rules: [validators.phone()],
    },
    {
      key: 'startDate',
      label: '开始日期',
      type: 'date',
      placeholder: '选择开始日期',
      props: { format: 'YYYY-MM-DD' },
    },
    {
      key: 'category',
      label: '门店分类',
      type: 'select',
      required: true,
      placeholder: '选择分类',
      options: [
        { value: '汇荣达', label: '汇荣达' },
        { value: '立炎卓', label: '立炎卓' },
      ],
    },
    {
      key: 'hasContract',
      label: '是否已签合同',
      type: 'switch',
      default: false,
    },
    {
      key: 'contractPhoto',
      label: '柜机协议照片',
      type: 'image-upload',
      required: true,
      hint: '请拍照上传柜机协议，支持拍照和相册选择',
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
      label: '备注',
      type: 'textarea',
      placeholder: '其他需要说明的信息',
      span: 24,
      props: { rows: 3 },
    },
  ],
}
