/**
 * zh-CN locale 聚合器 — 由 chunks/zh-CN/ 下各分块组合而成
 * 维护规则：新增/修改 key 在对应分块文件操作；zh 与 en 键集必须保持一致。
 */
import common from './chunks/zh-CN/common'
import feedback from './chunks/zh-CN/feedback'
import data from './chunks/zh-CN/data'
import layout from './chunks/zh-CN/layout'
import nav from './chunks/zh-CN/nav'
import form from './chunks/zh-CN/form'
import login from './chunks/zh-CN/login'
import chart from './chunks/zh-CN/chart'
import amap from './chunks/zh-CN/amap'
import routePlanner from './chunks/zh-CN/routePlanner'
import formBuilder from './chunks/zh-CN/formBuilder'
import basic from './chunks/zh-CN/basic'
import wc from './chunks/zh-CN/wc'
import storage from './chunks/zh-CN/storage'
import internal from './chunks/zh-CN/internal'

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
  ...basic,
  ...wc,
  ...storage,
  ...internal,
}
