#!/usr/bin/env node
/**
 * check-gate-wiring —— 每道闸口都必须真的在跑（#334 / #335）
 *
 * ## 为什么需要
 *
 * #334 的教训：某道附录校验闸口脚本存在、能手动跑，却**不在质量链里**，
 * 于是连续 9 行附录列错位没人发现。**"闸口存在"不等于"闸口在跑"** ——
 * 而这种事靠人记是记不住的：新增闸口时最容易漏的就是"把它接进链"。
 *
 * ## 判据（三条，都能一眼判定）
 *
 * 1. `scripts/check-*.mjs` 每个都要在 `scripts/quality-check.mjs` 的 STEPS 里出现
 * 2. 每个都要在 `package.json` 里有对应 `check:*` 脚本（链里按 npm 名调用）
 * 3. STEPS 里引用的 `check:*` 反过来必须存在对应脚本（防止删了脚本留死链）
 *
 * ## 为什么不做"必须进快链"
 *
 * 快链是给提交前跑的子集（有耗时预算），**不是每道闸口都适合进**（比如 e2e、
 * 依赖审计）。所以这里只要求"进整链"，快链的选择留给维护者。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** 扫描根：默认仓库根；自测时 --root 指到夹具目录（内含 scripts/ 与 package.json） */
const rootIdx = process.argv.indexOf('--root')
const ROOT = rootIdx > -1 ? resolve(process.argv[rootIdx + 1]) : '.'
const CHAIN_FILE = join(ROOT, 'scripts/quality-check.mjs')
const PKG_FILE = join(ROOT, 'package.json')

const problems = []

if (!existsSync(CHAIN_FILE) || !existsSync(PKG_FILE)) {
  console.error('✖ check:gate-wiring 找不到 quality-check.mjs 或 package.json')
  process.exit(1)
}

const chain = readFileSync(CHAIN_FILE, 'utf8')
const pkg = JSON.parse(readFileSync(PKG_FILE, 'utf8'))
const npmScripts = pkg.scripts ?? {}

/** 仓库里的闸口脚本 → 期望的 npm 名 */
const gates = readdirSync(join(ROOT, 'scripts'))
  .filter((f) => /^check-.*\.mjs$/.test(f))
  .sort()
  .map((f) => ({ file: `scripts/${f}`, npm: f.replace(/^check-/, 'check:').replace(/\.mjs$/, '') }))

for (const g of gates) {
  if (!chain.includes(g.npm)) {
    problems.push(`${g.file} 的 \`${g.npm}\` 不在 ${CHAIN_FILE} 的 STEPS 里 → 这道闸口永远不会跑`)
  }
  if (!npmScripts[g.npm]) {
    problems.push(`${g.file} 缺少 package.json 脚本 \`${g.npm}\` → 链里无法按名调用`)
  }
}

// 反向：链里提到的 check:* 必须有脚本
const referenced = new Set([...chain.matchAll(/'(check:[a-z0-9-]+)'/g)].map((m) => m[1]))
for (const name of referenced) {
  if (!npmScripts[name]) problems.push(`${CHAIN_FILE} 引用了 \`${name}\`，但 package.json 里没有这个脚本`)
}

if (problems.length) {
  console.error(`\n✖ check:gate-wiring 未通过（${problems.length} 处）：\n`)
  for (const p of problems) console.error('  - ' + p)
  console.error('\n修法：新增闸口后必须同时 ① 写 package.json 脚本 ② 加进 quality-check.mjs 的 STEPS。')
  console.error('      "闸口存在"不等于"闸口在跑" —— 漏接等于没写（#334）。\n')
  process.exit(1)
}

console.log(`✅ check:gate-wiring 通过 — ${gates.length} 道闸口全部接入质量链，且 npm 脚本齐备`)
