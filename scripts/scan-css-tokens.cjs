// 静态扫描：var(--x) 引用 vs 令牌声明，找出引用了从未声明过的自定义属性
// FAIL = 无兜底引用（属性整体失效，视觉静默归零）；WARN = 有兜底（降级可用但不随主题）
// 运行：node scripts/scan-css-tokens.cjs（CI 可接 --strict 把 WARN 也视为失败）
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..')
function walk(dir, exts, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

const files = walk(path.join(SRC, 'src'), ['.vue', '.css', '.ts', '.html'])
files.push(path.join(SRC, 'index.html'))
const declared = new Set()
const used = new Map() // name -> { noFallback: [], withFallback: [] }

for (const f of files) {
  if (!fs.existsSync(f)) continue
  const rel = path.relative(SRC, f)
  // 剥块注释（跨行，内容替换为空格保持行号），行注释在行内再剥
  const text = fs
    .readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const lines = text.split('\n')
  lines.forEach((line, idx) => {
    const code = line.replace(/\/\/.*$/, '')
    for (const m of code.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1])
    for (const m of code.matchAll(/['"`]--([a-zA-Z0-9-]+)['"`]\s*[:\]]/g)) declared.add(m[1])
    for (const m of code.matchAll(/var\(\s*--([a-zA-Z0-9-]+)\s*([,)])/g)) {
      const name = m[1]
      const hasFallback = m[2] === ','
      if (!used.has(name)) used.set(name, { noFallback: [], withFallback: [] })
      const bucket = hasFallback ? 'withFallback' : 'noFallback'
      used.get(name)[bucket].push({ file: rel, line: idx + 1 })
    }
  })
}

const fails = []
const warns = []
for (const [name, b] of [...used.entries()].sort()) {
  if (!declared.has(name)) {
    if (b.noFallback.length) fails.push({ name, locs: b.noFallback })
    else warns.push({ name, locs: b.withFallback })
  }
}
if (warns.length) {
  console.log(`WARN（有兜底，暂留）：${warns.length} 个`)
  for (const w of warns) console.log(`  --${w.name}  ${w.locs[0].file}:${w.locs[0].line} 等 ${w.locs.length} 处`)
}
if (!fails.length) {
  console.log('PASS：无「无兜底引用未声明令牌」')
  process.exit(0)
}
console.log(`FAIL：${fails.length} 个无兜底断档令牌：\n`)
for (const b of fails) {
  console.log(`  --${b.name}  (${b.locs.length} 处)`)
  for (const l of b.locs.slice(0, 6)) console.log(`     ${l.file}:${l.line}`)
}
process.exit(1)
