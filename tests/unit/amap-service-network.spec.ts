/**
 * amap-service 网络路径 — fetchPoiDetail / getDrivingRoute / geocodeCalc / 平台检测
 *
 * ## 为什么补（711 行，语句 64.7% / 分支 55% / 函数 76.5%，81 行未覆盖）
 *
 * 既有 `amap-service.spec.ts` **只测纯函数**（坐标校验/归一化/球面距离/导航链接），
 * `amap-nearby-paging` / `amap-photo-batching` / `amap-reverse-geocode` 各测一条支线。
 * 剩下 4 个网络型函数几乎为空，而它们正是用户可感的三条主链路：
 *
 * ① **`fetchOnce` / `safeFetch`**——15s 超时 + **一次 800ms 退避重试**。重试的存在理由
 *    写在注释里：批量解析 `batchResolveCoordinates` 会把失败项**永久标成 none**，
 *    一次网络抖动就会让门店坐标永久丢失——所以"重试一次"不是优化而是数据正确性防线。
 * ② **`getDrivingRoute`**——驾车路线（含途经点），三段错误语义各不相同：
 *    没 key（`driveRouteNoKey`，配置问题）、`infocode !== '10000'`（高德业务错误，
 *    原样抛出）、网络异常（`driveRouteNetwork` 并带 `cause`，便于上层区分重试）。
 *    再把 `steps[].polyline`（`"lon,lat;lon,lat"`）解析成坐标数组。
 * ③ **`geocodeCalc`**——**三级重试阶梯**：`门店名+地址` → 只 `地址` → `地址+门店名`，
 *    触发条件有两类：解析不出坐标（无效）、或解析出的点**距目标 > 700m**（偏离）；
 *    且最终在多个成功结果里取**距离最近**的一个。这套阶梯是「地址解析准确率」的核心。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useT } from '@/components/_internal/i18n'
import {
  fetchPoiDetail,
  searchNearby,
  getDrivingRoute,
  geocodeCalc,
  detectPlatform,
  setAmapKey,
  calcDistance,
} from '@/components/amap/amap-service'

/* ═══════════ 工具 ═══════════ */

/** i18n 文案：用于断言「抛的是业务错误还是网络错误」 */
const t18n = useT()

