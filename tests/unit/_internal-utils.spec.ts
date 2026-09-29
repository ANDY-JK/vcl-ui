import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isValidPhone,
  isValidEmail,
  isValidIdCard,
  isValidUrl,
  parseRegion,
  parseAddress,
  formatRegion,
  splitRegionDetail,
  downloadBlob,
  deepClone,
  formatNumber,
  formatMoney,
  toChineseAmount,
  truncate,
  safeParseJSON,
  parseQueryString,
  buildQueryString,
  randomInt,
  randomString,
  uuid,
  fileToBase64,
  dataURLtoBlob,
  uniqueBy,
  chunk,
  isEqual,
  maskName,
  maskPhone,
  maskIdCard,
  formatRelativeTime,
  isPlainObject,
  isNumeric,
  isEmpty,
  escapeHtml,
  unescapeHtml,
  hexToRgb,
  rgbToHex,
  isHexColor,
} from '@/components/_internal/utils'

// ════════════════════════════════════════
// 格式校验
// ════════════════════════════════════════

describe('校验', () => {
  it('手机号', () => {
    expect(isValidPhone('13812345678')).toBe(true)
    expect(isValidPhone('138 1234 5678')).toBe(true)
    expect(isValidPhone('12812345678')).toBe(false)
    expect(isValidPhone('1381234567')).toBe(false)
  })

  it('邮箱', () => {
    expect(isValidEmail('a@b.com')).toBe(true)
    expect(isValidEmail('a@b')).toBe(false)
    expect(isValidEmail('abc')).toBe(false)
  })

  it('身份证（格式校验）', () => {
    expect(isValidIdCard('11010519491231002X')).toBe(true)
    expect(isValidIdCard('11010519491231002x')).toBe(true)
    expect(isValidIdCard('123')).toBe(false)
    expect(isValidIdCard('11010519491231002A')).toBe(false)
  })

  it('URL', () => {
    expect(isValidUrl('https://a.com')).toBe(true)
    expect(isValidUrl('http://a.com')).toBe(true)
    expect(isValidUrl('ftp://a.com')).toBe(false)
    expect(isValidUrl('abc')).toBe(false)
  })

  it('非字符串输入容错（null/undefined/数字/对象）', () => {
    expect(isValidPhone(null)).toBe(false)
    expect(isValidPhone(undefined)).toBe(false)
    expect(isValidPhone(13812345678)).toBe(true)
    expect(isValidEmail(null)).toBe(false)
    expect(isValidEmail(123)).toBe(false)
    expect(isValidIdCard(null)).toBe(false)
    expect(isValidUrl(null)).toBe(false)
    expect(isValidUrl({ url: 'https://a.com' })).toBe(false)
  })
})

// ════════════════════════════════════════
// 行政区划
// ════════════════════════════════════════

