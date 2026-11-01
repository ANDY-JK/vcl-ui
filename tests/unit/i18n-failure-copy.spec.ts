/**
 * 失败文案的最小可操作性 —— 棘轮（#301）
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
 * ## 为什么是棘轮而不是一刀切
 *
 * 存量里有一批"图片加载失败""上传失败"这类**足够清楚**的短文案，一刀切会产生大量
 * 假警报（#279 的教训：假警报会让闸门被关掉）。所以：**只挡新增**。
 * 已存在的裸文案登记在 `BASELINE` 里；修好一条就从 BASELINE 删掉（否则会报"陈旧条目"）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'src/components/_internal/locales/chunks/zh-CN'

/** 存量裸文案（修好一条就删一条；新增裸文案会被拦下） */
const BASELINE = new Set([
  'amap.ts:driveRouteFailed',
  'data.ts:loadFailed',
  'data.ts:downloadFail',
  'form.ts:uploadFailed',
  'form.ts:captureFailed',
  'form.ts:cameraStartFailed',
  'form.ts:imageLoadFailed',
  'form.ts:compressFailed',
  'formBuilder.ts:exportFail',
  'formBuilder.ts:shareSignFail',
  'formBuilderPresets.ts:loadLocalFail',
  'formBuilderPresets.ts:clearFail',
  'internal.ts:readFileFail',
  'routePlanner.ts:planFailed',
  'routePlanner.ts:coordParseFailed',
])

const GUIDANCE = /请|重试|检查|尝试|稍后|刷新|手动|重新/
const DETAIL = /\{[a-zA-Z]+\}|（[^）]+）|\([^)]+\)/

function scan() {
  const found: string[] = []
  for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.ts')) continue
    const src = readFileSync(join(DIR, f), 'utf8')
    for (const m of src.matchAll(/^\s{2,6}([a-zA-Z][\w]*):\s*'([^']*)'/gm)) {
      const [, key, value] = m
      if (!/(Fail|Failed)$/.test(key)) continue
      if (DETAIL.test(value) || GUIDANCE.test(value)) continue
      found.push(`${f}:${key}`)
    }
  }
  return found
}

describe('i18n 失败文案 · 可操作性棘轮', () => {
  it('**不得新增"只说了失败、没说下一步"的文案**', () => {
    const bare = scan()
    const added = bare.filter((k) => !BASELINE.has(k))
    expect(
      added,
      `新增了没有下一步的失败文案：${added.join(', ')}\n` +
        `修法：加"请/重试/检查"等指导词，或说明原因（括号/占位符）。`,
    ).toEqual([])
  })

  it('**BASELINE 不得含已修好的条目**（否则棘轮会僵化）', () => {
    const bare = new Set(scan())
    const stale = [...BASELINE].filter((k) => !bare.has(k))
    expect(stale, `这些条目已不再裸，请从 BASELINE 删掉：${stale.join(', ')}`).toEqual([])
  })

  it('抽查三条本轮补过的文案确实带指导（回归保护）', () => {
    const src = readFileSync(join(DIR, 'formBuilder.ts'), 'utf8')
    for (const key of ['fileReadFail', 'loadFormFail', 'copyFail']) {
      const m = new RegExp(`^\\s{4}${key}:\\s*'([^']*)'`, 'm').exec(src)
      expect(m, `${key} 应存在`).toBeTruthy()
      expect(GUIDANCE.test(m![1]), `${key} 应含指导词，实际：${m![1]}`).toBe(true)
    }
  })
})
