/**
 * 依赖树健康闸口（审查 R5-B12 / 路线图 6.2 #3）
 *
 * ## 测「锁」而不是「装出来的树」（#414）
 *
 * 早期这里跑 `npm ls --all`（树模式）。实测在**同一棵树、同一个锁**上它会给出两种答案：
 *   · `npm ci` 之后立即跑 → invalid **0** 条；
 *   · 只要 `node_modules` 里多出一个**未登记目录**（`vue-tsc` 每次 typecheck 都写
 *     `node_modules/.vue-global-types`），立刻变成 **8** 条 invalid，且 8 条全是假阳性：
 *     `@vue/server-renderer@3.5.44 invalid: "3.x" from …/@vue/test-utils, "3.5.44" from vue`
 *     —— `3.5.44` 明明满足 `3.x`；更糟的是**把目录删掉也不会恢复**（要重装才回到 0）。
 * 于是「质量链第 1 步 typecheck → 第 27 步 check:deps」注定红，红的是测量面而不是依赖。
 * 一条会因无关动作翻转的闸口比一条范围更窄的闸口更糟：红的时候没人信，绿的时候也不知道绿了什么。
 *
 * 现在改为 `npm ls --all --package-lock-only`（锁模式）：只读**仓库提交的** package-lock.json
 * 与 package.json 求值，不看安装目录里多出来的东西。同一状态下锁模式稳定 0 条、连跑两次一致。
 * 代价是"node_modules 被手工改坏"不再由本闸口负责 —— 那件事由 `npm ci` 复装与各构建步骤暴露。
 *
 * ## 历史噪音（保留登记）
 *
 * 旧树模式曾报 1 条：`@vue/language-core@2.2.12 invalid: "^3.1.5" from …/unplugin-dts`。
 * **这条是噪音**，依据（已实测）：
 *   · `@vue/language-core` 在 `unplugin-dts` 的 `peerDependenciesMeta` 里标着 **optional: true**；
 *   · 本项目经 `vite-plugin-dts` 走的是 **`unplugin-dts/vite`** 入口，而 `dist/vite.cjs`
 *     与 `dist/vite.mjs` **都不引用** `@vue/language-core`（只有 `vue.cjs`/`vue.mjs` 才 require）；
 *   · 因此实际运行期根本不加载它，版本不匹配不影响 .d.ts 生成。
 * 锁文件补齐 `@vue/language-core@3.3.14` / `@volar/language-core@2.4.30` / `@volar/source-map@2.4.30`
 * 三个缺失条目之后（提交 7617683），锁模式连这条也不再出现；KNOWN_NOISE 仍保留，
 * 作为它再次出现时的登记位 —— 删掉登记位等于把"下次再来"当成新缺陷，反而噪声更大。
 *
 * 为什么不直接把依赖升上去：唯一的"正解"是升 `vue-tsc` 到 3.x 以满足 `^3.1.5`，
 * 但实测 `vue-tsc@3.3.13` 依赖的 `@vue/language-core@3.3.13` 会调用
 * `isTypeAssertionExpression`，在当前 `typescript@5.4` 的 `tsc.js` 里取不到 —— **typecheck 直接崩**，
 * 而且它**退出码仍是 0**（闸口会静默失效）。升级需要连带升 TS 到 5.7+，属于另一件事，
 * 不该为了让 `npm ls` 好看而把整条 typecheck 闸口置于风险中。
 *
 * 本闸口的立场不变：**把已知噪音显式登记，让任何新增的 invalid 立刻变红**。
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * 取依赖树的命令。单独成常量是为了让自测能**行为式**钉住它（`--print-cmd`）：
 * 字符串 grep 挡不住"换一种拼法"，而跑一次脚本读它自报的命令可以。
 */
const NPM_LS_ARGS = ['ls', '--all', '--package-lock-only']

/**
 * 已登记的已知噪音：键是「包名@版本 + 来自谁」，值是登记理由。
 * 新增条目必须写清"为什么它是噪音"，否则下一个人无从判断该不该修。
 */
const KNOWN_NOISE = [
  {
    pkg: '@vue/language-core',
    // 匹配 npm ls 输出里的 invalid 描述行
    pattern: /@vue\/language-core@[\d.]+\s+(?:deduped\s+)?invalid:\s*"\^3\.1\.5"\s+from\s+node_modules\/vite-plugin-dts\/node_modules\/unplugin-dts/,
    reason:
      'unplugin-dts 的 optional peer；本项目走 unplugin-dts/vite 入口，该入口不引用 @vue/language-core（实测 dist/vite.cjs、vite.mjs 均无 require），运行期不加载',
  },
]

/**
 * 依赖树来源：默认现场跑 `npm ls --all --package-lock-only`（锁模式，见文件头 #414）；
 * 自测时用 `--input <file>` 读预存输出（跑一次 npm ls 要几秒且受安装目录状态影响，
 * 夹具用文件更稳、更快）。
 *
 * `--print-cmd` 只打印将要执行的命令就退出：让自测能确认**用的是锁模式**而不是树模式 ——
 * 这两种模式的差别不是风格问题，而是"同一状态下 0 条 vs 8 条假阳性"。
 */
const printCmd = process.argv.includes('--print-cmd')
if (printCmd) {
  console.log(`npm ${NPM_LS_ARGS.join(' ')}`)
  process.exit(0)
}

const inputIdx = process.argv.indexOf('--input')
let out
if (inputIdx > -1) {
  out = readFileSync(process.argv[inputIdx + 1], 'utf8')
} else {
  try {
    // npm ls 在有 invalid 时退出码为 1，所以必须捕获 stdout 而不是靠退出码
    out = execSync(`npm ${NPM_LS_ARGS.join(' ')}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
}

// 收集所有 invalid 描述行（去重：同一问题会同时出现在"直接"和"deduped"两处）
const invalidLines = [...new Set(
  out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /\binvalid:/.test(l))
    // 去掉 npm 错误摘要行（"npm error invalid: …"），只保留依赖树里的描述行
    .filter((l) => !l.startsWith('npm error')),
)]

const unexplained = []
for (const line of invalidLines) {
  const known = KNOWN_NOISE.some((k) => k.pattern.test(line))
  if (!known) unexplained.push(line)
}

console.log(`[1] invalid 边：${invalidLines.length} 条（已登记噪音 ${invalidLines.length - unexplained.length} 条）`)
for (const k of KNOWN_NOISE) console.log(`   · 已知噪音 ${k.pkg}：${k.reason}`)

if (unexplained.length) {
  console.error('\n❌ check:deps 未通过 —— 存在未登记的 invalid 依赖边：')
  for (const l of unexplained) console.error(`   - ${l}`)
  console.error(
    '\n   处理方式二选一：① 修掉它（升级/换版本）；② 若能证明是 optional peer 且运行期不加载，' +
      '登记到 scripts/check-deps.mjs 的 KNOWN_NOISE 并写清理由。',
  )
  process.exit(1)
}

console.log(`\n✅ check:deps 通过 — ${invalidLines.length} 条 invalid 均为已登记噪音，无未登记项`)
