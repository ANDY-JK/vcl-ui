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
    // 静态属性：<IconSvg type="xxx"
    //
    // ⚠️ 属性名前必须是空白：`<IconSvg :type="icon" />` 里的 `:type` 是**绑定**到同名 prop，
    // 冒号后跟的 `icon` 是 prop 名不是图标名。此前写 `[^>]*?type="…"`，惰性量词会把冒号
    // 一并吃掉，于是把 prop 名 `icon` 当成图标收了进来 —— 而 `Icon` 恰是 lucide 导出的
    // 通用图标渲染器（要求 iconNode prop，不给就 `iconNode.map` 抛错），它混进子集后
    // 渲染即崩。判据只认「空白 + type=」。
    for (const m of src.matchAll(/<IconSvg[^>]*?\stype="([a-z0-9-]+)"/g)) names.add(m[1])
    // :type="..." 绑定内的所有引号字面量（三元/条件取值，每个候选都收）
    for (const m of src.matchAll(/:type="([^"]*)"/g)) {
      for (const q of m[1].matchAll(/'([a-z0-9-]+)'/g)) names.add(q[1])
    }
    // 包装组件上的静态 icon 属性：<Card icon="box" />、<Input icon="email" />。
    // 这批不经 IconSvg 标签，此前整态漏网 —— 表现为统计卡图标一律渲染兜底方块。
    // 同样要求前置空白，避免把 `:icon="icon"` 的绑定形态收成图标名。
    for (const m of src.matchAll(/\sicon="([a-z0-9-]+)"/g)) names.add(m[1])
    for (const m of src.matchAll(/:icon="([^"]*)"/g)) {
      for (const q of m[1].matchAll(/'([a-z0-9-]+)'/g)) names.add(q[1])
    }
    // 字段映射：icon: 'xxx'（此前正则引号吃两次，icon: 形态全部漏网）
    for (const m of src.matchAll(/icon: '([a-z0-9-]+)'/g)) names.add(m[1])
    for (const m of src.matchAll(/icon: "([a-z0-9-]+)"/g)) names.add(m[1])
    // 纯字符串数组元素（如 demo 的 commonIcons: ['home','folder',…]）。
    // 这些名字不经过 type= / icon: 任何一态，此前整段漏网 —— 表现为列表里的图标渲染成兜底方块。
    // 过收无妨：下方以「lucide 导出存在性」为准过滤，非图标字符串会被归入 non-lucide 丢弃。
    for (const m of src.matchAll(/^\s*'([a-z0-9-]+)',?\s*$/gm)) names.add(m[1])
    for (const m of src.matchAll(/^\s*"([a-z0-9-]+)",?\s*$/gm)) names.add(m[1])
  }
}
walk('src') // 全 src 扫描（App.vue 在 src 根上，此前只扫 components/demos 漏掉它）
// 注意：IconPicker 的面板名单（lucide-icons.json）不进子集 —— 4000 个全进等于没摇树。
// 面板渲染走 IconSvg 的运行时兜底告警，打开选择器时一次性加载。

const toPascal = (kebab) =>
  kebab
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')

/**
 * 通用导出黑名单：这些名字在 @lucide/vue 里存在，但不是「一个有形状的图标」，
 * 而是一族 API 本体，收进子集后渲染必崩——
 *   - Icon：通用渲染器，要求 iconNode prop；不传就 iconNode.map 抛 TypeError
 *   - createLucideIcon / LUCIDE_CONTEXT / icons / default：工厂、内部上下文与命名空间
 * 值层面无法区分（它们与真图标同为函数对象），故按名字精确拒收。
 */
const NOT_AN_ICON = new Set(['icon', 'create-lucide-icon', 'icons', 'lucide-context', 'default'])

// 以"导出存在性"为准（deprecated 别名导出存在但无独立文件）
const valid = []
const invalid = []
for (const n of [...names].sort()) {
  if (!n) continue
  if (NOT_AN_ICON.has(n)) {
    invalid.push(`${n}（通用导出，非图标）`)
    continue
  }
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
// lucide 有别名（grid-3x3/grid3x3 同映 Grid3x3）→ 按 Pascal 导出名去重，避免重复 import
const seenImports = new Set()
for (const n of valid) {
  const pascal = toPascal(n)
  lines.push(`  '${n}': ${pascal},`)
}
lines.push('}', '')
lines.push('import {')
for (const n of valid) {
  const pascal = toPascal(n)
  if (seenImports.has(pascal)) continue
  seenImports.add(pascal)
  lines.push(`  ${pascal},`)
}
lines.push("} from '@lucide/vue'", '')
fs.mkdirSync('src/components/_internal', { recursive: true })
fs.writeFileSync('src/components/_internal/lucide-subset.ts', lines.join('\n'))
console.log('written src/components/_internal/lucide-subset.ts')