describe('parseRegion — 省市区镇拆分', () => {
  it('普通省/市/区/详细地址', () => {
    expect(parseRegion('广东省深圳市南山区科技园路1号')).toEqual({
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      town: '',
      detail: '科技园路1号',
    })
  })

  it('直辖市：无省后缀，按「市」归入 city', () => {
    expect(parseRegion('北京市朝阳区三里屯街道工体北路')).toEqual({
      province: '',
      city: '北京市',
      district: '朝阳区',
      town: '三里屯街道',
      detail: '工体北路',
    })
    expect(parseRegion('重庆市渝北区')).toEqual({
      province: '',
      city: '重庆市',
      district: '渝北区',
      town: '',
      detail: '',
    })
  })

  it('自治区（含 4 字/3 字）', () => {
    expect(parseRegion('内蒙古自治区呼和浩特市新城区')).toEqual({
      province: '内蒙古自治区',
      city: '呼和浩特市',
      district: '新城区',
      town: '',
      detail: '',
    })
    expect(parseRegion('新疆维吾尔自治区乌鲁木齐市天山区')).toEqual({
      province: '新疆维吾尔自治区',
      city: '乌鲁木齐市',
      district: '天山区',
      town: '',
      detail: '',
    })
    expect(parseRegion('广西壮族自治区南宁市青秀区')).toEqual({
      province: '广西壮族自治区',
      city: '南宁市',
      district: '青秀区',
      town: '',
      detail: '',
    })
  })

  it('特别行政区', () => {
    expect(parseRegion('香港特别行政区中西区')).toEqual({
      province: '香港特别行政区',
      city: '',
      district: '中西区',
      town: '',
      detail: '',
    })
  })

  it('无省级前缀也能正确落入对应层级', () => {
    expect(parseRegion('深圳市南山区')).toEqual({
      province: '',
      city: '深圳市',
      district: '南山区',
      town: '',
      detail: '',
    })
    expect(parseRegion('南山区')).toEqual({
      province: '',
      city: '',
      district: '南山区',
      town: '',
      detail: '',
    })
  })

  it('无区县的市（东莞/中山）直接辖镇', () => {
    expect(parseRegion('广东省东莞市长安镇')).toEqual({
      province: '广东省',
      city: '东莞市',
      district: '',
      town: '长安镇',
      detail: '',
    })
  })

  it('省市同名（吉林省吉林市）', () => {
    expect(parseRegion('吉林省吉林市昌邑区')).toEqual({
      province: '吉林省',
      city: '吉林市',
      district: '昌邑区',
      town: '',
      detail: '',
    })
  })

  it('城市名以「州」结尾（州市 是城市名，不是地级后缀）', () => {
    expect(parseRegion('广州市天河区体育西路')).toEqual({
      province: '',
      city: '广州市',
      district: '天河区',
      town: '',
      detail: '体育西路',
    })
    expect(parseRegion('杭州市西湖区文三路')).toEqual({
      province: '',
      city: '杭州市',
      district: '西湖区',
      town: '',
      detail: '文三路',
    })
    expect(parseRegion('苏州市姑苏区观前街')).toEqual({
      province: '',
      city: '苏州市',
      district: '姑苏区',
      town: '',
      detail: '观前街',
    })
    expect(parseRegion('郑州市金水区')).toEqual({
      province: '',
      city: '郑州市',
      district: '金水区',
      town: '',
      detail: '',
    })
    expect(parseRegion('福州市鼓楼区')).toEqual({
      province: '',
      city: '福州市',
      district: '鼓楼区',
      town: '',
      detail: '',
    })
    expect(parseRegion('江苏省苏州市昆山市玉山镇')).toEqual({
      province: '江苏省',
      city: '苏州市',
      district: '昆山市',
      town: '玉山镇',
      detail: '',
    })
  })

  it('单字「州」地级（恩施州）：州 是地级，后面的市/县是县级', () => {
    expect(parseRegion('恩施州利川市解放路')).toEqual({
      province: '',
      city: '恩施州',
      district: '利川市',
      town: '',
      detail: '解放路',
    })
    expect(parseRegion('恩施州巴东县信陵镇')).toEqual({
      province: '',
      city: '恩施州',
      district: '巴东县',
      town: '信陵镇',
      detail: '',
    })
    expect(parseRegion('湘西州吉首市')).toEqual({
      province: '',
      city: '湘西州',
      district: '吉首市',
      town: '',
      detail: '',
    })
  })

  it('空白与空输入兜底', () => {
    expect(parseRegion('')).toEqual({ province: '', city: '', district: '', town: '', detail: '' })
    expect(parseRegion(null)).toEqual({ province: '', city: '', district: '', town: '', detail: '' })
    expect(parseRegion('广东省 深圳市 南山区')).toEqual({
      province: '广东省',
      city: '深圳市',
      district: '南山区',
      town: '',
      detail: '',
    })
  })

  it('非字符串输入容错', () => {
    expect(parseRegion(undefined)).toEqual({ province: '', city: '', district: '', town: '', detail: '' })
    expect(parseRegion(123)).toEqual({ province: '', city: '', district: '', town: '', detail: '123' })
  })

  it('parseAddress 为别名', () => {
    expect(parseAddress).toBe(parseRegion)
  })
})

describe('formatRegion / splitRegionDetail', () => {
  it('拼接省市区', () => {
    expect(formatRegion('广东省深圳市南山区')).toBe('广东省深圳市南山区')
    expect(formatRegion(parseRegion('北京市朝阳区'))).toBe('北京市朝阳区')
  })

  it('withTown / withDetail 扩展', () => {
    expect(formatRegion('北京市朝阳区三里屯街道工体北路', { withTown: true, withDetail: true })).toBe(
      '北京市朝阳区三里屯街道工体北路',
    )
  })

  it('拆出区域与详细地址', () => {
    expect(splitRegionDetail('广东省深圳市南山区科技园路1号')).toEqual({
      region: '广东省深圳市南山区',
      detail: '科技园路1号',
    })
  })
})

