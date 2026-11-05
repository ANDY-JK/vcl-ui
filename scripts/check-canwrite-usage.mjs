// 闸口：可写判据只许有 canWrite 一份实现（TD-79 类，#448）
//
// ## 背景
//
// TD-79 记的是结构：**同一个契约分散在两条到达路径上就会漏**。
// 它挂的三个实例都已修（openDB/ensureStore 的 onversionchange、useCellWrite 与各入口、
// Select 键盘与面板），但"判据收敛"这件事本身是靠人记住的 —— 第 427 轮还出现过
// 「时间面板的确定按钮只靠 v-if 隐藏，面板打开后 disabled 翻真仍能写」。
//
// TD-90 收口时已经把判据收敛成 `_internal/writable.ts` 的 `canWrite(props)`，
// 但**没有任何机械判据阻止新入口再手写一遍**。本闸口补上这一条：
// 在 `src/components/**` 里（除 `_internal/writable.ts` 本身）发现"内联手写可写判据"
// 即红，指向 `canWrite`。
//
// ## 判据（机械、可复现）
//
// 命中这些形状的行（且不在 `_internal/writable.ts`）：
//   · `!props.disabled && !props.readonly` / `!disabled && !readonly`
//   · `props.disabled || props.readonly` / `disabled || readonly`（用作守卫时）
// 排除：
//   · `_internal/writable.ts`（唯一实现）
//   · `:disabled="…"` 这类**原生 disabled 属性绑定**（那不是写守卫，是视觉/焦点状态）
//   · 注释行
//
// 精度边界：只看"内联判据"这一种形状。`computed` 里包一层再用的写法（如
// `const ok = !props.disabled`）不在范围内 —— 那类要么是真守卫的变体，
// 要么是另一个缺陷类，本闸口不假装能判。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const COMPONENTS = path.join(ROOT, 'src/components')

const GUARD_PATTERNS = [
  /!\s*props\.disabled\s*&&\s*!\s*props\.readonly/,
  /!\s*disabled\s*&&\s*!\s*readonly/,
  /props\.disabled\s*\|\|\s*props\.readonly/,
  /\bdisabled\s*\|\|\s*readonly\b/,
]
/** 扫描内联手写的可写判据（纯函数，可单测） */
export function findInlineWriteGuards({ componentsDir = COMPONENTS } = {}) {
  const files = []
  ;(function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (/\.(vue|ts)$/.test(n)) files.push(p.split(path.sep).join('/'))
    }
  })(componentsDir)

  const findings = []
  let scanned = 0
  let guardLines = 0
  for (const f of files) {
    // 唯一实现：相对路径比对（绝对/相对目录都能正确豁免）
    if (path.relative(componentsDir, f).split(path.sep).join('/') === '_internal/writable.ts') continue
    scanned++
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
    lines.forEach((l, i) => {
      const t = l.trim()
      if (!t || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      if (!/disabled|readonly/.test(l)) return
      // 原生 disabled 属性绑定（`:disabled="…"`）是视觉/焦点状态，不是写守卫
      if (/:disabled\s*=/.test(l)) return
      guardLines++
      if (GUARD_PATTERNS.some((re) => re.test(l))) {
        findings.push({ file: f, line: i + 1, text: t.slice(0, 100) })
      }
    })
  }
  return { findings, scanned, guardLines }
}

function main() {
  const { findings, scanned, guardLines } = findInlineWriteGuards()
  if (scanned < 5 || guardLines < 1) {
    console.error(
      `❌ check:canwrite-usage 未通过 —— 判据空转（扫描 ${scanned} 个文件、含 disabled/readonly 的行 ${guardLines} 行）`,
    )
    process.exit(1)
  }
  if (findings.length) {
    console.error(`❌ check:canwrite-usage 未通过 —— ${findings.length} 处内联手写了可写判据：`)
    for (const f of findings) console.error(`   - ${f.file}:${f.line}  ${f.text}`)
    console.error('   修法：改用 `canWrite(props)`（`@/components/_internal/writable`）—— 判据只留一份。')
    process.exit(1)
  }
  console.log(`✅ check:canwrite-usage 通过 — ${scanned} 个文件、${guardLines} 行 disabled/readonly 相关代码，无内联判据重复`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
