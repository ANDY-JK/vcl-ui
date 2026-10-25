// `sqlite-store.mjs` 的类型声明（逻辑在 .mjs；写法对齐 `server.d.mts` / `scripts/theme-pure.d.mts`）。
//
// 第 111 轮补：上一轮加了 SQLite 存储层但没补签名，宿主在 TS 里 import 时只能拿到 any。

import type { LowcodeStore } from './server.mjs'

/** 一个迁移步骤：`version` 从 1 开始且连续；`sql` 只做加法（加表/加列/加索引） */
export interface Migration {
  version: number
  sql: string
}

/** 迁移列表（只增不改）。宿主想验证"旧库能升级"时可以直接用它构造老版本库 */
export const MIGRATIONS: Migration[]

/** 读当前已应用到的 schema 版本（没有 `schema_version` 表时返回 0） */
export function readSchemaVersion(db: import('node:sqlite').DatabaseSync): number

/** 把库升到最新版本（每版本一个事务）；返回应用前后的版本与本次实际应用的版本号 */
export function migrate(db: import('node:sqlite').DatabaseSync): {
  from: number
  to: number
  applied: number[]
}

/**
 * SQLite 存储层：零依赖（`node:sqlite`），与内存版语义一致，另带 schema 迁移与 `rev` 乐观锁。
 *
 * `file` 省略 = 内存库（测试用）；传路径 = 落盘（重启后数据还在）。
 */
export function createSqliteStore(
  file?: string,
): LowcodeStore & {
  /** 底层句柄：按业务字段查数据时直接用（如 `json_extract(data,'$.amount')` 聚合） */
  raw: import('node:sqlite').DatabaseSync
  close(): void
}
