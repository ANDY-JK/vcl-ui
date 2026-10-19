// reverseGeocode：反向地理编码（坐标 → 结构化地址，2026-10-19）
//
// 用途：地图选点后把文字地址回填给 address 字段，省掉用户手打省市街道。
// 与同文件的 `geocodeCalc` 方向相反（那个是地址→坐标，用于核对门店位置偏移）。
//
// 三条设计约束：① 返回值**结构化**而非一串拼好的地址（怎么拼是宿主的口径）；
// ② 失败**返回 null 不抛**——反向地理编码只是锦上添花，不该让已选好的坐标作废；
// ③ 直辖市的 city 字段是空数组，需要用 province 顶上，否则会出现"北京市 ∈ 空"。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { reverseGeocode, setAmapKeys } from '@/components/amap/amap-service'

const KEY = 'test-rest-key'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  // setAmapKeys 合并式写入：清空要用空串覆盖
  setAmapKeys({ jsKey: '', restKey: '', securityCode: '' })
})

/** 造一个高德 v3 geocode/regeo 的成功响应 */
const okResp = (over: Record<string, unknown> = {}) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({
      status: '1',
      regeocode: {
        formatted_address: '北京市东城区东华门街道东长安街',
        addressComponent: {
          province: '北京市',
          city: [], // 直辖市为数组（真实形态）
          district: '东城区',
          township: '东华门街道',
          streetNumber: { street: '东长安街', number: '1号' },
        },
        ...over,
      },
    }),
  }) as unknown as Response

function withKey() {
  setAmapKeys({ jsKey: 'js', restKey: KEY })
}

describe('reverseGeocode · 成功路径', () => {
  it('坐标 → 结构化地址（省/市/区/街道/门牌 + formatted）', async () => {
    withKey()
    const fetcher = vi.fn(async () => okResp())
    vi.stubGlobal('fetch', fetcher)

    const r = await reverseGeocode(116.4, 39.9)
    expect(r).toEqual({
      formatted: '北京市东城区东华门街道东长安街',
      province: '北京市',
      city: '北京市', // city 是空数组 → 用 province 顶上
      district: '东城区',
      township: '东华门街道',
      street: '东长安街',
      streetNumber: '1号',
    })
  })

  it('请求 URL 带 key 与 location=lng,lat（顺序不能反）', async () => {
    withKey()
    const fetcher = vi.fn(async () => okResp())
    vi.stubGlobal('fetch', fetcher)
    await reverseGeocode(116.4, 39.9)
    const url = String((fetcher.mock.calls[0] as unknown[])[0])
    expect(url).toContain('restapi.amap.com/v3/geocode/regeo')
    expect(url).toContain(`key=${KEY}`)
    expect(url).toContain('location=116.4%2C39.9')
  })

  it('普通省份：city 为字符串时原样使用', async () => {
    withKey()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            status: '1',
            regeocode: {
              formatted_address: '广东省深圳市南山区',
              addressComponent: { province: '广东省', city: '深圳市', district: '南山区' },
            },
          }),
        }) as unknown as Response,
      ),
    )
    const r = await reverseGeocode(113.9, 22.5)
    expect(r?.province).toBe('广东省')
    expect(r?.city).toBe('深圳市')
  })

  it('字段缺失时给空串而不是 undefined（消费侧不必到处判空）', async () => {
    withKey()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({ ok: true, status: 200, json: async () => ({ status: '1', regeocode: {} }) }) as unknown as Response,
      ),
    )
    const r = await reverseGeocode(116.4, 39.9)
    expect(r).not.toBeNull()
    for (const k of ['province', 'city', 'district', 'township', 'street', 'streetNumber', 'formatted'] as const) {
      expect(typeof r?.[k], `${k} 应为字符串`).toBe('string')
    }
  })
})

describe('reverseGeocode · 失败一律返回 null（不抛）', () => {
  it('没有 REST key → null，且不发请求', async () => {
    // ENV_KEYS 在模块加载时就捕获了 VITE_AMAP_KEY，所以必须在**清空环境变量后重新加载模块**
    // 才能真正模拟"未配置 key"的场景（本机 .env.local 里是有真实 key 的）
    vi.stubEnv('VITE_AMAP_KEY', '')
    vi.resetModules()
    const mod = await import('@/components/amap/amap-service')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await mod.reverseGeocode(116.4, 39.9)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('坐标非法 → null，不发请求', async () => {
    withKey()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect(await reverseGeocode(0, 0)).toBeNull() // (0,0) 是占位值
    expect(await reverseGeocode(200, 39)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('HTTP 非 2xx → null', async () => {
    withKey()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response))
    expect(await reverseGeocode(116.4, 39.9)).toBeNull()
  })

  it('高德业务失败（status !== "1"，如无权限/超限）→ null', async () => {
    withKey()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: '0', info: 'INVALID_USER_KEY' }) }) as unknown as Response),
    )
    expect(await reverseGeocode(116.4, 39.9)).toBeNull()
  })

  it('网络异常 → null（不把异常抛给调用方）', async () => {
    withKey()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))
    expect(await reverseGeocode(116.4, 39.9)).toBeNull()
  })
})
