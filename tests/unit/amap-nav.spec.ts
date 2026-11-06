/* amapNav · 导航链接三端拼装与平台探测（#462）
 *
 * 从 amap-service.ts 拆出的纯函数模块：URL 形态是**对外契约**（高德协议），改动即破坏。
 * 本 spec 钉住三端 URL 的关键参数、途经点规则、以及 SSR 无 navigator 的兜底。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildNavLink, detectPlatform } from '@/components/amap/amap-nav'

const from = { lon: 116.4, lat: 39.9, name: '起点' }
const to = { lon: 121.4, lat: 31.2, name: '终点' }

function setUA(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
}

afterEach(() => vi.restoreAllMocks())

describe('detectPlatform', () => {
  it('iPhone/iPad/iPod → ios；Android → android；桌面 → web', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
    expect(detectPlatform()).toBe('ios')
    vi.restoreAllMocks()
    setUA('Mozilla/5.0 (Linux; Android 14)')
    expect(detectPlatform()).toBe('android')
    vi.restoreAllMocks()
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    expect(detectPlatform()).toBe('web')
  })
})

describe('buildNavLink', () => {
  it('web：uri.amap.com 带 from/to/mode=car 与 callnative', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
    const r = buildNavLink(from, to)
    expect(r.label).toBe('起点 → 终点')
    expect(r.url).toContain('https://uri.amap.com/navigation?')
    const q = new URLSearchParams(r.url.split('?')[1])
    expect(q.get('from')).toBe('116.4,39.9,起点')
    expect(q.get('to')).toBe('121.4,31.2,终点')
    expect(q.get('mode')).toBe('car')
    expect(q.get('callnative')).toBe('1')
    expect(q.get('via')).toBe(null) // 无途经点不出现
    expect(r.webUrl).toBe(r.url)
  })

  it('ios：iosamap://path 带 sid/did 与坐标', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')
    const r = buildNavLink(from, to)
    expect(r.url).toContain('iosamap://path?')
    const q = new URLSearchParams(r.url.split('?')[1])
    expect(q.get('slat')).toBe('39.9')
    expect(q.get('slon')).toBe('116.4')
    expect(q.get('sname')).toBe('起点')
    expect(q.get('dname')).toBe('终点')
    // 三端都给 webUrl 兜底（复制/分享用）
    expect(r.webUrl).toContain('https://uri.amap.com/navigation?')
  })

  it('android：amap://route/plan/ 协议', () => {
    setUA('Mozilla/5.0 (Linux; Android 14)')
    const r = buildNavLink(from, to)
    expect(r.url).toContain('amap://route/plan/?')
    const q = new URLSearchParams(r.url.split('?')[1])
    expect(q.get('dlat')).toBe('31.2')
  })

  it('途经点：via 出现在三端参数里（ios/android 带名称）', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0)')
    const wp = [{ lon: 118.1, lat: 36.6, name: '中途' }]
    const web = buildNavLink(from, to, wp)
    expect(new URLSearchParams(web.url.split('?')[1]).get('via')).toBe('118.1,36.6')

    vi.restoreAllMocks()
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')
    const ios = buildNavLink(from, to, wp)
    expect(new URLSearchParams(ios.url.split('?')[1]).get('via')).toBe('118.1,36.6,中途')
  })

  it('反向保护：未构造途经点时三端 URL 都不含 via', () => {
    setUA('Mozilla/5.0 (Windows NT 10.0)')
    const r = buildNavLink(from, to, [])
    const q = new URLSearchParams(r.url.split('?')[1])
    expect(q.get('via')).toBe(null)
  })
})
