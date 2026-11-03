/**
 * 失败文案的最小可操作性 —— **必须为 0**（#301 建棘轮 → #386 清零后换挡）
 *
 * ## 为什么
 *
 * 用户最容易卡住的地方不是"没提示"，而是**只说了"失败了"却不说下一步**：
 * 「表单加载失败」「文件读取失败」「复制失败」—— 用户不知道是该重试、换文件、还是找管理员。
 *
 * ## 判据（满足任一即通过）
 *
 * ① 含 `{err}` / `{name}` 之类占位符 —— 至少有具体信息；
 * ② 含括号补充 —— 说明了原因（如「导出失败（当前环境不支持下载）」）；
 * ③ 含指导词 —— 请 / 重试 / 检查 / 尝试 / 稍后 / 刷新 / 手动 / 重新。
 *
 * ## 为什么从"棘轮"改成"必须为 0"（#386）
 *
 * #301 时存量有 18 条、一次清零不现实，所以用 `BASELINE` 挡新增、慢慢还；
 * 18 → 15 之后停了很久。**棘轮只是过渡形态：存量到零还留着豁免名单，
 * 就会变成"以后再往里加一条也没人反对"**（本仓 #372/#382 都栽在单向豁免上）。
 * 现在零存量 → 改成硬判据：新增一条裸文案直接红。**不要在这里重建 BASELINE。**
 *
 * 副作用提醒：这条判据只认中文指导词，所以英文侧单独有 1 条抽查（防止只修半边）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/components/_internal/locales/chunks/zh-CN'
const DIR_EN = 'src/components/_internal/locales/chunks/en-US'

const GUIDANCE = /请|重试|检查|尝试|稍后|刷新|手动|重新/
const DETAIL = /\{[a-zA-Z]+\}|（[^）]+）|\([^)]+\)/
/** 英文侧只看"有没有下一步动作"，不做逐词翻译校对 */
const EN_GUIDANCE = /please|retry|check|try|refresh|contact/i

/** 本轮（#386）逐条补完的 15 条：锁住"修过的不回退" */
const FIXED = [
  ['amap.ts', 'driveRouteFailed'],
  ['data.ts', 'loadFailed'],
  ['data.ts', 'downloadFail'],
  ['form.ts', 'uploadFailed'],
  ['form.ts', 'captureFailed'],
  ['form.ts', 'cameraStartFailed'],
  ['form.ts', 'imageLoadFailed'],
  ['form.ts', 'compressFailed'],
  ['formBuilder.ts', 'exportFail'],
  ['formBuilder.ts', 'shareSignFail'],
  ['formBuilderPresets.ts', 'loadLocalFail'],
  ['formBuilderPresets.ts', 'clearFail'],
  ['internal.ts', 'readFileFail'],
  ['routePlanner.ts', 'planFailed'],
  ['routePlanner.ts', 'coordParseFailed'],
] as const

/** 读某语言块里某个 key 的单引号字符串值 */
function valueOf(dir: string, file: string, key: string): string | undefined {
  const src = readFileSync(join(dir, file), 'utf8')
  const m = new RegExp(`^\\s{2,6}${key}:\\s*'([^']*)'`, 'm').exec(src)
  return m?.[1]
}

/** 扫中文块：返回裸文案与"判据一共看过多少条"（后者用来防空集判绿） */
function scan() {
  const bare: string[] = []
  let total = 0
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.ts')) continue
    const src = readFileSync(join(DIR, f), 'utf8')
    for (const m of src.matchAll(/^\s{2,6}([a-zA-Z][\w]*):\s*'([^']*)'/gm)) {
      const [, key, value] = m
      if (!/(Fail|Failed)$/.test(key)) continue
      total++
      if (DETAIL.test(value) || GUIDANCE.test(value)) continue
      bare.push(`${f}:${key}`)
    }
  }
  return { bare, total }
}

describe('i18n 失败文案 · 可操作性（必须为 0）', () => {
  it('**不得出现"只说了失败、没说下一步"的文案**（扫到的条数有下限，防空集判绿）', () => {
    const { bare, total } = scan()
    expect(total, '一条失败文案都没扫到 —— 先怀疑扫描器坏了').toBeGreaterThanOrEqual(40)
    expect(bare, `这些失败文案没有下一步：${bare.join(', ')}\n修法：加"请/重试/检查"等指导词，或说明原因（括号/占位符）。`).toEqual([])
  })

  it('**#386 补过的 15 条逐条锁住**（修过的不许回退成裸文案）', () => {
    for (const [file, key] of FIXED) {
      const value = valueOf(DIR, file, key)
      expect(value, `${file} 缺少 ${key}`).toBeTruthy()
      expect(GUIDANCE.test(value!), `${file}:${key} 又变回裸文案：「${value}」`).toBe(true)
    }
  })

  it('**英文侧同样带下一步**（判据只认中文指导词，这里防"只修半边"）', () => {
    for (const [file, key] of FIXED) {
      const value = valueOf(DIR_EN, file, key)
      expect(value, `en-US ${file} 缺少 ${key}`).toBeTruthy()
      expect(EN_GUIDANCE.test(value!), `en-US ${file}:${key} 没有下一步：「${value}」`).toBe(true)
    }
  })
})
