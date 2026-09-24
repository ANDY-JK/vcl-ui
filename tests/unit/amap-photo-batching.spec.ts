// 批量照片的名称兜底轮：不能只查前 10 家就把第 11 家起静默丢掉。
// 并发窗口（一次 allSettled 几个请求）与"总共查多少个"是两件事：
// 窗口放大才会打满高德 QPS，顺序分块跑完不会 —— 调用方传的 count 才是这条链路的数量上限。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { batchFetchPoiPhotos } from '@/components/amap/amap-service'

const photo = (url: string) => ({ title: 't', url })

/** 记录每个 keywords 参数（即按名称兜底的那批门店） */
function stubTextResponses() {
  const names: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url)
      names.push(u.searchParams.get('keywords') || '')
      return {
        ok: true,
        json: async () => ({ pois: [{ photos: [photo(`https://img.test/${names.length}.jpg`)] }] }),
      } as unknown as Response
    }),
  )
  return names
}

/** 无 id 的门店全部只能走名称兜底 */
const stores = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `门店${i}`, latitude: 39.9 + i / 10000, longitude: 116.4 + i / 10000 }))

afterEach(() => vi.unstubAllGlobals())

describe('batchFetchPoiPhotos 名称兜底', () => {
  it('15 家无 ID 门店：15 家都要查，且每轮并发不超过上限', async () => {
    const names = stubTextResponses()
    const list = stores(15)
    const res = await batchFetchPoiPhotos(list, 20)
    expect(names).toHaveLength(15) // 修复前只发 10 次：第 11~15 家静默无照片
    expect(res.size).toBe(15)
    for (const s of list) {
      expect(res.get(`${s.name}|${s.latitude}|${s.longitude}`)?.length).toBe(1)
    }
  })

  it('并发窗口仍是 10：同一轮里最多 10 个请求在飞', async () => {
    let inflight = 0
    let peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        inflight++
        peak = Math.max(peak, inflight)
        await new Promise((r) => setTimeout(r, 1))
        inflight--
        return {
          ok: true,
          json: async () => ({ pois: [{ photos: [photo('https://img.test/a.jpg')] }] }),
        } as unknown as Response
      }),
    )
    await batchFetchPoiPhotos(stores(25), 25)
    expect(peak).toBeLessThanOrEqual(10) // 打满 QPS 的从来不是"总数多"，是"同时在飞的多"
  })

  it('count 才是数量上限：给了 30 家只按 count 取前 N 家', async () => {
    const names = stubTextResponses()
    await batchFetchPoiPhotos(stores(30), 12)
    expect(names).toHaveLength(12)
  })
})
