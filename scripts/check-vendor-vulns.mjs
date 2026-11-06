// F2 收口：vendored xlsx 的 CVE 监测——npm audit 的依赖图盲区（CDN tarball 不经 npm）由本闸补上。
//
// 为什么不能朴素查 OSV：SheetJS 2023 起停止向 npm 发版，OSV 的 npm 生态记录里这两条
// CVE（0.19.6 / 0.20.2 已修复）永远停在 introduced:0 无 fixed 事件——朴素查询对任何
// npm 版本号恒红。故按仓内登记制：返回的 GHSA id 必须在豁免表内且理由仍成立，新 id 即红。
// 复核触发：OSV 给任一豁免 id 补上 fixed 事件 / vendored 版本升级 / 出现新 id——都回这里重审。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * **上次成功结果的本地缓存**（`reports/` 已 gitignore）。
 *
 * 起因（第 107/108 轮实测）：本闸是整链里**唯一联网**的步骤（查 osv.dev），
 * 网络抖一下就 `fetch failed` → 其后 19 步全部不执行（两轮里共挡了 3 次整链）。
 * 而"断网"与"代码有漏洞"是两件事，不该用同一种红来表达。
 *
 * 口径（刻意保守）：
 *  · 只有**成功**跑完全部目标才写缓存（半截数据不入库）；
 *  · 缓存键 = `包名@版本`（版本变了自动不命中，不会拿旧结论顶新版本）；
 *  · 年龄 ≤ `MAX_AGE_DAYS` 天才允许兜底；**超期仍然红** —— 宁可误红，
 *    也不让供应链监测静默停摆；两者都不可用时行为与改动前完全一致。
 */
// 缓存位置可经 `VENDOR_VULNS_CACHE` 覆盖 —— CI 无网时可指向受控目录里的缓存（TD-25）：
// 把热缓存从 reports/（gitignore）带进 CI 工件，而不是让闸口在无网环境裸红。
function cachePathFromEnv(env = process.env) {
  return env.VENDOR_VULNS_CACHE
    ? resolve(env.VENDOR_VULNS_CACHE)
    : resolve(ROOT, 'reports', 'vendor-vulns-cache.json')
}
const CACHE = cachePathFromEnv()
const MAX_AGE_DAYS = 7

function readCache(cachePath = CACHE) {
  if (!existsSync(cachePath)) return null
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'))
  } catch {
    return null
  }
}

/** 缓存年龄（天）；时间戳坏了视为无限旧（= 不可用） */
function cacheAgeDays(cache) {
  const t = Date.parse(cache?.checkedAt ?? '')
  return Number.isFinite(t) ? (Date.now() - t) / 86_400_000 : Number.POSITIVE_INFINITY
}
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
  // ↓ 三条 2021 年的 SheetJS **Pro** 公告。2026-10-17 本闸口首次命中它们（同日入库、当天红），
  //   经查证与社区版无关，属"OSV 按包名匹配的必然命中"，登记豁免。
  [
    'GHSA-3x9f-74h4-2fqr',
    'SheetJS **Pro** through 0.16.9 的 DoS（crafted .xlsx 内存耗尽，issue 1/2）：影响面是商业版 Pro ≤0.16.9，本仓 vendored 是社区版 0.20.3（高于 0.16.9），且社区版与 Pro 并非同一代码线。公告未登记版本区间（affected.ranges 为空）→ OSV 对任何 xlsx 版本查询都会返回它，故只能登记豁免。复核条件：上游补 ranges / 换版重搬 / 出现带 ranges 的新公告时。',
  ],
  [
    'GHSA-8vcr-vxm8-293m',
    '同上（issue 2/2）：SheetJS Pro ≤0.16.9 内存耗尽 DoS；vendored 社区版 0.20.3 不受影响；ranges 为空故 OSV 恒命中。复核条件同 GHSA-3x9f-74h4-2fqr。',
  ],
  [
    'GHSA-g973-978j-2c3p',
    '同上（CPU 耗尽变体）：SheetJS Pro ≤0.16.9。vendored 社区版 0.20.3 不受影响；ranges 为空故 OSV 恒命中。复核条件同 GHSA-3x9f-74h4-2fqr。',
  ],
])

