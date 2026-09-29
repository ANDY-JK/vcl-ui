// check:offline 闸口的自测：证明它**真的会拦**，而不是恒过。
//
// 背景：本仓的零取件原则踩过三次真事故（高德主题图钉 404 / IconPicker 依赖 Iconify CDN /
// zxing wasm 从 jsdelivr 取），闸口若因正则写松而恒过，等于没设。故这里直接喂
// 「已知会取件」的样例，断言脚本把它们判为违规。
import { describe, it, expect } from 'vitest'

/** 与 scripts/check-offline.mjs 同源的判定：从脚本源码读取白名单与形态正则，避免两处漂移 */
async function loadGate() {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync('scripts/check-offline.mjs', 'utf8')
  // 直接执行脚本的判定逻辑：抽出 ALLOWED_HOSTS 与 PATTERNS 的求值片段
  const hostsSrc = /const ALLOWED_HOSTS = (\[[\s\S]*?\n\])/.exec(src)?.[1]
  const patsSrc = /const PATTERNS = (\[[\s\S]*?\n\])/.exec(src)?.[1]
  if (!hostsSrc || !patsSrc) throw new Error('check-offline.mjs 结构变了，自测需同步')
  const ALLOWED_HOSTS = new Function(`return ${hostsSrc}`)() as Array<{ re: RegExp; why: string }>
  const PATTERNS = new Function(`return ${patsSrc}`)() as Array<{ re: RegExp; why: string }>
  const allowed = (url: string) => ALLOWED_HOSTS.some((a) => a.re.test(url))
  const violationsOf = (text: string) => {
    const out: string[] = []
    for (const { re } of PATTERNS) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) if (!allowed(m[1])) out.push(m[1])
    }
    return out
  }
  return { violationsOf, allowed }
}

describe('check:offline 闸口 · 自测（证明会拦而非恒过）', () => {
  it('拦下运行期属性赋值的外链取件', async () => {
    const { violationsOf } = await loadGate()
    const bad = `<img :src="'https://cdn.example-cdn-xyz.com/a.png'" /><script src="https://evil-cdn.net/x.js"></script>`
    expect(violationsOf(bad).length).toBeGreaterThan(0)
  })

  it('拦下 CSS url() 与 @import 外链', async () => {
    const { violationsOf } = await loadGate()
    expect(violationsOf('.a{background:url(https://img.cdn-x.io/bg.png)}').length).toBe(1)
    expect(violationsOf(`@import 'https://fonts.cdn-y.io/f.css';`).length).toBe(1)
  })

  it('拦下 JS fetch/import 外链', async () => {
    const { violationsOf } = await loadGate()
    expect(violationsOf(`await fetch('https://api.cdn-z.io/data.json')`).length).toBe(1)
  })

  it('放行已登记的白名单（地图 SDK / 命名空间 / 保留域名 / placeholder）', async () => {
    const { violationsOf } = await loadGate()
    const ok = [
      `script.src = 'https://webapi.amap.com/maps?v=2.0'`,
      `const ns = 'http://www.w3.org/2000/svg'`,
      `const broken = 'https://invalid.example.com/broken.jpg'`,
      `placeholder="https://xxxx.supabase.co"`,
      `placeholder="https://api.example.com/xxx"`,
    ]
    for (const s of ok) expect(violationsOf(s), `应放行：${s}`).toEqual([])
  })

  it('放行本地路径与 data URI（本就无网络依赖）', async () => {
    const { violationsOf } = await loadGate()
    expect(violationsOf(`<img src="/demo-assets/x/a" />`)).toEqual([])
    expect(violationsOf(`const d = 'data:image/svg+xml;charset=utf-8,%3Csvg'`)).toEqual([])
  })
})
