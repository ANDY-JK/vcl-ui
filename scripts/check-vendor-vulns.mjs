// F2 收口：vendored xlsx 的 CVE 监测——npm audit 的依赖图盲区（CDN tarball 不经 npm）由本闸补上。
//
// 为什么不能朴素查 OSV：SheetJS 2023 起停止向 npm 发版，OSV 的 npm 生态记录里这两条
// CVE（0.19.6 / 0.20.2 已修复）永远停在 introduced:0 无 fixed 事件——朴素查询对任何
// npm 版本号恒红。故按仓内登记制：返回的 GHSA id 必须在豁免表内且理由仍成立，新 id 即红。
// 复核触发：OSV 给任一豁免 id 补上 fixed 事件 / vendored 版本升级 / 出现新 id——都回这里重审。
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VENDOR = JSON.parse(readFileSync(resolve(ROOT, 'src/components/_internal/xlsx/VENDOR.json'), 'utf8'))
const version = VENDOR.version ?? VENDOR['xlsx']?.version
if (!version) {
  console.error('❌ VENDOR.json 里读不到 version 字段，正源登记缺字段')
  process.exit(1)
}

/**
 * CVE 豁免登记（id → 依据）。每条必须写清：上游修复版本、vendored 版本为何不受影响、
 * 何时复核。OSV 返回不在表内的 id 一律红（新 CVE 需人裁决：升级 / 加固 / 接受并登记）。
 */
const ALLOWED_VULNS = new Map([
  [
    'GHSA-4r6h-8v6p-xvw6',
    'CVE-2023-30533 原型污染：上游 0.19.6 修复；npm registry 停更于 0.18.5 故 OSV 无 fixed 事件；vendored 0.20.3 取自 cdn.sheetjs.com 正源 tarball，高于修复版。复核条件：OSV 补 fixed 事件或换版重搬时。',
  ],
  [
    'GHSA-5pgg-2g8v-p4x9',
    'CVE-2024-22363 ReDoS：上游 0.20.2 修复；npm 生态同上无 fixed 事件；vendored 0.20.3 高于修复版。复核条件：OSV 补 fixed 事件或换版重搬时。',
  ],
])

async function queryOsv(name, ver) {
  // 外部调用健壮性（P5）：15s 超时 + 1 次退避重试；两次都失败按显式失败红（osv.dev 不可达
  // 属环境故障，宁可误红也不给供应链监测留静默通道）
  let lastErr
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package: { name, ecosystem: 'npm' }, version: ver }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`OSV HTTP ${res.status}`)
      return (await res.json()).vulns ?? []
    } catch (e) {
      lastErr = e
      if (attempt === 1) await new Promise((r) => setTimeout(r, 2_000))
    }
  }
  throw lastErr
}

/** 纯函数：分离豁免命中与新发现的 id（供单测） */
export function splitVulns(vulns, allowed) {
  const waived = []
  const unknown = []
  for (const v of vulns) (allowed.has(v.id) ? waived : unknown).push(v.id)
  return { waived, unknown }
}

/** 主流程收拢：单测 import 本模块拿 splitVulns，不得触发网络查询（仅直接执行时跑） */
async function main() {
  const vulns = await queryOsv('xlsx', version)
  const { waived, unknown } = splitVulns(vulns, ALLOWED_VULNS)

  if (unknown.length) {
    console.error(`❌ xlsx@${version} 出现未登记的漏洞通告（${unknown.join(', ')}）：需人裁决——升级重搬 / 加固 / 带理由登记进 ALLOWED_VULNS`)
    process.exit(1)
  }
  for (const id of waived) console.log(`  豁免命中 ${id}：${ALLOWED_VULNS.get(id).split('；')[0]}；`)
  console.log(`✅ check:vendor-vulns 通过 — xlsx@${version} 对 OSV 全量通告完成对账（命中 ${waived.length} 条均在豁免登记内，新 id 即红）`)
}

const invokedDirectly = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('check-vendor-vulns.mjs')
if (invokedDirectly) {
  main().catch((e) => {
    console.error('❌ check:vendor-vulns 异常中止：', e?.message ?? e)
    process.exit(1)
  })
}
