// 闸口：事件码是宿主建告警的契约，删改即红（TD-24 旁的稳定性缺口，#450）
//
// ## 背景
//
// `docs-site/guide/facts.md` 的事件码清单直接对外，宿主按 `code` 建告警规则
// （注释里写死了："e.code 是稳定事件码，按它建告警规则；不要用 message"）。
// 但**没有任何东西阻止重命名或删除一个已发布的码**：`gen:facts` 会照实生成新清单，
// 文档看起来"更新了"，而宿主那侧的告警规则会静默失效 —— 没人知道。
//
// ## 判据
//
// · 基线 `event-codes-baseline.json` 存已发布码清单；
// · 当前扫描（与 gen:facts 共用 `scripts/lib/event-codes.mjs`）里**缺少基线中的码** → 红
//   （重命名/删除都是破坏性变更，必须显式改基线并在留痕说明迁移）；
// · 出现基线没有的**新码** → 只提示不红（加新告警是正常开发，但应跑 gen:facts 让文档跟上）；
// · 基线缺失 / 不足 10 个码 / 有重复 → 红（判据空转或脏数据）。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { scanEventCodes } from './lib/event-codes.mjs'

const ROOT = process.cwd()
const BASELINE = path.join(ROOT, 'event-codes-baseline.json')

/**
 * 对比基线码集与当前码集（纯函数，可单测）。
 * @param {{baseline: string[], current: string[]}} p
 * @returns {{removed: string[], added: string[]}}
 */
export function diffCodes({ baseline, current }) {
  const b = new Set(baseline)
  const c = new Set(current)
  return {
    removed: [...b].filter((x) => !c.has(x)).sort(),
    added: [...c].filter((x) => !b.has(x)).sort(),
  }
}

/**
 * 校验基线文件形状（纯函数）。
 * @param {unknown} data
 * @returns {string[]} 问题列表（空 = 合法）
 */
export function validateBaseline(data) {
  const problems = []
  const codes = data?.codes
  if (!Array.isArray(codes)) return ['基线缺少 codes 数组']
  if (codes.length < 10) problems.push(`基线只有 ${codes.length} 个码（< 10，判据疑似空转）`)
  if (new Set(codes).size !== codes.length) problems.push('基线 codes 有重复项')
  for (const c of codes) if (typeof c !== 'string' || !c.includes('/')) problems.push(`疑似非法码：${String(c)}`)
  return problems
}

function main() {
  if (!fs.existsSync(BASELINE)) {
    console.error(`❌ check:event-codes 未通过 —— 找不到基线 ${path.relative(ROOT, BASELINE)}`)
    process.exit(1)
  }
  let data
  try {
    data = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  } catch (e) {
    console.error(`❌ check:event-codes 未通过 —— 基线不是合法 JSON：${e.message}`)
    process.exit(1)
  }
  const problems = validateBaseline(data)
  if (problems.length) {
    console.error('❌ check:event-codes 未通过 —— 基线形状不对：')
    for (const p of problems) console.error(`   - ${p}`)
    process.exit(1)
  }

  const rows = scanEventCodes({ root: ROOT })
  const current = [...new Set(rows.map((r) => r.code))].sort()
  const { removed, added } = diffCodes({ baseline: data.codes, current })

  if (removed.length) {
    console.error(`❌ check:event-codes 未通过 —— ${removed.length} 个已发布事件码消失（重命名/删除 = 破坏宿主告警）：`)
    for (const c of removed) console.error(`   - ${c}`)
    console.error('   修法：恢复该码；确需变更则同步更新 event-codes-baseline.json，并在留痕写清迁移说明。')
    process.exit(1)
  }
  if (added.length) {
    console.log(`ℹ 新增事件码 ${added.length} 个（允许，但请跑 npm run gen:facts 让文档清单跟上）：${added.join(', ')}`)
  }
  console.log(
    `✅ check:event-codes 通过 — ${current.length} 个已发布事件码（${rows.length} 个调用点）与基线一致，新增 ${added.length} 个`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
