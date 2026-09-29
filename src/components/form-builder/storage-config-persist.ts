/**
 * 存储配置的持久化（FormTargetCollect 专用）——落盘脱敏与加载兼容
 *
 * 为什么单独成模块（F3，2026-09-30）：StorageConfig 的 secretAccessKey 是明文凭据，
 * 整份 JSON.stringify 写 localStorage 会把 SK 的泄漏面从「本会话内存」扩大到「磁盘」——
 * 同源扩展插件、共用电脑、浏览器配置备份都读得到。故落盘前剥离 SK，其余字段照存；
 * 加载端容忍 SK 缺失（脱敏落盘的合法形态），endpoint/region/bucket/AK 照常恢复，
 * SK 由用户在面板重填后生效。Supabase 的 anonKey 属公开密钥（见 FormCloudConfig 注释），按设计照存。
 */
import {
  validateStorageConfig,
  defaultStorageConfigFromEnv,
  type StorageConfig,
} from '@/components/storage/contract-storage'

const CONFIG_KEY = 'form-target-collect-storage-config'

/** 明文凭据字段：落盘前剥离。新增凭据字段时必须进这个表，否则又回到整份落盘 */
const REDACT_KEYS: readonly (keyof StorageConfig)[] = ['secretAccessKey']

/** 落盘脱敏副本（不改动传入对象；会话内生效配置仍持有完整值） */
export function redactForPersist(cfg: StorageConfig): StorageConfig {
  const out = { ...cfg }
  for (const k of REDACT_KEYS) delete out[k]
  return out
}

/** 持久化（组件侧已做 typeof localStorage 守卫，本模块假定浏览器环境） */
export function persistStorageConfig(cfg: StorageConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(redactForPersist(cfg)))
}

/**
 * 读取落盘配置。校验口径与面板保存一致，仅对 s3 的 SK 网开一面：
 * 用占位值补齐让「其余字段是否填全」可验，返回的 cfg 里 SK 仍是空串——
 * 上传会因签名无效失败走既有错误提示，而不是静默把用户切回 local 后端丢掉整套云端配置。
 */
export function loadPersistedStorageConfig(): StorageConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const cfg = { secretAccessKey: '', ...(JSON.parse(raw) as Partial<StorageConfig>) } as StorageConfig
      const valid =
        cfg.backend === 'local' ||
        (cfg.backend === 'supabase' && !validateStorageConfig(cfg)) ||
        (cfg.backend === 's3' &&
          !validateStorageConfig({ ...cfg, secretAccessKey: cfg.secretAccessKey || 'session-redacted' }))
      if (valid) return cfg
    }
  } catch {
    /* 损坏配置走默认 */
  }
  return defaultStorageConfigFromEnv()
}
