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
 * 既没报告"哪些探针验过"，也没机会跑那 5411 个元素的扫描。
 * 对闸口来说，"测不了"和"测了但不合格"是**两件事**：前者要如实说"这次没测成"（判红），
 * 后者才该判红；两者都不能是"栈回溯 + 没有任何结论"。
 *
 * ## 为什么默认只跑静态断言（分层理由）
 *
 * 行为级验证要真启动 Chromium。第 149 轮实测把它放进 `test:unit` 的**代价**：
 * 同一步里 `chart-wordcloud-degrade`（27.6s）与 `form-target-collect-upload` 的 ZIP 两条
 * 被 CPU 争用拖过超时 —— 去掉本文件后同一批 **5425 例全过、120s**；带上它就有 3 例红。
 *
 * 所以分层：
 *   · **默认（本文件）**：静态断言守住这次的具体回归（`posOf` 必须有 catch、
 *     `close()` 必须兜底、SKIP 文案必须区分原因、抽查上限必须打印提示）—— 毫秒级、零浏览器
 *   · **行为级**：`RTL_GATE_BEHAVIOR=1 npx vitest run tests/unit/rtl-gate-robustness.spec.ts`
 *     才会真跑一遍闸口（约 5s），验证"页面打不开 → exit 1 + 不抛栈 + 扫描仍跑完"
 *
 * 真实路径每轮整链第 31 步都会跑到：闸口自己崩了，链就红。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const SRC = readFileSync('scripts/check-rtl-semantics.mjs', 'utf8')

describe('check:rtl-semantics · 源码必须保留的健壮性写法', () => {
  it('`posOf()` 必须 catch 页面级失败（不能只有 finally）', () => {
    const start = SRC.indexOf('async function posOf(')
    expect(start, '找不到 posOf（重命名了？请同步本用例）').toBeGreaterThan(-1)
    const body = SRC.slice(start, start + 2600)
    expect(body, 'posOf 必须有 catch：否则浏览器中断会带栈崩掉整条闸口').toMatch(/\}\s*catch\s*\(/)
    expect(body, '页面级失败要返回结构化状态，而不是上抛').toContain("status: 'error'")
  })

  it('清理动作必须 `.catch()` 兜底（浏览器已死时 close 本身会抛）', () => {
    expect(SRC, '扫描循环的 ctx.close 要兜').toMatch(/await ctx\.close\(\)\.catch\(\(\) => \{\}\)/)
    expect(SRC, '收尾的 browser.close 要兜').toMatch(/await browser\.close\(\)\.catch\(\(\) => \{\}\)/)
  })

  it('探针 SKIP 必须**区分原因**：页面打不开 ≠ 元素不存在', () => {
    expect(SRC, '页面级失败要有独立文案').toContain('页面打不开')
    expect(SRC, '元素不存在仍要保留原文案').toContain('元素不存在')
  })

  it('`RTL_SCAN_LIMIT` 生效时必须打印醒目提示（不允许静默缩覆盖）', () => {
    expect(SRC).toContain('RTL_SCAN_LIMIT')
    expect(SRC, '抽查必须在汇总行标注').toContain('只抽查前')
  })
})

const RUN_BEHAVIOR = process.env.RTL_GATE_BEHAVIOR === '1'

describe.skipIf(!RUN_BEHAVIOR)('check:rtl-semantics · 页面打不开时的行为（需真浏览器）', () => {
  /** 整个 describe 只跑一次闸口：单次约 5s，四组断言共用同一份输出 */
  let cached: { code: number; out: string } | null = null

  function runGate(): { code: number; out: string } {
    if (cached) return cached
    try {
      const out = execFileSync(process.execPath, ['scripts/check-rtl-semantics.mjs'], {
        encoding: 'utf8',
        stdio: 'pipe',
        // localhost:9 = ERR_UNSAFE_PORT：立即失败、不等待超时，复现"页面打不开"整类
        env: { ...process.env, RTL_BASE: 'http://localhost:9', RTL_SCAN_LIMIT: '2' },
      })
      cached = { code: 0, out }
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string }
      cached = { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
    }
    return cached
  }

  it('退出码 1 且点名"没测到"（测不了必须判红）', () => {
    const r = runGate()
    expect(r.code).toBe(1)
    expect(r.out).toContain('没测到')
  }, 180_000)

  it('不抛未捕获异常（不能只剩栈回溯、没有结论）', () => {
    const r = runGate()
    expect(r.out, `输出：${r.out.slice(0, 400)}`).not.toContain('at posOf')
    expect(r.out).not.toContain('Uncaught')
    expect(r.out).not.toMatch(/Node\.js v\d+\.\d+\.\d+\s*$/)
  }, 180_000)

  it('4 条探针都报告 SKIP(页面打不开)，而不是崩在第 1 条', () => {
    const r = runGate()
    const probeSkips = r.out.split('\n').filter((l) => /\.grid-corner--|\.col-fixed-left|\.sidebar/.test(l))
    expect(probeSkips.length).toBeGreaterThanOrEqual(4)
    expect(probeSkips.join('\n')).toContain('页面打不开')
  }, 180_000)

  it('扫描仍会跑完（不能因为探针失败就跳过全路由扫描）', () => {
    const r = runGate()
    expect(r.out).toMatch(/检查 \d+ 个窄定位元素/)
    expect(r.out, '抽查时汇总行必须标注').toContain('只抽查前')
  }, 180_000)
})
