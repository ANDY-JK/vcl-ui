// 发包前自检（四件事，任一不过即非零退出）
// 1) 每个 .vue 源文件都要有对应 .d.ts —— 抓到过 IconPicker 静默缺失
// 2) package.json exports 声明的每个目标文件必须真实存在
// 3) .env.local 里的真值不得出现在可执行产物（跳过源码里本来就有的值，避免假阳性）
// 4) 声明必须对最低承诺版本（peer: vue ^3.4.0）有效 —— 3.5 生成的 DefineComponent 多 7 个参数，
//    3.4 消费者开 skipLibCheck:false 会报 73 条 TS2707（已发生）
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const fail = []
const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|dist|\.git|reports|test-results|tests|docs/.test(p)) walk(p, out)
    } else out.push(p)
  }
  return out
}
const srcVue = walk(join('src', 'components'))
  .filter((f) => f.endsWith('.vue'))
  .map((f) => relative('src/components', f).replaceAll('\\', '/'))
const missing = srcVue.filter((r) => !existsSync(join('dist', r) + '.d.ts'))
if (missing.length) fail.push(`缺声明文件 ${missing.length}/${srcVue.length}: ${missing.join(', ')}`)
console.log(`[1] 声明完整性 ${srcVue.length - missing.length}/${srcVue.length}`)

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const targets = []
const collect = (v) => {
  if (typeof v === 'string') {
    if (v.startsWith('./dist/') && !v.includes('*')) targets.push(v.slice(2))
  } else for (const x of Object.values(v)) collect(x)
}
collect(pkg.exports)
const absent = [...new Set(targets)].filter((t) => !existsSync(t))
if (absent.length) fail.push(`exports 指向不存在的文件: ${absent.join(', ')}`)
console.log(`[2] exports 目标存在性 ${new Set(targets).size - new Set(absent).size}/${new Set(targets).size}`)

if (existsSync('.env.local')) {
  const srcAll = walk('src').reduce((s, f) => s + readFileSync(f, 'utf8'), '')
  const distFiles = walk('dist').filter((f) => /\.(js|cjs|mjs)$/.test(f))
  const distAll = distFiles.map((f) => readFileSync(f, 'utf8')).join('')
  const leaked = []
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^VITE_[A-Z_0-9]+=(.+)$/.exec(line.trim())
    if (!m) continue
    const v = m[1].replace(/^"|"$/g, '').trim()
    if (v.length < 6) continue
    if (srcAll.includes(v)) continue // 源码本来就有的字面量，不算内联泄露
    if (distAll.includes(v)) leaked.push(line.split('=')[0])
  }
  if (leaked.length) fail.push(`产物含构建期密钥: ${leaked.join(', ')}`)
  console.log(`[3] 产物密钥扫描 泄露=${leaked.length}`)
} else console.log('[3] 无 .env.local（CI 环境），跳过密钥扫描')

// 4) 用 vue34 别名把整棵声明重新类型检查一遍，等价于「3.4 消费者 + skipLibCheck:false」
const dtsAll = (function collect(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (p.endsWith('.d.ts')) out.push(p)
  }
  return out
})('dist')
const aliasLeft = dtsAll.filter((f) => readFileSync(f, 'utf8').includes('vue34'))
if (aliasLeft.length) fail.push(`声明残留构建别名 vue34: ${aliasLeft.length} 个文件`)
if (!existsSync(join('node_modules', 'vue34'))) {
  fail.push('缺少 devDependency vue34 —— 声明兼容性检查无法进行')
} else {
  const program = ts.createProgram({
    rootNames: dtsAll,
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
      baseUrl: process.cwd(),
      paths: { vue: ['./node_modules/vue34'] },
    },
  })
  const errors = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error)
  if (errors.length) {
    const first = ts.flattenDiagnosticMessageText(errors[0].messageText, ' ')
    fail.push(`声明对 vue 3.4 有 ${errors.length} 条类型错误（首条：${first}）`)
  }
  console.log(`[4] 声明对最低承诺版本 vue 3.4 类型检查 错误=${errors.length}`)
}

if (fail.length) {
  console.error('\n❌ verify:pkg 未通过')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}
console.log('\n✅ verify:pkg 通过')
