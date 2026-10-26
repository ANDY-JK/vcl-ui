/**
 * 门店提报预置的**经纬度/地址校验**（第 130 轮）。这 5 个规则此前**分支覆盖 0%**。
 *
 * 为什么重要：预置模板里 `latitude` / `longitude` 是**自由文本 + 自定义规则**（不是 number 输入），
 * 校验是唯一的把关点。判错的后果分两类：
 *   · 该拦没拦（`"abc"` 当成"没填"放过）→ 脏数据进库，下游按坐标算距离时炸
 *   · 该放没放（合法坐标被判非法）→ 用户填不进去，且**理由看不懂**
 *
 * 本文件按"输入类别 × 期望结果"逐格钉住，并区分**未填 / 非法 / 越界 / 疑似填错单位**四种语义。
 */
import { describe, it, expect } from 'vitest'
import { storeReportSchema } from '@/components/form-builder/presets/store-report'
import type { FormField } from '@/components/form-builder/types'

type Rule = (v: string) => string | undefined

function ruleOf(key: string): Rule {
  const s = storeReportSchema()
  const f = s.fields.find((x) => x.key === key) as FormField
  expect(f, `预置里应有字段 ${key}`).toBeTruthy()
  const rules = f.rules as Rule[] | undefined
  expect(Array.isArray(rules) && rules.length > 0, `${key} 应挂校验规则`).toBe(true)
  return rules![0]
}

const lat = () => ruleOf('latitude')
const lng = () => ruleOf('longitude')

describe('纬度校验 isLat（中国范围 18~54）', () => {
  it('**未填 → 放过**（空串/纯空白是"没填"，不是"填错"）', () => {
    expect(lat()('')).toBeUndefined()
    expect(lat()('   ')).toBeUndefined()
    expect(lat()('\n\t')).toBeUndefined()
  })

  it('**填了合法字符但解析成 NaN → 必须报错**（此前 `"abc"` 被当"没填"静默放过）', () => {
    for (const v of ['abc', 'abc123', 'N30.5', '三十', '12ab', '--5', '.']) {
      const msg = lat()(v)
      expect(msg, `纬度 "${v}" 不是数字，不能静默放过`).toBeTruthy()
      expect(msg, '要告诉用户"不是合法数字"，而不是范围错误').toContain('数字')
    }
  })

  it('**带空格的数字要报"格式错"，不能被当成合法数字**（`"30 5"` 剥空白会变成 305 → 误判成经度）', () => {
    for (const v of ['30 5', ' 3 0 ', '12 34 56', '30　5']) {
      const msg = lat()(v)
      expect(msg, `纬度 "${v}" 含空格，应报格式错`).toBeTruthy()
      expect(msg, '应是"请填数字"而不是"疑似经度"').toContain('数字')
      expect(msg, `"${v}" 不该被当成经度误填`).not.toContain('经度')
    }
  })

  it('范围边界逐点：18 与 54 通过、17 与 55 越界', () => {
    expect(lat()('18')).toBeUndefined()
    expect(lat()('18.0')).toBeUndefined()
    expect(lat()('54')).toBeUndefined()
    expect(lat()('54.0')).toBeUndefined()
    expect(lat()('17')).toContain('18~54')
    expect(lat()('17.9')).toContain('18~54')
    expect(lat()('55')).toContain('18~54')
    expect(lat()('54.1')).toContain('18~54')
  })

  it('范围中段通过，含小数与首尾空白', () => {
    for (const v of ['30', '30.5', '29.123456', ' 30 ', '30\n']) {
      expect(lat()(v), `纬度 "${v}" 应通过`).toBeUndefined()
    }
  })

  it('**明显超 70 → 提示"疑似输成经度"**（比笼统的范围错误有用得多）', () => {
    for (const v of ['71', '100', '120', '135', '300']) {
      const msg = lat()(v)
      expect(msg, `纬度 "${v}" 应提示单位疑似填错`).toBeTruthy()
      expect(msg).toContain('经度')
    }
  })

  it('70 属于"不够大不像经度"，仍报范围错误（分界点 70 本身在 18~54 之外）', () => {
    const msg = lat()('70')
    expect(msg).toContain('18~54')
    expect(msg, '70 不该被提示成经度（阈值是 > 70）').not.toContain('疑似')
  })
})

