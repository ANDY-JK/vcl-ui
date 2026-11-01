/**
 * check:docs 闸门的自测（#352）
 *
 * ## 它守的是什么
 *
 * 组件 API 文档是**生成的**：改了 `defineProps` 不跑 `gen:docs`，文档就静默漂移。
 * 第 #349 轮就是活例子 —— 连续六批加 prop、单测全绿，直到整链第 36 步才被它抓到。
 *
 * ## 为什么只锁"漂移"这一条
 *
 * 它的三条判据（缺少生成文件 / 文档漂移 / 多余文件）在夹具里都命中"缺少"，
 * 但**真正会被人违反的是"漂移"**（改了源码忘了重生成）；"缺少/多余"是 barrel 变动的连带结果。
 * 所以断言锁 `文档漂移` 这条消息，而不是任何一条 `缺少生成文件`。
 *
 * ## 夹具
 *
 * 生成侧仍读**真实 src**（不 mock 生成器），夹具只放"错误版本的已提交文档"：
 * · ok：不传 `--committed`（= 真实 docs-site/components）→ 必须 exit 0
 * · bad：`tests/fixtures/docs/stale/form.md`（内容明显是旧的）→ 必须报 `文档漂移 form.md`
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-docs.mjs')

function run(committed?: string) {
  const args = [SCRIPT]
  if (committed) args.push('--committed', committed)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:docs 闸门自测', () => {
  it('**真实文档必须与生成结果一致**（不一致说明忘了跑 gen:docs）', () => {
    const { code, out } = run()
    expect(code, `真实文档已漂移：\n${out}`).toBe(0)
  })

  it('**已提交文档过期时必须报「文档漂移」，并点名文件**', () => {
    const { code, out } = run('tests/fixtures/docs/stale')
    expect(code, '过期文档没被拦住 → 用户会照着旧 API 写代码').toBe(1)
    expect(out, '没报"文档漂移"（可能只报了缺少文件）').toContain('文档漂移 form.md')
  })
})
