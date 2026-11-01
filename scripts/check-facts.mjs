// 口径单一真源闸口（审查 6.2 #8 / R5-D8）
//
// 两件事：
//   ① **漂移**：重算一遍与已提交的 docs-site/guide/facts.md 逐字节比 → 不一致即红
//   ② **冲突**：扫正文里硬编码的「N 个域 / N 个组件 / N 个键 / 整链 N 步」→ 与真源不符即红
//
// 为什么 ② 才是关键：光有生成页没用。这个仓的坑从来不是「没有真源」，
// 而是**正文里手写的数字悄悄过期**——生成页没人看，正文天天被看。
// 实测过三次：首页「14 个域」（实际 13）、README「60+ 组件」（实际 65）、
// 行数止涨线注释 4 处里 3 处不符。
//
// 柔/硬两档：
//   · **硬**：精确数字与真源矛盾 → 红（如「15 个域」而真源是 13）
//   · **柔**：模糊表述（「60+ 组件」）→ 仅警告。它的语义没错（65 确实 > 60），
//     但会让读者得到偏小的印象，属于该改不该拦。
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * 自测支持（#351）：
 * · `--root <dir>`  —— 正文扫描的根（默认 cwd）。夹具里只放被测的正文文件，其余 PROSE 会自然跳过
 * · `--facts <file>` —— 用给定文本当真源，**跳过"重算再比"那一步**（夹具不该依赖真实源码）
 */
const rootArgIdx = process.argv.indexOf('--root')
const factsArgIdx = process.argv.indexOf('--facts')
const ROOT = rootArgIdx > -1 ? resolve(process.argv[rootArgIdx + 1]) : process.cwd()
const FACTS = join(ROOT, 'docs-site', 'guide', 'facts.md')
/** 同一批生成物：observability.md 与 facts.md 都由 gen:facts 产出，都要防漂移 */
const OBS = join(ROOT, 'docs-site', 'guide', 'observability.md')
const TMP_DIR = join(ROOT, 'reports', '.facts-check')

const failures = []
const warnings = []

// ── ① 漂移 ─────────────────────────────────────────────
// 与 check:docs 同款：**生成到临时目录再比**，绝不改动已提交文件。
// 为什么必须这样：若让生成器直接覆盖 facts.md，闸口就"自我修复"了 ——
// 第一次跑报红、第二次跑因为文件已被改对反而绿。那它就不是闸口，是自动修复器。

