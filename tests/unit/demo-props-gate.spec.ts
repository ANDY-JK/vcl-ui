/**
 * check:demo-props 闸门的自测（#356）—— 只锁「漏报预算棘轮」这条新判据
 *
 * ## 为什么只锁这一条
 *
 * 闸口另有一条「谎报」判据（表里有、组件没有），它一直有效（#355 当场抓到我写错）；
 * 而**漏报方向是这轮才补上的**：现状 158 个 prop 没进演示页表，历史存量太大不能一次清零，
 * 所以用**棘轮**（`MISSING_BUDGET = 158`，只许降不许升）先挡住"新增也不写文档"。
 * 新判据没有人替它守着，就用这两个用例守。
 *
 * ## 夹具
 *
 * 现造临时仓（`--root` 切目录）：
 * · ok：一个组件 1 个 prop，演示页表里列了它 → 漏报 0 ≤ 预算
 * · bad：一个组件 160 个 prop，演示页表一行都没列 → 漏报 160 > 预算 158 → 必须红
 */
import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-demo-props.mjs')
const TMP = resolve('tests/.tmp/demo-props-gate')

function buildFixture(propCount: number, documentCount: number) {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(join(TMP, 'src/components/widget'), { recursive: true })
  mkdirSync(join(TMP, 'src/demos/widget'), { recursive: true })

  const props = Array.from({ length: propCount }, (_, i) => `  p${i}?: string`).join('\n')
  writeFileSync(
    join(TMP, 'src/components/widget/Widget.vue'),
    `<script setup lang="ts">\ndefineProps<{\n${props}\n}>()\n</script>\n\n<template><div>w</div></template>\n`,
  )

  // 注意：闸口有"一条表行都没扫到就判失效"的前置判据，所以 bad 夹具也必须至少 1 行
  const rows = Array.from({ length: documentCount }, (_, i) => `          <tr><td><code>p${i}</code></td><td>string</td><td>—</td><td>说明</td></tr>`).join('\n')
  writeFileSync(
    join(TMP, 'src/demos/widget/WidgetDemo.vue'),
    `<script setup lang="ts">\nimport Widget from '@/components/widget/Widget.vue'\n</script>\n\n<template>\n  <div>\n    <Widget />\n    <table>\n      <thead><tr><th>Prop</th><th>类型</th><th>默认</th><th>说明</th></tr></thead>\n      <tbody>\n${rows}\n      </tbody>\n    </table>\n  </div>\n</template>\n`,
  )
  return TMP
}

function run(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

describe('check:demo-props 闸门自测 · 漏报预算棘轮', () => {
  it('**已文档化时必须通过**', () => {
    const { code, out } = run(buildFixture(1, 1))
    expect(code, `已文档化却判失败：\n${out}`).toBe(0)
    expect(out).toContain('未在演示页表中出现的 prop：0 个')
  })

  it('**漏报超预算必须判红，并说明"新加的 public prop 必须写进演示页表"**', () => {
    const { code, out } = run(buildFixture(160, 1))
    expect(code, '漏报超预算没拦住 → 新加 prop 不写文档也能过').toBe(1)
    expect(out).toMatch(/漏报 1[0-9][0-9] 个|漏报 160 个/)
  })
})