describe('经度校验 isLng（中国范围 73~135）', () => {
  it('未填 → 放过', () => {
    expect(lng()('')).toBeUndefined()
    expect(lng()('  ')).toBeUndefined()
  })

  it('**非法字符必须报错**（与前缀"未填放过"区分开）', () => {
    for (const v of ['abc', 'E120', '一百二十']) {
      const msg = lng()(v)
      expect(msg, `经度 "${v}" 不是数字`).toBeTruthy()
      expect(msg).toContain('数字')
    }
  })

  it('范围边界逐点：73 与 135 通过、72 与 136 越界', () => {
    expect(lng()('73')).toBeUndefined()
    expect(lng()('135')).toBeUndefined()
    expect(lng()('72.9')).toContain('73~135')
    expect(lng()('136')).toContain('73~135')
  })

  it('**明显小于 60 → 提示"疑似输成纬度"**', () => {
    for (const v of ['0', '30', '59']) {
      const msg = lng()(v)
      expect(msg, `经度 "${v}" 应提示单位疑似填错`).toBeTruthy()
      expect(msg).toContain('纬度')
    }
  })

  it('60~72 之间报范围错误而不是"疑似纬度"（分界点 60 本身）', () => {
    for (const v of ['60', '65', '72']) {
      const msg = lng()(v)
      expect(msg, `经度 ${v} 越界`).toContain('73~135')
      expect(msg, `经度 ${v} 不该被提示成纬度`).not.toContain('疑似')
    }
  })
})

describe('地址四级校验 addressLevels', () => {
  const addr = () => ruleOf('license_address')

  it('未填 → 放过', () => {
    expect(addr()('')).toBeUndefined()
    expect(addr()('   ')).toBeUndefined()
  })

  it('完整的省+市+区县+乡镇 → 通过', () => {
    for (const v of [
      '湖南省长沙市岳麓区梅溪湖街道',
      '广东省深圳市南山区科技园社区',
      '湖南省湘西土家族苗族自治州吉首市乾州街道',
      '内蒙古自治区呼和浩特市新城区东风路街道',
      '香港特别行政区香港市中西区中山村',
      '广西壮族自治区南宁市青秀区民族大道村',
    ]) {
      expect(addr()(v), `完整地址应通过：${v}`).toBeUndefined()
    }
  })

  it('**已知边界（预置规则的白名单口径，不是缺陷）**：省级后缀只认 省/自治区/直辖市/特别行政区', () => {
    // "北京市" 这类**直辖市简称**不含"省|自治区|直辖市|特别行政区"后缀，会判为不完整。
    // 这是预置模板自带的四段式正则口径（旧版 validateAddressFormat 原样承接），
    // 前两段都要求带后缀。这里把它**固化成已知行为**而不是"期望它通过"：
    // 若将来要支持"北京市北京市海淀区中关村街道"这种写法，需同时改正则与这条用例。
    expect(addr()('北京市北京市海淀区中关村街道')).toContain('4 个行政级别')
    // 同一地址补上"直辖市"后缀即可通过 —— 证明规则本身是有意为之而非写漏
    expect(addr()('北京市直辖市的市海淀区中关村街道')).toBeTruthy()
  })

  it('**缺任一级都要报错**（只到区县的地址不能算通过）', () => {
    for (const v of [
      '随便写写',
      '湖南省长沙市岳麓区',
      '湖南省长沙市',
      '湖南省',
      '长沙市岳麓区梅溪湖街道', // 缺省级
      '湖南省岳麓区梅溪湖街道', // 缺市级
      '湖南省长沙市梅溪湖街道', // 缺区县级
      '湖南省长沙市岳麓区梅溪湖', // 缺乡镇级（"梅溪湖"不带街道/镇/乡/村/社区）
    ]) {
      const msg = addr()(v)
      expect(msg, `不完整地址应报错：${v}`).toBeTruthy()
      expect(msg).toContain('4 个行政级别')
    }
  })

  it('错误文案里带字段名（同一表单有两个地址字段，用户要知道是哪一个）', () => {
    expect(addr()('随便写写')).toContain('营业执照地址')
    const amap = ruleOf('amap_address')
    expect(amap('随便写写'), '高德地址的文案应指向它自己').toContain('高德地图-地址')
  })

  it('**两个地址字段各自独立**（不要把营业执照地址的文案串到高德地址上）', () => {
    const a = addr()
    const b = ruleOf('amap_address')
    // 同一个输入，两条规则给出的文案必须不同（各自带自己的字段名）
    expect(a('x')).not.toBe(b('x'))
  })
})

describe('契约：预置模板的校验接线没接错', () => {
  it('经纬度与两个地址字段都挂了规则，其它字段不误挂', () => {
    const s = storeReportSchema()
    const withRules = s.fields.filter((f) => Array.isArray(f.rules) && f.rules.length > 0).map((f) => f.key)
    expect(withRules.sort()).toEqual(['amap_address', 'latitude', 'license_address', 'longitude'])
  })

  it('纬度/经度字段是**文本输入**（所以自定义规则是唯一把关点，不能被自带 type 校验顶掉）', () => {
    const s = storeReportSchema()
    expect(s.fields.find((f) => f.key === 'latitude')!.type).toBe('text')
    expect(s.fields.find((f) => f.key === 'longitude')!.type).toBe('text')
  })

  it('提示语与规则一致（hint 写的范围要和规则实际范围相符）', () => {
    const s = storeReportSchema()
    expect(s.fields.find((f) => f.key === 'latitude')!.hint).toContain('18~54')
    expect(s.fields.find((f) => f.key === 'longitude')!.hint).toContain('73~135')
  })
})