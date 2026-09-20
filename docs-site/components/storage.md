# 存储（storage）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。


## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `storageSet` | — |
| `storageGet` | — |
| `storageDelete` | — |
| `storageHas` | — |
| `dbPut` | 在任意 store 中存入数据（store 不存在则自动创建） |
| `dbGet` | 从任意 store 中读取数据 |
| `dbDelete` | 从任意 store 中删除数据 |
| `dbHas` | 检查 key 是否存在 |
| `dbGetAll` | 获取任意 store 中的全部数据（可选 key 前缀过滤） |
| `dbKeys` | 列出任意 store 中的全部 key |
| `dbCount` | 统计任意 store 中的有效条目数 |
| `dbClear` | 清空任意 store |
| `dbBatch` | 批量事务操作：单次 IDB 事务保证原子性 |
| `createBackend` | — |
| `validateStorageConfig` | 本地后端是唯一零配置选项；supabase / s3 各自必填项缺一不可 |
| `sanitizeObjectKeyPart` | — |
| `storage` | — |
| `setCloudAdapter` | 注入/移除云端 KV 适配器。传 null 关闭云端能力（退化为纯本地）。 |
| `createSupabaseKVAdapter` | 工厂：创建可注入 setCloudAdapter 的 Supabase KV 适配器 |
| `SupabaseKVAdapter` | 基于同一 bucket 的 KV 适配器（get/set/remove，值 JSON 序列化）。 |
| `SupabaseTransport` | — |
| `REQUEST_TIMEOUT_MS` | — |

---

