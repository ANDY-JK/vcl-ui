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
 * ⚠️ 这是**参考实现**：有 schema 版本与迁移（见 MIGRATIONS）、有记录级乐观锁（rev），
 * 但仍没有连接池、没有多进程写协调。上线前请按 README 的"上线前要补的"小节补齐其余几件。
 */
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { ConflictError } from './store-errors.mjs'
import { assertSqliteSurface } from './sqlite-capability.mjs'

/**
 * **迁移列表**：只增不改。每一项是一个版本，按 `version` 升序应用，已应用过的跳过。
 *
 * 为什么要有：没有迁移的库只能"删库重建"，而真实用户的数据不能删。
 * 升级路径必须是**可重复执行且幂等**的（migrate 会记住已到哪个版本）。
 *
 * 规矩：
 *  · 每项 `sql` 只做**加法**（加列/加表/加索引），不要在里面改语义或删列；
 *  · 新的结构变更追加到末尾，**不要动已有项**（已上线的库已经按老内容迁移过了）；
 *  · `version` 从 1 开始、必须连续。
 */
export const MIGRATIONS = [
  {
    version: 1,
    sql: `
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
`,
  },
  {
    // v2：记录级 + 表单级的乐观锁版本号。老数据统一从 1 起（它们本来就没版本概念）
    version: 2,
    sql: `
ALTER TABLE forms   ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;
ALTER TABLE records ADD COLUMN rev INTEGER NOT NULL DEFAULT 1;
`,
  },
]

/** 建 `schema_version` 表（若没有），返回当前已应用到的版本号 */
export function readSchemaVersion(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)')
  return db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version').get().v
}

/**
 * 把库升到最新版本：**每个版本一个事务**，失败即回滚（不会留下半迁移状态）。
 * 返回 `{ from, to, applied }`，便于启动日志与测试断言。
 */
