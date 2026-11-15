#!/usr/bin/env node
/**
 * gen-coverage-domains-fixtures —— 重建 coverage-domains 闸口的自测夹具（#520）。
 *
 * ## 为什么要它
 *
 * 仓库做过一轮**脱敏**（提交 b4b7f866「移除内部台账与隐私线索」）：把本机绝对路径
 * 整体替换成占位符 `[LOCAL_PATH]`。这个替换在**普通文件里无害**，但在覆盖夹具里
 * 是数据破坏 —— 夹具的路径键就是数据本身：
 *
 *   "I:/…/src/components/login/index.ts"  →  "[LOCAL_PATH]"
 *
 * 结果：14 个条目全部塌成一个键，`JSON.parse` 只保留最后一条，域名（login/newdomain…）
 * 连同"哪个文件属于哪个域"的区分信息全没了。闸口正则
 * `/\/src\/components\/([^/]+)\//` 匹配不到任何键 → 14 个域全部报
 * "在覆盖数据里不存在" → 自测三条用例全红。
 *
 * ## 为什么是重建而不是还原
 *
 * 夹具是**合成**的（覆盖数据，不是真实统计），原内容在脱敏提交里已经不可靠；
 * 而且重建能顺带把「合成路径不带本机信息」写进约定，避免下一次脱敏再踩同一个坑。
 *
 * 键形 `/synthetic/repo/src/components/<域>/<文件>.ts`：
 * - 正则能解析出域名（闸口只认路径形状）；
 * - 不含任何本机路径/用户名，脱敏扫描不会再命中。
 *
 * ## 用法
 *   node scripts/gen-coverage-domains-fixtures.mjs   # 重写两个夹具
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

const OUT_DIR = 'tests/fixtures/coverage-domains'

/** 100% 的一条覆盖记录：语句/分支/函数全命中。 */
function fullHit() {
  return { s: { 0: 1, 1: 1 }, b: { 0: [1, 1] }, f: { 0: 1 } }
}

/** 全 0 的一条覆盖记录：语句/分支/函数全不命中。 */
function zeroHit() {
  return { s: { 0: 0, 1: 0 }, b: { 0: [0, 0] }, f: { 0: 0 } }
}

/** 合成路径键：域名在路径里，闸门正则能解析。 */
function key(domain, file) {
  return `/synthetic/repo/src/components/${domain}/${file}`
}

/**
 * ok.json：14 个域全部 100% → 闸口必须 exit 0。
 *
 * ⚠️ 域清单必须**与闸口的 FLOORS 保持一致**（闸口会把 FLOORS 里的每个域
 * 拿去查覆盖数据，查不到就报"barrel 被删/改名了"）。这里直接从闸口脚本里
 * 解析出 FLOORS 键名，而不是再抄一遍 —— 抄一份早晚会漂移。
 */
function okFixture() {
  const floors = readFloorDomains()
  const obj = {}
  for (const domain of floors) obj[key(domain, 'index.ts')] = fullHit()
  return obj
}

/**
 * bad.json：`login` 三项全 0（低于地板）+ 一个**未登记的新域** `newdomain`。
 * 闸口必须 exit 1，并且点名 "login 语句" 与 "newdomain"。
 */
function badFixture() {
  const floors = readFloorDomains()
  const obj = {}
  for (const domain of floors) {
    obj[key(domain, 'index.ts')] = domain === 'login' ? zeroHit() : fullHit()
  }
  obj[key('newdomain', 'index.ts')] = fullHit()
  return obj
}

/** 从闸口脚本的 FLOORS 字面量里取域名（唯一真源，不手抄）。 */
function readFloorDomains() {
  const src = readFileSync('scripts/check-coverage-domains.mjs', 'utf8')
  const block = src.match(/const FLOORS = \{([\s\S]*?)\n\}/)?.[1]
  if (!block) throw new Error('闸口脚本里找不到 FLOORS 字面量')
  const domains = []
  for (const line of block.split('\n')) {
    const m = /^\s*['"]?([\w-]+)['"]?\s*:\s*\[/.exec(line)
    if (m) domains.push(m[1])
  }
  if (domains.length === 0) throw new Error('从 FLOORS 里解析不到域名')
  return domains
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(`${OUT_DIR}/ok.json`, JSON.stringify(okFixture(), null, 2) + '\n')
writeFileSync(`${OUT_DIR}/bad.json`, JSON.stringify(badFixture(), null, 2) + '\n')

const domains = readFloorDomains()
console.log(`[gen-coverage-domains-fixtures] 从闸口 FLOORS 读到 ${domains.length} 个域`)
console.log(`[gen-coverage-domains-fixtures] 重写 ${OUT_DIR}/ok.json（全 100%）与 bad.json（login=0 + newdomain）`)
