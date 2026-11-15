/**
 * 整链并发闸口（#514）—— 「环境忙」和「用例失败」必须分开报。
 *
 * ## 起因（实测）
 *
 * 2026-11-15 一轮整链在第 39 步 `test:unit` 红，报的是「用例失败」；翻日志才发现真相是：
 *
 * ```
 * Error: The coverage report directory "…/reports/coverage" is already in use by
 * another Vitest process (pid 48600). Running coverage for multiple Vitest processes
 * in the same directory at the same time is not supported, because they would delete
 * each other's reports.
 * ```
 *
 * 也就是**另一个 Vitest 进程正在同目录跑覆盖率**。两个后果都很贵：
 *
 * 1. 报错位置骗人：`test:unit` 红 ≠ 有用例红 —— 排查方向直接跑偏；
 * 2. 失败留痕会**污染真源**：`gen:facts` 的「单测文件数/用例数」取自最近一次成功留痕，
 *    而这次失败把 `reports/quality-check-latest.json` 写成了 `failedStep: 39`，
 *    于是真源退化成 `_未测（最近没有整链留痕）_`，与正文里的数字不再一致 →
 *    `check:facts` 假红。
 *
 * ## 两道判据
 *
 * - **A. 锁**：整链开跑前写 `reports/.quality-check.lock`（含 pid/head/时间）。
 *   若锁已存在且 pid 还活着 → 直接报「环境忙」并 exit 3，**不启动任何步骤**
 *   （两个整链并发只会互相破坏覆盖目录，跑下去毫无意义）。持有者进程已死 → 视为陈旧锁，接管。
 * - **B. 错误分类**：某步失败后，若它的日志里出现 vitest 的覆盖目录占用文案，
 *   判定为 `envBusy`：**不覆盖**权威留痕（写进 `quality-check-busy.json`），
 *   并把终端提示改成「环境忙，不是用例失败」。
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'

/** 锁文件路径（相对仓库根） */
export const LOCK_PATH = 'reports/.quality-check.lock'
/** 环境忙时另写的留痕（不覆盖 quality-check-latest.json） */
export const BUSY_REPORT_PATH = 'reports/quality-check-busy.json'
/**
 * 锁的存活上限（4 小时）。
 *
 * 整链实测 20~31 分钟、快链约 5 分钟 —— 4 小时远超任何正常时长，
 * 只用来兜住"pid 被系统回收后锁永久挡路"这种极端情况（见 `isStale`）。
 */
export const LOCK_TTL_MS = 4 * 60 * 60 * 1000
/**
 * 复入标记：外层（整链）持锁后把它写进子进程环境，
 * 于是链内的 `npm run test:unit` 不会再抢一次自己的锁（父子进程 pid 不同，光靠 pid 认不出）。
 */
export const LOCK_ENV = 'VCL_QA_LOCK_OWNER'

/**
 * pid 是否还活着。
 *
 * 注意 `EPERM`：进程存在但不属于当前用户时 `kill(pid, 0)` 抛 EPERM —— 那**也是活着**，
 * 不能当死锁处理（否则会接管别人正在用的覆盖目录，正是要防的场景）。
 */
export function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/**
 * 读锁。返回 `{ pid, head, startedAt }` 或 `null`（没锁 / 内容坏了都算没锁 ——
 * 坏锁不能永久阻塞整链，但它会被下一次 acquire 覆盖掉）。
 */
export function readLock(lockPath) {
  try {
    const raw = readFileSync(lockPath, 'utf8')
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    return {
      pid: Number(obj.pid),
      head: typeof obj.head === 'string' ? obj.head : '',
      startedAt: typeof obj.startedAt === 'string' ? obj.startedAt : '',
    }
  } catch {
    return null
  }
}

