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
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { generate } from './gen-docs.mjs'

const ROOT = process.cwd()
// 可选输出路径（供 check:facts 生成到临时目录比对用）。
// 不传就写回仓库里的 facts.md —— 这样闸口不会"自我修复"，
// 否则第一次跑报红、第二次跑因为文件被改对了反而绿，等于闸口不可幂等。
const OUT_ARG = process.argv[2] ? resolve(process.argv[2]) : null
const OUT = OUT_ARG ?? join(ROOT, 'docs-site', 'guide', 'facts.md')
// observability.md 与 facts.md 同批产出：两者都是「从源码算出来、不许手写」的事实
const OUT_OBS = OUT_ARG ? join(resolve(OUT_ARG), '..', 'observability.md') : join(ROOT, 'docs-site', 'guide', 'observability.md')

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

/** 枚举全部结构化事件码（reportEvent 调用点）—— 宿主据此建告警 */
function eventCatalog() {
  const files = []
  const rec = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) rec(p)
      else if (/\.(ts|vue)$/.test(e.name)) files.push(p)
    }
  }
  rec(join(ROOT, 'src', 'components'))

  const rows = []
  for (const f of files) {
    const text = readFileSync(f, 'utf8')
    const lines = text.split('\n')
    for (const [i, line] of lines.entries()) {
      // reportEvent('code', 'message', ctx, 'level')
      const m = line.match(/reportEvent\(\s*'([^']+)',\s*'([^']*)'(?:,\s*([^,]+))?(?:,\s*'(info|warn|error)')?/)
      if (!m) continue
      rows.push({
        code: m[1],
        message: m[2],
        level: m[4] ?? 'warn',
        context: m[3] && m[3] !== 'undefined' ? m[3].trim() : '',
        at: `${relative(ROOT, f).replaceAll('\\', '/')}:${i + 1}`,
      })
    }
  }
  rows.sort((a, b) => a.code.localeCompare(b.code))
  return rows
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

  // ── observability.md：宿主可用的可观测信号清单 ──
  const events = eventCatalog()
  const byLevel = (lv) => events.filter((e) => e.level === lv).length
  const obs = [
    '---',
    'title: 可观测信号清单（自动生成）',
    '---',
    '',
    '# 可观测信号清单',
    '',
    '> ⚠️ **本页由 `npm run gen:facts` 从源码生成，请勿手改。** 漂移会被 `check:facts` 拦下。',
    '',
    '宿主把库内的警告/错误/事件接进自己的监控（埋点、Sentry、告警平台）只需两步：',
    '',
    '```ts',
    "import { setRuntimeObserver } from 'vcl-ui/_internal/runtime-observer'",
    '',
    'setRuntimeObserver({',
    '  event: (e) => {',
    '    // e.code 是稳定事件码，按它建告警规则；不要用 message（可能本地化）',
    '    myTelemetry.track(e.code, { level: e.level, ...e.context })',
    '  },',
    '  warn: (...args) => myLogger.warn(...args),',
    '  error: (...args) => myLogger.error(...args),',
    '})',
    '```',
    '',
    '## 路由规则（只投一次，不重复上报）',
    '',
    '1. 宿主实现了 `event` → **只投** `event`（结构化管道，宿主自己决定要不要再落文本日志）',
    '2. 否则退到 `warn` / `error`（只接了文本管道的宿主也能收到，不丢信息）',
    '3. 再退到 `console`（未注入 observer 时行为与迁移前逐字一致）',
    '',
    '**宿主管道抛异常不会打断组件数据流**：报一次并降级 console（故障可见，不静默吞）。',
    '',
    '## 事件码清单',
    '',
    `共 **${events.length}** 个事件码（error ${byLevel('error')} / warn ${byLevel('warn')} / info ${byLevel('info')}）。`,
    '',
    '| 事件码 | 级别 | 触发场景 | context 字段 | 代码位置 |',
    '| --- | --- | --- | --- | --- |',
    ...events.map(
      (e) =>
        `| \`${e.code}\` | ${e.level} | ${e.message.replaceAll('|', '\\|')} | ${e.context ? `\`${e.context.replaceAll('|', '\\|')}\`` : '—'} | \`${e.at}\` |`,
    ),
    '',
    '## 该按哪些码建告警',
    '',
    '**必须告警（error 级）**——用户直接看不到东西：',
    '',
    ...events
      .filter((e) => e.level === 'error')
      .map((e) => `- \`${e.code}\` —— ${e.message.replace(/^\[[^\]]+\]\s*/, '')}`),
    '',
    '**建议聚合观察（warn 级）**——功能降级但仍可用，按小时聚合看趋势：',
    '',
    ...events
      .filter((e) => e.level === 'warn')
      .map((e) => `- \`${e.code}\` —— ${e.message.replace(/^\[[^\]]+\]\s*/, '')}`),
    '',
    '## 边界（如实声明）',
    '',
    '- 这里只列**结构化事件**。库内还有大量 `reportWarn` 自由文本（如墓碑清理、对象名校验），',
    '  它们只能"存下来给人看"，**没有稳定码**，不适合建告警规则。',
    `- 当前事件覆盖集中在 4 个域（${[...new Set(events.map((e) => e.code.split('/')[0]))].join(' / ')}）；`,
    '  其余域的失败路径仍是自由文本。新增失败路径时优先用 `reportEvent`。',
    '- 事件**不含任何用户数据字段值**（只带 key/id/错误串），避免把 PII 送进监控系统。',
    '',
  ]
  writeFileSync(OUT_OBS, obs.join('\n'), 'utf8')

  console.log(
    `[gen:facts] 域 ${domains.length} / 组件 ${manifest.totalComponents} / 命名导出 ${manifest.totalNamed} / ` +
      `zh-CN 键 ${keys['zh-CN'].keys} / 整链 ${steps.count} 步 / 事件码 ${events.length} → ${relative(ROOT, OUT)}`,
  )
}

await main()
