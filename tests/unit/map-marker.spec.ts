// 地图标记图钉（自绘内联 SVG）的两条守卫
//
// ① 形态：必须是 `encodeURIComponent` 产出的百分号编码 data URI。axe 闸口的豁免条锚的就是
//    `src="data:image/svg+xml,%`（tests/e2e/axe-a11y.spec.ts）；哪天改成 `;utf8,` 或换回外链，
//    高德 SDK 生成的 `<img>` 没有 alt，无障碍扫描会直接判红——所以这里把形态钉死。
// ② 死掉的门：库内不得再出现指向高德主题图的运行期引用。官方主题图在掉件
//    （mark_g.png 2026-09-27 实测 404），外链留着就是"某天地图上的针集体消失"，
//    而且没人会提前知道。注释里提它是允许的（写明历史），所以扫描要先剥注释。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  mapMarkerIcon,
  MAP_MARKER_BLUE,
  MAP_MARKER_GREEN,
  MAP_MARKER_RED,
} from '@/components/_internal/map-marker'

const SRC = path.join(process.cwd(), 'src')

/** 递归取 src 下的 ts/ts/vue 源码（跳过类型声明产物） */
function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.(ts|vue)$/.test(name)) out.push(p)
  }
  return out
}

/** 剥掉块注释与行注释：守卫只判运行期代码，不判"解释历史"的文字 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
}

describe('mapMarkerIcon 自绘标记', () => {
  it('产出百分号编码的 data URI（axe 豁免条锚定的形态）', () => {
    const uri = mapMarkerIcon(MAP_MARKER_RED)
    expect(uri.startsWith('data:image/svg+xml,%3Csvg')).toBe(true)
    expect(uri).not.toContain('data:image/svg+xml;utf8,')
    // 解码回来必须是我们自己的 SVG，且填充色真的落进去了
    const svg = decodeURIComponent(uri.slice('data:image/svg+xml,'.length))
    expect(svg).toContain(`fill="${MAP_MARKER_RED}"`)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"')
  })

  it('三枚针同款形状、只差填充色（与 09-27 那颗 green 一致）', () => {
    const paths = [MAP_MARKER_RED, MAP_MARKER_BLUE, MAP_MARKER_GREEN].map((c) =>
      decodeURIComponent(mapMarkerIcon(c).slice('data:image/svg+xml,'.length)),
    )
    const shape = paths[0]!.replace(/#f53642/g, '@')
    for (const p of paths.slice(1)) expect(p.replace(/#[0-9a-f]{6}/gi, '@')).toBe(shape)
  })

  it('src 里不再有高德主题图的运行期引用（掉件过一次，不许再走那条门）', () => {
    const hits: string[] = []
    for (const f of sourceFiles(SRC)) {
      const code = stripComments(readFileSync(f, 'utf8'))
      if (code.includes('theme/v1.3') || code.includes('markers/n/')) hits.push(path.relative(SRC, f))
    }
    expect(hits).toEqual([])
  })
})
