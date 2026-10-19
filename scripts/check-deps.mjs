/**
 * check:deps —— 依赖树健康闸口（审查 R5-B12 / 路线图 6.2 #3）
 *
 * `npm ls --all` 在当前依赖树上报 1 条 invalid 边并以退出码 1 结束：
 *
 *   @vue/language-core@2.2.12 invalid: "^3.1.5" from …/unplugin-dts
 *
 * **这条是噪音，不是缺陷**，依据（已实测）：
 *   · `@vue/language-core` 在 `unplugin-dts` 的 `peerDependenciesMeta` 里标着 **optional: true**；
 *   · 本项目经 `vite-plugin-dts` 走的是 **`unplugin-dts/vite`** 入口，而 `dist/vite.cjs`
 *     与 `dist/vite.mjs` **都不引用** `@vue/language-core`（只有 `vue.cjs`/`vue.mjs` 才 require）；
 *   · 因此实际运行期根本不加载它，版本不匹配不影响 .d.ts 生成。
 *
 * 为什么不直接把依赖升上去：唯一的"正解"是升 `vue-tsc` 到 3.x 以满足 `^3.1.5`，
 * 但实测 `vue-tsc@3.3.13` 依赖的 `@vue/language-core@3.3.13` 会调用
 * `isTypeAssertionExpression`，在当前 `typescript@5.4` 的 `tsc.js` 里取不到 —— **typecheck 直接崩**，
 * 而且它**退出码仍是 0**（闸口会静默失效）。升级需要连带升 TS 到 5.7+，属于另一件事，
 * 不该为了让 `npm ls` 好看而把整条 typecheck 闸口置于风险中。
 *
 * 所以本闸口的立场是：**把已知噪音显式登记，让任何新增的 invalid 立刻变红**。
 * 这比"因为有一条噪音就干脆不看依赖树"要强得多。
 */
import { execSync } from 'node:child_process'

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

let out
try {
  // npm ls --all 在有 invalid 时退出码为 1，所以必须捕获 stdout 而不是靠退出码
  out = execSync('npm ls --all', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
} catch (e) {
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`
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
