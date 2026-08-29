/**
 * 模板内联多语句 handler 编译体检（一次性工具）
 * 用 Vue 官方编译器逐文件编译模板，枚举所有表达式解析错误（vite build 遇错即停，此脚本全量报告）
 * 用法：node scripts/scan-template-expr.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, compileTemplate } from '@vue/compiler-sfc'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = resolve(root, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (name.endsWith('.vue')) out.push(p)
    else if (!name.includes('.') || name.endsWith('.d.ts') === false) {
      try {
        if (readdirSync(p)) walk(p, out)
      } catch {
        /* 文件跳过 */
      }
    }
  }
  return out
}

let bad = 0
for (const file of walk(srcDir)) {
  const source = readFileSync(file, 'utf8')
  const { descriptor } = parse(source, { filename: file })
  if (!descriptor.template) continue
  const { errors } = compileTemplate({
    source: descriptor.template.content,
    filename: file,
    id: 'scan',
  })
  for (const e of errors) {
    if (!e.loc) continue
    const tplStartLine = descriptor.template.loc.start.line
    const line = tplStartLine + e.loc.start.line - 1
    console.log(`${file.replace(/\\/g, '/')}:${line} — ${e.message}`)
    bad++
  }
}
console.log(bad ? `\n共 ${bad} 处模板表达式编译错误` : '全部模板编译通过')
