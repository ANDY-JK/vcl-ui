// @vitest-environment node
/**
 * storage-config-persist 的 SSR 守卫自测（#376）
 *
 * ## 缺陷回顾
 *
 * 读路径（loadPersistedStorageConfig）在组件 setup 期有 `typeof localStorage` 守卫，
 * **写路径（persistStorageConfig）没有** —— SSR 下用户在存储面板点"保存"会直接
 * ReferenceError（调用方守卫只包了 setup 期那次读）。
 *
 * ## 测法（为什么用 node 环境而不是 stubGlobal）
 *
 * `ssr-guard` 的 `isBrowser` 是 **import 期求值的模块常量**，`vi.stubGlobal` 改不了它；
 * 本仓默认环境又是 happy-dom（预置了 window/localStorage）。所以"无浏览器"分支只能在
 * **没有 happy-dom 的进程**里测 —— 行内注释 `@vitest-environment node` 让 vitest 按文件
 * 决定环境，模块链从加载起就见不到 window。真实浏览器行为由既有
 * storage-config-redact.spec（happy-dom）覆盖。
 */
import { describe, it, expect } from 'vitest'
import { persistStorageConfig, loadPersistedStorageConfig } from '@/components/form-builder/storage-config-persist'
import { defaultStorageConfigFromEnv, type StorageConfig } from '@/components/storage/contract-storage'

describe('storage-config-persist · SSR 守卫（node 环境，无 window/localStorage）', () => {
  const s3Config: StorageConfig = {
    backend: 's3',
    url: '',
    anonKey: '',
    bucket: 'my-bucket',
    endpoint: 'https://my-bucket.s3.bitiful.net',
    region: 'us-east-1',
    accessKeyId: 'AKID-example',
    secretAccessKey: 'SUPER-SECRET-VALUE',
  }

  it('**无 localStorage：写路径静默跳过、读路径走默认，都不抛**（此前写路径会 ReferenceError）', () => {
    expect(typeof localStorage).toBe('undefined')
    expect(() => persistStorageConfig(s3Config)).not.toThrow()
    expect(typeof localStorage).toBe('undefined') // 写路径没把 localStorage 造出来
    const cfg = loadPersistedStorageConfig()
    expect(cfg.backend).toBe(defaultStorageConfigFromEnv().backend)
  })

  it('**读路径在无 localStorage 时返回的是完整 env 默认而不是半残对象**', () => {
    expect(loadPersistedStorageConfig()).toEqual(defaultStorageConfigFromEnv())
  })
})
