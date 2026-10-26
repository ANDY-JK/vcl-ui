/**
 * 预置 Schema：门店提报（承接旧版 DynamicForm）
 *
 * 旧版 DynamicFormDemo（vue通用组件/src/views/demos/DynamicFormDemo.vue）本质
 * 就是「输入框(text/select) + 上传(image-upload)」两类组件撑起的门店提报场景：
 * - 48 个字段（含公式字段 compute→linkage、条件显隐 visibleWhen、默认值、经纬度/地址校验）
 * - 26 个拖拽上传位（dropZones→image-upload 字段，按 OTC/O2O/ALL 分组卡片）
 *
 * 迁移映射：
 * - text/select → 新版同类型；viewOnly → readonly；defaultValue → default
 * - compute 公式 → linkage.followValue（{{field}} 算术/拼接；引擎不支持的字符串函数
 *   （replace/filter/endsWith）对应字段跳过聚合，保留为手动输入）
 * - visibleWhen { field, value } → { field, equals }
 * - format lat/lng、地址四级校验 → 内联 rules
 * - dropZones 26 位 → image-upload 字段 + group 分组（OTC/O2O/ALL）
 *
 * 函数化：模块求值早于 setLocale，文案在调用时刻按当前语言翻译
 */

import type { FormSchema, FormField } from '../types'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：纯 .ts 文件，各函数直接用 */
const t = useT()

/** 地址四级行政级别校验（省/市/区县/乡镇，旧版 validateAddressFormat） */
function addressLevels(desc: string) {
  return (v: string) => {
    if (!v || !v.trim()) return undefined
    return /^.{2,}(?:省|自治区|直辖市|特别行政区).{2,}(?:市|区|州|盟).{2,}(?:区|县|市|旗).{2,}(?:乡|镇|街道|村|社区)/.test(
      v,
    )
      ? undefined
      : t('fbPre.srAddrLevels', { desc })
  }
}
/**
 * 解析坐标输入。**区分三种情况**（这一步是校验能不能正确工作的前提）：
 *   · 未填（空串/纯空白）      → null（放过，不是错误）
 *   · 填了但不是合法数字       → NaN （**必须报错**；以前直接返回 undefined 放过了 `"abc"`）
 *   · 合法数字                 → number
 *
 * 另外不能先剥掉空白再 parseFloat：`"30 5"` 剥完变成 `305`，会被判成"疑似输成经度"，
 * 而真实意图是**填错了格式**。所以只做 trim，用整串锚定的正则判断"是不是一个数"。
 */
function parseCoord(v: string | undefined): number | null {
  const s = (v ?? '').trim()
  if (!s) return null // 未填
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) return NaN // 填了但不是数
  return parseFloat(s)
}

/** 纬度校验（中国范围 18~54，旧版 isLat） */
const isLat = (v: string) => {
  const n = parseCoord(v)
  if (n === null) return undefined
  // 第 130 轮修：原来 `isNaN(n) → return undefined`，把 `"abc"` 当"没填"静默放过了
  if (Number.isNaN(n)) return t('fbPre.srCoordNotNumber')
  if (n > 70) return t('fbPre.srLatAsLng')
  if (n < 18 || n > 54) return t('fbPre.srLatRange')
  return undefined
}
/** 经度校验（中国范围 73~135，旧版 isLng） */
const isLng = (v: string) => {
  const n = parseCoord(v)
  if (n === null) return undefined
  if (Number.isNaN(n)) return t('fbPre.srCoordNotNumber')
  if (n < 60) return t('fbPre.srLngAsLat')
  if (n < 73 || n > 135) return t('fbPre.srLngRange')
  return undefined
}

