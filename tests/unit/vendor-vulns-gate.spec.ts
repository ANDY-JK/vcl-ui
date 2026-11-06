// check:vendor-vulns 的纯逻辑单测——splitVulns 的豁免分流（F2）。
// 网络查询不进单测（osv.dev 不可达会污染回归），只锁「豁免命中/新 id 即红」的判定口径。
import { describe, it, expect } from 'vitest'
import { splitVulns, cacheAgeDays, cachePathFromEnv, MAX_AGE_DAYS, CACHE } from '../../scripts/check-vendor-vulns.mjs'

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

describe('cacheAgeDays（离线兜底的年龄判据，TD-25）', () => {
  it('新鲜（0 天）→ 0；超期（8 天）→ > MAX_AGE_DAYS；时间戳坏 → 无穷大', () => {
    expect(cacheAgeDays({ checkedAt: new Date().toISOString() })).toBeLessThan(0.01)
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString()
    expect(cacheAgeDays({ checkedAt: old })).toBeGreaterThan(MAX_AGE_DAYS)
    expect(cacheAgeDays({ checkedAt: 'not-a-date' })).toBe(Number.POSITIVE_INFINITY)
    expect(cacheAgeDays(null)).toBe(Number.POSITIVE_INFINITY)
  })

  it('MAX_AGE_DAYS = 7（口径不变：超期仍然红，宁可误红）', () => {
    expect(MAX_AGE_DAYS).toBe(7)
  })
})

describe('VENDOR_VULNS_CACHE 覆盖（TD-25 无网 CI 机制）', () => {
  it('不设 → 指向 reports/vendor-vulns-cache.json（本地默认，gitignore）', () => {
    const p = cachePathFromEnv({})
    expect(p.split(/[\\/]/).slice(-2).join('/')).toBe('reports/vendor-vulns-cache.json')
  })

  it('设置 → 原样解析（CI 指向受控目录）', () => {
    const p = cachePathFromEnv({ VENDOR_VULNS_CACHE: '/ci/cache/vulns.json' })
    expect(p.split(/[\\/]/).slice(-3).join('/')).toBe('ci/cache/vulns.json')
  })

  it('默认常量与"不设环境变量"一致', () => {
    expect(CACHE).toBe(cachePathFromEnv({}))
  })
})
