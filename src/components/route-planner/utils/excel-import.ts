/**
 * Excel 导入解析
 * 固定格式：门店名 | 四级乡镇 | 详细地址 | 联系人 | 电话 | 经度 | 纬度
 * 第1行=表头 第2行=起点/终点 第3行起=门店数据
 */
import { normalizeChinaLatLon } from '@/components/amap'
import { useT } from '@/components/_internal/i18n'

/** 模块级 t：错误消息与点位名按当前语言 */
const t = useT()
import { parseRegion } from '@/components/_internal/utils'
import type { Store, ImportResult } from '@/components/route-planner/types'

/** 表头 → 字段（固定映射） */
const HEADER_MAP: Record<string, string> = {
  门店名: 'name',
  店铺名: 'name',
  名称: 'name',
  店名: 'name',
  详细地址: 'address',
  地址: 'address',
  联系人: 'contact',
  联系人姓名: 'contact',
  电话: 'phone',
  手机号: 'phone',
  手机号码: 'phone',
  经度: 'longitude',
  longitude: 'longitude',
  lon: 'longitude',
  lng: 'longitude',
  纬度: 'latitude',
  latitude: 'latitude',
  lat: 'latitude',
  四级乡镇: 'fullAddr',
  '4级乡镇': 'fullAddr',
  省市区镇: 'fullAddr',
}

export async function parseExcel(file: File | ArrayBuffer): Promise<ImportResult> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file
  const XLSX = await import('@/components/_internal/xlsx/xlsx.mjs')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown as unknown[][]

  const rows = trimData(rawRows)
  if (rows.length < 2) return { stores: [], needGeocode: [] }

  // 表头定位（大小写不敏感 + 剥掉单位括号，如「经度(°)」/「LNG」）
  const headerRow = rows[0] as (string | number | undefined)[]
  const colMap = new Map<string, number>()
  headerRow.forEach((h, idx) => {
    if (h == null) return
    const field = HEADER_MAP[normalizeHeader(String(h))]
    if (field) colMap.set(field, idx)
  })

  // 未映射列 → 按类型推断（仅电话；坐标列必须显式声明，见下方校验）
  const maxCols = Math.max(...rows.map((r) => (r as unknown[]).length))
  const mappedCols = new Set(colMap.values())
  for (let col = 0; col < maxCols; col++) {
    if (mappedCols.has(col)) continue
    const sample: unknown[] = []
    for (let i = 1; i <= Math.min(5, rows.length - 1); i++) {
      sample.push((rows[i] as unknown[])?.[col])
    }
    const phoneCount = sample.filter((v) => v != null && /^\d{11}$/.test(String(v).trim())).length
    if (phoneCount >= 2 && !colMap.has('phone')) {
      colMap.set('phone', col)
      mappedCols.add(col)
    }
  }

  // 固定格式要求经纬度列：缺失时明确报错，不再按数值均值猜（任意数字列都会被误认）
  if (!colMap.has('longitude') || !colMap.has('latitude')) {
    throw new Error(t('routePlanner.missingCoordColumns', { row: 3 }))
  }

  // 第2行 = 起点/终点
  const startRow = rows[1] as (string | number | undefined)[]
  const startAddr = getStr(startRow, colMap.get('address')) || getStr(startRow, colMap.get('fullAddr'))
  const startPoint = startAddr ? { name: t('routePlanner.startEndPoint'), address: startAddr } : null

  const stores: Partial<Store>[] = []
  const needGeocode: Partial<Store>[] = []
  // 判重口径：仅「门店名 + 详细地址」完全相同才算重复。
  // 同坐标不再判重——同商场多个柜台是正常数据，清掉坐标会逼它们重新地理编码。
  const seenStoreKeys = new Set<string>()

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] as (string | number | undefined)[]
    if (!row || row.length === 0) continue

    const name = getStr(row, colMap.get('name'))
    const address = getStr(row, colMap.get('address'))
    const fullAddr = getStr(row, colMap.get('fullAddr'))

    // 完全空行跳过；允许仅四级乡镇无门店名/地址的行（乡镇标记）
    if (!name && !address && !fullAddr) continue

    if (name && address) {
      const dupKey = `${name}|${address}`
      if (seenStoreKeys.has(dupKey)) continue
      seenStoreKeys.add(dupKey)
    }

    const parsed = parseRegion(fullAddr)

    // 乡镇标记：无门店名 + 无详细地址 → 用最后一节（镇/乡/街道名）作为显示名
    const isMarker = !name && !address
    const displayName = name || parsed.town || t('routePlanner.unnamedArea', { n: i })

    let latitude = getNum(row, colMap.get('latitude'))
    let longitude = getNum(row, colMap.get('longitude'))

    // 自动纠正经纬度互换（中国范围启发式）
    if (longitude != null && latitude != null) {
      const normalized = normalizeChinaLatLon(latitude, longitude)
      if (normalized) {
        latitude = normalized.latitude
        longitude = normalized.longitude
      } else {
        latitude = null
        longitude = null
      }
    }

    const partial: Partial<Store> = {
      id: `store_${Date.now()}_${i}`,
      name: displayName,
      address,
      province: parsed.province,
      city: parsed.city,
      district: parsed.district,
      town: parsed.town,
      fullAddr: fullAddr || undefined,
      isTownshipMarker: isMarker || undefined,
      contact: getStr(row, colMap.get('contact')),
      phone: getStr(row, colMap.get('phone')),
      longitude,
      latitude,
    }

    if (longitude != null && latitude != null) {
      stores.push(partial)
    } else {
      needGeocode.push(partial)
    }
  }

  return { stores, needGeocode, startPoint }
}

function trimData(rawRows: unknown[][]): unknown[][] {
  let lastRow = 0,
    lastCol = 0
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i]
    if (!row || !Array.isArray(row)) continue
    for (let j = 0; j < row.length; j++) {
      if (row[j] != null && row[j] !== '') {
        lastRow = i
        lastCol = Math.max(lastCol, j)
      }
    }
  }
  return rawRows.slice(0, lastRow + 1).map((r) => (r as unknown[]).slice(0, lastCol + 1))
}

/** 表头归一化：剥掉单位括号（「经度(°)」→「经度」）、去空白、转小写（「LNG」→「lng」） */
function normalizeHeader(header: string): string {
  return header
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

function getStr(row: (string | number | undefined)[], idx: number | undefined): string {
  if (idx == null || idx >= row.length) return ''
  const val = row[idx]
  return val != null ? String(val).trim() : ''
}

function getNum(row: (string | number | undefined)[], idx: number | undefined): number | null {
  if (idx == null || idx >= row.length) return null
  const val = row[idx]
  if (val == null || val === '') return null
  const num = typeof val === 'number' ? val : parseFloat(String(val).trim())
  return isNaN(num) ? null : num
}
