// 一次性脚本：收集库内实际引用的 lucide 图标名，生成按需子集模块
// 用法：node scripts/gen-lucide-subset.mjs（IconSvg.vue 按需化后可归档）
import fs from 'fs'
import path from 'path'
import * as lucide from '@lucide/vue'

const names = new Set()
function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name)
    if (f.isDirectory()) {
      walk(p)
      continue
    }
    if (!/\.(vue|ts)$/.test(f.name)) continue
    const src = fs.readFileSync(p, 'utf8')
    for (const m of src.matchAll(/<IconSvg[^>]*?type="([a-z0-9-]+)"/g)) names.add(m[1])
    for (const m of src.matchAll(/(?::type="[^"]*|icon: '|icon: ")'([a-z0-9-]+)'/g)) names.add(m[1])
    for (const m of src.matchAll(/icon: "([a-z0-9-]+)"/g)) names.add(m[1])
  }
}
walk('src/components')
walk('src/demos')
// 注意：IconPicker 的面板名单（lucide-icons.json）不进子集 —— 4000 个全进等于没摇树。
// 面板渲染走 IconSvg 的运行时懒加载桶，打开选择器时一次性加载。

const toPascal = (kebab) =>
  kebab
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')

// 以"导出存在性"为准（deprecated 别名导出存在但无独立文件）
const valid = []
const invalid = []
for (const n of [...names].sort()) {
  if (!n) continue
  if (toPascal(n) in lucide) valid.push(n)
  else invalid.push(n)
}
console.log('source refs:', names.size, 'valid lucide:', valid.length, 'non-lucide(渲染兜底):', invalid.length)
console.log('non-lucide sample:', invalid.slice(0, 30).join(', '))

const lines = [
  '// 自动生成 — scripts/gen-lucide-subset.mjs。只收集库内实际用到的 lucide 图标，',
  '// 具名导入（Pascal 直名）可被 tree-shaking；未知图标名运行时告警并渲染兜底（见 IconSvg.vue）。',
  "import type { Component } from 'vue'",
  '',
  'export const lucideSubset: Record<string, Component> = {',
]
for (const n of valid) {
  lines.push(`  '${n}': ${toPascal(n)},`)
}
lines.push('}', '')
lines.push('import {')
for (const n of valid) {
  lines.push(`  ${toPascal(n)},`)
}
lines.push("} from '@lucide/vue'", '')
fs.mkdirSync('src/components/_internal', { recursive: true })
fs.writeFileSync('src/components/_internal/lucide-subset.ts', lines.join('\n'))
console.log('written src/components/_internal/lucide-subset.ts')
