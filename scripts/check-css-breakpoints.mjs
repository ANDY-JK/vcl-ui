/**
 * check-css-breakpoints —— CSS 侧断点防漂移闸口
 *
 * 规范档位全集（max-width 形式）：480 / 640 / 767 / 1023
 * 与 _internal/breakpoints.ts 的 BP_*（JS 唯一来源）对齐：
 *   max-width: 767px ≡ JS `w < BP_MD(768)`；max-width: 1023px ≡ JS `w < BP_LG(1024)`。
 * 背景：此前 600/640/767/768/900/1100 六种 max-width 散落各文件，
 *   768 与 767 在 768px 整宽视口（iPad 竖屏）行为撕裂；900/1100 与 JS 档位无对应。
 * 新增断点先想清楚能不能复用既有的；确需新档位：改本文件的 ALLOWED + breakpoints.ts 注释，
 * 并同步 tokens.css 的 --bp-* 与 check-constants 的对账。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ALLOWED = new Set([480, 640, 767, 1023])
const ROOT = 'src'
const EXTS = new Set(['.vue', '.css'])

/** 单文件检查：收集不在规范档位内的宽度断点 */
function collectViolations(rel, text, out) {
  for (const media of text.matchAll(/@media[^{)]*\)/g)) {
    for (const w of media[0].matchAll(/(?:max-width|min-width)\s*:\s*(\d+)px/g)) {
      const v = Number(w[1])
      if (!ALLOWED.has(v)) out.push(`${rel}：@media 断点 ${w[0]} 不在规范档位 [${[...ALLOWED].join('/')}]`)
    }
  }
}

function walk(dir, ctx) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p, ctx)
      continue
    }
    if (!EXTS.has(name.slice(name.lastIndexOf('.')))) continue
    ctx.scanned++
    const rel = p.replaceAll('\\', '/')
    collectViolations(rel, readFileSync(p, 'utf8'), ctx.violations)
  }
}

const ctx = { scanned: 0, violations: [] }
walk(ROOT, ctx)

if (ctx.violations.length > 0) {
  console.error(`❌ check:css-breakpoints 失败 — ${ctx.violations.length} 处断点漂移：`)
  for (const v of ctx.violations) console.error('  ' + v)
  console.error('规范档位：max-width 480/640/767/1023（映射关系见 _internal/breakpoints.ts 头注释）')
  process.exit(1)
}
console.log(`✅ check:css-breakpoints 通过 — ${ctx.scanned} 个文件全部宽度断点在规范档位内`)
