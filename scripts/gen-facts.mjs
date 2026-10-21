// 口径单一真源（审查 6.2 #8 / R5-D8）：把「可核验的事实」集中算一次，产出 facts.md。
//
// 为什么需要它：这个仓里出现过**同一事实三处不同值**——
//   · docs-site 首页写「14 个组件域」，实际 13（构建入口口径）
//   · README 写「60+ 组件」，实际 65
//   · 4 处行数注释里有 3 处已经和现实不符（H#51 才改成脚本算）
// 手写快照必然过期，而「过期」不会报错——它只是慢慢变成谎话。
//
// 本脚本的反面是 `check:facts`：
//   ① 重算一遍与已提交的 facts.md 比字节 → 漂移即红
//   ② 扫正文里硬编码的「N 个域 / N 个组件 / N 个用例」→ 与真源冲突即红
// ② 是这条链的关键：光有生成页没用，正文里手写的数字才是真正会对不上的地方。
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { generate } from './gen-docs.mjs'

const ROOT = process.cwd()
// 可选输出路径（供 check:facts 生成到临时目录比对用）。
// 不传就写回仓库里的 facts.md —— 这样闸口不会"自我修复"，
// 否则第一次跑报红、第二次跑因为文件被改对了反而绿，等于闸口不可幂等。
const OUT = process.argv[2] ? resolve(process.argv[2]) : join(ROOT, 'docs-site', 'guide', 'facts.md')

/** 构建入口口径的域清单（package.json exports 里去掉辅助子路径） */
function domainEntries() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const aux = new Set(['.', './css', './styles', './i18n', './dist/*', './package.json'])
  return Object.keys(pkg.exports ?? {})
    .filter((k) => !aux.has(k))
    .map((k) => k.replace(/^\.\//, ''))
}

/** 语言包键数（与 check:i18n 同一套扁平化规则，避免两处口径分叉） */
async function i18nKeys() {
  const base = resolve(ROOT, 'src', 'components', '_internal', 'locales', 'chunks')
  const flat = (obj, prefix = '', out = []) => {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, p, out)
      else out.push(p)
    }
    return out
  }
  const out = {}
  for (const loc of ['zh-CN', 'en-US']) {
    let n = 0
    const files = readdirSync(join(base, loc)).filter((f) => f.endsWith('.ts'))
    for (const f of files) {
      const mod = await import(pathToFileURL(join(base, loc, f)).href)
      n += flat(mod.default ?? {}).length
    }
    out[loc] = { keys: n, files: files.length }
  }
  return out
}

/** 整链步数（从 --list 真取，不数代码里的数组长度） */
function gateSteps() {
  const out = execFileSync('node', ['scripts/quality-check.mjs', '--list'], { encoding: 'utf8' })
  const lines = out.split('\n').filter((l) => /^\s*\d+\.\s/.test(l))
  return { count: lines.length, names: lines.map((l) => l.trim().replace(/^\d+\.\s*/, '').split(/\s+/)[0]) }
}

/** 单测规模：从最近一次整链留痕读（没有就标"未测"）。**不跑测试**，只读留痕。 */
function testScale() {
  try {
    const t = readFileSync(join(ROOT, 'reports', 'quality-check-logs', '15-test-unit.log'), 'utf8')
    const files = t.match(/Test Files\s+(\d+) passed/)
    const tests = t.match(/Tests\s+(\d+) passed/)
    if (files && tests) return { files: Number(files[1]), tests: Number(tests[1]) }
  } catch {
    /* 没跑过整链 */
  }
  return null
}

