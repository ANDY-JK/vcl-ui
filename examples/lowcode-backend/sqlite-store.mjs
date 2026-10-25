/**
 * **SQLite 存储层**（`node:sqlite`，Node 22.5+ 内置 → **零依赖**）—— 与 `createMemoryStore()` 同一契约。
 *
 * ## 它存在的理由
 *
 * 内存版只能证明"接口长什么样"；"**能不能真换成数据库**"要用**同一套契约测试跑两遍都绿**才算数。
 * 这份实现同时是**给宿主抄的模板**：把下面的 DDL 与 11 个方法体换成 MySQL/PG 的方言即可，
 * HTTP 层、鉴权、错误语义（401/403/400/413、裸载荷）一行都不用动。
 *
 * ## 用法
 *
 * ```bash
 * LOWCODE_DB=./lowcode.db LOWCODE_TOKEN=your-secret node examples/lowcode-backend/server.mjs
 * ```
 * 不设 `LOWCODE_DB` 时仍用内存版（重启即丢）—— 参考实现的默认行为不变。
 *
 * ## 表结构（两张表就够表达低代码的全部数据）
 *
 * ```
 * forms   (id PK, name, updated_at, collect_key, design)        design 存 JSON
 * records (seq PK AUTOINCREMENT, collect_key, id, time, data)  data   存 JSON
 * ```
 *
 * 两个刻意的设计点，与内存版**逐条对齐**（否则"换库"会换出行为差异）：
 *  1. **记录按"后写的在前"**：内存版是 `unshift`，这里用自增 `seq` 倒序 → 两版一致；
 *  2. **删表单连它的收集记录一起删**（`deleteForm` 用事务包住两条 DELETE）——
 *     否则那些记录永远无人可达，成为"孤儿数据"；
 *  3. `data` 为 NULL 时**不塞 `{}`**：内存版里 `data` 是 undefined，经 HTTP JSON 化后字段直接消失，
 *     这里也让它消失（返回对象里不带 `data`），保证前端看到的东西一样。
 *
 * ⚠️ 这是**参考实现**：没有迁移（migration）体系、没有连接池、没有多实例并发方案。
 * 上线前请按 README 的"上线前要补的五件事"补齐（持久化只是其中一件）。
 */
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS forms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  collect_key TEXT NOT NULL,
  design      TEXT
);
CREATE INDEX IF NOT EXISTS idx_forms_updated ON forms (updated_at DESC);

CREATE TABLE IF NOT EXISTS records (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  collect_key TEXT NOT NULL,
  id          TEXT NOT NULL,
  time        TEXT NOT NULL,
  data        TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_key_seq ON records (collect_key, seq DESC);
CREATE INDEX IF NOT EXISTS idx_records_key_id  ON records (collect_key, id);
`

/** JSON 解析失败不抛（表里的值可能被外部工具改坏）：当作"没有值" */
function parseJson(text) {
  if (text === null || text === undefined) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * @param {string} [file] 数据库文件路径；不传 = 内存库（测试用）
 */
export function createSqliteStore(file = ':memory:') {
  const db = new DatabaseSync(file)
  // WAL：读写并发更稳（内存库下是空操作）；同步模式 NORMAL 兼顾安全与吞吐
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(SCHEMA)

  const meta = (r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at, collectKey: r.collect_key })
  const FORM_COLUMNS = 'id, name, updated_at, collect_key'

  return {
    async listForms() {
      // ORDER BY rowid = 创建顺序（内存版是 Map 的插入顺序，更新不改变位置）
      return db.prepare(`SELECT ${FORM_COLUMNS} FROM forms ORDER BY rowid`).all().map(meta)
    },

    async loadForm(id) {
      const row = db.prepare('SELECT design FROM forms WHERE id = ?').get(id)
      return row ? (parseJson(row.design) ?? null) : null
    },

    async saveForm(id, design, name) {
      const key = id || `form_${randomUUID()}`
      const prev = db.prepare('SELECT name, collect_key FROM forms WHERE id = ?').get(key)
      const rec = {
        id: key,
        name: name || design?.meta?.title || prev?.name || key,
        updatedAt: new Date().toISOString(),
        collectKey: prev?.collect_key || `fd_collect_${key}`,
      }
      db.prepare(
        `INSERT INTO forms (id, name, updated_at, collect_key, design) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, updated_at = excluded.updated_at, design = excluded.design`,
      ).run(rec.id, rec.name, rec.updatedAt, rec.collectKey, JSON.stringify(design ?? null))
      return rec
    },

    async renameForm(id, name) {
      db.prepare('UPDATE forms SET name = ?, updated_at = ? WHERE id = ?').run(
        name,
        new Date().toISOString(),
        id,
      )
    },

    async deleteForm(id) {
      const row = db.prepare('SELECT collect_key FROM forms WHERE id = ?').get(id)
      if (!row) return
      // 事务：删表单与删它的记录要么都成、要么都不成（否则断在中间会留下孤儿记录）
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM records WHERE collect_key = ?').run(row.collect_key)
        db.prepare('DELETE FROM forms WHERE id = ?').run(id)
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
    },

    async loadRecords(storageKey) {
      return db
        .prepare('SELECT id, time, data FROM records WHERE collect_key = ? ORDER BY seq DESC')
        .all(storageKey)
        .map((r) => {
          const rec = { id: r.id, time: r.time }
          const data = parseJson(r.data)
          // 内存版里 data 可能是 undefined → JSON 化后字段消失；这里保持"消失"而不是变成 null
          if (data !== undefined) rec.data = data
          return rec
        })
    },

    async appendRecord(storageKey, record) {
      db.prepare('INSERT INTO records (collect_key, id, time, data) VALUES (?, ?, ?, ?)').run(
        storageKey,
        record.id,
        record.time,
        record.data === undefined ? null : JSON.stringify(record.data),
      )
    },

    async updateRecord(storageKey, recordId, data) {
      db.prepare('UPDATE records SET data = ? WHERE collect_key = ? AND id = ?').run(
        data === undefined ? null : JSON.stringify(data),
        storageKey,
        recordId,
      )
    },

    async removeRecord(storageKey, recordId) {
      db.prepare('DELETE FROM records WHERE collect_key = ? AND id = ?').run(storageKey, recordId)
    },

    async clearRecords(storageKey) {
      db.prepare('DELETE FROM records WHERE collect_key = ?').run(storageKey)
    },

    async stats() {
      const forms = db.prepare('SELECT COUNT(*) AS n FROM forms').get().n
      const records = db.prepare('SELECT COUNT(*) AS n FROM records').get().n
      return { forms, records }
    },

    /**
     * 底层句柄：低代码之外还要按**业务字段**查记录时直接用它
     * （例如"这个客户还有几张待办"），不必为每个查询再加一个 store 方法。
     */
    raw: db,

    /** 关库（进程退出、或测试里想验"重开后数据还在"时） */
    close() {
      db.close()
    },
  }
}