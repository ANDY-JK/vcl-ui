// #479：脚本注入失败后，协调器不许把「已初始化」锁死
//
// 症状：AmapWidget / RouteMap 在 setup 里调 `amapLoader.ensureInit(...)`。
// 旧实现先 `initialized = true`、再 `loadScript(...)`；loadScript 一抛异常，
// 组件这次挂载失败，而协调器已经"记账成功"——之后每次挂载都命中 `if (initialized) return`，
// 地图永久空白，连 `setAmapKeys()` 都只回一句「需刷新页面」。
// 事实上此时根本没有 SDK，重试才是对的（高德 SDK 不能热换 key，但**能**重试失败的加载）。
import { describe, it, expect, vi } from 'vitest'
import { createAmapLoader } from '@/components/amap/amap-loader'

describe('amap-loader · 加载失败的记账时机（#479）', () => {
  it('loadScript 抛异常 → 不置 initialized，下一次 ensureInit 能重试', () => {
    const loadScript = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('script inject failed')
      })
      .mockImplementation(() => {})
    const loader = createAmapLoader({ loadScript })

    expect(() => loader.ensureInit('key-A')).toThrow('script inject failed')
    expect(loader.isInitialized()).toBe(false)
    // 没初始化 → key 变更不该谎报「需要刷新页面」
    expect(loader.onKeyChanged('key-B')).toBe(false)

    loader.ensureInit('key-A')
    expect(loadScript).toHaveBeenCalledTimes(2)
    expect(loader.isInitialized()).toBe(true)
  })

  it('连抛两次 → 两次都不记账，第三次成功后才锁死（幂等仍成立）', () => {
    const loadScript = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('fail#1')
      })
      .mockImplementationOnce(() => {
        throw new Error('fail#2')
      })
      .mockImplementation(() => {})
    const loader = createAmapLoader({ loadScript })

    expect(() => loader.ensureInit('key-A')).toThrow('fail#1')
    expect(() => loader.ensureInit('key-A')).toThrow('fail#2')
    expect(loader.isInitialized()).toBe(false)

    loader.ensureInit('key-B')
    loader.ensureInit('key-C')
    expect(loadScript).toHaveBeenCalledTimes(3)
    expect(loadScript.mock.calls[2][0].key).toBe('key-B')
    expect(loader.isInitialized()).toBe(true)
  })

  it('成功后仍幂等：失败重试成功也不会重复注入', () => {
    const loadScript = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('transient')
      })
      .mockImplementation(() => {})
    const loader = createAmapLoader({ loadScript })

    expect(() => loader.ensureInit('key-A')).toThrow('transient')
    loader.ensureInit('key-A')
    loader.ensureInit('key-A')
    expect(loadScript).toHaveBeenCalledTimes(2)
  })

  it('空 key 不初始化、不锁死：宿主异步拉到配置后能补上', () => {
    const loadScript = vi.fn()
    const loader = createAmapLoader({ loadScript })

    loader.ensureInit('')
    expect(loadScript).not.toHaveBeenCalled()
    expect(loader.isInitialized()).toBe(false)
    expect(loader.onKeyChanged('key-late')).toBe(false)

    loader.ensureInit('key-late')
    expect(loadScript).toHaveBeenCalledTimes(1)
    expect(loadScript.mock.calls[0][0]).toEqual({
      key: 'key-late',
      version: '2.0',
      plugins: ['AMap.ToolBar', 'AMap.Scale'],
    })
  })
})
