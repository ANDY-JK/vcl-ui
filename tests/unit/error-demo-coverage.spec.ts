/**
 * error-demo-coverage 判据的自测（#382）
 *
 * ## 它守的是什么
 *
 * #378~#381 手工补了 4 个组件的 error/invalid 演示；本判据把"新组件加 error/invalid
 * prop → 演示页必须有绑定"变成机械检查，豁免清单双向对账（同 #372 棘轮形态）。
 *
 * ## 夹具
 *
 * 现造组件 + 演示页：有 prop 无绑定 → gap；有绑定 → 过；豁免 → 过但双向校验。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  hasErrorishProps,
  demoBindsErrorish,
  scanErrorishComponents,
  scanDemoBindings,
  findDemoGaps,
} from '../../scripts/error-demo-coverage.mjs'

const TMP = resolve('tests/.tmp/error-demo-coverage')

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

function build() {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(join(TMP, 'comps'), { recursive: true })
  mkdirSync(join(TMP, 'demos'), { recursive: true })
  // 有 error prop
  writeFileSync(join(TMP, 'comps', 'A.vue'), '<script lang="ts">\ninterface Props {\n  error?: string\n}\n</script>')
  // 有 invalid prop
  writeFileSync(join(TMP, 'comps', 'B.vue'), '<script lang="ts">\ninterface Props {\n  invalid?: boolean\n}\n</script>')
  // 干净组件
  writeFileSync(join(TMP, 'comps', 'C.vue'), '<script lang="ts">\ninterface Props {\n  size?: number\n}\n</script>')
  // 演示页：绑定了 A 的 error，没绑 B 的
  writeFileSync(join(TMP, 'demos', 'ADemo.vue'), '<template><A :error="err" /></template>')
  writeFileSync(join(TMP, 'demos', 'BDemo.vue'), '<template><B plain /></template>')
  return {
    comps: scanErrorishComponents(join(TMP, 'comps')),
    demos: scanDemoBindings(join(TMP, 'demos')),
  }
}

describe('error/invalid 演示覆盖判据', () => {
  it('**prop 声明识别**：error?/invalid? 命中，普通 prop 不命中，@error 事件不算', () => {
    expect(hasErrorishProps('interface Props {\n  error?: string\n}')).toBe(true)
    expect(hasErrorishProps('interface Props {\n  invalid?: boolean\n}')).toBe(true)
    expect(hasErrorishProps('interface Props {\n  size?: number\n}')).toBe(false)
    // @error 事件（emit 声明）不是注入 prop
    expect(hasErrorishProps("defineEmits<{ error: [msg: string] }>()")).toBe(false)
  })

  it('**演示绑定识别**：:error=/:invalid= 命中，error= 无冒号不命中，@error 不命中', () => {
    expect(demoBindsErrorish('<A :error="err" />')).toBe(true)
    expect(demoBindsErrorish('<A :invalid="bad" />')).toBe(true)
    expect(demoBindsErrorish('<A error="字面量" />')).toBe(false)
    expect(demoBindsErrorish('<A @error="onErr" />')).toBe(false)
  })

  it('**扫描组件树**：只返回声明了 error/invalid 的', () => {
    const { comps } = build()
    expect(comps.map((c) => c.name).sort()).toEqual(['A', 'B'])
  })

  it('**对账：有绑定不报、无绑定报、豁免过但双向校验**', () => {
    const { comps, demos } = build()
    const r = findDemoGaps(comps, demos, { B: 'B 是内部组件，错误由宿主渲染' })
    expect(r.gaps).toEqual([])
    // 豁免清单过期（代码里删了 B 的 prop）→ 报过期
    const stale = findDemoGaps(comps.filter((c) => c.name !== 'B'), demos, { B: '理由' })
    expect(stale.staleExempt).toEqual(['B'])
  })

  it('**无豁免时 gap 完整上报**', () => {
    const { comps, demos } = build()
    const r = findDemoGaps(comps, demos)
    expect(r.gaps.map((g) => g.name)).toEqual(['B'])
    expect(r.staleExempt).toEqual([])
  })
})