async function main() {
  // 组件/命名导出数：复用 gen-docs 的解析（它已是「组件清单」的既有真源）
  const tmp = join(ROOT, 'reports', '.facts-tmp')
  const manifest = generate(tmp)
  const domains = domainEntries()
  const keys = await i18nKeys()
  const steps = gateSteps()
  const scale = testScale()

  const lines = [
    '---',
    'title: 事实清单（自动生成）',
    '---',
    '',
    '# 事实清单',
    '',
    '> ⚠️ **本页由 `npm run gen:facts` 生成，请勿手改。**',
    '> 漂移会被 `check:facts` 拦下；正文里硬编码的数字与这里冲突也会被拦下。',
    '',
    '可核验事实的**单一真源**。文档正文只应引用本页，不要手写这些数字。',
    '',
    '## 结构规模',
    '',
    '| 事实 | 值 | 怎么算的 |',
    '| --- | --- | --- |',
    `| 域入口数 | **${domains.length}** | \`package.json\` 的 \`exports\`，去掉 \`./css\`/\`./i18n\` 等辅助子路径 |`,
    `| 组件数 | **${manifest.totalComponents}** | \`gen:docs\` 解析 \`defineProps\`/\`defineEmits\`/\`defineSlots\` 得到 |`,
    `| 命名导出数 | **${manifest.totalNamed}** | 同上，含类型与 composable |`,
    `| 解析失败组件 | **${manifest.unparsed.length}** | 应为 0；非 0 时 \`check:docs\` 直接红 |`,
    '',
    '域入口清单：',
    '',
    ...domains.map((d) => `- \`vcl-ui/${d}\``),
    '',
    '## 语言包',
    '',
    '| 语言 | 键数 | 分块文件 |',
    '| --- | --- | --- |',
    `| zh-CN | **${keys['zh-CN'].keys}** | ${keys['zh-CN'].files} |`,
    `| en-US | **${keys['en-US'].keys}** | ${keys['en-US'].files} |`,
    '',
    keys['zh-CN'].keys === keys['en-US'].keys
      ? `两侧键数一致（${keys['zh-CN'].keys}）。\`check:i18n\` 逐块比对键集，不只是数量。`
      : `⚠️ **两侧键数不一致**：zh-CN ${keys['zh-CN'].keys} vs en-US ${keys['en-US'].keys} —— 闸口应当报红。`,
    '',
    '内置语言**只有这两门**。其他语言需宿主通过覆盖键值实现，库不提供官方包。',
    '',
    '## 质量闸口',
    '',
    `| 事实 | 值 |`,
    `| --- | --- |`,
    `| 整链步数 | **${steps.count}** |`,
    '',
    '步清单（顺序即执行顺序）：',
    '',
    ...steps.names.map((n, i) => `${i + 1}. \`${n}\``),
    '',
  ]

  if (scale) {
    lines.push(
      '## 测试规模（读自最近一次整链留痕）',
      '',
      '| 事实 | 值 |',
      '| --- | --- |',
      `| 单测文件数 | **${scale.files}** |`,
      `| 单测用例数 | **${scale.tests}** |`,
      '',
      '::: info 这两个数会随每次提交变化',
      '它们来自 `reports/quality-check-logs/15-test-unit.log`（**每次整链运行前清空**），',
      '所以只反映最近一次整链。闸口**不拦**这两个数的漂移，只拦结构规模与语言包键数。',
      ':::',
      '',
    )
  }

  lines.push(
    '## 为什么要有这一页',
    '',
    '因为「手写的数字」会**安静地过期**——它不会报错，只是慢慢变成谎话。实测过的三次：',
    '',
    '1. 文档站首页写「14 个组件域」，实际 **13**（把手 `_internal`/`shared` 也算成了域）',
    '2. README 写「60+ 组件」，实际 **65**（三年前的口径，之后没人回头改）',
    '3. 「行数止涨线」注释里 4 处手写快照，**3 处**已与实测不符（H#51 改成脚本算才收口）',
    '',
    '所以这里的规矩是：**能算的绝不手写；必须手写的，用闸口对着真源查。**',
    '',
  )

  writeFileSync(OUT, lines.join('\n'), 'utf8')
  console.log(
    `[gen:facts] 域 ${domains.length} / 组件 ${manifest.totalComponents} / 命名导出 ${manifest.totalNamed} / ` +
      `zh-CN 键 ${keys['zh-CN'].keys} / 整链 ${steps.count} 步 → ${OUT.replace(ROOT, '.')}`,
  )
}

await main()
