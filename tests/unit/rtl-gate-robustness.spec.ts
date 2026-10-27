// @vitest-environment node
/**
 * 闸口脚本健壮性：测不了的时候必须**如实报告没测到**，而不是崩溃（第 149 轮）。
 *
 * ## 为什么补
 *
 * 整链第 31 步 `check:rtl-semantics` 跑在最后（前面已跑完 5 千多条单测 + e2e），
 * 第 149 轮实测到 Chromium 被系统回收：`page.goto` 抛
 * `Target page, context or browser has been closed`。
 *
 * 而 `posOf()` 当时**只有 finally、没有 catch** —— 于是整条闸口带着栈回溯崩掉：
 * 既没报告"哪些探针验过"，也没机会跑那 5394 个元素的扫描。
 * 对闸口来说，"测不了"和"测了但不合格"是**两件事**：前者要明确说"这次没测成"，
 * 后者才该判红；两者都不能是"栈回溯 + 没有任何结论"。
 *
 * ## 怎么测（不依赖真实浏览器崩溃）
 *
 * 用 `RTL_BASE` 指向一个**打不开**的地址（`http://localhost:9` 是 ERR_UNSAFE_PORT，
 * 立即失败、不等待超时），复现"页面打不开"这一整类。
 *
 * ⚠️ 整个文件**只跑一次闸口**（`shared` 记忆化）：单次约 35s，四组断言共用同一份输出，
 * 否则四例各跑一遍要 2 分多钟，白白拖长整链。
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'

type GateRun = { code: number; out: string }

let cached: GateRun | null = null

function runGateOnce(): GateRun {
  if (cached) return cached
  try {
    const out = execFileSync(process.execPath, ['scripts/check-rtl-semantics.mjs'], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, RTL_BASE: 'http://localhost:9', RTL_SCAN_LIMIT: '2' },
    })
    cached = { code: 0, out }
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string }
    cached = { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
  return cached
}

describe('check:rtl-semantics · 页面打不开时的行为', () => {
  it('**退出码 1 且点名"没测到"**（不能当通过）', () => {
    const r = runGateOnce()
    expect(r.code, '测不了必须判红').toBe(1)
    expect(r.out, '要说清楚是"没测到"').toContain('没测到')
  }, 180_000)

  it('**不抛未捕获异常**（不能只剩栈回溯、没有结论）', () => {
    const r = runGateOnce()
    expect(r.out, `输出：${r.out.slice(0, 400)}`).not.toContain('at posOf')
    expect(r.out).not.toContain('Uncaught')
    expect(r.out, '不该只剩"Node.js v"这种崩溃尾巴').not.toMatch(/Node\.js v\d+\.\d+\.\d+\s*$/)
  }, 180_000)

  it('探针的 SKIP 要**区分原因**：页面打不开 ≠ 元素不存在', () => {
    const r = runGateOnce()
    expect(r.out, '页面级失败要写明"页面打不开"').toContain('页面打不开')
    const probeSkips = r.out.split('\n').filter((l) => /\.grid-corner--|\.col-fixed-left|\.sidebar/.test(l))
    expect(probeSkips.length, '4 条探针都应报告，而不是崩在第 1 条').toBeGreaterThanOrEqual(4)
  }, 180_000)

  it('**扫描仍会跑完**（不能因为探针失败就跳过全路由扫描）', () => {
    const r = runGateOnce()
    expect(r.out, '扫描要给出统计行').toMatch(/检查 \d+ 个窄定位元素/)
    expect(r.out, '所有路由都该被记为 SKIP').toMatch(/SKIP \d+ 个路由/)
  }, 180_000)
})
