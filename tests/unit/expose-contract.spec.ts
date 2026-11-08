/**
 * defineExpose 契约对账 —— 组件暴露了方法面，README 就必须写它
 *
 * ## 为什么需要
 *
 * `defineExpose` 是组件实例的**公开**方法面：`ref.value.xxx()` 能调到，就是契约。
 * README 的「defineExpose 公开契约」表是这份契约的唯一人类入口，但它靠手写维护 ——
 * 新增一处 `defineExpose` 而忘了记表，**没有任何闸口会红**（第十七轮前 `LowCodeNav`
 * 的 `refresh()` 就是这样漏掉的：它是「用户自建表单后重取导航」的唯一出路，漏记等于宿主找不到这扇门）。
 *
 * ## 判据
 *
 * 1. 源码里出现 `defineExpose(` 的每个组件，其组件名必须在 README 的
 *    「defineExpose 公开契约」章节正文里出现（公开 API 表与内部区块段都算 ——
 *    内部区块也标了 ⛔ 非公开，但同样要写清「别依赖」，所以要出现）
 * 2. 章节必须能找到（README 结构变了要立刻红，而不是静默通过）
 * 3. 扫描面非空（至少 10 个组件 —— 少于这个数说明解析口径失效）
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve('src/components')
const README = resolve('README.md')

const SECTION_START = '### defineExpose 公开契约'
const SECTION_END = '## ⬆️ 从 1.x 升级到 2.0'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

/** 真正**调用** defineExpose 的组件（注释里提到的不算） */
function exposedComponents(): string[] {
  return walk(ROOT)
    .filter((p) => /defineExpose\s*\(/.test(readFileSync(p, 'utf8')))
    .map((p) => p.split(/[\\/]/).pop()?.replace(/\.vue$/, '') ?? '')
    .sort()
}

function exposeSection(): string {
  const md = readFileSync(README, 'utf8')
  const start = md.indexOf(SECTION_START)
  if (start < 0) throw new Error(`README 里找不到「${SECTION_START}」章节`)
  const end = md.indexOf(SECTION_END, start)
  return md.slice(start, end < 0 ? md.length : end)
}

describe('defineExpose 契约 · README 对账', () => {
  it('README 的 expose 章节存在且可解析', () => {
    const sec = exposeSection()
    expect(sec.length).toBeGreaterThan(200)
    expect(sec).toContain('公开 API')
  })

  it('扫描面非空（解析口径失效时用例必须红，而不是静默通过）', () => {
    const list = exposedComponents()
    expect(list.length, `只解析到 ${list.length} 个 defineExpose 组件，明显不对`).toBeGreaterThan(10)
  })

  it('**每个暴露了方法面的组件，README 里都点了名**', () => {
    const sec = exposeSection()
    const missing = exposedComponents().filter((name) => !sec.includes(name))
    expect(
      missing,
      `这些组件有 defineExpose 但 README「defineExpose 公开契约」章节没提 → 宿主不知道这扇门存在`,
    ).toEqual([])
  })

  it('反向：README 公开 API 表里点名的组件，源码里必须真有 defineExpose', () => {
    const sec = exposeSection()
    const publicPart = sec.split('内部区块 expose')[0] ?? ''
    const listed = [...publicPart.matchAll(/^\|\s*`([^`]+)`/gm)]
      .flatMap((m) => (m[1] ?? '').split('/'))
      .map((s) => s.trim())
      .filter((s) => /^[A-Za-z_][\w-]*$/.test(s) && s !== '组件')
    const actual = new Set(exposedComponents())
    const rotted = listed.filter((n) => !actual.has(n))
    expect(rotted, 'README 写了暴露面，但源码里这些组件已经没有 defineExpose（表已过期）').toEqual([])
  })
})
