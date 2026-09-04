/**
 * en-US locale 聚合器 — 由 chunks/en-US/ 下各分块组合而成
 * 维护规则：新增/修改 key 在对应分块文件操作；zh 与 en 键集必须保持一致。
 */
import common from './chunks/en-US/common'
import feedback from './chunks/en-US/feedback'
import data from './chunks/en-US/data'
import layout from './chunks/en-US/layout'
import nav from './chunks/en-US/nav'
import form from './chunks/en-US/form'
import login from './chunks/en-US/login'
import chart from './chunks/en-US/chart'
import amap from './chunks/en-US/amap'
import routePlanner from './chunks/en-US/routePlanner'
import formBuilder from './chunks/en-US/formBuilder'
import formBuilderPresets from './chunks/en-US/formBuilderPresets'
import basic from './chunks/en-US/basic'
import wc from './chunks/en-US/wc'
import storage from './chunks/en-US/storage'
import internal from './chunks/en-US/internal'
import type zhCN from './zh-CN'

// satisfies 强约束：en 键集必须覆盖 zh 全部键，缺键在 typecheck 报错
export default {
  ...common,
  ...feedback,
  ...data,
  ...layout,
  ...nav,
  ...form,
  ...login,
  ...chart,
  ...amap,
  ...routePlanner,
  ...formBuilder,
  ...formBuilderPresets,
  ...basic,
  ...wc,
  ...storage,
  ...internal,
} satisfies typeof zhCN
