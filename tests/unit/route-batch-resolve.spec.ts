// batchResolveCoordinates 批量解析行为（2026-10-21，审查 6.3 / 覆盖洼地 route-planner）
//
// 背景：route-planner 域函数覆盖 48.9%，逐文件分析发现 `coordinate-resolver.ts`
// 只覆盖了 `resolveCoordinate`（P3 乡镇兜底那条边界），而**批量入口
// `batchResolveCoordinates` 一条都没测**（1/6 函数）。
//
// 批量入口才是真正的生产路径：Excel 导入几百家门店后全走它。
// 它有三条分支，其中两条容易出错：
//
// ① **已有坐标直接保留**（不发起请求）—— 若这里判空写错（如 `!= null` 写成 `!== undefined`），
//    经纬度 0 或 null 的门店会被当成"有坐标"，于是拿到 (0,0) 这个几内亚湾的点。
// ② **解析失败不丢失门店** —— 失败要保留记录并标 `coordSource='none'`，
//    否则用户导入 100 家只回来 97 家，且不知道少了哪三家。
// ③ **业务字段透传** —— `isTownshipMarker` / `visitMinutes` / `fullAddr` 必须原样带上，
//    缺了会导致"乡镇标记丢失身份""拜访时长全部退回默认值"（源码 L168-172 的注释也提醒过）。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { batchResolveCoordinates } from '@/components/route-planner/utils/coordinate-resolver'
import { keywordSearch } from '@/components/amap'

vi.mock('@/components/amap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/amap')>()
  return { ...actual, keywordSearch: vi.fn() }
})

const mockSearch = vi.mocked(keywordSearch)

/** delayMs=0：批量里的限速延时对本测试无意义，传 0 避免几百 ms 空等 */
const NO_DELAY = 0

beforeEach(() => {
  mockSearch.mockReset()
})

describe('batchResolveCoordinates · 已有坐标直接保留', () => {
  it('合法经纬度 → 不发起请求，标 original', async () => {
    const [r] = await batchResolveCoordinates([{ name: 'A', longitude: 113.1, latitude: 28.2 }], undefined, NO_DELAY)
    expect(mockSearch, '已有坐标不该再请求').not.toHaveBeenCalled()
    expect(r.coordSource).toBe('original')
    expect(r.longitude).toBe(113.1)
    expect(r.latitude).toBe(28.2)
  })

  it('经纬度为 0 视为无效坐标（不是"有值"）→ 仍走解析', async () => {
    // 经纬度 0 是几内亚湾，现实中不可能。若判空写成 `!= null` 会把它当合法值放过去，
    // 于是门店被"成功定位"到海上。这里锁住 isValidLatLon 的守门职责。
    mockSearch.mockResolvedValue({ latitude: 28.2, longitude: 113.1 })
    const [r] = await batchResolveCoordinates([{ name: '赤道店', longitude: 0, latitude: 0 }], undefined, NO_DELAY)
    expect(mockSearch, '0,0 应被判无效并走解析').toHaveBeenCalled()
    expect(r.coordSource).not.toBe('original')
  })

  it('只有经度没有纬度 → 走解析（不能只判一个字段）', async () => {
    mockSearch.mockResolvedValue({ latitude: 28.2, longitude: 113.1 })
    await batchResolveCoordinates([{ name: 'B', longitude: 113.1 }], undefined, NO_DELAY)
    expect(mockSearch, '缺纬度应走解析').toHaveBeenCalled()
  })
})

