// check:vendor-vulns 的**离线兜底端对端**验证（#472，TD-25 收口）
//
// 此前 #465 只测了纯函数（cacheAgeDays / cachePathFromEnv）—— 真正的兜底路径却没法测：
// main() 在「发现新 id」时直接 process.exit(1)，测试一 import 就把自己杀掉。
// 本轮把主流程抽成 runVendorVulns()（返回结构化结论、可注入 fetch/cache），于是**四种离线情形**
// 全部能机械验证：热缓存 → 绿 / 无缓存 → 红 / 超期缓存 → 红 / 缓存里混进新 id → 仍然红。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runVendorVulns,
  MAX_AGE_DAYS,
  splitVulns,
  cacheAgeDays,
} from '../../scripts/check-vendor-vulns.mjs'

const KEYS = ['xlsx@0.20.3', 'pinyin-pro@unknown']
const WAIVED = [
  'GHSA-4r6h-8v6p-xvw6',
  'GHSA-5pgg-2g8v-p4x9',
  'GHSA-3x9f-74h4-2fqr',
  'GHSA-8vcr-vxm8-293m',
  'GHSA-g973-978j-2c3p',
]

/** 造一份「上次在线成功」的缓存（results 用当前真实目标键） */
function seed(dir: string, { ageDays = 0, extraIds = [] as string[] } = {}) {
  const file = join(dir, 'cache.json')
  writeFileSync(
    file,
    JSON.stringify({
      checkedAt: new Date(Date.now() - ageDays * 86_400_000).toISOString(),
      results: {
        [KEYS[0]]: [...WAIVED, ...extraIds],
        [KEYS[1]]: [],
      },
    }),
  )
  return file
}

const offlineFetch = async () => {
  throw new Error('fetch failed (simulated offline)')
}
const silent = () => {}
const collect = () => {
  const logs: string[] = []
  const errors: string[] = []
  return {
    log: (s: string) => logs.push(s),
    error: (s: string) => errors.push(s),
    logs,
    errors,
  }
}

function withTmp(fn: (dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), 'vendor-vulns-offline-'))
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }))
}

describe('runVendorVulns · 离线兜底（TD-25 端到端）', () => {
  it('断网 + 新鲜热缓存 → 绿，两项都走缓存，且不覆盖缓存', () =>
    withTmp(async (dir) => {
      const file = seed(dir)
      const before = readFileSync(file, 'utf8')
      const c = collect()
      const r = await runVendorVulns({ fetchImpl: offlineFetch, retryDelay: 0, cachePath: file, ...c })
      expect(r.ok).toBe(true)
      expect(r.usedCache).toBe(2)
      expect(c.logs.join('\n')).toContain('用离线缓存兜底')
      expect(readFileSync(file, 'utf8'), '离线结论不该覆盖在线缓存').toBe(before)
    }))

  it('断网 + 无缓存 → 红，错误信息给出 VENDOR_VULNS_CACHE 行动指引', () =>
    withTmp(async (dir) => {
      const c = collect()
      const r = await runVendorVulns({
        fetchImpl: offlineFetch,
        retryDelay: 0,
        cachePath: join(dir, 'missing.json'),
        ...c,
      })
      expect(r.ok).toBe(false)
      expect(r.errors.join('\n')).toContain('VENDOR_VULNS_CACHE')
      expect(r.errors.join('\n')).toContain(`上限 ${MAX_AGE_DAYS} 天`)
    }))

  it('断网 + 超期缓存（8 天）→ 红（宁可误红，不让监测静默停摆）', () =>
    withTmp(async (dir) => {
      const file = seed(dir, { ageDays: MAX_AGE_DAYS + 1 })
      const c = collect()
      const r = await runVendorVulns({ fetchImpl: offlineFetch, retryDelay: 0, cachePath: file, ...c })
      expect(r.ok).toBe(false)
      expect(r.errors.join('\n')).toContain('没有可用的离线缓存兜底')
    }))

  it('断网 + 热缓存里混进未登记 id → 仍然红（缓存不能变成放行通道）', () =>
    withTmp(async (dir) => {
      const file = seed(dir, { extraIds: ['GHSA-brand-new'] })
      const c = collect()
      const r = await runVendorVulns({ fetchImpl: offlineFetch, retryDelay: 0, cachePath: file, ...c })
      expect(r.ok).toBe(false)
      expect(r.errors.join('\n')).toContain('GHSA-brand-new')
    }))

  it('在线成功 → 写缓存（含 checkedAt 与两个目标键）', () =>
    withTmp(async (dir) => {
      const file = join(dir, 'cache.json')
      const onlineFetch = async (_url: string, init: { body?: string }) => {
        const name = JSON.parse(init?.body ?? '{}')?.package?.name
        const ids = name === 'xlsx' ? WAIVED.slice(0, 1) : []
        return { ok: true, json: async () => ({ vulns: ids.map((id) => ({ id })) }) }
      }
      const c = collect()
      const r = await runVendorVulns({ fetchImpl: onlineFetch as never, retryDelay: 0, cachePath: file, ...c })
      expect(r.ok).toBe(true)
      expect(r.usedCache).toBe(0)
      expect(existsSync(file)).toBe(true)
      const cache = JSON.parse(readFileSync(file, 'utf8'))
      expect(cacheAgeDays(cache)).toBeLessThan(0.01)
      expect(Object.keys(cache.results).sort()).toEqual([...KEYS].sort())
    }))

  it('反向保护：splitVulns 确实会把新 id 分进 unknown（否则上一条是空转）', () => {
    const allowed = new Map(WAIVED.map((id) => [id, 'reason']))
    expect(splitVulns([{ id: 'GHSA-brand-new' }], allowed).unknown).toEqual(['GHSA-brand-new'])
  })

  it('反向保护：离线路径确实调用了注入的 fetch（不是没走网络却"绿"了）', () =>
    withTmp(async (dir) => {
      const file = seed(dir)
      let calls = 0
      const fetchImpl = async () => {
        calls += 1
        throw new Error('offline')
      }
      const r = await runVendorVulns({ fetchImpl, retryDelay: 0, cachePath: file, log: silent, error: silent })
      expect(r.ok).toBe(true)
      expect(calls, '两个目标各重试 2 次 = 4 次').toBe(4)
    }))
})
