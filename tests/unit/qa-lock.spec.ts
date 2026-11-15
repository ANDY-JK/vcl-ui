// @vitest-environment node
/**
 * 整链并发闸口（#514）—— 「环境忙」与「用例失败」分开报。
 *
 * 起因见 `scripts/qa-lock.mjs` 头注释：一轮整链的红其实来自
 * `coverage report directory … is already in use by another Vitest process (pid 48600)`，
 * 却被报成「用例失败」，而且那次失败留痕把 `gen:facts` 的真源打成了
 * `_未测（最近没有整链留痕）_` → `check:facts` 假红。
 *
 * 这里只测纯逻辑（锁的读写/接管/只删自己的、日志分类），不真跑整链。
 * 真跑整链的验收在 `reports/quality-check-latest.json`。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { acquireLock, releaseLock, readLock, isAlive, isStale, detectEnvBusy, ENV_BUSY_HINT } from '../../scripts/qa-lock.mjs'

const dirs: string[] = []
function tmpLock() {
  const d = mkdtempSync(join(tmpdir(), 'qa-lock-'))
  dirs.push(d)
  return join(d, 'lock.json')
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('qa-lock · 锁的获取与接管（#514）', () => {
  it('没锁 → 拿到，并把 pid/head 写进去', () => {
    const p = tmpLock()
    const r = acquireLock(p, { pid: 12345, head: 'abcdef1', now: '2026-11-15T00:00:00.000Z' })
    expect(r.ok).toBe(true)
    const held = readLock(p)
    expect(held).toEqual({ pid: 12345, head: 'abcdef1', startedAt: '2026-11-15T00:00:00.000Z' })
  })

  it('**锁被活着的进程占着 → 拿不到，并带回持有者信息**（不启动任何步骤）', () => {
    const p = tmpLock()
    // 用当前进程当"活着的持有者"（pid 一定存在）
    acquireLock(p, { pid: process.pid })
    const r = acquireLock(p, { pid: process.pid + 1 })
    expect(r.ok).toBe(false)
    expect(r.holder?.pid).toBe(process.pid)
  })

  it('同一个 pid 重复获取 → 直接刷新，不算被占（自己不会挡自己）', () => {
    const p = tmpLock()
    acquireLock(p, { pid: 999, head: 'h1' })
    const r = acquireLock(p, { pid: 999, head: 'h2' })
    expect(r.ok).toBe(true)
    expect(readLock(p)?.head).toBe('h2')
  })

  it('持有者进程已死 → 视为陈旧锁，可接管', () => {
    const p = tmpLock()
    // 造一个几乎不可能存在的 pid
    writeFileSync(p, JSON.stringify({ pid: 9999999, head: 'dead', startedAt: '' }))
    const r = acquireLock(p, { pid: process.pid, head: 'me' })
    expect(r.ok).toBe(true)
    expect(readLock(p)?.pid).toBe(process.pid)
  })

  it('锁文件内容坏了 → 当没锁（坏锁不永久阻塞整链）', () => {
    const p = tmpLock()
    writeFileSync(p, '{ 这不是 json')
    expect(readLock(p)).toBeNull()
    expect(acquireLock(p, { pid: process.pid }).ok).toBe(true)
  })

  it('**只删自己的锁**（pid 不匹配就不动）—— 否则并发时会删掉别人的锁', () => {
    const p = tmpLock()
    acquireLock(p, { pid: 424242, head: 'other' })
    expect(releaseLock(p, process.pid)).toBe(false)
    expect(existsSync(p)).toBe(true)

    acquireLock(p, { pid: process.pid, head: 'me' })
    expect(releaseLock(p, process.pid)).toBe(true)
    expect(existsSync(p)).toBe(false)
  })

  it('isAlive：当前 pid 活着、荒谬 pid 死了、非整数判死', () => {
    expect(isAlive(process.pid)).toBe(true)
    expect(isAlive(9999999)).toBe(false)
    expect(isAlive(0)).toBe(false)
    expect(isAlive(Number.NaN)).toBe(false)
  })

  /* ── 超龄接管（#516）──
   * `isAlive` 只证明"这个 pid 有人"，证明不了"还是那个进程"：pid 会被系统回收复用，
   * 于是一个早崩掉、锁却没删的 pid 可能正好被别的进程占用 → 整链被不相干的进程永久挡住。
   * 超过 TTL 就按陈旧处理，并把"接管了谁"回报给调用方打印出来。 */
  it('**锁超龄 → 即使持有者 pid 还活着也接管**，并带回原持有者信息', () => {
    const p = tmpLock()
    const old = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString() // 5 小时前
    acquireLock(p, { pid: process.pid, head: 'ancient', now: old })

    const r = acquireLock(p, { pid: process.pid + 1, head: 'me', ttlMs: 4 * 60 * 60 * 1000 })
    expect(r.ok, '超龄锁必须能被接管，否则 pid 复用会永久挡住整链').toBe(true)
    expect(r.tookOverFrom?.pid).toBe(process.pid)
    expect(readLock(p)?.head).toBe('me')
  })

  it('未超龄的活锁不接管（别把正在跑的那次顶掉）', () => {
    const p = tmpLock()
    const fresh = new Date(Date.now() - 60 * 1000).toISOString() // 1 分钟前
    acquireLock(p, { pid: process.pid, head: 'running', now: fresh })
    const r = acquireLock(p, { pid: process.pid + 1, head: 'me', ttlMs: 4 * 60 * 60 * 1000 })
    expect(r.ok).toBe(false)
  })

  it('isStale：正常时间戳按 TTL 判；缺失/坏时间戳一律不判超龄（不敢乱接管）', () => {
    const now = '2026-11-15T10:00:00.000Z'
    expect(isStale({ startedAt: '2026-11-15T09:00:00.000Z' }, now, 4 * 3600_000)).toBe(false)
    expect(isStale({ startedAt: '2026-11-15T05:00:00.000Z' }, now, 4 * 3600_000)).toBe(true)
    expect(isStale({ startedAt: '' }, now, 4 * 3600_000)).toBe(false)
    expect(isStale({ startedAt: '不是时间' }, now, 4 * 3600_000)).toBe(false)
    expect(isStale(null, now, 4 * 3600_000)).toBe(false)
  })
})