// ════════════════════════════════════════
// 下载
// ════════════════════════════════════════

describe('downloadBlob — Blob 下载', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('正常下载：创建链接并触发 click', () => {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()
    const spy = vi.spyOn(document, 'createElement')
    const result = downloadBlob(new Blob(['x']), 'a.txt')
    expect(result).toBe(true)
    expect(spy).toHaveBeenCalledWith('a')
  })

  it('createObjectURL 抛异常时降级返回 false，不抛出', () => {
    URL.createObjectURL = vi.fn(() => {
      throw new Error('not supported')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => downloadBlob(new Blob(['x']), 'a.txt')).not.toThrow()
    expect(downloadBlob(new Blob(['x']), 'a.txt')).toBe(false)
    warn.mockRestore()
  })
})

// ════════════════════════════════════════
// 深拷贝
// ════════════════════════════════════════

describe('deepClone — JSON 深拷贝', () => {
  it('对象深拷贝，修改副本不影响原对象', () => {
    const src = { a: 1, b: { c: [1, 2, 3] } }
    const copy = deepClone(src)
    expect(copy).toEqual(src)
    expect(copy).not.toBe(src)
    copy.b.c.push(4)
    expect(src.b.c).toEqual([1, 2, 3])
  })

  it('数组深拷贝', () => {
    const src = [{ x: 1 }, { x: 2 }]
    const copy = deepClone(src)
    copy[0].x = 99
    expect(src[0].x).toBe(1)
  })

  it('原始值/null/undefined 原样返回', () => {
    expect(deepClone(42)).toBe(42)
    expect(deepClone('str')).toBe('str')
    expect(deepClone(null)).toBeNull()
    expect(deepClone(undefined)).toBeUndefined()
  })
})

// ════════════════════════════════════════
// 数字 / 金额
// ════════════════════════════════════════

describe('formatNumber / formatMoney / toChineseAmount', () => {
  it('千分位', () => {
    expect(formatNumber(1234567)).toBe('1,234,567')
    expect(formatNumber('1234567')).toBe('1,234,567')
    expect(formatNumber(1234567.891, { decimals: 2 })).toBe('1,234,567.89')
    expect(formatNumber(1234.5, { decimals: 0 })).toBe('1,235')
  })

  it('非法数值原样返回', () => {
    expect(formatNumber(NaN)).toBe('NaN')
    expect(formatNumber('abc')).toBe('abc')
  })

  it('金额', () => {
    expect(formatMoney(1234.5)).toBe('¥1,234.50')
    expect(formatMoney(-1234.5)).toBe('-¥1,234.50')
    expect(formatMoney(1234.5, { symbol: '$', decimals: 1 })).toBe('$1,234.5')
  })

  it('人民币大写', () => {
    expect(toChineseAmount(0)).toBe('零元整')
    expect(toChineseAmount(100)).toBe('壹佰元整')
    expect(toChineseAmount(1001.23)).toBe('壹仟零壹元贰角叁分')
    expect(toChineseAmount(-12.34)).toBe('负壹拾贰元叁角肆分')
    expect(toChineseAmount('abc')).toBe('')
  })
})

// ════════════════════════════════════════
// 字符串
// ════════════════════════════════════════

describe('truncate / safeParseJSON / query', () => {
  it('truncate 截断', () => {
    expect(truncate('hello world', 5)).toBe('hello…')
    expect(truncate('hello', 10)).toBe('hello')
    expect(truncate('hello world', 5, '...')).toBe('hello...')
    expect(truncate(null, 5)).toBe('')
  })

  it('safeParseJSON 失败返回 fallback', () => {
    expect(safeParseJSON('{"a":1}', null)).toEqual({ a: 1 })
    expect(safeParseJSON('bad json', { x: 1 })).toEqual({ x: 1 })
    expect(safeParseJSON('', 'empty')).toBe('empty')
  })

  it('query 字符串互转', () => {
    expect(parseQueryString('?a=1&b=hello%20world')).toEqual({ a: '1', b: 'hello world' })
    expect(parseQueryString('')).toEqual({})
    expect(buildQueryString({ a: 1, b: 'x y', c: null })).toBe('a=1&b=x%20y')
  })
})

