// #479 第二组：单例 + 模块级「key 变更订阅」的行为
//
// 为什么单独一个文件：`amap-loader.ts` 底部那段订阅是**模块加载期**执行的，
// 旧单测里永远只跑到 `createAmapLoader()` 工厂，订阅体（未初始化 → 自动补初始化、
// 已初始化 → 只报「需刷新」）一条都没被跑到 —— 覆盖率 68.18%，未覆盖行 72-83 正是它。
// 而这段恰恰是「空 key 不锁死」与「宿主异步 setAmapKeys」两条承诺的落脚点：
// 订阅坏了，宿主拿到配置后也**不会**自动补初始化，症状还是地图永久空白。
//
// 用 vi.mock 把三个外部依赖换成可观测桩；每例 `vi.resetModules()` 重新加载模块，
// 让单例状态和订阅注册都从头开始，用例之间不串状态。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AmapLoader } from '@/components/amap/amap-loader'

const H = vi.hoisted(() => {
  const initMock = vi.fn()
  const reportMock = vi.fn()
  let listener: ((keys: { jsKey?: string }) => void) | null = null
  return {
    initMock,
    reportMock,
    getListener: () => listener,
    setListener: (cb: ((keys: { jsKey?: string }) => void) | null) => {
      listener = cb
    },
  }
})

vi.mock('@vuemap/vue-amap', () => ({
  initAMapApiLoader: (c: unknown) => H.initMock(c),
}))

vi.mock('@/components/amap/amap-key', () => ({
  onAmapKeyChange: (cb: (keys: { jsKey?: string }) => void) => H.setListener(cb),
}))

vi.mock('@/components/_internal/runtime-observer', () => ({
  reportEvent: (...args: unknown[]) => H.reportMock(...args),
}))

let loader: AmapLoader

beforeEach(async () => {
  vi.resetModules()
  H.initMock.mockClear()
  H.reportMock.mockClear()
  H.setListener(null)
  loader = (await import('@/components/amap/amap-loader')).amapLoader
})

describe('amap-loader 单例 · 模块加载期订阅', () => {
  it('模块加载就订阅了 key 变更（否则宿主 setAmapKeys 无人接）', () => {
    expect(typeof H.getListener()).toBe('function')
  })

  it('未初始化时收到空 jsKey → 不加载、不锁死', () => {
    H.getListener()?.({ jsKey: '' })
    H.getListener()?.({})
    expect(H.initMock).not.toHaveBeenCalled()
    expect(loader.isInitialized()).toBe(false)
  })

  it('未初始化时收到 jsKey → 用该 key 自动补初始化', () => {
    H.getListener()?.({ jsKey: 'key-late' })
    expect(H.initMock).toHaveBeenCalledTimes(1)
    expect((H.initMock.mock.calls[0][0] as { key: string }).key).toBe('key-late')
    expect(loader.isInitialized()).toBe(true)
  })

  it('已初始化后换 key → 不重新加载，只报一次「需刷新」警告', () => {
    H.getListener()?.({ jsKey: 'key-late' })
    expect(H.initMock).toHaveBeenCalledTimes(1)

    H.getListener()?.({ jsKey: 'key-new' })
    expect(H.initMock).toHaveBeenCalledTimes(1) // SDK 无法热换 key，诚实不假装
    expect(H.reportMock).toHaveBeenCalledTimes(1)
    const [code, message, , level] = H.reportMock.mock.calls[0]
    expect(code).toBe('amap/key-swapped-after-init')
    expect(String(message)).toContain('刷新')
    expect(level).toBe('warn')
  })

  it('已初始化后收到**空** jsKey（清空配置）→ 不报警告、不重载', () => {
    H.getListener()?.({ jsKey: 'key-late' })
    H.reportMock.mockClear()
    H.getListener()?.({ jsKey: '' })
    expect(H.reportMock).not.toHaveBeenCalled()
    expect(H.initMock).toHaveBeenCalledTimes(1)
  })
})