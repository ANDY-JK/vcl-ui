#!/usr/bin/env node
/**
 * 闸口：**静态引用的图标名必须真的能渲染**（TD-89 / #289）
 *
 * ## 为什么
 *
 * `IconSvg` 遇到不认识的图标名**不报错**，只渲染一个兜底方块。
 * 于是"名字写错"和"这个图标本来就没有"在用户眼里一样，在构建里也一样 —— 没有任何东西会失败。
 *
 * 第 51 轮实测到两组真实缺陷：
 *   ① demo 页 8 个 `provider="solar"` 的图标写成 `type="home"`（solar 变体名必须带 `-linear`），
 *      8 个全部渲染兜底方块；
 *   ② lucide 那边同理 —— 只因生成脚本按 Pascal 名去 `@lucide/vue` 校验过，才没出事。
 *
 * ## 判据：**按 provider 分口径**校验静态写法
 *
 * 这一点是踩出来的：第一版只按 lucide 校验，把 `provider="solar" type="chat-round-dots"`
 * 全报成无效（它确实是合法 solar 名）。**同一个字符串在不同 provider 下有效性不同**，
 * 所以必须先把 provider 解析出来再判。
 *
 * - `<IconSvg type="x">`（无 provider）→ 默认 lucide
 * - `<IconSvg provider="solar" type="x">` → `SOLAR_ICONS` 名录
 * - `<IconSvg provider="morphicons" type="x">` → morphicons 注册表
 * - 包装组件 `icon="x"` / `icon: 'x'`（Card / Input / 字段映射）→ lucide
 *
 * ## 只校验"静态字面量"
 *
 * 动态绑定（`:type="cond ? 'a' : 'b'"`）里的候选**不在此列** —— 判定这类需要求值，
 * 而基于猜测的闸口会产生假警报（假警报会让闸门被关掉，见 #279）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import * as lucide from '@lucide/vue'

const ROOT = process.cwd()

/** kebab → Pascal（lucide 的导出名口径） */
const pascal = (k) =>
  k
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')

/** lucide 里存在但**不是图标**的导出（通用渲染器 / 工厂 / 上下文） */
const NOT_AN_ICON = new Set(['icon', 'create-lucide-icon', 'icons', 'lucide-context', 'default'])

/** solar 名录：从 solar-icons.ts 的数组字面量里取（它就是「列出来的每个名字都渲染得出来」的契约） */
function solarNames() {
  const src = readFileSync(join(ROOT, 'src/components/_internal/solar-icons.ts'), 'utf8')
  return new Set([...src.matchAll(/^\s+'([a-z0-9-]+)',\s*$/gm)].map((m) => m[1]))
}

/** morphicons 名录：从数据 JSON 取键 */
function morphiconsNames() {
  const raw = readFileSync(join(ROOT, 'src/components/_internal/morphicons-icons-data.json'), 'utf8')
  const data = JSON.parse(raw)
  return new Set(Object.keys(data.icons ?? data))
}

const SOLAR = solarNames()
const MORPH = morphiconsNames()

/**
 * 镜像 `IconSvg` 的 `toSolarIconName()`（**必须与组件保持一致**）。
 *
 * 组件会**自动补变体后缀**：`type="home"` → `solar:home-linear`。
 * 所以 `home` 是合法的写法，写到数据里的才是 `home-linear`。
 *
 * 第一版闸口直接拿裸名去 `SOLAR_ICONS` 里查，于是 8 个合法写法全被报成"无效"
 * —— 假警报（#279 的教训：假警报会让闸门被关掉）。**校验器必须镜像消费端的归一化**。
 */
const SOLAR_VARIANTS = ['linear', 'bold', 'broken', 'outline', 'bold-duotone', 'line-duotone']
function solarNormalize(name) {
  const parts = name.split('-')
  const lastTwo = parts.slice(-2).join('-')
  const lastOne = parts[parts.length - 1]
  const hasVariant = SOLAR_VARIANTS.includes(lastTwo) || SOLAR_VARIANTS.includes(lastOne)
  return hasVariant ? name : `${name}-linear`
}
/** 已知的"合法但不在名录里"的用法（每项必须写理由） */
const ALLOWLIST = new Set()

function collect(dir, acc = []) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name)
    if (f.isDirectory()) {
      collect(p, acc)
      continue
    }
    if (/\.(vue|ts)$/.test(f.name)) acc.push(p)
  }
  return acc
}

const files = collect(join(ROOT, 'src'))
const problems = []
let checked = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const rel = relative(ROOT, file).replace(/\\/g, '/')

  // ① <IconSvg ...> 上的静态 type + provider
  for (const m of src.matchAll(/<IconSvg\b[^>]*?>/g)) {
    const tag = m[0]
    const type = /\stype="([a-z0-9-]+)"/.exec(tag)
    if (!type) continue
    const prov = /\sprovider="([a-z]+)"/.exec(tag)
    const provider = prov ? prov[1] : 'lucide'
    const name = type[1]
    if (ALLOWLIST.has(`${provider}:${name}`)) continue
    checked += 1
    let ok
    if (provider === 'solar') ok = SOLAR.has(solarNormalize(name))
    else if (provider === 'morphicons') ok = MORPH.has(name)
    else ok = NOT_AN_ICON.has(name) ? false : pascal(name) in lucide
    if (!ok) {
      const hint =
        provider === 'solar'
          ? `（按 ${name} 补后缀后是 ${solarNormalize(name)}；候选：${[...SOLAR].filter((n) => n.startsWith(name.replace(/-linear$/, ''))).slice(0, 3).join(' / ') || '见 solar-icons.ts'}）`
          : ''
      problems.push({ file: rel, name, provider, hint, kind: 'IconSvg type=' })
    }
  }

  // ② 包装组件上的静态 icon 属性 / 字段映射的 icon 字面量（默认 lucide）
  const wrappers = [
    ...src.matchAll(/\sicon="([a-z0-9-]+)"/g),
    ...src.matchAll(/icon: '([a-z0-9-]+)'/g),
    ...src.matchAll(/icon: "([a-z0-9-]+)"/g),
  ]
  for (const m of wrappers) {
    const name = m[1]
    if (ALLOWLIST.has(`lucide:${name}`) || NOT_AN_ICON.has(name)) continue
    checked += 1
    if (!(pascal(name) in lucide)) {
      problems.push({ file: rel, name, provider: 'lucide', hint: '', kind: 'icon=' })
    }
  }
}

if (problems.length) {
  console.error(`\n✖ check:icon-names 发现 ${problems.length} 处无效图标名（会渲染成兜底方块）：\n`)
  for (const p of problems) {
    console.error(`  ${p.file}`)
    console.error(`    ${p.kind}"${p.name}"  provider=${p.provider} 不存在 ${p.hint}`)
  }
  console.error('\n修法：solar 用名录里的带后缀变体（如 home-linear）；')
  console.error('     lucide 用真实导出的 kebab 名（trash-2 / heading-1 这类带数字的照常可用）。')
  process.exit(1)
}

console.log(
  `✅ check:icon-names 通过 — ${checked} 处静态图标引用全部可渲染（lucide / solar / morphicons 分口径）`,
)
