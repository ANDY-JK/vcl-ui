// resolveCoordinate 三级坐标解析 — Priority 3（乡镇兜底）边界锁定
// 背景：省市区镇全空时，旧实现拼出裸查询「人民政府」，会命中任意政府大楼并当成门店坐标。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCoordinate } from '@/components/route-planner/utils/coordinate-resolver'
import { keywordSearch } from '@/components/amap'

vi.mock('@/components/amap', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/amap')>()
  return { ...actual, keywordSearch: vi.fn() }
})

const mockSearch = vi.mocked(keywordSearch)

describe('resolveCoordinate · 乡镇兜底不查裸「人民政府」', () => {
  beforeEach(() => {
    mockSearch.mockReset()
    mockSearch.mockResolvedValue({ latitude: 28.2, longitude: 112.9 })
  })

  it('无任何地域信息：不发起查询，直接失败（交由 batch 标 none）', async () => {
    await expect(resolveCoordinate({})).rejects.toThrow()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('cityLimit 为空（只有镇名、无市/区）：不做乡镇兜底', async () => {
    await expect(resolveCoordinate({ town: '某镇' })).rejects.toThrow()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('有城市 + 镇名：仍走乡镇兜底并标注 township_geocode', async () => {
    const r = await resolveCoordinate({ city: '长沙市', town: '某镇' })
    expect(r.source).toBe('township_geocode')
    expect(mockSearch).toHaveBeenCalledTimes(1)
    // 查询词带城市限定与「人民政府」，不是裸词
    const [query] = mockSearch.mock.calls[0]
    expect(query).toContain('人民政府')
    expect(query).toContain('长沙市')
  })
})
