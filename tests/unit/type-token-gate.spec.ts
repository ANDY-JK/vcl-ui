/**
 * check:type-tokens 闸门的自测
 *
 * 判据只有一条：**声明块里有 font-size 却没有 line-height → 记 1 条裸字号规则**，
 * 条数超过基线即红（棘轮，只许降不许涨）。
 *
 * 这里钉四件事：
 *   1. 真仓实测条数与基线**一致或更低**（基线漂了要有人知道）
 *   2. 夹具里有裸字号 → 真的红（不是空转）
 *   3. 夹具里字号+行高配对 → 真的绿（不误报）
 *   4. `--update` 只许降：想用「更新基线」绕过棘轮 → 直接失败
 *
 * 为什么不用退出码当唯一判据：夹具只满足单一判据的输入，退出码会被无关检查带偏；
 * 断言输出里的具体信息才是这条判据的产物。
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-type-tokens.mjs')
const TMP = resolve('tests/.tmp/type-token-gate')
const REAL_BASELINE = resolve('type-token-baseline.json')

function run(root: string, args: string[] = []) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** 在临时根下造一个只有 src/components 的假仓（闸口只读这两处 + 根上的基线） */
function makeRoot(name: string, files: Record<string, string>, baseline?: number) {
  const root = join(TMP, name)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(root, 'src', 'components'), { recursive: true })
  for (const [rel, body] of Object.entries(files)) {
    const p = join(root, 'src', 'components', rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, body)
  }
  if (baseline !== undefined) writeFileSync(join(root, 'type-token-baseline.json'), JSON.stringify({ count: baseline }))
  return root
}

beforeAll(() => mkdirSync(TMP, { recursive: true }))
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

describe('check:type-tokens · 真仓基线', () => {
  it('基线存在且是数字', () => {
    expect(existsSync(REAL_BASELINE)).toBe(true)
    const baseline = JSON.parse(readFileSync(REAL_BASELINE, 'utf8'))
    expect(typeof baseline.count).toBe('number')
  })

  it('真仓实测条数 ≤ 基线（棘轮没被人偷偷上调）', () => {
    // 真仓跑：不传 --root，走默认 src/components
    const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    const baseline = JSON.parse(readFileSync(REAL_BASELINE, 'utf8')).count
    expect(r.status, out).toBe(0)
    const measured = Number(/裸字号规则 (\d+) 条/.exec(out)?.[1])
    expect(Number.isFinite(measured), `没能从输出里读到条数：${out}`).toBe(true)
    expect(measured).toBeLessThanOrEqual(baseline)
  })
})

describe('check:type-tokens · 判据在真量（负向对照）', () => {
  it('有 font-size 无 line-height → 红，且点名到文件与行', () => {
    const root = makeRoot('violate', {
      'x/a.css': `.a {\n  font-size: var(--vcl-fs-12);\n  color: red;\n}\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(1)
    expect(out).toContain('超过止涨线 0 条')
    expect(out).toContain('x/a.css:1')
  })

  it('字号与行高配对 → 绿（不误报）', () => {
    const root = makeRoot('clean', {
      'x/a.css': `.a {\n  font-size: var(--vcl-fs-12);\n  line-height: 16px;\n}\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    expect(out).toContain('裸字号规则 0 条')
  })

  it('.vue 只看 <style>：<script> 里的 font-size 字样不算声明', () => {
    const root = makeRoot('vue-script', {
      'x/A.vue': `<script setup>\nconst s = 'font-size: 12px'\n</script>\n<style>\n.a { color: red; }\n</style>\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    expect(out).toContain('裸字号规则 0 条')
  })

  it('注释里的 font-size 不算：剥注释后不误报', () => {
    const root = makeRoot('comment', {
      'x/a.css': `.a {\n  /* 旧写法 font-size: 12px; 已删 */\n  color: red;\n}\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(0)
  })

  it('@media 里的裸字号会被单独计数（不被外层已配对规则赦免）', () => {
    const root = makeRoot('media', {
      'x/a.css': `.a {\n  font-size: 12px;\n  line-height: 16px;\n}\n@media (max-width: 767px) {\n  .a { font-size: 13px; }\n}\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(1)
    expect(out).toContain('1 条')
  })
})

describe('check:type-tokens · 盒子高度有契约的块不计（密排前提）', () => {
  it('显式 height 的块不计数：高度已定死，补行高只会撑高', () => {
    const root = makeRoot('box-height', {
      'x/a.css': `.chip {\n  height: calc(24px * var(--vcl-scale));\n  font-size: 12px;\n}\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(0)
    expect(out).toContain('0 条')
  })

  it('flex + align-items:center 的块不计数：文字由盒模型居中，行高不参与行距', () => {
    const root = makeRoot('centered', {
      'x/a.css': `.row {\n  display: flex;\n  align-items: center;\n  font-size: 12px;\n}\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(0)
  })

  it('**负向对照**：同样 flex 但没居中 → 仍计数（豁免不能漏成整片赦免）', () => {
    const root = makeRoot('flex-not-centered', {
      'x/a.css': `.row {\n  display: flex;\n  font-size: 12px;\n}\n`,
    }, 0)
    const { code, out } = run(root)
    expect(code, out).toBe(1)
    expect(out).toContain('超过止涨线 0 条')
  })

  it('纯文字块（无高度契约、不居中）→ 计数，这正是要迁移的那类', () => {
    const root = makeRoot('text-block', {
      'x/a.css': `.empty {\n  padding: 20px;\n  text-align: center;\n  font-size: 12px;\n}\n`,
    }, 0)
    const { code } = run(root)
    expect(code).toBe(1)
  })
})

describe('check:type-tokens · 棘轮只许降', () => {
  it('--update 想把基线调高 → 失败（防止用「更新基线」当后门）', () => {
    const root = makeRoot('ratchet', {
      'x/a.css': `.a { font-size: 12px; }\n.b { font-size: 13px; }\n`,
    }, 0)
    const { code, out } = run(root, ['--update'])
    expect(code, out).toBe(1)
    expect(out).toContain('只许降不许涨')
  })

  it('--update 降基线 → 成功并写回', () => {
    const root = makeRoot('ratchet-down', {
      'x/a.css': `.a { font-size: 12px; }\n`,
    }, 5)
    const { code } = run(root, ['--update'])
    expect(code).toBe(0)
    expect(JSON.parse(readFileSync(join(root, 'type-token-baseline.json'), 'utf8')).count).toBe(1)
  })

  it('扫描面为空 → 红（防路径写错时闸口静默空转）', () => {
    const root = join(TMP, 'empty')
    rmSync(root, { recursive: true, force: true })
    mkdirSync(join(root, 'src', 'components'), { recursive: true })
    writeFileSync(join(root, 'type-token-baseline.json'), JSON.stringify({ count: 0 }))
    const { code, out } = run(root)
    expect(code, out).toBe(1)
    expect(out).toContain('扫描面为空')
  })
})
