// #480：两类 Key 的「缺 Key 警告」共用一个棘轮 → 谁先调用谁独占
//
// 症状：宿主先打了一次 REST 接口（`getAmapRestKey()`），此时 Key 还没配 → 报
// `amap/rest-key-missing`；随后地图组件挂载、`getAmapJsKey()` 也是空，但共享的
// `_warned` 已被置位 —— **一句提示都不再出现**。用户看到的现象是"整块地图空白、
// 控制台只提了 REST Key"，而真正卡住的是 JS Key。两类 Key 的失败后果完全不同
// （地图空白 vs 服务端接口 401），提示却是同一个开关，等于把两种病因合并成一个。
//
// 这份 spec 同时是这个文件的**首份单测**（此前 amap-key.ts 70.4% 全靠间接调用碰到）。
import { describe, it, expect, vi, beforeEach } from 'vitest'

const H = vi.hoisted(() => {
  const reportMock = vi.fn()
  let envImpl: (key: string) => string | undefined = () => undefined
  return {
    reportMock,
    setEnv: (fn: (key: string) => string | undefined) => {
      envImpl = fn
    },
    envValue: (key: string) => envImpl(key),
  }
})

vi.mock('@/components/_internal/env-guard', () => ({
  envValue: (key: string) => H.envValue(key),
}))

vi.mock('@/components/_internal/runtime-observer', () => ({
  reportEvent: (...args: unknown[]) => H.reportMock(...args),
}))

type KeyMod = typeof import('@/components/amap/amap-key')
let k: KeyMod

/** 每个用例重新加载模块：`_override` / 警告棘轮 / 订阅集合都是模块级状态 */
async function freshModule(env: (key: string) => string | undefined = () => undefined): Promise<KeyMod> {
  vi.resetModules()
  H.reportMock.mockClear()
  H.setEnv(env)
  return import('@/components/amap/amap-key')
}

const codes = () => H.reportMock.mock.calls.map((c) => c[0] as string)

beforeEach(async () => {
  k = await freshModule()
})

describe('amap-key · 缺 Key 警告按种类分别棘轮（#480）', () => {
  it('先取 REST 再取 JS：两条警告都要出现（旧实现第二条被吞掉）', () => {
    expect(k.getAmapRestKey()).toBe('')
    expect(k.getAmapJsKey()).toBe('')
    expect(codes()).toEqual(['amap/rest-key-missing', 'amap/js-key-missing'])
  })

  it('先取 JS 再取 REST：同样两条都在', () => {
    expect(k.getAmapJsKey()).toBe('')
    expect(k.getAmapRestKey()).toBe('')
    expect(codes()).toEqual(['amap/js-key-missing', 'amap/rest-key-missing'])
  })

  it('同一类重复取：只警告一次（防刷屏棘轮仍成立）', () => {
    k.getAmapJsKey()
    k.getAmapJsKey()
    k.getAmapJsKey()
    expect(codes()).toEqual(['amap/js-key-missing'])
  })

  it('警告级别是 error、文案指名是哪一类 Key', () => {
    k.getAmapJsKey()
    const [, message, , level] = H.reportMock.mock.calls[0]
    expect(String(message)).toContain('JS API Key')
    expect(level).toBe('error')
  })
})

describe('amap-key · 设置与取值', () => {
  it('setAmapKey 同时设置 JS 与 REST，两个取值口都拿到它', () => {
    k.setAmapKey('key-1')
    expect(k.getAmapJsKey()).toBe('key-1')
    expect(k.getAmapRestKey()).toBe('key-1')
    expect(codes()).toEqual([]) // 有 key 就不该有缺失警告
  })

  it('setAmapKeys 部分覆盖：只改 restKey 时 jsKey 保持原值', () => {
    k.setAmapKey('shared')
    k.setAmapKeys({ restKey: 'rest-only' })
    expect(k.getAmapJsKey()).toBe('shared')
    expect(k.getAmapRestKey()).toBe('rest-only')
  })

  it('setAmapKey 不清掉已设置的 securityCode（两类 key 共用一个安全密钥）', () => {
    k.setAmapKeys({ securityCode: 'sec-9' })
    k.setAmapKey('key-1')
    expect(k.getAmapSecurityCode()).toBe('sec-9')
  })

  it('环境变量是默认值，运行时覆盖优先', async () => {
    const m = await freshModule((name) => (name === 'VITE_AMAP_KEY' ? 'env-key' : undefined))
    expect(m.getAmapJsKey()).toBe('env-key')
    m.setAmapKey('runtime-key')
    expect(m.getAmapJsKey()).toBe('runtime-key')
    expect(m.getAmapRestKey()).toBe('runtime-key')
  })

  it('已警告过之后才设置 Key：不会再有警告（棘轮不回滚）', () => {
    k.getAmapJsKey()
    k.setAmapKey('late-key')
    expect(k.getAmapJsKey()).toBe('late-key')
    expect(codes()).toEqual(['amap/js-key-missing'])
  })
})

describe('amap-key · 变更订阅', () => {
  it('setAmapKey / setAmapKeys 各通知一次，且带当前完整 Key 集合', () => {
    const seen: string[] = []
    k.onAmapKeyChange((keys) => seen.push(`${keys.jsKey}|${keys.restKey}`))
    k.setAmapKey('a')
    k.setAmapKeys({ restKey: 'b' })
    expect(seen).toEqual(['a|a', 'a|b'])
  })

  it('退订后不再收到通知（返回的函数就是退订器）', () => {
    const fn = vi.fn()
    const off = k.onAmapKeyChange(fn)
    k.setAmapKey('a')
    off()
    k.setAmapKey('b')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('订阅者抛异常不阻断其它订阅者，也不让 set 调用失败', () => {
    const good = vi.fn()
    k.onAmapKeyChange(() => {
      throw new Error('subscriber boom')
    })
    k.onAmapKeyChange(good)
    expect(() => k.setAmapKey('a')).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
    expect(k.getAmapJsKey()).toBe('a') // 覆盖已生效
  })
})