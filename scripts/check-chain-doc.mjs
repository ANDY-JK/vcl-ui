#!/usr/bin/env node
/**
 * `check:chain-doc` —— README 里**手写**的链步数必须与真源一致
 *
 * ## 为什么需要这道闸口
 *
 * 链步数是"手写数字"，而 `check:facts` 只校 `docs-site/` 正文里的 6 类事实
 * （域数 / 组件数 / i18n 键数 / 步数 / 页数 / 事件码）—— **README 不在受检正文里**。
 * 于是它漂过两次：
 *
 * | 时间 | README 写的 | 当时实际 |
 * | --- | --- | --- |
 * | #350 之前 | 快链 6 步 / 整链 27 步 | 17 / 43 |
 * | 2026-11-08 本轮 | 快链 18 步 / 整链 43 步 | **28 / 57** |
 *
 * 同类缺陷的共同形态：**受检文件里有一句不受检的话**，读的人默认它已经被验过。
 *
 * ## 真源与判据
 *
 * 真源就是 `scripts/quality-check.mjs` 本身：
 *   - `QUICK_STEPS` 的条目数 = 快链步数
 *   - `STEPS` 的条目数    = 整链步数
 * 这里用**静态解析**而不是 import：那个模块顶层会真的跑链（import 即执行）。
 *
 * 判据：README 里凡出现 `快链**：… **N 步` / `整链**：… **N 步` 形态，N 必须等于真源值。
 * 找不到该形态 → 也算失败（有人把句子删了/改写了，闸口就失去观测点，必须显式更新规则）。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()

// 注释剥离用的两个正则单独提出来：直接内联写进 .replace 时，反斜杠很容易在
// 多轮命令/脚本编辑里被吃掉（本轮就发生过一次），提出来只需维护一处。
const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g
const LINE_COMMENT_RE = /\/\/.*$/gm

/**
 * 从 quality-check.mjs 源码里数出两档链的步数（静态解析，不执行模块）
 *
 * 两种形态都要吃得下：
 *   - STEPS：每步一行 `  ['name', 'cmd'],`
 *   - QUICK_STEPS：一整个单行数组（含行内 `//` 注释），也可能跨行
 * 所以先剥注释，再数**引号里的字符串字面量**个数。
 */
export function readChainTruth(source) {
  const findBlock = (name) => {
    const start = source.indexOf(`const ${name} = [`)
    if (start < 0) return null
    let i = source.indexOf('[', start)
    let depth = 0
    for (; i < source.length; i++) {
      if (source[i] === '[') depth++
      else if (source[i] === ']' && --depth === 0) return source.slice(start, i + 1)
    }
    return null
  }

  const count = (name) => {
    const block = findBlock(name)
    if (!block) return null
    // 剥掉行注释与块注释，避免注释里的引号被算成条目
    const code = block.replace(BLOCK_COMMENT_RE, '').replace(LINE_COMMENT_RE, '')
    const literals = code.match(/'[^']*'/g) ?? []
    return name === 'STEPS' ? literals.length / 2 : literals.length
  }

  return { quick: count('QUICK_STEPS'), all: count('STEPS') }
}

/**
 * 判据（纯函数，便于负向对照）。
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function judgeChainDoc(readme, truth) {
  const issues = []
  const rules = [
    // README 的写法是 `**快链**：… —— **28 步 / 约 5 分钟**`：数字后面还跟着时长，
    // 所以只锚到「N 步」为止，不要要求步数紧跟收尾的 `**`。
    { key: '快链', expected: truth.quick, re: /快链\*\*[^\n]*?\*\*(\d+)\s*步/ },
    { key: '整链', expected: truth.all, re: /整链\*\*[^\n]*?\*\*(\d+)\s*步/ },
  ]
  for (const r of rules) {
    const m = r.re.exec(readme)
    if (!m) {
      issues.push(`README 里找不到「${r.key} N 步」的写法 —— 闸口失去观测点，请同步更新判据（真源：${r.expected} 步）`)
      continue
    }
    const written = Number(m[1])
    if (written !== r.expected) {
      issues.push(`README 写的是「${r.key} ${written} 步」，真源是 **${r.expected}** 步（${r.key}一栏请改成 ${r.expected}）`)
    }
  }
  return { ok: issues.length === 0, issues }
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)
if (isMain) {
  const truth = readChainTruth(readFileSync(resolve(ROOT, 'scripts/quality-check.mjs'), 'utf8'))
  if (truth.quick === null || truth.all === null) {
    console.error('❌ check:chain-doc 无法从 scripts/quality-check.mjs 解析出 QUICK_STEPS / STEPS')
    process.exit(1)
  }
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
  const { ok, issues } = judgeChainDoc(readme, truth)
  if (!ok) {
    console.error(`❌ check:chain-doc 未通过 —— ${issues.length} 处：`)
    for (const i of issues) console.error(`   - ${i}`)
    console.error('\n修法：把 README「闸口的本地执行者」一节里的步数改成真源值。')
    process.exit(1)
  }
  console.log(`✅ check:chain-doc 通过 — README 的步数与真源一致（快链 ${truth.quick} / 整链 ${truth.all}）`)
}
