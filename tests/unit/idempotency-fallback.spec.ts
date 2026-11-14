// createIdempotencyKey 的**降级路径**（#478）
//
// 为什么单独测：happy-dom 与现代浏览器都有 `crypto.randomUUID`，所以主路径
// （randomUUID）永远被覆盖 —— 而**降级路径**（只有 getRandomValues / 完全没有
// crypto）只在老 WebView、非安全上下文、SSR 里才会走到。
//
// 上一轮看覆盖率时 `idempotency.ts` 行覆盖 47%、未覆盖 24–37 行，正是这三段。
// 这类代码的坏处是**静默**：降级后如果两次提交撞同一个键，服务端会把两次不同的
// 提交判成重复 —— 用户表现为"表单提交了但数据没进去"，且极难复现。
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  createIdempotencyKey,
  makeIdempotencyKey,
  setIdempotencyKeyFactory,
} from '@/components/form-builder/idempotency'

/** 备份 globalThis.crypto，测完还原 */
const realCrypto = globalThis.crypto

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', { value: realCrypto, configurable: true, writable: true })
  vi.restoreAllMocks()
})

/** 造一个"只有 getRandomValues、没有 randomUUID"的 crypto */
function cryptoWithGetRandomValuesOnly(): Crypto {
  return {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i + 1
      return arr
    },
  } as unknown as Crypto
}

describe('createIdempotencyKey · 降级到 getRandomValues', () => {
  it('没有 randomUUID 时用 getRandomValues，产出 32 位十六进制', () => {
    Object.defineProperty(globalThis, 'crypto', { value: cryptoWithGetRandomValuesOnly(), configurable: true })
    const k = createIdempotencyKey()
    expect(k).toMatch(/^[0-9a-f]{32}$/)
  })

  it('getRandomValues 路径下不同次仍不撞车（随机源被调用了）', () => {
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256)
      return arr
    })
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues } as unknown as Crypto,
      configurable: true,
    })
    const set = new Set(Array.from({ length: 500 }, () => createIdempotencyKey()))
    expect(getRandomValues).toHaveBeenCalled()
    expect(set.size).toBe(500)
  })
})

describe('createIdempotencyKey · 完全没有 crypto', () => {
  it('落到时间戳 + 随机数的兜底，形状是「时间戳-两段随机」', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    const k = createIdempotencyKey()
    expect(k).toMatch(/^[a-z0-9]+-[a-z0-9]+[a-z0-9]+$/)
    expect(k.length).toBeGreaterThan(10)
  })

  it('兜底路径下不同次不撞车（这是降级的最低要求）', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    const set = new Set(Array.from({ length: 2000 }, () => createIdempotencyKey()))
    expect(set.size).toBe(2000)
  })

  it('crypto 存在但 randomUUID 抛异常 → 也要落到兜底而不是崩掉', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: () => {
          throw new Error('boom')
        },
        getRandomValues: undefined,
      } as unknown as Crypto,
      configurable: true,
    })
    // 不能抛：幂等键生成失败会让整个提交流程挂掉，比降级更糟
    expect(() => createIdempotencyKey()).not.toThrow()
    expect(createIdempotencyKey().length).toBeGreaterThan(10)
  })
})

describe('makeIdempotencyKey · 宿主自定义生成器', () => {
  afterEach(() => setIdempotencyKeyFactory(null))

  it('配了 factory 就用它', () => {
    setIdempotencyKeyFactory(() => 'trace-abc-123')
    expect(makeIdempotencyKey()).toBe('trace-abc-123')
  })

  it('传 null 恢复默认实现', () => {
    setIdempotencyKeyFactory(() => 'fixed')
    setIdempotencyKeyFactory(null)
    expect(makeIdempotencyKey()).not.toBe('fixed')
    expect(makeIdempotencyKey().length).toBeGreaterThan(8)
  })

  it('**factory 抛异常 → 退回默认实现，不能把异常抛给调用方**', () => {
    // 幂等键只是个辅助请求头。宿主给的生成器坏了（traceId 服务挂了两行代码），
    // 不该让用户的表单提交整个失败 —— 那是"为了埋点把业务搞挂"。
    setIdempotencyKeyFactory(() => {
      throw new Error('traceId service down')
    })
    let key = ''
    expect(() => {
      key = makeIdempotencyKey()
    }).not.toThrow()
    expect(key.length).toBeGreaterThan(8)
  })

  it('factory 返回空串 → 也退回默认实现（空请求头等于没有幂等键）', () => {
    setIdempotencyKeyFactory(() => '')
    expect(makeIdempotencyKey().length).toBeGreaterThan(8)
  })

  it('factory 返回纯空白 → 同样退回默认实现（`" "` 是个假键，比空串更阴）', () => {
    setIdempotencyKeyFactory(() => '   ')
    const k = makeIdempotencyKey()
    expect(k.length).toBeGreaterThan(8)
    expect(k.trim()).toBe(k)
    expect(k).not.toBe('   ')
  })

  it('factory 返回非字符串（宿主用 JS 传参，没有类型保护）→ 退回默认实现', () => {
    // 类型是摆设：宿主可能 `() => undefined` / `() => 42`，不该把 number 当请求头值
    setIdempotencyKeyFactory(() => undefined as unknown as string)
    expect(makeIdempotencyKey().length).toBeGreaterThan(8)
    setIdempotencyKeyFactory(() => 42 as unknown as string)
    expect(makeIdempotencyKey().length).toBeGreaterThan(8)
  })

  it('factory 返回值首尾空白 → 去掉空白后原样使用（不是丢给默认实现）', () => {
    setIdempotencyKeyFactory(() => '  trace-x-9  ')
    expect(makeIdempotencyKey()).toBe('trace-x-9')
  })
})
