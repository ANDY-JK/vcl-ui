// @vitest-environment node
/**
 * check:console-noise 闸门自测（TD-04，#392）
 *
 * ## 它守的是什么
 *
 * 这个闸口是"未静默 console.warn/error"的**类别棘轮**：出现新类别即红。
 * 但它最要紧的一条判据是**"采集到 0 类噪音必须判红"** —— 0 类几乎一定是"没采集上"
 * （spool 为空：上一次检查成功后会清空、或手动先跑了 check 再跑），而不是"真的没有噪音"。
 * 闸口在没数据时判绿，等于假绿。
 *
 * ## 为什么要补自测
 *
 * 这条守卫是 2026-10-21 在脚本里补的，但**没有任何用例守住它**：
 * spool 路径写死后，要测"空采集"就得动真实 spool（会破坏正在跑的采集）。
 * 所以本轮给脚本加了 `--spool` / `--baseline-file` 两个只影响被测环节的开关，
 * 用夹具证明"空采集会红、新类别会红、已知类别会绿"。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-console-noise.mjs')

function makeFixture(opts: { spool?: Record<string, Record<string, number>>; baseline?: Record<string, number> | null }) {
  const dir = mkdtempSync(join(tmpdir(), 'vcl-noise-'))
  const spool = join(dir, 'spool')
  mkdirSync(spool, { recursive: true })
  let i = 0
  for (const [file, part] of Object.entries(opts.spool ?? {})) {
    writeFileSync(join(spool, `${i++}-${file}.json`), JSON.stringify(part), 'utf8')
  }
  const baseline = join(dir, 'baseline.json')
  if (opts.baseline !== null) {
    writeFileSync(baseline, JSON.stringify({ noise: opts.baseline ?? {} }), 'utf8')
  }
  return { dir, spool, baseline, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function run(spool: string, baseline: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--no-run', '--spool', spool, '--baseline-file', baseline], {
    encoding: 'utf8',
  })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:console-noise · 空采集必须判红（不许假绿）', () => {
  it('**spool 为空 → exit 1，并说清"是没采集上"而不是"没噪音"**', () => {
    const f = makeFixture({ spool: {}, baseline: {} })
    try {
      const { code, out } = run(f.spool, f.baseline)
      expect(code, '空采集被判绿 → 这段棘轮等于没有').toBe(1)
      expect(out, '要明确点出"没采集上"').toContain('没采集上')
      expect(out, '要给出正确操作顺序').toContain('npm run test:unit')
    } finally {
      f.cleanup()
    }
  })

  it('**spool 目录不存在 → exit 1，并提示先跑采集**', () => {
    const f = makeFixture({ spool: {}, baseline: {} })
    try {
      rmSync(f.spool, { recursive: true, force: true })
      const { code, out } = run(f.spool, f.baseline)
      expect(code, 'spool 缺失必须红').toBe(1)
      expect(out).toMatch(/找不到.*noise-spool|先跑一次/)
    } finally {
      f.cleanup()
    }
  })
})

describe(
  'check:console-noise · 基线写入必须是并集（否则个别 spec 的告警会变成假红）',
  () => {
    it('**并集模式：本次未出现的旧类别保留**，新类别追加', () => {
      const f = makeFixture({
        spool: { a: { '[本次新出现] x': 2 } },
        baseline: { '[本次没出现] y': 5 },
      })
      try {
        const r = spawnSync(process.execPath, [SCRIPT, '--no-run', '--spool', f.spool, '--baseline-file', f.baseline, '--baseline'], {
          encoding: 'utf8',
        })
        expect(r.status, r.stderr).toBe(0)
        const written = JSON.parse(readFileSync(f.baseline, 'utf8')).noise
        expect(Object.keys(written), '旧类别被丢掉 → 下次它一出现就判假红').toContain('[本次没出现] y')
        expect(Object.keys(written)).toContain('[本次新出现] x')
      } finally {
        f.cleanup()
      }
    })

    it('--baseline-reset 才允许把旧类别丢掉（显式重置）', () => {
      const f = makeFixture({
        spool: { a: { '[本次新出现] x': 2 } },
        baseline: { '[本次没出现] y': 5 },
      })
      try {
        const r = spawnSync(
          process.execPath,
          [SCRIPT, '--no-run', '--spool', f.spool, '--baseline-file', f.baseline, '--baseline', '--baseline-reset'],
          { encoding: 'utf8' },
        )
        expect(r.status, r.stderr).toBe(0)
        const written = JSON.parse(readFileSync(f.baseline, 'utf8')).noise
        expect(Object.keys(written)).toEqual(['[本次新出现] x'])
      } finally {
        f.cleanup()
      }
    })
  },
)

describe('check:console-noise · 棘轮判定', () => {
  it('**已知类别 → 绿**（不该因为"有噪音"就红，只拦新增类别）', () => {
    const f = makeFixture({
      spool: { a: { '[storage] 云端对账失败': 3 }, b: { '[storage] 云端对账失败': 2 } },
      baseline: { '[storage] 云端对账失败': 5 },
    })
    try {
      const { code, out } = run(f.spool, f.baseline)
      expect(code, `已知类别被误判：\n${out}`).toBe(0)
      expect(out).toContain('均为已知类别')
    } finally {
      f.cleanup()
    }
  })

  it('**出现新类别 → 红，并点名该类别**', () => {
    const f = makeFixture({
      spool: { a: { '[storage] 云端对账失败': 1 }, b: { '[模板 ref 失效] foo': 2 } },
      baseline: { '[storage] 云端对账失败': 1 },
    })
    try {
      const { code, out } = run(f.spool, f.baseline)
      expect(code, '新类别没被拦住 → 新告警可以静默扩散').toBe(1)
      expect(out).toContain('新增类别')
      expect(out).toContain('[模板 ref 失效] foo')
    } finally {
      f.cleanup()
    }
  })

  it('Node 运行时告警（`(node:…)` 前缀）不算本仓噪音，不参与棘轮', () => {
    const f = makeFixture({
      spool: { a: { '(node:N) …: SQLite is an … feature …': 7 } },
      baseline: {},
    })
    try {
      const { code } = run(f.spool, f.baseline)
      // 只豁免运行时告警 → 汇总为空，但"0 类即没采集上"的守卫会拦（这是设计：宁可红也别假绿）
      expect(code, '全被豁免后等同于没采集上，必须红').toBe(1)
    } finally {
      f.cleanup()
    }
  })
})
