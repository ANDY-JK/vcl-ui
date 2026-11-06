/**
 * sqlite 能力探针（TD-22 收口）
 *
 * 背景：`node:sqlite` 仍是 Node 的**实验性** API —— 形态可能随版本变化，
 * 而 `sqlite-store.mjs` 直接 `import { DatabaseSync } from 'node:sqlite'`，
 * 一旦 API 变动，报错会发生在 import 期（难定位），或更糟：运行时某个方法不存在。
 *
 * 本模块把"能不能用、用了哪些方法"变成**一次显式探测**：
 *   · `probeSqlite()`：真正 import + 建表/插入/查询/事务冒烟，返回结构化结论；
 *   · `assertSqliteUsable()`：不可用时抛出**带行动指引**的错误（锁 Node 版本或换 better-sqlite3）；
 *   · `SQLITE_API_SURFACE`：存储层实际用到的方法名清单（探针会逐个确认存在）。
 *
 * 为什么不用 try/catch 包住 import 了事：那只告诉你"坏了"，不告诉你"坏在哪、
 * 该锁版本还是该换库"。探针的输出可以直接贴进 issue。
 */

/** 存储层依赖的 node:sqlite API 面（增删需同步本清单与探针断言） */
export const SQLITE_API_SURFACE = Object.freeze({
  module: ['DatabaseSync'],
  instance: ['exec', 'prepare', 'close'],
  statement: ['get', 'all', 'run'],
})

/**
 * 探测 node:sqlite 可用性。
 * @returns {{ ok: boolean, node: string, note?: string, missing?: string[], smoke?: string }}
 */
export async function probeSqlite() {
  const node = process.versions.node
  let mod
  try {
    mod = await import('node:sqlite')
  } catch (e) {
    return {
      ok: false,
      node,
      note: `node:sqlite 不可用（${e?.message ?? e}）—— 需要 Node 22.5+；参考后端请换 Node 版本或改用 better-sqlite3`,
    }
  }
  const missing = []
  for (const name of SQLITE_API_SURFACE.module) {
    if (typeof mod[name] !== 'function') missing.push(`module.${name}`)
  }
  if (missing.length) {
    return { ok: false, node, note: 'node:sqlite 缺导出', missing }
  }
  // 实例/语句方法面：用一次真实冒烟确认（比只看 typeof 可靠）
  let db
  try {
    db = new mod.DatabaseSync(':memory:')
    for (const name of SQLITE_API_SURFACE.instance) {
      if (typeof db[name] !== 'function') missing.push(`db.${name}`)
    }
    db.exec('CREATE TABLE probe (id TEXT PRIMARY KEY, n INTEGER NOT NULL)')
    const ins = db.prepare('INSERT INTO probe (id, n) VALUES (?, ?)')
    for (const name of SQLITE_API_SURFACE.statement) {
      if (typeof ins[name] !== 'function') missing.push(`stmt.${name}`)
    }
    ins.run('a', 1)
    db.prepare('INSERT INTO probe (id, n) VALUES (?, ?)').run('b', 2)
    const got = db.prepare('SELECT id FROM probe ORDER BY n DESC').all()
    const one = db.prepare('SELECT n FROM probe WHERE id = ?').get('a')
    db.exec('BEGIN')
    db.prepare('UPDATE probe SET n = ? WHERE id = ?').run(9, 'a')
    db.exec('COMMIT')
    const after = db.prepare('SELECT n FROM probe WHERE id = ?').get('a')
    db.close()
    if (got.length !== 2 || got[0].id !== 'b' || one.n !== 1 || after.n !== 9) {
      return { ok: false, node, note: `冒烟结果异常：${JSON.stringify({ got, one, after })}` }
    }
    if (missing.length) return { ok: false, node, missing }
    return { ok: true, node, smoke: 'create/insert/select/transaction 全通' }
  } catch (e) {
    try {
      db?.close()
    } catch {
      /* 关不掉不影响结论 */
    }
    return { ok: false, node, note: `冒烟抛错：${e?.message ?? e}`, missing }
  }
}

/**
 * 同步守卫：确认 db 实例与语句对象的方法面齐全（供 createSqliteStore 入口调用）。
 * 走静态 import 的 DatabaseSync，因此"模块不存在"在 import 期就会崩 —— 这里管的是
 * "模块在但方法没了/改名了"这一类形态漂移。
 */
export function assertSqliteSurface(db, stmt) {
  const missing = []
  for (const name of SQLITE_API_SURFACE.instance) {
    if (typeof db?.[name] !== 'function') missing.push(`db.${name}`)
  }
  if (stmt) {
    for (const name of SQLITE_API_SURFACE.statement) {
      if (typeof stmt?.[name] !== 'function') missing.push(`stmt.${name}`)
    }
  }
  if (missing.length) {
    throw new Error(
      `node:sqlite 的 API 面已变（缺：${missing.join(', ')}）。请：①锁 Node 版本（≥22.5，建议 LTS 22/24）；` +
        `②或改用 better-sqlite3（同为 ${SQLITE_API_SURFACE.instance.length + SQLITE_API_SURFACE.statement.length} 个方法）。`,
    )
  }
}

/** 不可用时抛出带行动指引的错误；可用时原样返回探测结论 */
export async function assertSqliteUsable() {
  const r = await probeSqlite()
  if (!r.ok) {
    const detail = r.missing?.length ? `（缺：${r.missing.join(', ')}）` : `（${r.note ?? ''}）`
    throw new Error(
      `node:sqlite 不可用${detail}。参考后端要落 SQLite 请：①锁 Node 版本（≥22.5，建议 LTS 22/24）；` +
        `②或改用 better-sqlite3（API 面同为 ${SQLITE_API_SURFACE.instance.length + SQLITE_API_SURFACE.statement.length} 个方法）。`,
    )
  }
  return r
}
