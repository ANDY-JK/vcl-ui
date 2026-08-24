import { describe, it, expect, vi } from 'vitest'
import { createAmapLoader } from '@/components/amap/amap-loader'

describe('amap-loader 协调器', () => {
  it('首次 ensureInit 用当前 key 初始化', () => {
    const loadScript = vi.fn()
    const loader = createAmapLoader({ loadScript })
    loader.ensureInit('key-A')
    expect(loadScript).toHaveBeenCalledTimes(1)
    expect(loadScript.mock.calls[0][0].key).toBe('key-A')
  })

  it('重复 ensureInit 不重复初始化（幂等）', () => {
    const loadScript = vi.fn()
    const loader = createAmapLoader({ loadScript })
    loader.ensureInit('key-A')
    loader.ensureInit('key-B')
    expect(loadScript).toHaveBeenCalledTimes(1)
    expect(loader.isInitialized()).toBe(true)
  })

  it('初始化前 key 变更：后续 ensureInit 用最新 key', () => {
    const loadScript = vi.fn()
    const loader = createAmapLoader({ loadScript })
    loader.onKeyChanged('key-A')
    loader.onKeyChanged('key-B')
    loader.ensureInit('key-C')
    expect(loadScript).toHaveBeenCalledTimes(1)
    expect(loadScript.mock.calls[0][0].key).toBe('key-C')
  })

  it('初始化后 key 变更：返回需刷新提示（SDK 已加载无法热换）', () => {
    const loadScript = vi.fn()
    const loader = createAmapLoader({ loadScript })
    loader.ensureInit('key-A')
    const hint = loader.onKeyChanged('key-B')
    // 不重新加载（幂等），但返回提示告知需刷新
    expect(loadScript).toHaveBeenCalledTimes(1)
    expect(hint).toBe(true)
  })
})
