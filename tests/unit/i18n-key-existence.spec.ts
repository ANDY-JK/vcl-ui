/**
 * 文案键存在性守卫 —— 源码引用的 key 必须在语言包里真实存在
 *
 * 背景（两个闸口都抓不到的缺口）：
 *   1) check:i18n 只查 zh/en 两侧键集对等 ——键在两侧都不存在时，两侧照样"同集"，
 *      运行时回退成显示键名本身；单测与类型检查也都发现不了。
 *   2) 2026-09-20 SSR 冒烟意外抓到 feedback.popoverTrigger：Q12 加键时插到了
 *      chunk 顶层而非 feedback 对象内（扁平化后是 popoverTrigger 而非 feedback.popover.x），
 *      intlify 在 node 环境直接报 Not found。
 *
 * 为什么放单测而不是 check:i18n.mjs：聚合器 locales/zh-CN.ts 的 import 语句不带
 * .ts 扩展名，Node 原生 ESM 解析不了（脚本里只能逐 chunk import，拿不到命名空间
 * 拼接后的全路径键）。vitest 能解析 TS，且这就是「测试即闸口」的既有模式。
 */
import { describe, it, expect } from 'vitest'
import zh from '@/components/_internal/locales/zh-CN'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const flatKeys = (obj: Record<string, unknown>, prefix = '', out: string[] = []): string[] => {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatKeys(v as Record<string, unknown>, p, out)
    else out.push(p)
  }
  return out
}

const declared = new Set(flatKeys(zh as unknown as Record<string, unknown>))

/** 扫 src/components 下源码里的 t('a.b') / tt('a.b') / tm('a.b') 引用 */
function collectUsedKeys(dir: string, out: Map<string, string[]> = new Map()): Map<string, string[]> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|dist|demos/.test(p)) collectUsedKeys(p, out)
    } else if (/\.(vue|ts)$/.test(e.name)) {
      const src = readFileSync(p, 'utf8')
      // 只认点号路径（顶层单段键如 'common' 不在此列，避免误报）
      const re = /\b(?:t|tt|tm)\s*\(\s*'([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+)'\s*\)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        const key = m[1]
        if (!out.has(key)) out.set(key, [])
        out.get(key)!.push(p.replaceAll('\\', '/'))
      }
    }
  }
  return out
}

describe('文案键存在性：源码引用的 key 必须已声明', () => {
  const used = collectUsedKeys('src/components')
  const dangling = [...used.entries()].filter(([k]) => !declared.has(k))

  it('扫到了足够多的引用（防正则失联造成假绿）', () => {
    expect(used.size).toBeGreaterThan(500)
  })

  it(`全部 ${used.size} 个引用键都在语言包里`, () => {
    const detail = dangling
      .slice(0, 12)
      .map(([k, files]) => `${k} ← ${files[0]}`)
      .join('\n  ')
    expect(dangling.length, `引用但未声明 ${dangling.length} 个：\n  ${detail}`).toBe(0)
  })
})