const tmpOut = join(TMP_DIR, 'facts.md')
let fresh
if (factsArgIdx > -1) {
  // 夹具模式：真源直接给文本，不重算、也不做漂移比对
  fresh = readFileSync(process.argv[factsArgIdx + 1], 'utf8')
} else try {
  mkdirSync(TMP_DIR, { recursive: true })
  execFileSync('node', ['scripts/gen-facts.mjs', tmpOut], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  fresh = readFileSync(tmpOut, 'utf8')
} catch (e) {
  failures.push(`gen:facts 执行失败：${e instanceof Error ? e.message : String(e)}`)
}

// 生成器一次产出两份文件：facts.md 与 observability.md。两份都要比。
if (factsArgIdx === -1) for (const [committedPath, tmpPath, label] of [
  [FACTS, tmpOut, 'facts.md'],
  [OBS, join(TMP_DIR, 'observability.md'), 'observability.md'],
]) {
  let c
  try {
    c = readFileSync(committedPath, 'utf8')
  } catch {
    failures.push(`找不到 ${relative(ROOT, committedPath)} —— 先跑 npm run gen:facts 生成`)
    continue
  }
  let f
  try {
    f = readFileSync(tmpPath, 'utf8')
  } catch {
    failures.push(`gen:facts 未产出 ${label}`)
    continue
  }
  if (c !== f) {
    const cl = c.split('\n')
    const fl = f.split('\n')
    const firstDiff = cl.findIndex((l, i) => l !== fl[i])
    failures.push(
      `${label} 与真源不一致（第 ${firstDiff + 1} 行起）—— 跑 npm run gen:facts 重新生成并提交\n` +
        `      已提交：${(cl[firstDiff] ?? '(缺行)').slice(0, 100)}\n` +
        `      真  源：${(fl[firstDiff] ?? '(缺行)').slice(0, 100)}`,
    )
  }
}

// 真源值从生成结果里读回来（不重复实现一遍计算逻辑）
function fact(re) {
  const m = fresh?.match(re)
  return m ? Number(m[1]) : null
}

const F = {
  domains: fact(/\| 域入口数 \| \*\*(\d+)\*\*/),
  components: fact(/\| 组件数 \| \*\*(\d+)\*\*/),
  named: fact(/\| 命名导出数 \| \*\*(\d+)\*\*/),
  demoPages: fact(/\| demo 组件演示页数 \| \*\*(\d+)\*\*/),
  keys: fact(/\| zh-CN \| \*\*(\d+)\*\*/),
  steps: fact(/\| 整链步数 \| \*\*(\d+)\*\*/),
}

for (const [k, v] of Object.entries(F)) {
  if (v === null) failures.push(`facts.md 里读不出「${k}」，生成器格式可能变了`)
}

// 若仓库里已有 facts.md，与刚生成的比

// ── ② 正文数字冲突 ─────────────────────────────────────
/**
 * 要扫的正文（facts.md 自己是真源，跳过；生成类文档跳过）。
 *
 * **刻意不扫 `docs/`**：那里是历史审查报告，保留的是**当时**的数字
 * （2026-09-24 的报告就该写那天的用例数）。让今天的真源去改历史报告，
 * 等于伪造当时的状态。这条边界要写清楚，否则后来者会以为漏了。
 */
const PROSE = [
  'README.md',
  'docs-site/index.md',
  'docs-site/guide/introduction.md',
  'docs-site/guide/install.md',
  'docs-site/guide/quick-start.md',
  'docs-site/guide/theming.md',
  'docs-site/guide/i18n.md',
  'docs-site/guide/web-components.md',
  'docs-site/guide/migration-2.0.md',
  'docs-site/guide/faq.md',
  'docs-site/guide/troubleshooting.md',
  'docs-site/guide/comparison.md',
  'docs-site/guide/glossary.md',
  // 低代码指南：读者是要照着它"部署到服务器"的，里面一旦出现组件数/键数这类
  // 会漂移的数字就必须被真源校验（第 104 轮纳入；此前它不在受检清单里）
  'docs-site/guide/lowcode.md',
]

/** 每条规则：正则里的第 1 组是真源值对应的数字，name 用于报错 */
const RULES = [
  { re: /(\d+)\s*个(?:组件)?域/g, truth: () => F.domains, name: '域数' },
  { re: /(\d+)\s*域(?:入口|独立构建产物)?/g, truth: () => F.domains, name: '域数' },
  { re: /(\d+)\s*个组件(?!域)/g, truth: () => F.components, name: '组件数' },
  { re: /组件\s*(\d+)\s*个/g, truth: () => F.components, name: '组件数' },
  { re: /(\d+)\s*个键/g, truth: () => F.keys, name: 'i18n 键数' },
  { re: /键\s*(\d+)\s*个/g, truth: () => F.keys, name: 'i18n 键数' },
  { re: /整链\s*\**(\d+)\**\s*步/g, truth: () => F.steps, name: '整链步数' },
  { re: /(\d+)\s*步(?:机械)?闸口/g, truth: () => F.steps, name: '整链步数' },
  // "N 页交互示例" 曾经是手写没人校验的（第 104 轮实测 49 ≠ 46）
  { re: /(\d+)\s*页(?:组件)?交互示例/g, truth: () => F.demoPages, name: 'demo 演示页数' },
]

/** 模糊表述：只警告 */
const LOOSE = [
  { re: /(\d+)\+\s*组件/g, truth: () => F.components, name: '组件数（模糊写法）' },
  { re: /(\d+)\+\s*个组件/g, truth: () => F.components, name: '组件数（模糊写法）' },
]

/** 某一行是否在讲「派生计数」而非总量 —— 这类行豁免规则一（总量规则） */
function isDerivedCountLine(line) {
  return /_internal|`shared`|覆盖地板|覆盖闸口|其中|不含|另有/.test(line)
}

for (const file of PROSE) {
  let text
  try {
    text = readFileSync(join(ROOT, file), 'utf8')
  } catch {
    continue // 文件不存在不算错（不同分支可能没这些页）
  }
  const lines = text.split('\n')
  for (const [i, line] of lines.entries()) {
    const derived = isDerivedCountLine(line)
    for (const { re, truth, name } of RULES) {
      // 域数规则遇到「派生计数」行直接跳过：`12 个域 + _internal + shared` 是合法的子集说法
      if (derived && name === '域数') continue
      re.lastIndex = 0
      for (const m of line.matchAll(re)) {
        const got = Number(m[1])
        const want = truth()
        // 只查「量级相当」的候选，避免把第 2 章第 13 条这类误伤
        if (want === null) continue
        if (got === want) continue
        // 行号/坐标之类的噪音：值远小于真源且差距 > 50% 时放过
        if (got < want * 0.5 || got > want * 2) continue
        failures.push(
          `${file}:${i + 1} ${name}写的是 **${got}**，真源是 **${want}** —— ` +
            `请改成引用 docs-site/guide/facts.md，或跑 npm run gen:facts 对齐\n      原文：${line.trim().slice(0, 110)}`,
        )
      }
    }
    for (const { re, truth, name } of LOOSE) {
      re.lastIndex = 0
      for (const m of line.matchAll(re)) {
        const got = Number(m[1])
        const want = truth()
        if (want === null || got >= want) continue // "60+" 在 65 时是"没错但不准"
        warnings.push(
          `${file}:${i + 1} ${name}「${got}+」低于真源 ${want} —— 语义没错但读者会得到偏小印象，建议改成精确值`,
        )
      }
    }
  }
}

// 清临时产物
try {
  rmSync(TMP_DIR, { recursive: true, force: true })
} catch {
  /* ignore */
}

// ── 汇总 ───────────────────────────────────────────────
console.log('')
console.log(
  `   真源：域 ${F.domains} / 组件 ${F.components} / 命名导出 ${F.named} / zh-CN 键 ${F.keys} / 整链 ${F.steps} 步`,
)
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} 条模糊表述（不判失败）：`)
  for (const w of warnings) console.log(`   · ${w}`)
}
if (failures.length) {
  console.error(`\n❌ check:facts 未通过 —— 正文与真源不一致 ${failures.length} 处：\n`)
  for (const f of failures) console.error(`   - ${f}`)
  console.error('\n   说明：可核验事实的单一真源是 docs-site/guide/facts.md（由 gen:facts 生成）。')
  console.error('   正文要么引用它，要么写精确值；不要手写一个"差不多"的旧数。')
  process.exit(1)
}
console.log(`\n✅ check:facts 通过 — 正文数字与真源一致（已扫 ${PROSE.length} 个正文文件）`)