async function queryOsv(name, ver, { fetchImpl = globalThis.fetch, retryDelay = 2_000 } = {}) {
  // 外部调用健壮性（P5）：15s 超时 + 1 次退避重试；两次都失败按显式失败红（osv.dev 不可达
  // 属环境故障，宁可误红也不给供应链监测留静默通道）
  // ver 省略时按「包名全量通告」查询：用于版本不可考的 vendored 件（pinyin-pro）。
  let lastErr
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const pkg = ver ? { name, ecosystem: 'npm', version: ver } : { name, ecosystem: 'npm' }
      const res = await fetchImpl('https://api.osv.dev/v1/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package: pkg }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`OSV HTTP ${res.status}`)
      return (await res.json()).vulns ?? []
    } catch (e) {
      lastErr = e
      if (attempt === 1 && retryDelay > 0) await new Promise((r) => setTimeout(r, retryDelay))
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
/**
 * 主流程（#472 收口 TD-25）：**返回结构化结论，不直接 process.exit**。
 *
 * 此前 main() 在「出现新 id」时直接 process.exit(1) —— 这条路径因此**永远无法被单测覆盖**：
 * 测试一 import 就把自己杀掉。离线兜底只能靠纯函数（cacheAgeDays / cachePathFromEnv）间接测，
 * 而真正要证明的是「断网 + 热缓存 → 绿、断网 + 无缓存 → 红、缓存里混进新 id → 仍然红」。
 * 现在全部可注入：fetchImpl / retryDelay / cachePath / log / error。
 */
export async function runVendorVulns(opts = {}) {
  const {
    fetchImpl = globalThis.fetch,
    retryDelay = 2_000,
    cachePath = CACHE,
    log = console.log,
    error = console.error,
  } = opts
  // 被监测的仓内 vendor 件（2026-10-17 起从「单件 xlsx」推广为清单制，第五轮审查 R5-C24）：
  //   有 version 的按版本查（能精确判定"该版本是否受影响"）；
  //   无 version 的按包名查全量通告 —— 任何一条未登记通告即红，逼人裁决。
  const PINYIN = JSON.parse(readFileSync(resolve(ROOT, 'src/components/_internal/pinyin-pro/VENDOR.json'), 'utf8'))
  const TARGETS = [
    { name: 'xlsx', version, allowed: ALLOWED_VULNS },
    { name: 'pinyin-pro', version: PINYIN.version === 'unknown' ? undefined : PINYIN.version, allowed: new Map() },
  ]

  const lines = []
  const errors = []
  const cache = readCache(cachePath)
  const cacheFresh = cache && cacheAgeDays(cache) <= MAX_AGE_DAYS
  const freshResults = {}
  let usedCache = 0
  let ok = true

  for (const t of TARGETS) {
    const key = `${t.name}@${t.version ?? 'unknown'}`
    let vulns
    try {
      vulns = await queryOsv(t.name, t.version, { fetchImpl, retryDelay })
      freshResults[key] = vulns.map((v) => v.id)
    } catch (err) {
      // 网络不可达：只有在"缓存新鲜且版本一致"时才兜底，并把这件事**显式说出来**
      const cachedIds = cacheFresh ? cache?.results?.[key] : undefined
      if (!cachedIds) {
        errors.push(
          `❌ ${key}：osv.dev 不可达，且没有可用的离线缓存兜底。` +
            `（缓存上限 ${MAX_AGE_DAYS} 天；无网 CI 请把热缓存放到受控目录并设 VENDOR_VULNS_CACHE 指向它）`,
        )
        ok = false
        break
      }
      usedCache += 1
      vulns = cachedIds.map((id) => ({ id }))
      log(
        `   ⚠ ${key}：osv.dev 不可达（${err?.message ?? err}），改用 ${cacheAgeDays(cache).toFixed(1)} 天前的缓存结果（上限 ${MAX_AGE_DAYS} 天）`,
      )
    }
    const { waived, unknown } = splitVulns(vulns, t.allowed)
    if (unknown.length) {
      errors.push(
        `❌ ${t.name}${t.version ? `@${t.version}` : '（版本未知，按包名全量监测）'} 出现未登记的漏洞通告（${unknown.join(', ')}）：需人裁决——升级重搬 / 加固 / 带理由登记进 ALLOWED_VULNS`,
      )
      ok = false
      break
    }
    for (const id of waived) log(`  豁免命中 ${id}（${t.name}）：${t.allowed.get(id).split('；')[0]}；`)
    lines.push(`${t.name}${t.version ? `@${t.version}` : '(版本未知/按包名)'}=${vulns.length}条通告(豁免${waived.length})`)
  }

  if (!ok) {
    for (const e of errors) error(e)
    return { ok, lines, usedCache, errors }
  }

  // 全部目标都拿到**新鲜**结果才写缓存（有兜底的跑不覆盖缓存，避免"离线结论"污染"在线结论"）
  if (usedCache === 0) {
    try {
      writeFileSync(cachePath, JSON.stringify({ checkedAt: new Date().toISOString(), results: freshResults }, null, 2))
    } catch {
      // 写不了缓存不影响闸口结论（reports/ 可能只读）
    }
  }

  const suffix = usedCache > 0 ? `（其中 ${usedCache} 项用离线缓存兜底）` : ''
  log(`✅ check:vendor-vulns 通过 — ${lines.join('；')}（新 id 即红）${suffix}`)
  return { ok, lines, usedCache, errors }
}

/** CLI 薄壳：把结构化结论翻译成原来的 stdout / 退出码（外部行为一字不变） */
async function main() {
  const r = await runVendorVulns()
  if (!r.ok) process.exit(1)
}

export { CACHE, cacheAgeDays, cachePathFromEnv, MAX_AGE_DAYS }
const invokedDirectly = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('check-vendor-vulns.mjs')
if (invokedDirectly) {
  main().catch((e) => {
    console.error('❌ check:vendor-vulns 异常中止：', e?.message ?? e)
    process.exit(1)
  })
}