// ════════════════════════════════════════
// 随机 / ID
// ════════════════════════════════════════

describe('randomInt / randomString / uuid', () => {
  it('randomInt 在闭区间内', () => {
    for (let i = 0; i < 100; i++) {
      const v = randomInt(1, 10)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(10)
    }
  })

  it('randomString 长度与字符集', () => {
    const s = randomString(8)
    expect(s).toHaveLength(8)
    const s2 = randomString(4, 'ab')
    expect(s2).toMatch(/^[ab]{4}$/)
  })

  it('uuid 带前缀且唯一', () => {
    const a = uuid('r')
    const b = uuid('r')
    expect(a.startsWith('r')).toBe(true)
    expect(a).not.toBe(b)
  })
})

// ════════════════════════════════════════
// 文件 / 数据转换
// ════════════════════════════════════════

describe('fileToBase64 / dataURLtoBlob', () => {
  it('Blob → data URL（happy-dom 提供 FileReader）', async () => {
    const url = await fileToBase64(new Blob(['hello'], { type: 'text/plain' }))
    expect(url.startsWith('data:text/plain')).toBe(true)
  })

  it('data URL → Blob 还原', async () => {
    const url = await fileToBase64(new Blob(['hello'], { type: 'text/plain' }))
    const blob = dataURLtoBlob(url)
    expect(blob).not.toBeNull()
    expect(blob!.type).toBe('text/plain')
    const text = await blob!.text()
    expect(text).toBe('hello')
  })

  it('非法 data URL 返回 null', () => {
    expect(dataURLtoBlob('not-a-data-url')).toBeNull()
  })
})

// ════════════════════════════════════════
// 数组
// ════════════════════════════════════════

describe('uniqueBy / chunk', () => {
  it('uniqueBy 按字段去重（保留首次顺序）', () => {
    const arr = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 3 }]
    expect(uniqueBy(arr, 'id')).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
  })

  it('uniqueBy 支持函数取值', () => {
    const arr = [
      { a: 1, b: 2 },
      { a: 1, b: 3 },
      { a: 2, b: 2 },
    ]
    expect(uniqueBy(arr, (x) => x.a)).toHaveLength(2)
  })

  it('uniqueBy 非数组返回空', () => {
    expect(uniqueBy(null as unknown as unknown[], 'id')).toEqual([])
  })

  it('chunk 分组', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]])
    expect(chunk([], 2)).toEqual([])
    expect(chunk([1, 2], 0)).toEqual([])
  })
})

// ════════════════════════════════════════
// 对象比较
// ════════════════════════════════════════

describe('isEqual — 深比较', () => {
  it('基本类型 / NaN', () => {
    expect(isEqual(1, 1)).toBe(true)
    expect(isEqual('a', 'a')).toBe(true)
    expect(isEqual(1, '1')).toBe(false)
    expect(isEqual(NaN, NaN)).toBe(true)
    expect(isEqual(null, undefined)).toBe(false)
  })

  it('数组（顺序敏感）', () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(isEqual([1, 2], [2, 1])).toBe(false)
    expect(isEqual([1, [2, 3]], [1, [2, 3]])).toBe(true)
  })

  it('对象（键序不敏感）', () => {
    expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(isEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(isEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true)
    expect(isEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false)
  })

  it('Date', () => {
    expect(isEqual(new Date(0), new Date(0))).toBe(true)
    expect(isEqual(new Date(0), new Date(1))).toBe(false)
  })

  it('数组 vs 对象不相等', () => {
    expect(isEqual([], {})).toBe(false)
  })
})

// ════════════════════════════════════════
// 脱敏
// ════════════════════════════════════════

describe('maskName / maskPhone / maskIdCard', () => {
  it('姓名（保留首字符）', () => {
    expect(maskName('张三')).toBe('张*')
    expect(maskName('张三丰')).toBe('张**')
    expect(maskName('王')).toBe('王')
    expect(maskName('')).toBe('')
  })

  it('手机号', () => {
    expect(maskPhone('13812345678')).toBe('138****5678')
    expect(maskPhone('138 1234 5678')).toBe('138****5678')
    expect(maskPhone('abc')).toBe('abc')
  })

  it('身份证', () => {
    expect(maskIdCard('110101199001011234')).toBe('1101**********1234')
    expect(maskIdCard('123')).toBe('123')
  })
})

