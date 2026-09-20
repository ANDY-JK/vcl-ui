// 闸口：docs-site/components/ 必须与源码重新生成的结果逐字节一致（Q9-半）
//
// 为什么需要它：组件 API 文档是生成的，改了源码不重新生成 = 文档静默漂移
// （demo 表有 check:demo-props 守谎报，库自己的参考文档此前是零）。本闸口把
// 「重新生成无 diff」变成机械断言，改 props 忘跑 gen:docs 直接红。
//
// 判定两档：
//   1) 漂移：重新生成到临时目录，与 docs-site/components 逐文件比对
//   2) 解析缺口：manifest.unparsed 非空（组件 props 解析不了，宁缺毋假）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generate } from './gen-docs.mjs'

const ROOT = process.cwd()
const COMMITTED = path.join(ROOT, 'docs-site/components')
const fail = []

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcl-docs-'))
try {
  const manifest = generate(tmp)

  if (manifest.unparsed.length) {
    fail.push(`组件 API 解析失败 ${manifest.unparsed.length} 个：${manifest.unparsed.join(', ')}`)
  }

  // 逐文件比对（含 manifest.json）
  const list = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? list(path.join(d, e.name)) : [path.join(d, e.name)],
    )
  const rel = (p) => path.relative(tmp, p).replaceAll('\\', '/')
  const fresh = new Map(list(tmp).map((f) => [rel(f), fs.readFileSync(f, 'utf8')]))
  const current = new Map(
    fs.existsSync(COMMITTED)
      ? list(COMMITTED).map((f) => [path.relative(COMMITTED, f).replaceAll('\\', '/'), fs.readFileSync(f, 'utf8')])
      : [],
  )

  for (const [name, content] of fresh) {
    if (!current.has(name)) fail.push(`缺少生成文件 ${name}（跑 npm run gen:docs）`)
    else if (current.get(name) !== content) fail.push(`文档漂移 ${name}（源码改过？跑 npm run gen:docs 重新生成）`)
  }
  for (const name of current.keys()) {
    if (!fresh.has(name)) fail.push(`多余文件 ${name}（barrel 删了导出？跑 npm run gen:docs 清理）`)
  }

  console.log(
    `[check:docs] ${fresh.size} 个生成文件，漂移 ${fail.filter((f) => f.startsWith('文档漂移')).length}，` +
      `解析失败 ${manifest.unparsed.length}`,
  )
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

if (fail.length) {
  console.error('\n❌ check:docs 未通过')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}
console.log('\n✅ check:docs 通过')
