// 存储配置落盘脱敏（F3，2026-09-30）——
// 断言「落盘 JSON 里不出现 secretAccessKey」与「脱敏形态可被加载端容忍恢复」，
// 防止后续把整份 cfg 直接 stringify 回写导致明文凭据重新落 localStorage。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  redactForPersist,
  persistStorageConfig,
  loadPersistedStorageConfig,
} from '@/components/form-builder/storage-config-persist'
import { emptyStorageConfig, type StorageConfig } from '@/components/storage/contract-storage'
import { envValue } from '@/components/_internal/env-guard'

vi.mock('@/components/_internal/env-guard', () => ({ envValue: vi.fn(() => undefined) }))

const CONFIG_KEY = 'form-target-collect-storage-config'

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

beforeEach(() => {
  localStorage.clear()
})

describe('redactForPersist（纯函数）', () => {
  it('剥离 secretAccessKey、其余字段原样保留，且不改动传入对象', () => {
    const out = redactForPersist(s3Config)
    expect('secretAccessKey' in out).toBe(false)
    expect(out.endpoint).toBe(s3Config.endpoint)
    expect(out.accessKeyId).toBe(s3Config.accessKeyId)
    expect(out.bucket).toBe(s3Config.bucket)
    // 会话内生效配置不受落盘脱敏影响
    expect(s3Config.secretAccessKey).toBe('SUPER-SECRET-VALUE')
  })

  it('supabase 配置不被脱敏波及（anonKey 属公开密钥，按设计照存）', () => {
    const supabase: StorageConfig = {
      ...emptyStorageConfig(),
      backend: 'supabase',
      url: 'https://x.supabase.co',
      anonKey: 'eyJ-public-anon',
      bucket: 'contracts',
    }
    const out = redactForPersist(supabase)
    expect(out.anonKey).toBe('eyJ-public-anon')
    expect(out.backend).toBe('supabase')
  })
})

describe('persistStorageConfig → localStorage', () => {
  it('落盘 JSON 不含 secretAccessKey（本测试即 F3 的回归锁）', () => {
    persistStorageConfig(s3Config)
    const raw = localStorage.getItem(CONFIG_KEY)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('SUPER-SECRET-VALUE')
    expect(raw).not.toContain('secretAccessKey')
    const parsed = JSON.parse(raw!) as Partial<StorageConfig>
    expect(parsed.endpoint).toBe(s3Config.endpoint)
  })
})

describe('loadPersistedStorageConfig（脱敏形态容忍）', () => {
  it('s3 配置缺 SK 时其余字段照常恢复、SK 为空串（不静默回退 local 丢配置）', () => {
    persistStorageConfig(s3Config)
    const loaded = loadPersistedStorageConfig()
    expect(loaded.backend).toBe('s3')
    expect(loaded.endpoint).toBe(s3Config.endpoint)
    expect(loaded.bucket).toBe(s3Config.bucket)
    expect(loaded.accessKeyId).toBe(s3Config.accessKeyId)
    expect(loaded.secretAccessKey).toBe('')
  })

  it('字段不齐/损坏 JSON 回退环境默认', () => {
    localStorage.setItem(CONFIG_KEY, '{broken json')
    expect(loadPersistedStorageConfig().backend).not.toBe('s3')
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ backend: 's3', endpoint: '' }))
    expect(loadPersistedStorageConfig().backend).not.toBe('s3')
  })

  it('无落盘记录回退环境默认（本测试环境无 VITE_* 值 → local）', () => {
    expect(loadPersistedStorageConfig().backend).toBe('local')
    expect(envValue).toHaveBeenCalled()
  })
})
