/**
 * demo 案例覆盖度审计：组件 props 枚举值 vs 全部 demo 实际演示值 的差集
 *
 * check-demo-props 门禁卡「Props 表谎报」，本脚本卡「漏演示」：
 * 组件 defineProps 里的 union 枚举（variant?: 'a' | 'b'）若没有任何 demo 用过某个值，
 * 该变体就没有可视化案例。豁免：默认值（不传 prop 即默认，视为已演示）。
 * 计入范围：全部 demo 文件（跨 demo 使用同样算覆盖，如 Card.titleAs 在各页都用）。
 *
 * 用法：node scripts/audit-demo-coverage.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')

/** 从组件源码提取 union 枚举 prop 与默认值：{ unions, defaults } */
function extractUnions(compSrc) {
  const unions = {}
  const defaults = {}
  const iface = compSrc.match(/interface Props\s*(?:extends [\w.]+\s*)?\{([\s\S]*?)\n\}/)
  const body = iface ? iface[1] : compSrc
  for (const m of body.matchAll(/(\w+)\??:\s*([^;\n]+)[;\n]/g)) {
    const name = m[1]
    const type = m[2].trim()
    if (!type.includes('|')) continue
    const vals = [...type.matchAll(/'([^']+)'/g)].map((x) => x[1])
    if (vals.length >= 2) unions[name] = vals
  }
  // 默认值：withDefaults(defineProps<Props>(), { variant: 'primary' }) —— 不传即默认，视为已演示
  const wd =
    compSrc.match(/withDefaults\(\s*defineProps[^)]*\)\s*,\s*\{([\s\S]*?)\}\s*\)/) ||
    compSrc.match(/withDefaults\([\s\S]*?\}\s*,\s*\{([\s\S]*?)\}\s*\)/)
  const wdBody = wd ? (wd[1] ?? wd[2]) : null
  if (wdBody) for (const m of wdBody.matchAll(/(\w+)\s*:\s*'([^']+)'/g)) defaults[m[1]] = m[2]
  return { unions, defaults }
}

/** 所有 demo 模板里某 prop 的实际使用值 */
function usedValuesAll(demoSources, propCamel) {
  const kebab = propCamel.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())
  const vals = new Set()
  for (const src of demoSources) {
    for (const m of src.matchAll(new RegExp(`\\s:${kebab}="([^"]*)"|\\s${kebab}="([^"]*)"`, 'g'))) {
      const v = (m[1] ?? m[2] ?? '').trim()
      if (/^[\w-]+$/.test(v)) vals.add(v) // 字面量（含 404 等纯数字枚举；跳过变量绑定）
    }
  }
  return vals
}

const walk = (d, o = []) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name)
    if (f.isDirectory()) walk(p, o)
    else if (f.name.endsWith('.vue')) o.push(p)
  }
  return o
}

const demoMapSrc = read('src/demos/ComponentDemo.vue')
const pairs = [...demoMapSrc.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:\s*defineAsyncComponent(?:\(\{ loader: \(\) => import\('([^']+)'\)|\('([^']+)'\))/gm)]
  .map((m) => [m[1], m[2] || m[3]])
const allDemoSources = walk('src/demos').map((p) => read(p))

// 刻意不演示的 prop（route → props）：值在 demo 页内全量铺开会破坏其它 a11y/结构规则，
// consumer 按 API 文档用即可，不算「漏演示」缺口。
const EXEMPT_PROPS = {
  card: ['titleAs'], // 全量演示 h1/h4/h5/h6 会在 demo 页 h2 分组后跳级 → axe heading-order 违规（默认 h3/h2 已演示该 prop）
}

const rows = []
for (const [route, demoPath] of pairs) {
  const guess = demoPath.replace('./', '').replace('Demo.vue', '.vue').replace('Demo.ts', '.ts')
  const compFile = path.join('src/components', guess)
  if (!fs.existsSync(compFile)) {
    rows.push({ route, note: 'demo-only 页面（无同名组件）', file: demoPath })
    continue
  }
  const { unions, defaults } = extractUnions(read(compFile))
  const exempt = new Set(EXEMPT_PROPS[route] || [])
  const missing = {}
  for (const [prop, vals] of Object.entries(unions)) {
    if (exempt.has(prop)) continue // 刻意不演示
    const used = usedValuesAll(allDemoSources, prop)
    if (used.size === 0) continue // 该 prop 全站未以字面量使用（绑定式用法），跳过避免误报
    const miss = vals.filter((v) => !used.has(v) && defaults[prop] !== v)
    if (miss.length) missing[prop] = miss
  }
  if (Object.keys(missing).length) rows.push({ route, comp: path.basename(compFile), missing })
}

console.log(JSON.stringify(rows, null, 1))
fs.writeFileSync('reports/demo-coverage.json', JSON.stringify(rows, null, 1))
console.log('done → reports/demo-coverage.json')
