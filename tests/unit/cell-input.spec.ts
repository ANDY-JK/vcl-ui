// cell-input 归一化行为锁定：Excel 风格输入解析（date/number/time/datetime/text）
// 背景：同事反馈「date 列输入 9/12 应变 2026-09-12」，归一化落地后必须有回归锁。
// ⚠️ 全部用例注入固定 now —— 不得依赖真实时钟，否则跨年/跨月会随机红。
import { describe, it, expect } from 'vitest'
import { normalizeCellInput } from '@/components/data/composables/cell-input'

/** 固定「当前时间」：2026-09-17 10:30（月份 0-based，8 = 9月） */
const NOW = new Date(2026, 8, 17, 10, 30, 0)

/** 单值归一化快捷调用 */
function norm(raw: string, type?: Parameters<typeof normalizeCellInput>[1]['type'], dateOrder?: 'MDY' | 'DMY') {
  return normalizeCellInput(raw, { type, now: NOW, dateOrder })
}

describe('cell-input · opt-in 与清空', () => {
  it('未声明 type → 原样返回（存量表格零行为变化）', () => {
    expect(norm('9/12').value).toBe('9/12')
    expect(norm('1,234').value).toBe('1,234')
    expect(norm('  空格  ').value).toBe('  空格  ')
  })

  it("type='text' → 原样返回，前导零必须保住", () => {
    expect(norm('007', 'text').value).toBe('007')
    expect(norm('9/12', 'text').value).toBe('9/12')
    expect(norm('-', 'text').value).toBe('-')
  })

  it('空串/纯空白一律放行并归一为空串（带类型的列仍可清空）', () => {
    for (const t of ['date', 'number', 'time', 'datetime'] as const) {
      expect(norm('', t)).toMatchObject({ ok: true, value: '' })
      expect(norm('   ', t)).toMatchObject({ ok: true, value: '' })
    }
  })
})

describe('cell-input · date（同事诉求核心）', () => {
  it('9/12 → 当前年 2026-09-12', () => {
    expect(norm('9/12', 'date')).toMatchObject({ ok: true, value: '2026-09-12' })
  })

  it('- 与 . 同为日期分隔符', () => {
    expect(norm('9-12', 'date').value).toBe('2026-09-12')
    expect(norm('9.12', 'date').value).toBe('2026-09-12')
  })

  it('中文写法 9月12日 → 2026-09-12（补零到 ISO）', () => {
    expect(norm('9月12日', 'date').value).toBe('2026-09-12')
    expect(norm('2026年9月12日', 'date').value).toBe('2026-09-12')
  })

  it('完整年月日补零到 ISO（保证字典序 = 时间序，可排序）', () => {
    expect(norm('2026/9/12', 'date').value).toBe('2026-09-12')
    expect(norm('2026-9-12', 'date').value).toBe('2026-09-12')
    expect(norm('2026/09/12', 'date').value).toBe('2026-09-12')
  })

  it('8 位纯数字 20260912 → 2026-09-12', () => {
    expect(norm('20260912', 'date').value).toBe('2026-09-12')
  })

  it('两位年补全：00-29 → 20xx，30-99 → 19xx（对齐 Excel）', () => {
    expect(norm('9/12/26', 'date').value).toBe('2026-09-12')
    expect(norm('9/12/99', 'date').value).toBe('1999-09-12')
  })

  it("dateOrder='DMY' 时 9/12 → 2026-12-09（真歧义，必须显式声明）", () => {
    expect(norm('9/12', 'date', 'DMY').value).toBe('2026-12-09')
  })

  it('月日超范围时按 Excel 容错交换：13/12 → 12月13日', () => {
    expect(norm('13/12', 'date').value).toBe('2026-12-13')
  })

  it('非法日期被拒绝且返回原值（2026-02-31 / 2025-02-29）', () => {
    expect(norm('2026-02-31', 'date')).toMatchObject({ ok: false, value: '2026-02-31', errorKey: 'table.invalidDate' })
    expect(norm('2025-02-29', 'date').ok).toBe(false)
  })

  it('闰年合法：2024-02-29 通过', () => {
    expect(norm('2024-02-29', 'date')).toMatchObject({ ok: true, value: '2024-02-29' })
  })

  it('无法识别的日期拒绝（乱码 / 缺段）', () => {
    expect(norm('abc', 'date').ok).toBe(false)
    expect(norm('9//', 'date').ok).toBe(false)
    expect(norm('1/2/3/4/5', 'date').ok).toBe(false)
  })
})

describe('cell-input · time', () => {
  it('冒号写法补零：2:5 → 02:05', () => {
    expect(norm('2:5', 'time').value).toBe('02:05')
    expect(norm('14:30', 'time').value).toBe('14:30')
  })

  it('紧凑 4 位：1430 → 14:30，930 → 09:30', () => {
    expect(norm('1430', 'time').value).toBe('14:30')
    expect(norm('930', 'time').value).toBe('09:30')
  })

  it('秒保留：14:30:05', () => {
    expect(norm('14:30:05', 'time').value).toBe('14:30:05')
  })

  it('越界时间拒绝（25:00 / 12:60）', () => {
    expect(norm('25:00', 'time')).toMatchObject({ ok: false, errorKey: 'table.invalidTime' })
    expect(norm('12:60', 'time').ok).toBe(false)
  })
})

