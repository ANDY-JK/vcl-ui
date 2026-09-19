// parseExcel 导入解析行为锁定
// 背景：坐标列曾按数值均值猜测（80~180 猜经度、0~90 猜纬度），会把任意数字列误认成经纬度；
// 且表头只做精确匹配，"经度(°)" / "LNG" 这类写法直接漏掉。
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcel } from '@/components/route-planner/utils/excel-import'

function makeBuf(aoa: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseExcel · 表头识别', () => {
  it('带单位括号的表头可识别（经度(°) / 纬度(°)）', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', '经度(°)', '纬度(°)'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9, 28.2],
      ['门店A', '长沙市岳麓区xx路2号', 112.9388, 28.2282],
    ])
    const { stores } = await parseExcel(buf)
    expect(stores).toHaveLength(1)
    expect(stores[0].longitude).toBeCloseTo(112.9388, 4)
    expect(stores[0].latitude).toBeCloseTo(28.2282, 4)
  })

  it('大小写不敏感（LNG / LAT）', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', 'LNG', 'LAT'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9, 28.2],
      ['门店A', '长沙市岳麓区xx路2号', 112.9388, 28.2282],
    ])
    const { stores } = await parseExcel(buf)
    expect(stores).toHaveLength(1)
    expect(stores[0].longitude).toBeCloseTo(112.9388, 4)
  })
})

describe('parseExcel · 不再按数值均值猜坐标', () => {
  it('数值恰好像经纬度的未知列不会被当成坐标（缺经纬度列直接报错）', async () => {
    // 旧实现会把「销量」列（均值 ~100）猜成经度、「库存」列（均值 ~40）猜成纬度
    const buf = makeBuf([
      ['门店名', '详细地址', '销量', '库存'],
      ['起点', '长沙市芙蓉区xx路1号', 110, 40],
      ['门店A', '长沙市岳麓区xx路2号', 116, 39],
      ['门店B', '长沙市开福区xx路3号', 118, 41],
      ['门店C', '长沙市天心区xx路4号', 120, 42],
    ])
    await expect(parseExcel(buf)).rejects.toThrow(/经度|纬度/)
  })

  it('缺少纬度列 → 报错并中止', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', '经度'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9],
      ['门店A', '长沙市岳麓区xx路2号', 112.9388],
    ])
    await expect(parseExcel(buf)).rejects.toThrow(/纬度/)
  })

  it('坐标列存在但单元格为空 → 走 needGeocode（不报错）', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', '经度', '纬度'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9, 28.2],
      ['门店A', '长沙市岳麓区xx路2号', '', ''],
      ['门店B', '长沙市开福区xx路3号', 112.98, 28.23],
    ])
    const { stores, needGeocode } = await parseExcel(buf)
    expect(stores).toHaveLength(1)
    expect(needGeocode).toHaveLength(1)
    expect(needGeocode[0].name).toBe('门店A')
  })
})

describe('parseExcel · 去重口径', () => {
  it('同坐标不同门店全部保留（同商场多柜是正常数据）', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', '经度', '纬度'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9, 28.2],
      ['商场A柜', '长沙市岳麓区某商场1F', 112.9388, 28.2282],
      ['商场B柜', '长沙市岳麓区某商场2F', 112.9388, 28.2282],
    ])
    const { stores, needGeocode } = await parseExcel(buf)
    expect(stores).toHaveLength(2)
    expect(needGeocode).toHaveLength(0)
    expect(stores[0].longitude).toBeCloseTo(112.9388, 4)
    expect(stores[1].longitude).toBeCloseTo(112.9388, 4)
  })

  it('门店名 + 详细地址完全相同才判重（只保留第一条）', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', '经度', '纬度'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9, 28.2],
      ['门店A', '长沙市岳麓区xx路2号', 112.9388, 28.2282],
      ['门店A', '长沙市岳麓区xx路2号', 112.9389, 28.2283],
    ])
    const { stores } = await parseExcel(buf)
    expect(stores).toHaveLength(1)
    expect(stores[0].longitude).toBeCloseTo(112.9388, 4)
  })

  it('同名不同地址不判重', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', '经度', '纬度'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9, 28.2],
      ['门店A', '长沙市岳麓区xx路2号', 112.9388, 28.2282],
      ['门店A', '长沙市开福区xx路3号', 112.98, 28.23],
    ])
    const { stores } = await parseExcel(buf)
    expect(stores).toHaveLength(2)
  })
})

describe('parseExcel · 电话列推断保留', () => {
  it('未映射的 11 位数字列仍被识别为电话', async () => {
    const buf = makeBuf([
      ['门店名', '详细地址', '经度', '纬度', '备注'],
      ['起点', '长沙市芙蓉区xx路1号', 112.9, 28.2, ''],
      ['门店A', '长沙市岳麓区xx路2号', 112.9388, 28.2282, 13800138000],
      ['门店B', '长沙市开福区xx路3号', 112.98, 28.23, 13900139000],
    ])
    const { stores } = await parseExcel(buf)
    expect(stores[0].phone).toBe('13800138000')
  })
})