/** 预置模板：门店提报表单 Schema（陈列检查/提报类场景的字段编排） */
export function storeReportSchema(): FormSchema {
  /** 品牌字段（仅「是否提报=项目店」显示，旧版 salesroom 逻辑） */
  const brand = (key: string, label: string): FormField => ({
    key,
    label,
    type: 'select',
    options: [
      { value: '否', label: '否' },
      { value: '是', label: '是' },
    ],
    visibleWhen: { field: 'is_report', equals: '项目店' },
    span: 12,
  })

  /** 上传位（旧版 dropZones → image-upload 字段） */
  const upload = (key: string, label: string, group: string): FormField => ({
    key,
    label,
    type: 'image-upload',
    group,
    props: { variant: 'card', accept: 'image/*', maxSize: 10, mobileMenu: true, compress: true },
  })

  const fields: FormField[] = [
    // ─── 门店基础 ───
    { key: 'division', label: '归属分部', type: 'text', default: '湘赣' },
    { key: 'service_provider', label: '服务商公司名称', type: 'text', default: '示例服务商有限公司', span: 24 },
    { key: 'province', label: '省', type: 'text', readonly: true },
    { key: 'city', label: '市', type: 'text', readonly: true },
    { key: 'district', label: '区/县', type: 'text', readonly: true },
    { key: 'street', label: '乡/镇/街道', type: 'text', readonly: true },
    {
      key: 'address',
      label: '详细地址',
      type: 'text',
      readonly: true,
      span: 24,
      linkage: {
        type: 'followValue',
        formula: '{{street}}{{store_license_name}}',
        dependsOn: ['street', 'store_license_name'],
      },
    },
    { key: 'store_license_name', label: '门店营业执照名称', type: 'text', required: true, span: 24 },
    { key: 'store_length', label: '门店长（米）', type: 'number', props: { stepper: false, min: 0 } },
    { key: 'store_width', label: '门店宽/深（米）', type: 'number', props: { stepper: false, min: 0 } },
    {
      key: 'store_area',
      label: '门店面积',
      type: 'text',
      readonly: true,
      linkage: {
        type: 'followValue',
        formula: '{{store_length}} * {{store_width}}',
        dependsOn: ['store_length', 'store_width'],
      },
    },
    {
      key: 'license_address',
      label: '营业执照地址',
      type: 'textarea',
      required: true,
      span: 24,
      props: { rows: 2 },
      rules: [addressLevels('营业执照地址')],
    },
    { key: 'amap_store_name', label: '高德地图-门店名称', type: 'text' },
    {
      key: 'amap_address',
      label: '高德地图-地址',
      type: 'textarea',
      required: true,
      span: 24,
      props: { rows: 2 },
      rules: [addressLevels('高德地图-地址')],
    },
    { key: 'seed_email', label: 'SEED邮箱', type: 'email' },
    { key: 'seed_phone', label: 'SEED手机号', type: 'text', readonly: true },
    { key: 'email_password', label: '邮箱登陆密码', type: 'password', hint: '由填写人自行输入，模板不预置口令' },
    { key: 'postal_code', label: '邮编', type: 'text' },
    { key: 'contact_name', label: '姓名', type: 'text' },
    { key: 'contact_phone', label: '电话', type: 'tel' },
    { key: 'latitude', label: '纬度', type: 'text', rules: [isLat], hint: '中国范围 18~54' },
    { key: 'longitude', label: '经度', type: 'text', rules: [isLng], hint: '中国范围 73~135' },
    { key: 'verification_result', label: '核验结果', type: 'text', default: '正常' },
    { key: 'htd_account', label: 'HTD账号', type: 'text' },
    { key: 'real_name_verified', label: '实名认证', type: 'text', default: '是' },
    { key: 'responsible_person', label: '责任铁军', type: 'text', default: '示例责任人' },
    { key: 'store_id', label: '门店ID', type: 'text' },
    {
      key: 'is_report',
      label: '是否提报',
      type: 'select',
      required: true,
      options: [
        { value: '项目店', label: '项目店' },
        { value: '大盘店', label: '大盘店' },
      ],
    },

    // ─── 品牌（项目店） ───
    brand('brand_xiaomi', '小米'),
    brand('brand_huawei', '华为'),
    brand('brand_honor', '荣耀'),
    brand('brand_vivo', 'vivo'),
    brand('brand_oppo', 'OPPO'),
    {
      key: 'existing_brands',
      label: '现有手机销售品牌',
      type: 'text',
      readonly: true,
      span: 24,
      hint: '自动聚合所选品牌（需升级公式引擎支持，当前手动填写）',
    },
    {
      key: 'available_area',
      label: '门店可用面积(m²)',
      type: 'text',
      readonly: true,
      linkage: { type: 'followValue', formula: '{{store_area}}', dependsOn: ['store_area'] },
    },
    {
      key: 'license_name',
      label: '营业执照名称',
      type: 'text',
      readonly: true,
      linkage: { type: 'followValue', formula: '{{store_license_name}}', dependsOn: ['store_license_name'] },
    },
    {
      key: 'lease_start_date',
      label: '租约开始日期',
      type: 'date',
      visibleWhen: { field: 'is_report', equals: '项目店' },
      props: { format: 'YYYY-MM-DD' },
    },
    {
      key: 'lease_end_date',
      label: '租约结束日期',
      type: 'date',
      visibleWhen: { field: 'is_report', equals: '项目店' },
      props: { format: 'YYYY-MM-DD' },
    },
    {
      key: 'apple_zone_location',
      label: '苹果专区预留位置',
      type: 'select',
      visibleWhen: { field: 'is_report', equals: '项目店' },
      options: ['前场中', '前场左', '前场右', '后场左', '后场中', '后场右'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'door_type',
      label: '门头类型',
      type: 'select',
      visibleWhen: { field: 'is_report', equals: '项目店' },
      options: ['纯运营商门头', '纯客户门头', '非单一竞品', '单一竞品'].map((v) => ({ value: v, label: v })),
    },
    {
      key: 'door_type_desc',
      label: '门头类型说明',
      type: 'text',
      visibleWhen: { field: 'is_report', equals: '项目店' },
    },
    { key: 'credit_code', label: '统一社会信用代码', type: 'text' },
    { key: 'remark', label: '备注', type: 'textarea', span: 24, props: { rows: 3 } },
    { key: 'lnfn_email', label: 'LNFN邮箱', type: 'email', visibleWhen: { field: 'is_report', equals: '项目店' } },
    { key: 'id_card', label: '身份证', type: 'text', visibleWhen: { field: 'is_report', equals: '项目店' } },
    { key: 'status', label: '状态', type: 'text', default: ' ' },
    {
      key: 'personnel',
      label: '人员',
      type: 'select',
      options: ['', '张三', '李四', '王五', '赵六'].map((v) => ({ value: v, label: v })),
    },
    { key: 'distance', label: '高德距离', type: 'text', hint: '由「计算距离」动作写入（设计器事件页可配 callApi）' },

    // ─── 上传区：OTC（钉钉门头/店内/高德/GPS） ───
    upload('dingtalk_door', '钉钉门头', 'OTC'),
    upload('dingtalk_indoor', '钉钉店内', 'OTC'),
    upload('amap_screenshot', '高德截图', 'OTC'),
    upload('gps_screenshot', 'GPS截图', 'OTC'),
    upload('door_left', '门头左', 'OTC'),
    upload('door_mid', '门头中', 'OTC'),
    upload('door_right', '门头右', 'OTC'),
    upload('business_license', '营业执照', 'OTC'),

    // ─── 上传区：O2O（门店/证件/合同） ───
    upload('business_license_copy', '营业执照副本', 'O2O'),
    upload('indoor_left', '店内左', 'O2O'),
    upload('indoor_mid', '店内中', 'O2O'),
    upload('indoor_right', '店内右', 'O2O'),
    upload('zone_left', '专区左', 'O2O'),
    upload('zone_mid', '专区中', 'O2O'),
    upload('zone_right', '专区右', 'O2O'),
    upload('inside_out', '内往外', 'O2O'),
    upload('id_card_front', '身份证正面', 'O2O'),
    upload('id_card_back', '身份证反面', 'O2O'),
    upload('lease_contract', '租赁合同', 'O2O'),
    upload('lease_contract_1', '租赁合同1', 'O2O'),
    upload('intent_contract', '意向合同', 'O2O'),
    upload('intent_contract_1', '意向合同1', 'O2O'),
    upload('floor_plan', '平面图', 'O2O'),
    upload('survey_file', '测绘文件', 'O2O'),
    upload('handheld_id_front', '手持身份证正', 'O2O'),
    upload('handheld_id_back', '手持身份证反', 'O2O'),
  ]

  return {
    title: t('fbPre.srTitle'),
    description: t('fbPre.srDesc'),
    // grid 布局：字段多列紧凑排布（对标旧版 DynamicForm auto-fill 栅格）
    layout: 'grid',
    columns: 2,
    submitText: t('fbPre.srSubmit'),
    validateOnChange: true,
    // 表单级 API 链路（旧版 DynamicForm 三模式承接）：
    // - edit（默认） 编辑提交
    // - review       审核模式：全字段可编辑 + 变更防抖自动保存到 saveUrl
    // - view         只读展示 + 挂载时 GET 加载
    // 接入方把 apiUrl/saveUrl 换成真实接口即可；不配则退回纯前端表单（无 API 交互）
    submitConfig: {
      mode: 'edit',
      apiUrl: '/api/store-report',
      saveUrl: '/api/store-report',
      reviewAutoSave: 3000,
    },
    fields,
  }
}
