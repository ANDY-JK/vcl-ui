// 写"全量覆盖跑"标记：供 check-coverage-domains.mjs 判断数据来源是否完整。
//
// ## 为什么需要这个标记
//
// `npx vitest run <单个spec> --coverage` 会静默覆盖 reports/coverage/coverage-final.json。
// 若此后跑按域地板检查，会把"只有部分文件有数据"误判成"覆盖率暴跌"：
// 实测只跑一个 11 用例的 spec 后，login 分支显示 0.0%、shared 语句 0.0%，
// 8 个域同时报"低于地板" —— 全是假的。
//
// ## 为什么不用文件数判断（试过，被证伪）
//
// vitest 的 v8 provider 会把所有被 import 过的模块都写进报告，未测到的记 0。
// 单独跑一个小 spec 也产出 346 个文件，与全量跑**完全相同** —— 文件数分不出来。
//
// 所以用「标记文件 + mtime 比较」：
//   · 全量跑结束 → 写 .full-run（mtime = 现在）
//   · 闸口检查 → 要求 coverage-final.json 的 mtime **不晚于** .full-run
//   · 若两者顺序颠倒（先全量、后单 spec）→ 立刻抓出
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

const MARKER = join('reports', 'coverage', '.full-run')
const dir = dirname(MARKER)

if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true })
}

writeFileSync(MARKER, `full unit run completed at ${new Date().toISOString()}\n`, 'utf8')
console.log(`[mark-coverage-full-run] 已写标记 ${MARKER}`)