// ════════════════════════════════════════
// 相对时间
// ════════════════════════════════════════

describe('formatRelativeTime', () => {
  const now = new Date(2026, 7, 24, 12, 0, 0) // 2026-08-24 12:00

  it('刚刚 / 分钟 / 小时', () => {
    expect(formatRelativeTime(new Date(now.getTime() - 30 * 1000), now)).toBe('刚刚')
    expect(formatRelativeTime(new Date(now.getTime() - 5 * 60 * 1000), now)).toBe('5分钟前')
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 60 * 60 * 1000), now)).toBe('3小时前')
  })

  it('昨天 / 天前', () => {
    // 昨天 10:00
    expect(formatRelativeTime(new Date(2026, 7, 23, 10, 0, 0), now)).toBe('昨天')
    // 3 天前
    expect(formatRelativeTime(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000), now)).toBe('3天前')
  })

  it('超过 30 天显示具体日期（同年 MM-DD）', () => {
    expect(formatRelativeTime(new Date(2026, 2, 1), now)).toBe('03-01')
    // 跨年
    expect(formatRelativeTime(new Date(2025, 11, 31), now)).toBe('2025-12-31')
  })

  it('未来时间显示具体日期', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 60 * 60 * 1000), now)).toBe('08-24')
  })

  it('非法输入返回空串', () => {
    expect(formatRelativeTime('bad', now)).toBe('')
  })
})

// ════════════════════════════════════════
// 类型判断
// ════════════════════════════════════════

describe('isPlainObject / isNumeric / isEmpty', () => {
  it('isPlainObject', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject(new Date())).toBe(false)
  })

  it('isNumeric', () => {
    expect(isNumeric(123)).toBe(true)
    expect(isNumeric('123')).toBe(true)
    expect(isNumeric(' 12.5 ')).toBe(true)
    expect(isNumeric('abc')).toBe(false)
    expect(isNumeric('')).toBe(false)
    expect(isNumeric(NaN)).toBe(false)
    expect(isNumeric(null)).toBe(false)
  })

  it('isEmpty', () => {
    expect(isEmpty(null)).toBe(true)
    expect(isEmpty(undefined)).toBe(true)
    expect(isEmpty('')).toBe(true)
    expect(isEmpty('  ')).toBe(true)
    expect(isEmpty([])).toBe(true)
    expect(isEmpty({})).toBe(true)
    expect(isEmpty(new Map())).toBe(true)
    expect(isEmpty(new Set())).toBe(true)
    expect(isEmpty('a')).toBe(false)
    expect(isEmpty([1])).toBe(false)
    expect(isEmpty({ a: 1 })).toBe(false)
    expect(isEmpty(0)).toBe(false)
  })
})

// ════════════════════════════════════════
// HTML 转义
// ════════════════════════════════════════

describe('escapeHtml / unescapeHtml', () => {
  it('转义特殊字符', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('反转义还原', () => {
    const s = '<div class="a">x & y</div>'
    expect(unescapeHtml(escapeHtml(s))).toBe(s)
  })

  it('非字符串输入', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(123)).toBe('123')
  })
})

// ════════════════════════════════════════
// 颜色转换
// ════════════════════════════════════════

describe('hexToRgb / rgbToHex / isHexColor', () => {
  it('hex → rgb', () => {
    expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 })
    expect(hexToRgb('00ff00')).toEqual({ r: 0, g: 255, b: 0 })
  })

  it('非法 hex 返回 null', () => {
    expect(hexToRgb('#GG0000')).toBeNull()
    expect(hexToRgb('red')).toBeNull()
    expect(hexToRgb('#12345')).toBeNull()
  })

  it('rgb → hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#FF0000')
    expect(rgbToHex(0, 128, 255)).toBe('#0080FF')
    // 越界钳制
    expect(rgbToHex(300, -1, 128)).toBe('#FF0080')
  })

  it('isHexColor', () => {
    expect(isHexColor('#FF0000')).toBe(true)
    expect(isHexColor('fff')).toBe(true)
    expect(isHexColor('red')).toBe(false)
    expect(isHexColor('#12345')).toBe(false)
  })
})
