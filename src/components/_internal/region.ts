/**
 * 中国地址四级行政区划拆分 —— 从 `_internal/utils.ts` 拆出（2026-11-01）
 *
 * ## 为什么拆
 *
 * `utils.ts` 涨到 810 行（`_internal` 域止涨线，余量 0）—— 按 #266 的教训，
 * "卡着线走"会把下一个 5 分钟的小改动变成 40 分钟的重构。行政区划这 98 行
 * 是**纯后缀正则算法**（零硬编码名单），与其余工具函数零耦合，最适合独立成模块。
 *
 * ## 语义要点
 *
 * - 纯后缀规则，不查名单：省/自治区/特别行政区 → 市/自治州/地区/盟 → 区/县/旗
 * - `州市` 歧义（广州 vs 恩施州）靠"切开后余下是否县级单位"判定
 * - 输入经 `toStr` 归一（TD-85：对象/Symbol 不再泄漏成 `[object Object]`）
 */
import { stripSpace } from './utils'
// ════════════════════════════════════════
// 行政区划 / 地址
// ════════════════════════════════════════

/** 行政区划拆分结果（省 → 市 → 区县 → 乡镇，剩余部分为详细地址） */
export interface Region {
  /** 省级：省 / 自治区 / 特别行政区 */
  province: string
  /** 地级：市 / 自治州 / 地区 / 盟 */
  city: string
  /** 县级：区 / 县 / 旗 / 县级市 */
  district: string
  /** 乡级：镇 / 乡 / 街道 / 苏木 / 民族乡 */
  town: string
  /** 剩余详细地址（门牌号、路名、村/社区等） */
  detail: string
}

/**
 * 中国地址四级行政区划拆分（纯后缀规则，零硬编码名单）。
 *
 * 按「省 → 市 → 区县 → 乡镇」顺序逐级剥取，剩余部分归入 detail。
 * - 直辖市（北京市等）无「省」后缀，按「市」归入 city，province 保持为空
 * - 无省级前缀的地址（如 "深圳市南山区"）也能正确落入对应层级
 *
 * @example
 * parseRegion('广东省深圳市南山区科技园路1号')
 * // { province:'广东省', city:'深圳市', district:'南山区', town:'', detail:'科技园路1号' }
 * parseRegion('北京市朝阳区三里屯街道工体北路')
 * // { province:'', city:'北京市', district:'朝阳区', town:'三里屯街道', detail:'工体北路' }
 */
export function parseRegion(input?: unknown): Region {
  let addr = stripSpace(input)
  const region: Region = { province: '', city: '', district: '', town: '', detail: '' }

  // 省级：省 / 自治区 / 特别行政区
  const p = addr.match(/^(.+?省|.+?自治区|.+?特别行政区)/)
  if (p) {
    region.province = p[1]
    addr = addr.slice(p[1].length)
  }

  // 地级：自治州 / 地区 / 盟 / 市 优先，单字「州」作兜底（恩施州）
  const c = addr.match(/^(.+?(?:自治州|地区|盟|市)|.+?州)/)
  let city = c ? c[1] : ''
  // 「州市」歧义消解：广州/杭州/苏州 里「州市」是城市名整体；恩施州利川市 里「州」是地级、
  // 「利川市」才是县级。纯后缀规则无法两全，判据是「在州处切开后余下是否为县级单位」：
  // 广州 → 余下「市天河区」以市开头，不是县级单位，故不切；恩施州 → 余下「利川市」，切。
  const zhouCut = addr.match(/^(.+?州)([^市区县旗]+(?:自治县|自治旗|新区|区|县|旗|市))/)
  if (zhouCut && zhouCut[1].length < city.length) city = zhouCut[1]
  if (city) {
    region.city = city
    addr = addr.slice(city.length)
  }

  // 县级：自治县 / 自治旗 / 新区 / 区 / 县 / 旗 / 市
  const d = addr.match(/^(.+?(?:自治县|自治旗|新区|区|县|旗|市))/)
  if (d) {
    region.district = d[1]
    addr = addr.slice(d[1].length)
  }

  // 乡级：街道 / 民族乡 / 苏木 / 镇 / 乡
  const t = addr.match(/^(.+?(?:街道|民族乡|苏木|镇|乡))/)
  if (t) {
    region.town = t[1]
    addr = addr.slice(t[1].length)
  }

  region.detail = addr
  return region
}

/** parseRegion 的语义别名（地址拆分 = 行政区划拆分 + 详细地址） */
export const parseAddress = parseRegion

/** 拼接区域名（省市区，可选乡镇/详细地址） */
export function formatRegion(region: Region | string, opts?: { withTown?: boolean; withDetail?: boolean }): string {
  // 第 188 轮：签名是 Region | string，但运行时可能拿到 null/undefined/数字等脏数据，
  // 旧实现直接读 r.province → 渲染期抛 "Cannot read properties of null"，整棵组件树崩。
  if (region == null) return ''
  if (typeof region !== 'string' && typeof region !== 'object') return ''
  const r = typeof region === 'string' ? parseRegion(region) : region
  const parts: string[] = []
  if (r.province) parts.push(r.province)
  if (r.city) parts.push(r.city)
  if (r.district) parts.push(r.district)
  if (opts?.withTown && r.town) parts.push(r.town)
  if (opts?.withDetail && r.detail) parts.push(r.detail)
  return parts.join('')
}

/** 把完整地址拆成「区域」与「详细地址」两部分 */
export function splitRegionDetail(input?: unknown): { region: string; detail: string } {
  const r = parseRegion(input)
  return { region: formatRegion(r, { withTown: true }), detail: r.detail }
}
