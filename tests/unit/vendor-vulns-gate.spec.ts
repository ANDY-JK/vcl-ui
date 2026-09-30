// check:vendor-vulns 的纯逻辑单测——splitVulns 的豁免分流（F2）。
// 网络查询不进单测（osv.dev 不可达会污染回归），只锁「豁免命中/新 id 即红」的判定口径。
import { describe, it, expect } from 'vitest'
import { splitVulns } from '../../scripts/check-vendor-vulns.mjs'

const ALLOWED = new Map([
  ['GHSA-4r6h-8v6p-xvw6', 'CVE-2023-30533 登记理由'],
  ['GHSA-5pgg-2g8v-p4x9', 'CVE-2024-22363 登记理由'],
])

describe('splitVulns（OSV 结果分流）', () => {
  it('已登记 id 全部进豁免桶', () => {
    const r = splitVulns([{ id: 'GHSA-4r6h-8v6p-xvw6' }, { id: 'GHSA-5pgg-2g8v-p4x9' }], ALLOWED)
    expect(r.unknown).toEqual([])
    expect(r.waived).toEqual(['GHSA-4r6h-8v6p-xvw6', 'GHSA-5pgg-2g8v-p4x9'])
  })

  it('新 id 进未知桶（闸口判红的依据）', () => {
    const r = splitVulns([{ id: 'GHSA-4r6h-8v6p-xvw6' }, { id: 'GHSA-new-cve' }], ALLOWED)
    expect(r.unknown).toEqual(['GHSA-new-cve'])
  })

  it('空结果两桶皆空（上游干净时的形态）', () => {
    expect(splitVulns([], ALLOWED)).toEqual({ waived: [], unknown: [] })
  })
})