/** 造一个最小 Response（只用到 ok / json） */
function resp(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

const GOOD = '10000'

/** 记录每次请求的 URL */
let urls: string[]
let fetchMock: ReturnType<typeof vi.fn>

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  fetchMock = vi.fn((url: string, init?: RequestInit) => impl(url, init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const urlOf = (i: number) => new URL(urls[i]!)

beforeEach(() => {
  urls = []
  setAmapKey('test-key') // 避免 getAmapRestKey 的空 key 告警噪音
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/* ═══════════ detectPlatform ═══════════ */

describe('detectPlatform 平台检测', () => {
  const ua = (s: string) => {
    Object.defineProperty(navigator, 'userAgent', { value: s, configurable: true })
  }

  it('**iOS：iPhone / iPad / iPod 三种 UA 都识别**', () => {
    for (const s of [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X)',
    ]) {
      ua(s)
      expect(detectPlatform(), s.slice(0, 30)).toBe('ios')
    }
  })

  it('**Android**', () => {
    ua('Mozilla/5.0 (Linux; Android 14; Pixel 8)')
    expect(detectPlatform()).toBe('android')
  })

  it('**桌面浏览器 → web**', () => {
    ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')
    expect(detectPlatform()).toBe('web')
  })

  it('**无 navigator（SSR/Worker）→ web 兜底**', () => {
    vi.stubGlobal('navigator', undefined)
    expect(detectPlatform(), '不能抛 ReferenceError').toBe('web')
  })
})

/* ═══════════ fetchPoiDetail ═══════════ */

describe('fetchPoiDetail POI 详情', () => {
  const detail = {
    infocode: GOOD,
    pois: [
      {
        name: '门店A',
        address: '北京市海淀区某路1号',
        type: '餐饮服务;中餐厅',
        typecode: '050100',
        photos: [{ title: '门头', url: 'https://img/1.jpg' }],
      },
    ],
  }

  it('**成功：字段原样透传**（name/address/type/typecode/photos）', async () => {
    stubFetch(async (u) => {
      urls.push(u)
      return resp(detail)
    })
    const out = await fetchPoiDetail('POI-1')
    expect(out).toEqual({
      photos: detail.pois[0]!.photos,
      type: '餐饮服务;中餐厅',
      typecode: '050100',
      address: '北京市海淀区某路1号',
      name: '门店A',
    })
  })

  it('**请求 URL 带 key 且 id 经 encodeURIComponent**', async () => {
    stubFetch(async (u) => {
      urls.push(u)
      return resp(detail)
    })
    await fetchPoiDetail('POI/1 &x=2')
    const q = urlOf(0)
    expect(q.pathname).toBe('/v5/place/detail')
    expect(q.searchParams.get('key')).toBe('test-key')
    expect(q.searchParams.get('id'), '特殊字符被编码且服务端解码后一致').toBe('POI/1 &x=2')
  })

  it('**pois 为空数组 → null**', async () => {
    stubFetch(async () => resp({ infocode: GOOD, pois: [] }))
    expect(await fetchPoiDetail('X')).toBeNull()
  })

  it('**pois 缺失 → null**', async () => {
    stubFetch(async () => resp({ infocode: GOOD }))
    expect(await fetchPoiDetail('X')).toBeNull()
  })

  it('**json() 抛错 → null**（不向外抛）', async () => {
    stubFetch(async () => ({ ok: true, json: async () => { throw new Error('bad json') } }) as never)
    expect(await fetchPoiDetail('X')).toBeNull()
  })
})

/* ═══════════ safeFetch 重试 / fetchOnce 超时 ═══════════ */

describe('safeFetch 退避重试与 fetchOnce 超时', () => {
  it('**首次失败 → 800ms 后重试一次并成功**（抖动被吃掉）', async () => {
    vi.useFakeTimers()
    let n = 0
    stubFetch(async () => {
      n++
      if (n === 1) throw new TypeError('network down')
      return resp({ infocode: GOOD, pois: [{ name: 'N', address: 'A', type: 't', typecode: 'c' }] })
    })

    const p = fetchPoiDetail('X')
    await vi.advanceTimersByTimeAsync(799)
    expect(n, '799ms 还没重试（证明退避就是 800ms）').toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    const out = await p
    expect(n, '800ms 后重试，共 2 次请求').toBe(2)
    expect(out?.name, '重试拿到结果').toBe('N')
  })

  it('**两次都失败 → 最终仍返回 null**（不无限重试）', async () => {
    vi.useFakeTimers()
    let n = 0
    stubFetch(async () => {
      n++
      throw new TypeError('down')
    })
    const p = fetchPoiDetail('X')
    await vi.advanceTimersByTimeAsync(800)
    expect(await p).toBeNull()
    expect(n, '恰好重试一次（不是指数退避也不是循环）').toBe(2)
  })

  it('**请求挂起时 15s 后 AbortSignal 被 abort**（超时兜底真的生效）', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    // ⚠️ fetch 必须**永不 settle**：若立即返回，finally 的 clearTimeout 会先把
    // 超时定时器清掉，signal 就永远不会被 abort（首版即踩此坑，断言失败）。
    stubFetch(
      (_u, init) =>
        new Promise<Response>(() => {
          signal = init?.signal as AbortSignal
        }),
    )
    void fetchPoiDetail('X').catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(signal, '传了 signal').toBeTruthy()
    expect(signal!.aborted, '未到 15s 不应已中止').toBe(false)
    // 精确卡在 14999ms：任何把超时改小（1000/14000）的变异体都会在此翻车
    await vi.advanceTimersByTimeAsync(14999)
    expect(signal!.aborted, '14999ms 仍未中止（证明超时值就是 15000）').toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(signal!.aborted, '正好 15000ms 被 abort').toBe(true)
  })

  it('**正常返回后会清掉超时定时器**（不留悬挂 timer）', async () => {
    vi.useFakeTimers()
    stubFetch(async (_u, _init) => {
      // 立即返回 → finally 应 clearTimeout
      return resp({ infocode: GOOD, pois: [] })
    })
    await fetchPoiDetail('X')
    expect(vi.getTimerCount(), '定时器已清空').toBe(0)
  })
})

/* ═══════════ getDrivingRoute ═══════════ */

describe('getDrivingRoute 驾车路线', () => {
  it('**无 key → 抛 driveRouteNoKey**（配置问题，不是网络问题）', async () => {
    // ⚠️ 这个分支**不能靠 setAmapKey('') 构造**，有两道坎：
    //   ① getKeys() 是 `_override.restKey || ENV_KEYS.restKey`，空串 falsy → 回落 env；
    //   ② ENV_KEYS 是**模块加载时求值**的模块级常量，vi.stubEnv 对已导入模块无效
    //      （本机 VITE_AMAP_KEY 配了真 key，所以运行时永远拿得到 key）。
    // 唯一可行路径：清空 env → resetModules → **重新导入**，让 ENV_KEYS 以空值求值。
    vi.stubEnv('VITE_AMAP_KEY', '')
    vi.resetModules()
    const fresh = await import('@/components/amap/amap-service')
    const spy = vi.fn(async () => resp({ infocode: GOOD }))
    vi.stubGlobal('fetch', spy)
    fresh.setAmapKey('') // override 空 + env 空 → 真的无 key
    await expect(fresh.getDrivingRoute([116.4, 39.9], [116.5, 39.9])).rejects.toThrow()
    // 与网络错误要能区分：没有 key 时**一次请求都不该发**
    expect(spy, '无 key 时不该发请求').not.toHaveBeenCalled()
  })

  it('**机制证明：ENV_KEYS 在模块加载时求值，stubEnv 对已导入模块无效**', async () => {
    // 这是一条「坑位说明」断言：amap-key 的 ENV_KEYS 是模块级常量，
    // import.meta.env 在加载时读取一次。所以：
    //   · 对**已导入**的模块 stubEnv **不生效** → 用的仍是本机真 key
    //   · 想改 env 影响 key，必须 resetModules + 重新 import（见上面「无 key」用例）
    vi.stubEnv('VITE_AMAP_KEY', 'env-key-should-win')
    const spy = vi.fn(async () => resp({ infocode: GOOD, route: { paths: [{ distance: '1', duration: '1' }] } }))
    vi.stubGlobal('fetch', spy)
    await getDrivingRoute([116.4, 39.9], [116.5, 39.9])
    const keyOfRun = new URL(spy.mock.calls[0]![0] as string).searchParams.get('key')!
    expect(keyOfRun, 'stubEnv 未影响到已加载的 ENV_KEYS').not.toBe('env-key-should-win')
    expect(keyOfRun.length, '用的是本机 env 里的真 key（只断言非空，不外传其值）').toBeGreaterThan(0)

    // 反面对照：重新导入后 stubEnv 生效 —— 证明差异来自「加载时求值」而非别的
    vi.resetModules()
    const fresh = await import('@/components/amap/amap-service')
    const spy2 = vi.fn(async () => resp({ infocode: GOOD, route: { paths: [{ distance: '1', duration: '1' }] } }))
    vi.stubGlobal('fetch', spy2)
    fresh.setAmapKey('')
    await fresh.getDrivingRoute([116.4, 39.9], [116.5, 39.9])
    expect(
      new URL(spy2.mock.calls[0]![0] as string).searchParams.get('key'),
      '重新加载后 stub 的 env 生效',
    ).toBe('env-key-should-win')
  })

  it('**成功：distance/duration 解析为数字，polyline 还原为坐标数组**', async () => {
    stubFetch(async (u) => {
      urls.push(u)
      return resp({
        infocode: GOOD,
        route: {
          paths: [
            {
              distance: '12345.6',
              duration: '1800.4',
              tolls: '15',
              // 刻意用 '7.9'：parseInt → 7、parseFloat → 7.9，可区分两者
              // （高德实际返回整数，此处是为锁定「取整」这一实现选择）
              traffic_lights: '7.9',
              steps: [{ polyline: '116.4,39.9;116.45,39.92' }, { polyline: '116.5,39.95' }],
            },
          ],
        },
      })
    })
    const r = await getDrivingRoute([116.4, 39.9], [116.5, 39.95])
    expect(r.distance, 'parseFloat 保留小数').toBe(12345.6)
    expect(r.duration).toBe(1800.4)
    expect(r.tolls).toBe(15)
    expect(r.traffic_lights, 'parseInt 取整（不是 parseFloat 的 7.9）').toBe(7)
    expect(r.polyline, '两步拼接，[lon,lat] 顺序').toEqual([
      [116.4, 39.9],
      [116.45, 39.92],
      [116.5, 39.95],
    ])
  })

  it('**无 steps / 空 polyline / 非法点都被跳过**（polyline 为空数组不报错）', async () => {
    stubFetch(async () =>
      resp({
        infocode: GOOD,
        route: {
          paths: [
            {
              distance: '1',
              duration: '2',
              steps: [{ polyline: '' }, {}, { polyline: 'abc,def;116.4,39.9' }],
            },
          ],
        },
      }),
    )
    const r = await getDrivingRoute([116.4, 39.9], [116.5, 39.9])
    expect(r.polyline, '只留合法点').toEqual([[116.4, 39.9]])
    expect(r.tolls, 'tolls 缺失 → undefined').toBeUndefined()
    expect(r.traffic_lights).toBeUndefined()
  })

  it('**steps 整体缺失 → polyline 空数组**', async () => {
    stubFetch(async () => resp({ infocode: GOOD, route: { paths: [{ distance: '5', duration: '6' }] } }))
    const r = await getDrivingRoute([116.4, 39.9], [116.5, 39.9])
    expect(r.polyline).toEqual([])
    expect(r.distance).toBe(5)
  })

  it('**distance/duration 非数字 → 归零**（parseFloat || 0）', async () => {
    // duration 用 'x'（不是 ''）：parseFloat('x')||0 → 0，而 Number('x') → NaN，
    // 这样才能把「用 parseFloat 还是 Number」这个变异体区分开
    stubFetch(async () => resp({ infocode: GOOD, route: { paths: [{ distance: 'x', duration: 'x' }] } }))
    const r = await getDrivingRoute([116.4, 39.9], [116.5, 39.9])
    expect(r.distance).toBe(0)
    expect(r.duration).toBe(0)
  })

  it('**infocode 非 10000 → 原样抛业务错误**（含 infocode，便于排查配额）', async () => {
    stubFetch(async () => resp({ infocode: '10003', route: { paths: [{ distance: '1', duration: '1' }] } }))
    await expect(getDrivingRoute([116.4, 39.9], [116.5, 39.9])).rejects.toThrow(/10003/)
  })

  it('**paths 为空 → 抛业务错误（不是网络错误）**', async () => {
    stubFetch(async () => resp({ infocode: GOOD, route: { paths: [] } }))
    const err = await getDrivingRoute([116.4, 39.9], [116.5, 39.9]).catch((e: Error) => e)
    // ⚠️ 只断言「抛了」是不够的：去掉 paths 校验后，path[0] 是 undefined，
    //    读 path.steps 会抛 TypeError 被外层 catch 兜住 → 仍会抛（只是变成网络错误）。
    //    所以必须断言「没有 cause」= 走的是显式业务错误分支。
    expect(err.message, '不是网络错误文案').not.toBe(t18n('amap.driveRouteNetwork'))
    expect(err.cause, '业务错误不带 cause').toBeUndefined()
  })

  it('**route 整体缺失 → 抛业务错误（不是网络错误）**', async () => {
    stubFetch(async () => resp({ infocode: GOOD }))
    const err = await getDrivingRoute([116.4, 39.9], [116.5, 39.9]).catch((e: Error) => e)
    expect(err.message).not.toBe(t18n('amap.driveRouteNetwork'))
    expect(err.cause, '业务错误不带 cause').toBeUndefined()
  })

  it('**网络异常 → 转成网络错误并保留 cause**（与业务错误区分）', async () => {
    vi.useFakeTimers()
    const boom = new TypeError('fetch failed')
    stubFetch(async () => {
      throw boom
    })
    const p = getDrivingRoute([116.4, 39.9], [116.5, 39.9])
    const assertion = expect(p).rejects.toMatchObject({ cause: boom })
    await vi.advanceTimersByTimeAsync(800)
    await assertion
  })

  it('**无途经点时 URL 不含 waypoints 参数**', async () => {
    stubFetch(async (u) => {
      urls.push(u)
      return resp({ infocode: GOOD, route: { paths: [{ distance: '1', duration: '1' }] } })
    })
    await getDrivingRoute([116.4, 39.9], [116.5, 39.9])
    expect(urlOf(0).searchParams.has('waypoints')).toBe(false)
    expect(urlOf(0).searchParams.get('origin'), 'origin = lon,lat').toBe('116.4,39.9')
    expect(urlOf(0).searchParams.get('destination')).toBe('116.5,39.9')
    expect(urlOf(0).searchParams.get('extensions')).toBe('all')
  })

  it('**多途经点 → waypoints 用分号连接**', async () => {
    stubFetch(async (u) => {
      urls.push(u)
      return resp({ infocode: GOOD, route: { paths: [{ distance: '1', duration: '1' }] } })
    })
    await getDrivingRoute(
      [116.4, 39.9],
      [116.8, 39.9],
      [
        [116.5, 39.91],
        [116.6, 39.92],
      ],
    )
    expect(urlOf(0).searchParams.get('waypoints')).toBe('116.5,39.91;116.6,39.92')
    expect(urlOf(0).pathname).toBe('/v5/direction/driving')
  })
})

/* ═══════════ geocodeCalc 三级重试阶梯 ═══════════ */

describe('geocodeCalc 地址解析重试阶梯', () => {
  const TARGET_LAT = 39.9
  const TARGET_LON = 116.4

  /** 按 keywords 返回坐标；记录查询顺序 */
  function stubByKeyword(map: Record<string, string | null>) {
    const queries: string[] = []
    stubFetch(async (u) => {
      urls.push(u)
      const kw = new URL(u).searchParams.get('keywords') ?? ''
      queries.push(kw)
      const loc = map[kw]
      return resp({ infocode: GOOD, pois: loc ? [{ location: loc }] : [] })
    })
    return queries
  }

  it('**首查命中且距离在 700m 内 → 只查一次，exceeded=false**', async () => {
    // 目标 (39.9,116.4)；给一个约 14m 外的点
    const queries = stubByKeyword({ '门店A 中关村大街1号': '116.4001,39.9001' })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries, '只查一次').toEqual(['门店A 中关村大街1号'])
    expect(r.distance, '约 14m，四舍五入到 0~20').toBeGreaterThanOrEqual(0)
    expect(r.distance).toBeLessThan(700)
    expect(r.exceeded).toBe(false)
    expect(r.amapLat).toBeCloseTo(39.9001, 6)
    expect(r.amapLon).toBeCloseTo(116.4001, 6)
  })

  it('**首查无坐标 → 退到「只用地址」**', async () => {
    const queries = stubByKeyword({ '中关村大街1号': '116.4001,39.9001' })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries, '第二级是纯地址').toEqual(['门店A 中关村大街1号', '中关村大街1号'])
    expect(r.exceeded).toBe(false)
  })

  it('**二级也无坐标 → 退到「地址 + 门店名」**', async () => {
    const queries = stubByKeyword({ '中关村大街1号 门店A': '116.4001,39.9001' })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries).toEqual(['门店A 中关村大街1号', '中关村大街1号', '中关村大街1号 门店A'])
    expect(r.exceeded).toBe(false)
  })

  it('**三级都无坐标 → 抛 invalidRouteResults**（不返回空结果冒充成功）', async () => {
    const queries = stubByKeyword({})
    await expect(
      geocodeCalc({
        address: '中关村大街1号',
        storeName: '门店A',
        targetLat: TARGET_LAT,
        targetLon: TARGET_LON,
      }),
    ).rejects.toThrow()
    expect(queries, '三级都试过').toHaveLength(3)
  })

  it('**首查命中但偏离 700m → 仍触发退避阶梯**（这是"偏离"而非"失败"）', async () => {
    // 首查给一个 100km 外的点 → distance > 700 → 继续退避
    const queries = stubByKeyword({
      '门店A 中关村大街1号': '117.4,40.9',
      '中关村大街1号': '116.4001,39.9001',
    })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries, '偏离也算触发条件').toEqual(['门店A 中关村大街1号', '中关村大街1号'])
    expect(r.distance, '最终取近的那个').toBeLessThan(700)
    expect(r.exceeded).toBe(false)
  })

  it('**三级都偏离 → 取距离最近的那个，exceeded=true**', async () => {
    // 三个都 > 700m，第三个最近
    const queries = stubByKeyword({
      '门店A 中关村大街1号': '118.0,41.0', // 最远
      '中关村大街1号': '117.0,40.0', // 次远
      '中关村大街1号 门店A': '116.42,39.9005', // 最近（约 1.8km）
    })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries).toHaveLength(3)
    const dBest = calcDistance(TARGET_LAT, TARGET_LON, 39.9005, 116.42)
    expect(r.distance, '取三者中最近').toBeCloseTo(dBest, 3)
    expect(r.exceeded, '仍超 700m').toBe(true)
    expect(r.amapLat).toBeCloseTo(39.9005, 6)
  })

  it('**坐标含 NaN → 视同无效并退避**（不是拿 NaN 去算距离）', async () => {
    const queries = stubByKeyword({
      '门店A 中关村大街1号': 'foo,bar', // parseFloat → NaN
      '中关村大街1号': '116.4001,39.9001',
    })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries, 'NaN 触发退避').toHaveLength(2)
    expect(Number.isNaN(r.distance)).toBe(false)
  })

  it('**(0,0) 占位坐标 → 视同无效**（isValidLatLon 拒绝，避免解析到赤道原点）', async () => {
    const queries = stubByKeyword({
      '门店A 中关村大街1号': '0,0',
      '中关村大街1号': '116.4001,39.9001',
    })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries, '(0,0) 不能当有效结果').toHaveLength(2)
    expect(r.amapLon).toBeCloseTo(116.4001, 6)
  })

  it('**三级都只返回 (0,0) 占位 → 仍抛错**（唯一能拦它的是 isValidLatLon）', async () => {
    // 关键：keywordSearch 对 '0,0' 会返回 {latitude:0, longitude:0}（非 null、非 NaN），
    // performQuery 的 null/NaN 两道检查都放行 → 只有 isValidLatLon 的 (0,0) 规则能拦。
    // 去掉该校验后，'0,0' 会被当成有效结果，最终返回 amapLat=0 而不是抛错。
    const queries = stubByKeyword({
      '门店A 中关村大街1号': '0,0',
      '中关村大街1号': '0,0',
      '中关村大街1号 门店A': '0,0',
    })
    await expect(
      geocodeCalc({
        address: '中关村大街1号',
        storeName: '门店A',
        targetLat: TARGET_LAT,
        targetLon: TARGET_LON,
      }),
    ).rejects.toThrow()
    expect(queries, '三级都试过').toHaveLength(3)
  })

  it('**中距（70~700m）→ exceeded=false**（阈值是 700 不是 70）', async () => {
    // 目标 (39.9,116.4)；约 330m 外的一个点（0.003 度纬度 ≈ 333m）
    const queries = stubByKeyword({ '门店A 中关村大街1号': '116.4,39.903' })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(r.distance, '约 330m').toBeGreaterThan(70)
    expect(r.distance).toBeLessThan(700)
    expect(queries, '未超 700m 不触发退避').toHaveLength(1)
    expect(r.exceeded, '70 < d < 700 → 不算超出').toBe(false)
  })

  it('**中远距（700m~7km）→ 仍触发退避**（阈值不是 7000）', async () => {
    // 约 1.1km 外（0.01 度纬度 ≈ 1.11km）
    const queries = stubByKeyword({
      '门店A 中关村大街1号': '116.4,39.91',
      '中关村大街1号': '116.4001,39.9001',
    })
    const r = await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(queries, '超 700m 就退避（即便不到 7km）').toHaveLength(2)
    expect(r.exceeded).toBe(false)
  })

  it('**city 参数透传到搜索请求**（避免同名地址匹配到外省）', async () => {
    const queries = stubByKeyword({ '门店A 中关村大街1号': '116.4001,39.9001' })
    await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
      city: '北京市',
    })
    expect(queries).toHaveLength(1)
    expect(urlOf(0).searchParams.get('city')).toBe('北京市')
  })

  it('**不带 city 时请求里没有 city 参数**', async () => {
    stubByKeyword({ '门店A 中关村大街1号': '116.4001,39.9001' })
    await geocodeCalc({
      address: '中关村大街1号',
      storeName: '门店A',
      targetLat: TARGET_LAT,
      targetLon: TARGET_LON,
    })
    expect(urlOf(0).searchParams.has('city')).toBe(false)
  })
})