describe('qa-lock · 失败原因分类（#514）', () => {
  const REAL_LOG = `
 Test Files  1 failed (1)
Error: The coverage report directory "[LOCAL_PATH]" is already in use by
another Vitest process (pid 48600). Running coverage for multiple Vitest processes
in the same directory at the same time is not supported, because they would delete
each other's reports.
`
  it('**真实日志 → 判为环境忙并带出占用者 pid**', () => {
    const r = detectEnvBusy(REAL_LOG)
    expect(r?.reason).toBe('coverage-dir-in-use')
    expect(r?.pid).toBe(48600)
    expect(r?.detail).toContain('already in use by another')
  })

  it('普通用例失败日志不误判（不能被当成环境忙而掩盖真失败）', () => {
    const normal = `
 FAIL  tests/unit/foo.spec.ts > 某个用例
AssertionError: expected 1 to be 2
 Test Files  1 failed (1)
      Tests  1 failed | 10 passed (11)
`
    expect(detectEnvBusy(normal)).toBeNull()
  })

  it('空/非字符串输入不抛', () => {
    expect(detectEnvBusy('')).toBeNull()
    expect(detectEnvBusy(undefined as unknown as string)).toBeNull()
  })

  it('提示文案点明"不是用例失败"并给出两个动作（等它跑完 / 删陈旧锁）', () => {
    expect(ENV_BUSY_HINT).toContain('不是用例失败')
    expect(ENV_BUSY_HINT).toContain('.quality-check.lock')
    expect(ENV_BUSY_HINT).toContain('quality-check-latest.json')
  })
})
