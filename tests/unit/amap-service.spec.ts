// amap-service 纯函数行为锁定测试
// 覆盖：坐标校验、中国经纬度归一化（互换纠正）、球面距离、平台检测、导航链接构建
import { describe, it, expect } from 'vitest'
import { isValidLatLon, normalizeChinaLatLon, calcDistance, detectPlatform, buildNavLink } from '@/components/amap/amap-service'

describe('isValidLatLon', () => {
  it('合法坐标通过', () => {
    expect(isValidLatLon(39.9, 116.4)).toBe(true)
    expect(isValidLatLon(-90, -180)).toBe(true)
    expect(isValidLatLon(90, 180)).toBe(true)
  })

  it('越界/NaN 拒绝', () => {
    expect(isValidLatLon(91, 0)).toBe(false)
    expect(isValidLatLon(0, 181)).toBe(false)
    expect(isValidLatLon(NaN, 0)).toBe(false)
  })
})

describe('normalizeChinaLatLon', () => {
  it('合法中国坐标原样返回', () => {
    expect(normalizeChinaLatLon(39.9, 116.4)).toEqual({ latitude: 39.9, longitude: 116.4 })
  })

  it('经纬度写反时自动互换纠正', () => {
    // 用户录入 (116.4, 39.9)——纬度写成经度
    expect(normalizeChinaLatLon(116.4, 39.9)).toEqual({ latitude: 39.9, longitude: 116.4 })
  })

  it('互换后仍非法返回 null', () => {
    // (999,999) 互换后仍越界 → null
    expect(normalizeChinaLatLon(999, 999)).toBeNull()
    // (0,0) 是合法坐标（虽不在中国范围）→ 不互换直接返回
    expect(normalizeChinaLatLon(0, 0)).toEqual({ latitude: 0, longitude: 0 })
  })
})

describe('calcDistance', () => {
  it('同点距离为 0', () => {
    expect(calcDistance(39.9, 116.4, 39.9, 116.4)).toBe(0)
  })

  it('北京到上海距离约 1000-1200km', () => {
    const d = calcDistance(39.9, 116.4, 31.2, 121.5)
    expect(d).toBeGreaterThan(1000000) // > 1000km
    expect(d).toBeLessThan(1300000) // < 1300km
  })

  it('距离对称（A→B = B→A）', () => {
    const d1 = calcDistance(39.9, 116.4, 31.2, 121.5)
    const d2 = calcDistance(31.2, 121.5, 39.9, 116.4)
    expect(Math.abs(d1 - d2)).toBeLessThan(1)
  })
})

describe('detectPlatform', () => {
  it('无 navigator 时返回 web', () => {
    expect(detectPlatform()).toBe('web') // happy-dom UA 非 ios/android
  })
})

describe('buildNavLink', () => {
  const from = { lon: 116.4, lat: 39.9, name: '起点' }
  const to = { lon: 121.5, lat: 31.2, name: '终点' }

  it('生成导航链接（webUrl + url）', () => {
    const link = buildNavLink(from, to)
    expect(link.webUrl).toContain('uri.amap.com/navigation')
    expect(link.url).toBeTruthy()
    expect(link.label).toBe('起点 → 终点')
  })

  it('途经点拼入链接', () => {
    const wp = { lon: 117.0, lat: 36.0, name: '中途' }
    const link = buildNavLink(from, to, [wp])
    expect(link.webUrl).toContain('via=')
    expect(link.url).toContain('via=')
  })
})