describe('batchResolveCoordinates · 解析失败不丢门店', () => {
  it('解析抛错 → 仍保留记录，标 none，坐标为 null', async () => {
    mockSearch.mockRejectedValue(new Error('quota exceeded'))
    const out = await batchResolveCoordinates([{ name: 'C', city: '长沙市' }], undefined, NO_DELAY)

    expect(out.length, '失败也要保留门店（不能少一条）').toBe(1)
    expect(out[0].name).toBe('C')
    expect(out[0].coordSource).toBe('none')
    expect(out[0].longitude).toBeNull()
    expect(out[0].latitude).toBeNull()
  })

  it('全部失败时，结果条数与输入条数一致', async () => {
    mockSearch.mockRejectedValue(new Error('boom'))
    const input = [{ name: 'X', city: '长沙市' }, { name: 'Y', city: '长沙市' }, { name: 'Z', city: '长沙市' }]
    const out = await batchResolveCoordinates(input, undefined, NO_DELAY)
    expect(out.length, '输几条就该出几条').toBe(3)
    expect(out.every((s) => s.coordSource === 'none')).toBe(true)
  })
})

describe('batchResolveCoordinates · 字段透传', () => {
  it('业务字段原样带上（缺了会让乡镇标记丢身份、拜访时长退回默认）', async () => {
    const [r] = await batchResolveCoordinates(
      [
        {
          name: '乡镇店',
          province: '湖南省',
          city: '长沙市',
          district: '望城区',
          town: '某镇',
          fullAddr: '湖南省长沙市望城区某镇某村1号',
          isTownshipMarker: true,
          visitMinutes: 45,
          contact: '张三',
          phone: '13800000000',
        },
      ],
      undefined,
      NO_DELAY,
    )

    expect(r.fullAddr, 'fullAddr 必须透传').toBe('湖南省长沙市望城区某镇某村1号')
    expect(r.isTownshipMarker, 'isTownshipMarker 必须透传').toBe(true)
    expect(r.visitMinutes, 'visitMinutes 必须透传').toBe(45)
    expect(r.contact).toBe('张三')
    expect(r.phone).toBe('13800000000')
  })

  it('缺字段时给空串（不是 undefined，避免下游判空逻辑踩空）', async () => {
    const [r] = await batchResolveCoordinates([{ name: 'D', longitude: 113.1, latitude: 28.2 }], undefined, NO_DELAY)
    expect(r.address).toBe('')
    expect(r.province).toBe('')
    expect(r.city).toBe('')
    expect(r.contact).toBe('')
  })

  it('无 id 时生成唯一 id（两次调用不重复）', async () => {
    const a = await batchResolveCoordinates([{ name: 'E', longitude: 113.1, latitude: 28.2 }], undefined, NO_DELAY)
    const b = await batchResolveCoordinates([{ name: 'F', longitude: 113.1, latitude: 28.2 }], undefined, NO_DELAY)
    expect(a[0].id, '应生成 id').toBeTruthy()
    expect(a[0].id).not.toBe(b[0].id)
  })

  it('已有 id 时保留原 id（不能覆盖，否则前端列表 key 全变）', async () => {
    const [r] = await batchResolveCoordinates(
      [{ id: 'store-keep-me', name: 'G', longitude: 113.1, latitude: 28.2 }],
      undefined,
      NO_DELAY,
    )
    expect(r.id, '原 id 必须保留').toBe('store-keep-me')
  })
})

describe('batchResolveCoordinates · 进度回调', () => {
  it('每处理一条回调一次，参数是 (已完成, 总数)', async () => {
    mockSearch.mockResolvedValue({ latitude: 28.2, longitude: 113.1 })
    const progress: Array<[number, number]> = []
    await batchResolveCoordinates(
      [{ name: 'A', city: '长沙市' }, { name: 'B', city: '长沙市' }, { name: 'C', city: '长沙市' }],
      (cur, total) => progress.push([cur, total]),
      NO_DELAY,
    )

    expect(progress.length, '三条应回调三次').toBe(3)
    expect(progress[0]).toEqual([1, 3])
    expect(progress[2]).toEqual([3, 3])
  })

  it('不传 onProgress 也不报错（可选参数）', async () => {
    mockSearch.mockResolvedValue({ latitude: 28.2, longitude: 113.1 })
    await expect(batchResolveCoordinates([{ name: 'A', city: '长沙市' }], undefined, NO_DELAY)).resolves.toBeTruthy()
  })
})
