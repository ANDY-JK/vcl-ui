// 周边搜索翻页判定 —— 「这一页满了所以还有下一页」必须和请求里的 offset 同源。
// 两处各写一个 25 时，改请求条数会让判定永假，结果静默停在第一页（表现为"附近门店就这几个"）。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchNearby } from '@/components/amap/amap-service'

const PAGE_SIZE = 25

const poi = (tag: string, i: number) => ({
  id: `${tag}${i}`,
  name: `门店-${tag}-${i}`,
  address: '某路 1 号',
  location: `${(116.4 + i / 1000).toFixed(6)},${(39.9 + i / 1000).toFixed(6)}`,
})

const body = (tag: string, n: number) => ({
  status: '1',
  infocode: '10000',
  count: String(n),
  pois: Array.from({ length: n }, (_, i) => poi(tag, i)),
})

/** 按 page 参数派发不同条数的假响应，并记录实际发起了几次请求 */
function stubResponses(sizes: Record<number, number>) {
  const urls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url)
      const page = Number(new URL(url).searchParams.get('page'))
      return { ok: true, json: async () => body(`p${page}`, sizes[page] ?? 0) } as unknown as Response
    }),
  )
  return urls
}

afterEach(() => vi.unstubAllGlobals())

describe('searchNearby 翻页', () => {
  it('请求条数与翻页判定同源：第一页满 → 继续取第二页', async () => {
    const urls = stubResponses({ 1: PAGE_SIZE, 2: 3 })
    const res = await searchNearby(39.9, 116.4, 1000)
    expect(urls).toHaveLength(2)
    expect(new URL(urls[0]).searchParams.get('offset')).toBe(String(PAGE_SIZE))
    expect(res).toHaveLength(PAGE_SIZE + 3)
  })

  it('第一页没满 → 不再发第二页请求', async () => {
    const urls = stubResponses({ 1: 10 })
    const res = await searchNearby(39.9, 116.4, 1000)
    expect(urls).toHaveLength(1)
    expect(res).toHaveLength(10)
  })
})