describe('cell-input · datetime', () => {
  it('日期+时间：9/12 14:30 → 2026-09-12 14:30', () => {
    expect(norm('9/12 14:30', 'datetime').value).toBe('2026-09-12 14:30')
    expect(norm('2026-09-12T14:30', 'datetime').value).toBe('2026-09-12 14:30')
  })

  it('仅时间 → 补今天', () => {
    expect(norm('14:30', 'datetime').value).toBe('2026-09-17 14:30')
  })

  it('日期合法但缺时间 → 拒绝', () => {
    expect(norm('9/12', 'datetime').ok).toBe(false)
  })
})

describe('cell-input · number（补上小程序库有而 Vue 丢的校验）', () => {
  it('去千分位与货币符号', () => {
    expect(norm('1,234', 'number').value).toBe('1234')
    expect(norm('￥1,234.50', 'number').value).toBe('1234.5')
  })

  it('会计写法 (123) → -123，全角括号同样识别', () => {
    expect(norm('(123)', 'number').value).toBe('-123')
    expect(norm('（123）', 'number').value).toBe('-123')
  })

  it('科学计数 1e3 → 1000（不落 e 记法，避免导出后 Excel 认成文本）', () => {
    expect(norm('1e3', 'number').value).toBe('1000')
  })

  it('全角数字与负号转半角', () => {
    expect(norm('１２３', 'number').value).toBe('123')
    expect(norm('－5', 'number').value).toBe('-5')
  })

  it('前导零保原样（对齐方案#20：007 类编码值不被静默改成 7）', () => {
    // 对齐计划「输入 007 保持文本，需防误伤前导零」：数字列的 007/01.5 若归一成 7 会损毁编码/工号数据，
    // 比「Excel 把 007 当 7」更安全——要纯数字使用方自己 trim，编码类列声明 type='text'
    expect(norm('007', 'number').value).toBe('007')
    expect(norm('-007', 'number').value).toBe('-007')
    expect(norm('01.5', 'number').value).toBe('01.5')
    expect(norm('００７', 'number').value).toBe('007')
    // 正常数字不受影响
    expect(norm('0', 'number').value).toBe('0')
    expect(norm('0.5', 'number').value).toBe('0.5')
    expect(norm('000', 'number').value).toBe('000')
  })

  it('超安全整数范围的纯数字保原样（卡号/身份证/流水号不被抹尾数）', () => {
    // Number() 在 |n| > 2^53-1 上会静默改尾数，落库后不可逆 —— 与前导零同策略保原样
    expect(norm('6210001234567890123', 'number').value).toBe('6210001234567890123')
    expect(norm('110101199003071234', 'number').value).toBe('110101199003071234')
    expect(norm('9007199254740993', 'number').value).toBe('9007199254740993')
    expect(norm('-9007199254740993', 'number').value).toBe('-9007199254740993')
    // 安全范围内的整数位数再多也照常归一（去千分位是数字列的本职）
    expect(norm('123,456,789,012,345', 'number').value).toBe('123456789012345')
    // 小数不受该守卫影响（isSafeInteger 只对纯整数形态判定）
    expect(norm('1.5', 'number').value).toBe('1.5')
  })

  it('无法无损转十进制的写法保原样，不静默改值', () => {
    // toFixed(20) 对 |n| ≥ 1e21 仍返回指数形式、对 1e-21 会抹成 '0'
    expect(norm('1e21', 'number').value).toBe('1e21')
    expect(norm('1e-21', 'number').value).toBe('1e-21')
    // 能无损还原的仍然展开
    expect(norm('1e-7', 'number').value).toBe('0.0000001')
    expect(norm('1e3', 'number').value).toBe('1000')
  })

  it('非数字拒绝，且不落库（value 保持原值）', () => {
    expect(norm('abc', 'number')).toMatchObject({ ok: false, value: 'abc', errorKey: 'table.invalidNumber' })
    expect(norm('12abc', 'number').ok).toBe(false)
    expect(norm('Infinity', 'number').ok).toBe(false)
    expect(norm('0x10', 'number').ok).toBe(false)
  })

  it('合法边界值通过：0 / 负数 / 小数', () => {
    expect(norm('0', 'number').value).toBe('0')
    expect(norm('-12.5', 'number').value).toBe('-12.5')
    expect(norm('.5', 'number').value).toBe('0.5')
  })
})

describe('cell-input · number 的小数点/千分位判定（#406）', () => {
  it('**欧式写法不再被改值**：1.234,56 是 1234.56，不是 1.23456', () => {
    expect(norm('1.234,56', 'number').value).toBe('1234.56')
    expect(norm('1.234.567,89', 'number').value).toBe('1234567.89')
    expect(norm('€1.234,56', 'number').value).toBe('1234.56')
  })

  it('**小数逗号不再被当千分位**：1,23 是 1.23，不是 123', () => {
    expect(norm('1,23', 'number').value).toBe('1.23')
    expect(norm('1,2', 'number').value).toBe('1.2')
    expect(norm('0,5', 'number').value).toBe('0.5')
  })

  it('美式千分位与美式小数照旧（反回归）', () => {
    expect(norm('1,234', 'number').value).toBe('1234')
    expect(norm('1,234,567', 'number').value).toBe('1234567')
    expect(norm('1,234.56', 'number').value).toBe('1234.56')
    expect(norm('￥1,234.50', 'number').value).toBe('1234.5')
  })

  it('**形态无法判定时判非法**，不猜（旧实现会拼成 1234）', () => {
    expect(norm('1,23,4', 'number')).toMatchObject({ ok: false, errorKey: 'table.invalidNumber' })
    expect(norm('1,2345', 'number').ok).toBe(false)
  })

  it('空格千分位仍可识别（1 234,56）', () => {
    expect(norm('1 234,56', 'number').value).toBe('1234.56')
  })
})