export function migrate(db) {
  const from = readSchemaVersion(db)
  const applied = []
  for (const m of MIGRATIONS) {
    if (m.version <= from) continue
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(m.version)
      db.exec('COMMIT')
      applied.push(m.version)
    } catch (err) {
      db.exec('ROLLBACK')
      // 带上 cause：迁移失败时**原始 SQL 错误**才是排障线索，包一层就把现场丢了
      throw new Error(`迁移到 v${m.version} 失败：${err?.message ?? err}`, { cause: err })
    }
  }
  return { from, to: readSchemaVersion(db), applied }
}

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
  // TD-22：立刻确认实例方法面还在（实验性 API，形态可能变）——
  // 缺方法时报"锁 Node 版本 / 换 better-sqlite3"，而不是等到某次 prepare 才崩。
  assertSqliteSurface(db)
  // WAL：读写并发更稳（内存库下是空操作）；同步模式 NORMAL 兼顾安全与吞吐
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  migrate(db)

  const meta = (r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at, collectKey: r.collect_key, rev: r.rev })
  const FORM_COLUMNS = 'id, name, updated_at, collect_key, rev'

  /**
   * 乐观锁检查：调用方带了 `expectedRev` 才检查（不带 = 老语义"后写覆盖"）。
   * 冲突时抛 `ConflictError`，由 HTTP 层映射成 409 —— 存储层不关心 HTTP。
   */
  function assertRev(actual, expectedRev, what) {
    if (expectedRev === undefined || expectedRev === null) return
    if (actual !== expectedRev) {
      throw new ConflictError(`${what} 已被别人改过（当前 rev=${actual}，你带的是 ${expectedRev}）`, { rev: actual })
    }
  }

  return {
    async listForms() {
      // ORDER BY rowid = 创建顺序（内存版是 Map 的插入顺序，更新不改变位置）
      return db.prepare(`SELECT ${FORM_COLUMNS} FROM forms ORDER BY rowid`).all().map(meta)
    },

    async loadForm(id) {
      const row = db.prepare('SELECT design FROM forms WHERE id = ?').get(id)
      return row ? (parseJson(row.design) ?? null) : null
    },

    async saveForm(id, design, name, expectedRev) {
      const key = id || `form_${randomUUID()}`
      const prev = db.prepare('SELECT name, collect_key, rev FROM forms WHERE id = ?').get(key)
      // 覆盖已有表单时才可能有冲突；新建没有"别人改过"这回事
      if (prev) assertRev(prev.rev, expectedRev, `表单 ${key}`)
      const rec = {
        id: key,
        name: name || design?.meta?.title || prev?.name || key,
        updatedAt: new Date().toISOString(),
        collectKey: prev?.collect_key || `fd_collect_${key}`,
        rev: (prev?.rev ?? 0) + 1,
      }
      db.prepare(
        `INSERT INTO forms (id, name, updated_at, collect_key, design, rev) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, updated_at = excluded.updated_at, design = excluded.design, rev = excluded.rev`,
      ).run(rec.id, rec.name, rec.updatedAt, rec.collectKey, JSON.stringify(design ?? null), rec.rev)
      return rec
    },

    async renameForm(id, name, expectedRev) {
      const prev = db.prepare('SELECT rev FROM forms WHERE id = ?').get(id)
      if (!prev) return
      assertRev(prev.rev, expectedRev, `表单 ${id}`)
      db.prepare('UPDATE forms SET name = ?, updated_at = ?, rev = rev + 1 WHERE id = ?').run(
        name,
        new Date().toISOString(),
        id,
      )
    },

    async deleteForm(id, expectedRev) {
      const row = db.prepare('SELECT collect_key, rev FROM forms WHERE id = ?').get(id)
      if (!row) return
      // 删除最不可逆：带了 rev 就必须匹配。校验放在事务**之前** ——
      // 否则会先删掉记录、再发现版本不对，回滚之外还得解释"为什么删了一半"
      assertRev(row.rev, expectedRev, `表单 ${id}`)
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
        .prepare('SELECT id, time, data, rev FROM records WHERE collect_key = ? ORDER BY seq DESC')
        .all(storageKey)
        .map((r) => {
          const rec = { id: r.id, time: r.time, rev: r.rev }
          const data = parseJson(r.data)
          // 内存版里 data 可能是 undefined → JSON 化后字段消失；这里保持"消失"而不是变成 null
          if (data !== undefined) rec.data = data
          return rec
        })
    },

    async appendRecord(storageKey, record) {
      db.prepare('INSERT INTO records (collect_key, id, time, data, rev) VALUES (?, ?, ?, ?, 1)').run(
        storageKey,
        record.id,
        record.time,
        record.data === undefined ? null : JSON.stringify(record.data),
      )
    },

    async updateRecord(storageKey, recordId, data, expectedRev) {
      const prev = db
        .prepare('SELECT rev FROM records WHERE collect_key = ? AND id = ?')
        .get(storageKey, recordId)
      // 记录不存在时保持老语义（静默无操作）：上游可能刚把它删了
      if (!prev) return
      assertRev(prev.rev, expectedRev, `记录 ${storageKey}/${recordId}`)
      db.prepare('UPDATE records SET data = ?, rev = rev + 1 WHERE collect_key = ? AND id = ?').run(
        data === undefined ? null : JSON.stringify(data),
        storageKey,
        recordId,
      )
    },

    async removeRecord(storageKey, recordId, expectedRev) {
      const row = db
        .prepare('SELECT rev FROM records WHERE collect_key = ? AND id = ?')
        .get(storageKey, recordId)
      if (row) assertRev(row.rev, expectedRev, `记录 ${storageKey}/${recordId}`)
      db.prepare('DELETE FROM records WHERE collect_key = ? AND id = ?').run(storageKey, recordId)
    },

    async clearRecords(storageKey, expectedCount) {
      // 整表清空没有"单条版本"可比 → 用**条数**当护栏（与内存版同一判据、同一个错误类型，
      // 否则两个存储实现会在"清空"这件事上给出不同结论）
      if (expectedCount !== undefined && expectedCount !== null) {
        const n = db.prepare('SELECT COUNT(*) AS n FROM records WHERE collect_key = ?').get(storageKey).n
        if (n !== expectedCount) {
          throw new ConflictError(
            `${storageKey} 的记录数已变（当前 ${n} 条，你带的是 ${expectedCount} 条）`,
            { rev: n },
          )
        }
      }
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