/**
 * 尝试拿锁。
 *
 * 接管条件（满足任一即接管，并在返回值里说明从谁手里接管）：
 * - 持有者 pid 已死（进程崩了/被杀了，锁没来得及删）；
 * - 锁**超龄**（`startedAt` 早于 `ttlMs`）—— 防 pid 被系统回收后"活着的别人"永久占锁。
 *
 * @returns `{ ok: true, tookOverFrom? }` 拿到；`{ ok: false, holder }` 被活着的进程占着
 */
export function acquireLock(
  lockPath,
  { pid = process.pid, head = '', now = new Date().toISOString(), ttlMs = LOCK_TTL_MS } = {},
) {
  const held = readLock(lockPath)
  if (held && held.pid !== pid && isAlive(held.pid) && !isStale(held, now, ttlMs)) {
    return { ok: false, holder: held }
  }
  writeFileSync(lockPath, JSON.stringify({ pid, head, startedAt: now }, null, 2), 'utf8')
  const tookOverFrom = held && held.pid !== pid ? held : undefined
  return tookOverFrom ? { ok: true, tookOverFrom } : { ok: true }
}

/**
 * 锁是否超龄。
 *
 * 为什么需要：`isAlive` 只能证明"这个 pid 有人"，**证明不了"还是那个进程"** ——
 * pid 会被系统回收复用，于是一个早就崩掉、锁却没删的 pid 可能正好被别的进程占用，
 * 整链就会被一个不相干的进程永久挡住。超过 TTL 就按陈旧处理（并在调用处打印接管信息，
 * 让人知道"这次是强行接管的"）。
 */
export function isStale(holder, now = new Date().toISOString(), ttlMs = LOCK_TTL_MS) {
  if (!holder?.startedAt) return false // 时间缺失时不敢判超龄，仍按 pid 活判
  const started = Date.parse(holder.startedAt)
  const current = Date.parse(now)
  if (Number.isNaN(started) || Number.isNaN(current)) return false
  return current - started > ttlMs
}

/**
 * 释放锁。**只删自己的锁**（pid 不匹配就留着）——否则并发场景里后完成的那个
 * 会把别人正在用的锁删掉，闸口形同虚设。
 */
export function releaseLock(lockPath, pid = process.pid) {
  const held = readLock(lockPath)
  if (!held || held.pid !== pid) return false
  try {
    unlinkSync(lockPath)
    return true
  } catch {
    return false
  }
}

/**
 * 日志里是否出现「覆盖目录被别人占用」。
 *
 * ⚠️ 必须**先把换行压平**再匹配：vitest 的原话是折行的 ——
 * ```
 * Error: The coverage report directory "…/reports/coverage" is already in use by
 * another Vitest process (pid 48600). …
 * ```
 * 逐行匹配会漏（`already in use by` 与 `another` 分别在两行）—— 这条判据的
 * 第一版就是这么绿的，被用例当场抓到。
 */
export function detectEnvBusy(text) {
  if (typeof text !== 'string' || !text) return null
  const flat = text.replace(/\s+/g, ' ')
  if (!/already in use by another\s+vitest process/i.test(flat)) return null
  const pidRaw = /\(pid\s+(\d+)\)/i.exec(flat)?.[1]
  const start = flat.search(/coverage report directory/i)
  return {
    reason: 'coverage-dir-in-use',
    pid: pidRaw ? Number(pidRaw) : null,
    detail: flat.slice(Math.max(0, start), Math.max(0, start) + 180).trim(),
  }
}

/** 给终端看的「环境忙」提示（统一口径，别每个调用点各写一份） */
export const ENV_BUSY_HINT = [
  '这不是用例失败：另一个 Vitest 进程正在同目录跑覆盖率，两个进程会互删报告。',
  '等它跑完再重跑整链；若确认那个进程早已退出，删掉 reports/.quality-check.lock 即可。',
  '注意：本次不覆盖 reports/quality-check-latest.json（权威留痕保持上一次成功结果），',
  '      失败内容写到 reports/quality-check-busy.json。',
].join('\n')
