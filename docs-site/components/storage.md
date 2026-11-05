# 存储（storage）

> 本页由 `npm run gen:docs` 从源码自动生成，请勿手改；改源码后重新生成（`check:docs` 闸口会卡漂移）。


## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| `storageSet` | 轻量写入 —— token、标记、小配置。同步，不阻塞。 |
| `storageGet` | 轻量读取 —— 自动判过期 |
| `storageDelete` | 轻量删除 |
| `storageHas` | 检查 key 是否存在且未过期 |
| `dbPut` | 在任意 store 中存入数据（store 不存在则自动创建） |
| `dbGet` | 从任意 store 中读取数据 |
| `dbDelete` | 从任意 store 中删除数据 |
| `dbHas` | 检查 key 是否存在 |
| `dbGetAll` | 获取任意 store 中的全部数据（可选 key 前缀过滤） |
| `dbKeys` | 列出任意 store 中的全部 key |
| `dbCount` | 统计任意 store 中的有效条目数 |
| `dbClear` | 清空任意 store |
| `dbBatch` | 批量事务操作：单次 IDB 事务保证原子性 |
| `createBackend` | 存储后端工厂：按 cfg.backend（local/s3/supabase）装配对应实现（本地缓存 + 云端对账），onSyncError 接收单文件同步失败 |
| `validateStorageConfig` | 本地后端是唯一零配置选项；supabase / s3 各自必填项缺一不可 |
| `normalizeForBackend` | 把配置收敛成**只带当前后端字段**的形态（其余后端字段一律置空串）。 |
| `sanitizeObjectKeyPart` | 把任意文件名/键名转成可作 Supabase 对象键的 ASCII 形式（导出供测试/复用）。 |
| `getSlotFile` | 读某照片位的文件（兼容：'contract' 位回退到旧 contract 字段） |
| `setSlotFile` | 设置某照片位文件（file 为空 = 删除该位）；返回新 state（immutable） |
| `allSlotsFilled` | 全部照片位是否都已收齐 |
| `defaultStorageConfigFromEnv` | 环境变量默认配置：仅开发期生效。S3 兼容（缤纷云等）配齐则优先 → Supabase 配齐次之 → 本地 |
| `validateSupabaseConfig` | 校验 Supabase 配置：返回可读错误文案，合法返回 null（#438：从 storage 域入口导出） |
| `storage` | 统一存储门面：声明意图、自动路由后端（localStorage / 云端），业务侧只与它对话 |
| `setCloudAdapter` | 注入/移除云端 KV 适配器。传 null 关闭云端能力（退化为纯本地）。 |
| `createSupabaseKVAdapter` | 工厂：创建可注入 setCloudAdapter 的 Supabase KV 适配器 |
| `SupabaseKVAdapter` | 基于同一 bucket 的 KV 适配器（get/set/remove，值 JSON 序列化）。 |
| `SupabaseTransport` | Supabase Storage 传输层：上传/下载/对账（对象键经 sanitizeObjectKeyPart 的 ASCII 形式） |
| `REQUEST_TIMEOUT_MS` | 云端存储单次请求的超时上限 —— Supabase 与 S3 两个传输层共用。 |

---