/* ═══════════ searchNearby 分页与去重 ═══════════ */

describe('searchNearby 分页与去重', () => {
  const POI_PAGE_SIZE = 25

  /** 造 n 个命名的 POI 响应体项（location 必须非 0 才不被 parseAroundResp 过滤） */
  function pois(n: number, prefix: string, startIdx = 0) {
    return Array.from({ length: n }, (_, i) => ({
      name: prefix + (startIdx + i),
      address: 'addr',
      location: `116.${400 + startIdx + i},39.9`,
    }))
  }

  /** 按 (page, 是否有 types) 返回响应；记录请求 */
  function stubPages(map: Record<string, ReturnType<typeof pois>>) {
    const calls: { page: string | null; types: string | null }[] = []
    stubFetch(async (u) => {
      urls.push(u)
      const q = new URL(u).searchParams
      const page = q.get('page')
      const types = q.get('types')
      calls.push({ page, types })
      const list = map[`p${page}${types ? '-t' : ''}`] ?? []
      return resp({ infocode: GOOD, pois: list })
    })
    return calls
  }

  it('**第一页不满 25 → 不再请求第二页**（省一次调用）', async () => {
    const calls = stubPages({ p1: pois(3, 'a') })
    const out = await searchNearby(39.9, 116.4, 500)
    expect(out).toHaveLength(3)
    expect(calls, '只请求了一次').toHaveLength(1)
    expect(calls[0]!.page).toBe('1')
  })

  it('**第一页满 25 → 请求第二页并合并**', async () => {
    const calls = stubPages({ p1: pois(POI_PAGE_SIZE, 'a'), p2: pois(4, 'b', 100) })
    const out = await searchNearby(39.9, 116.4, 500)
    expect(calls.map((c) => c.page), '两页都请求了').toEqual(['1', '2'])
    expect(out, '25 + 4 合并').toHaveLength(POI_PAGE_SIZE + 4)
  })

  it('**恰好 24 条（差 1 条满页）→ 不翻页**（阈值就是 25）', async () => {
    const calls = stubPages({ p1: pois(POI_PAGE_SIZE - 1, 'a') })
    const out = await searchNearby(39.9, 116.4, 500)
    expect(calls, '只请求一次').toHaveLength(1)
    expect(out, '24 条').toHaveLength(POI_PAGE_SIZE - 1)
  })

  it('**跨页重复 POI 被去重**（第二页混入第一页已有项 → 不重复计入）', async () => {
    // 第一页 25 个 a0..a24；第二页故意放 3 个重复项 + 2 个新项
    const dup = pois(3, 'a') // 与第一页前 3 个同名同坐标
    const fresh = [
      { name: 'n1', address: 'x', location: '117.0,39.9' },
      { name: 'n2', address: 'x', location: '117.1,39.9' },
    ]
    stubPages({ p1: pois(POI_PAGE_SIZE, 'a'), p2: [...dup, ...fresh] })
    const out = await searchNearby(39.9, 116.4, 500)
    expect(out, '25 + 2（3 个重复被去重）').toHaveLength(POI_PAGE_SIZE + 2)
    expect(out.filter((p) => p.name.startsWith('a')), 'a 系列不重复').toHaveLength(POI_PAGE_SIZE)
  })

  it('**重复项即使出现在第二页也返回 false 分支**（去重键 = 名称+坐标）', async () => {
    // 同名但坐标不同 → 不去重（键含坐标）
    stubPages({
      p1: pois(POI_PAGE_SIZE, 'a'),
      p2: [{ name: 'a0', address: 'x', location: '118.0,40.0' }, ...pois(1, 'z', 200)],
    })
    const out = await searchNearby(39.9, 116.4, 500)
    expect(out.filter((p) => p.name === 'a0'), '同名不同坐标保留两条').toHaveLength(2)
  })

  it('**指定 types 时补一轮无 types 搜索**（types 会漏掉不匹配类别的 POI）', async () => {
    const calls = stubPages({ p1: pois(2, 't'), 'p1-t': pois(5, 'm') })
    const out = await searchNearby(39.9, 116.4, 500, '050000')
    // 顺序：types 的第一页 → 无 types 的第一页
    expect(calls.map((c) => (c.types ? 'with-types' : 'no-types'))).toEqual(['with-types', 'no-types'])
    expect(out).toHaveLength(7)
  })

  it('**types 页满 25 时也翻它的第二页**', async () => {
    const calls = stubPages({
      'p1-t': pois(POI_PAGE_SIZE, 'm'),
      'p2-t': pois(2, 'm', 300),
      p1: pois(1, 'x'),
    })
    const out = await searchNearby(39.9, 116.4, 500, '050000')
    expect(calls.map((c) => `p${c.page}${c.types ? '-t' : ''}`)).toEqual(['p1-t', 'p2-t', 'p1'])
    expect(out).toHaveLength(POI_PAGE_SIZE + 2 + 1)
  })

  it('**types 与无 types 两轮都满页时各翻两页**（共 4 次请求）', async () => {
    const calls = stubPages({
      'p1-t': pois(POI_PAGE_SIZE, 't'),
      'p2-t': pois(1, 't', 500),
      p1: pois(POI_PAGE_SIZE, 'n', 600),
      p2: pois(2, 'n', 700),
    })
    const out = await searchNearby(39.9, 116.4, 500, '050000')
    expect(calls.map((c) => 'p' + c.page + (c.types ? '-t' : ''))).toEqual(['p1-t', 'p2-t', 'p1', 'p2'])
    expect(out).toHaveLength(POI_PAGE_SIZE + 1 + POI_PAGE_SIZE + 2)
  })

  it('**无 types 轮次与 types 轮次之间也去重**（同一 POI 两轮都返回时只留一份）', async () => {
    const shared = { name: 'same', address: 'x', location: '116.5,39.9' }
    stubPages({ 'p1-t': [shared, ...pois(1, 'only-t', 400)], p1: [shared, ...pois(1, 'only-n', 500)] })
    const out = await searchNearby(39.9, 116.4, 500, '050000')
    expect(out, '共享项只留一份 → 3 条').toHaveLength(3)
    expect(out.filter((p) => p.name === 'same')).toHaveLength(1)
  })

  it('**radius 与 location 参数正确**（location 是 lon,lat 顺序）', async () => {
    stubPages({ p1: pois(1, 'a') })
    await searchNearby(39.9, 116.4, 777)
    const q = urlOf(0).searchParams
    expect(q.get('location'), 'lon 在前').toBe('116.4,39.9')
    expect(q.get('radius')).toBe('777')
    expect(q.get('offset'), 'offset 与分页判定同源（POI_PAGE_SIZE）').toBe(String(POI_PAGE_SIZE))
  })
})
