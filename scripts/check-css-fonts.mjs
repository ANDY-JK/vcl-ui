/**
 * check-css-fonts —— 组件字号防回退闸口
 *
 * 规则：src/components 内 font-size 一律引用令牌体系，禁止直写 px：
 *   - 档位字号        → var(--fs-N)（档位族见 tokens.css，--vcl-scale 驱动连续缩放）
 *   - 自定义尺寸      → calc(Npx * var(--vcl-scale))
 *   - 控件字号        → var(--vcl-ctrl-font-size)
 * tokens.css 本身豁免；值以数字开头的 font-size 声明（含小数、含 !important 前缀部分）都算直写。
 * JS 侧 canvas/ECharts 字号不受此管（导出渲染与图表库自身，与视口无关）。
 *
 * 注：本闸口只覆盖 src/components 的字号，是全量尺寸闸口 check:css-scale
 * （含 src/demos、含宽高/间距/圆角等全部尺寸属性）的一个子集——两者都跑，
 * 这里是出现最早、报错最直白的那道，保留它以便字号回退时一眼看出问题类别。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/components'
const violations = []
let scanned = 0

function collectViolations(rel, text) {
  for (const m of text.matchAll(/font-size:\s*\d+(?:\.\d+)?px[^;}]*/g)) {
    violations.push(`${rel}：${m[0].trim()}（改引 var(--fs-N) 或 calc(Npx * var(--vcl-scale))）`)
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p)
      continue
    }
    if (!/\.(vue|css)$/.test(name) || name === 'tokens.css') continue
    scanned++
    collectViolations(p.replaceAll('\\', '/'), readFileSync(p, 'utf8'))
  }
}

walk(ROOT)

if (violations.length > 0) {
  console.error(`❌ check:css-fonts 失败 — ${violations.length} 处字号直写 px：`)
  for (const v of violations) console.error('  ' + v)
  console.error('字体缩放体系见 tokens.css --fs-* 档位族注释；破坏它会让字号在新缩放体系外恒定。')
  process.exit(1)
}
console.log(`✅ check:css-fonts 通过 — ${scanned} 个文件字号全部走令牌/插值体系`)
