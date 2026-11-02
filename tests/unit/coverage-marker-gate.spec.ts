/**
 * check:coverage-domains「全量跑标记」判据的自测（#369）
 *
 * ## 为什么补这块
 *
 * 这道闸口防两类误用：① **单跑某个 spec 带 --coverage** 会产出只反映部分文件的
 * coverage-final.json，在它上面做按域地板检查会大面积误报 —— 所以要求
 * `reports/coverage/.full-run` 标记存在；② 全量跑之后又单跑 spec（报告比标记新）——
 * 现有 coverage 不再是全量口径。
 *
 * 这两条此前零自测：真验一次要跑全量带覆盖的单测（约 9 分钟），成本高。
 * 用 `--marker`/`--input` 把两个文件路径都指到夹具，判据本身秒级可测。
 *
 * ## 只锁标记判据
 *
 * 覆盖数据用**合成**的（只含一个域），按域地板必然红 —— 那不是本用例的对象。
 * 断言是「标记相关错误出现 / 不出现」，其它失败视为环境噪音。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-coverage-domains.mjs')
const INPUT = 'tests/fixtures/coverage-marker/coverage-final.json'
const MARKER = 'tests/fixtures/coverage-marker/.full-run'
/** 新鲜标记：提交进仓的 .full-run 是"旧"的（供 STALE 用例用），FRESH 用例现场写一份新的 */
const FRESH_MARKER = 'tests/fixtures/coverage-marker/.full-run-fresh'

function run(marker?: string, withInput = true) {
  const args = [SCRIPT]
  if (withInput) args.push('--input', INPUT)
  if (marker) args.push('--marker', marker)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const MISSING = () => run('tests/fixtures/coverage-marker/nonexistent')
const STALE = () => run(MARKER)
const FRESH = () => run(FRESH_MARKER)

beforeEach(() => {
  // 现场写一份比夹具 coverage 更新的标记，保证"新鲜"语义在测试执行时刻成立
  writeFileSync(FRESH_MARKER, String(Date.now()))
})

describe('check:coverage-domains · 全量跑标记判据', () => {
  it('**标记缺失必须报，且指到实际检查的路径**', () => {
    const { out } = MISSING()
    expect(out).toContain('覆盖数据来源不明')
    expect(out).toContain('nonexistent')
  })

  it('**报告比标记新必须报（全量跑完又单跑了 spec）**', () => {
    const { out } = STALE()
    expect(out).toContain('覆盖数据比全量标记更新')
  })

  it('**标记新鲜的夹具不得触发标记判据**（其它判据的失败不算）', () => {
    const { out } = FRESH()
    expect(out).not.toContain('覆盖数据来源不明')
    expect(out).not.toContain('覆盖数据比全量标记更新')
  })
})
