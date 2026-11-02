/**
 * SSR 冒烟覆盖判据的自测（#377）
 *
 * ## 它守的是什么
 *
 * `ssr-smoke.spec.ts` 的清单是手写的，经典问题是"新组件没人想起来加"——
 * #376 的 FormTargetCollect（setup 期读 localStorage）就漏了。
 * 判据两级：**域覆盖**（每域至少一个代表）+ **危险信号**（源码含
 * localStorage/matchMedia 等的组件必须逐个在清单）。
 *
 * ## 夹具
 *
 * 现造组件树（tmp 目录）：域 a 放干净组件、域 b 放含 localStorage 的组件，
 * 分别验证"漏报能被抓"与"全在清单时不报"。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  scanComponentTree,
  findSmokeGaps,
  findUncoveredDomains,
  extractListedNames,
} from '../../scripts/ssr-smoke-coverage.mjs'

const TMP = resolve('tests/.tmp/ssr-smoke-coverage')

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

function build() {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(join(TMP, 'a'), { recursive: true })
  mkdirSync(join(TMP, 'b'), { recursive: true })
  writeFileSync(join(TMP, 'a', 'CleanA.vue'), '<template><p>ok</p></template>')
  writeFileSync(join(TMP, 'a', 'CleanB.vue'), '<template><p>ok</p></template>')
  writeFileSync(
    join(TMP, 'b', 'RiskyA.vue'),
    "<script setup>\nconst k = typeof localStorage !== 'undefined' ? localStorage.getItem('k') : ''\n</script>\n<template><p>{{ k }}</p></template>",
  )
  writeFileSync(join(TMP, 'b', 'RiskyB.vue'), '<template><p>y</p></template>')
  return scanComponentTree(TMP)
}

describe('SSR 冒烟覆盖判据', () => {
  it('**扫出组件树并标记危险信号**', () => {
    const scanned = build()
    expect(scanned).toHaveLength(2)
    const b = scanned.find((d) => d.domain === 'b')!
    expect(b.files.find((f) => f.name === 'RiskyA')?.dangerous).toBe(true)
    expect(b.files.find((f) => f.name === 'RiskyB')?.dangerous).toBe(false)
  })

  it('**漏报能被抓，且危险组件排前面**', () => {
    const scanned = build()
    const gaps = findSmokeGaps(scanned, new Set(['CleanA']))
    // 危险的必须全部排在非危险前面（相等档保持扫描序，不断言全序）
    const firstClean = gaps.findIndex((g) => !g.dangerous)
    expect(firstClean).toBeGreaterThan(-1)
    expect(gaps.slice(0, firstClean).every((g) => g.name === 'RiskyA')).toBe(true)
    expect(gaps.slice(firstClean).map((g) => g.name).sort()).toEqual(['CleanB', 'RiskyB'])
  })

  it('**全在清单时不报**', () => {
    const scanned = build()
    const gaps = findSmokeGaps(scanned, new Set(['CleanA', 'CleanB', 'RiskyA', 'RiskyB']))
    expect(gaps).toEqual([])
  })

  it('**域覆盖：清单只有 a 域代表时，b 域必须报**', () => {
    const scanned = build()
    expect(findUncoveredDomains(scanned, new Set(['CleanA']))).toEqual(['b'])
  })

  it('**从冒烟 spec 源码提取清单名**（防止 spec 与判据的格式漂移）', () => {
    const names = extractListedNames(
      "const cases = [\n  ['Button', Button, {}],\n  ['Input.stepper', Input, {}],\n  ['FormTargetCollect', X, {}],\n]",
    )
    expect([...names]).toEqual(['Button', 'Input.stepper', 'FormTargetCollect'])
  })
})
