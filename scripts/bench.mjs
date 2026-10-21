// 关键路径性能基准（自研轻量 harness）。
// 背景：vitest 5.0.1 的 CLI 仍保留 `vitest bench`，但公开入口已不导出 bench()（内部实现
// 在 chunk 里未接线）——基准脱离 vitest 自立：纯 Node + jiti 加载 TS 源码（带 @ 别名）+
// happy-dom 供 sanitize 的 DOM 面。
// 运行：npm run bench；输出 mean/min（毫秒），供优化前后对比。不进 quality-check 链。
// 规模取真实场景：表格 1 万行 × 10 列（审计口径）、树 200 节点、路线 60 门店。
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createJiti } from 'jiti'
import { Window } from 'happy-dom'
import { ref, computed } from 'vue'

// sanitizeHTML 走白名单 DOM 消毒，Node 下需注入 happy-dom 的 document
if (typeof globalThis.document === 'undefined') {
  globalThis.document = new Window().document
}

const jiti = createJiti(fileURLToPath(import.meta.url), {
  alias: {
    // route-planning 只用 calcDistance（定义在 amap-service.ts），但 amap barrel 会拖进
    // tokens.css/AmapWidget.vue——jiti 无法加载，把该 specifier 精确指到真实源文件
    '@/components/amap': fileURLToPath(new URL('../src/components/amap/amap-service.ts', import.meta.url)),
    '@': fileURLToPath(new URL('../src', import.meta.url)),
  },
  interopDefault: true,
})

const [
  { useTableCore },
  { normalizeCellInput },
  { sanitizeHTML },
  { createPinyinMatcher, matchPinyin },
  { planRoute },
] = await Promise.all([
  jiti.import('@/components/data/composables/useTableCore'),
  jiti.import('@/components/data/composables/cell-input'),
  jiti.import('@/components/_internal/sanitize'),
  jiti.import('@/components/_internal/usePinyinSearch'),
  jiti.import('@/components/route-planner/utils/route-planning'),
])
// 注：form-builder 节点树操作不进基准——domain.ts → fieldRegistry 拖 7 个 .vue 组件
// 映射（jiti 无法加载 SFC），且树操作是元数据层而非渲染热点。

const results = []
/**
 * 每个场景记录 mean / **median** / min。
 *
 * 为什么同时记 median：`mean` 会被偶发的长尾（一次 GC、一次调度抢占）拉高，
 * 而"基线比对"要的是**典型值**。实测教训：同一份代码在负载 4% 与连续跑（负载升高）两种
 * 情况下，`mean` 相差可达 2–3 倍，而 `median` 稳定得多。
 * 判定回归用 median，`--json` 两个都存（便于人工判断分布形状）。
 */
function bench(name, fn, { iterations = 10, warmup = 3 } = {}) {
  for (let i = 0; i < warmup; i++) fn()
  const times = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  const sorted = [...times].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const mean = times.reduce((a, b) => a + b, 0) / iterations
  results.push({ name, mean, median, min: sorted[0], iterations })
}

// ══════════ useTableCore · 1 万行 × 10 列 ══════════
const ROWS = 10_000
const COLS = 10
const genCols = (n) => Array.from({ length: n }, (_, i) => ({ key: `col${i}`, title: `列${i}` }))
const genRows = (n) =>
  Array.from({ length: n }, (_, i) => {
    const row = { id: `r${i}` }
    for (let c = 0; c < COLS; c++) row[`col${c}`] = `值${i}-${c}`
    return row
  })

/** 与 table-perf.spec 同口径的最小 core 装配（每次迭代内新建，避免 computed 缓存吃掉算子） */
function makeCore(data, pinyin = false) {
  const filterState = ref({})
  const hiddenColumns = ref(new Set())
  const visibleColumns = computed(() => genCols(COLS))
  const globalSearch = ref('')
  const core = useTableCore(
    { data, rowKey: 'id', pinyinSearch: pinyin },
    () => {},
    filterState,
    hiddenColumns,
    visibleColumns,
    globalSearch,
  )
  return { core, globalSearch }
}

const tableData = genRows(ROWS)
const tableCols = genCols(COLS)

bench('表格 displayData 全量管道（1 万行 × 10 列，过滤+映射）', () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  makeCore(tableData).core.displayData.value
})

bench('表格 rowMetaMap 全量构建（截断判定+斑马纹）', () => {
  const { core } = makeCore(tableData)
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  core.displayData.value
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  core.rowMetaMap.value
})

bench('表格全局搜索（拼音匹配全量扫描）', () => {
  const { core, globalSearch } = makeCore(tableData, true)
  globalSearch.value = '值9999'
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  core.displayData.value
})

bench('表格客户端排序（文本列全量）', () => {
  const { core } = makeCore(tableData)
  core.toggleSort(tableCols[1])
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  core.displayData.value
})

// ══════════ sanitizeHTML · 白名单消毒 ══════════
const rich =
  '<b>合同</b>金额 <span style="color:red">¥1,234.56</span><table><tr><td>品名</td><td><a href="https://example.com/x" target="_blank">详情</a></td></tr></table><img src="https://cdn.example.com/a.png" alt="图"><script>alert(1)</script>'
const dirty =
  '<img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><svg><script>x</script></svg><style>body{}</style><template><iframe src=evil></iframe></template>'

bench('sanitizeHTML 典型富文本（含必剥 script）', () => sanitizeHTML(rich), { iterations: 200 })
bench('sanitizeHTML 对抗载荷（6 类攻击向量）', () => sanitizeHTML(dirty), { iterations: 200 })

// ══════════ 拼音搜索 ══════════
const labels = Array.from({ length: 10_000 }, (_, i) => `长沙${i}号店`)
const matcher = createPinyinMatcher(() => true)
for (const l of labels) matcher.getIndex(l) // 预热：量缓存命中路径（裸转换另有 matchPinyin 基线）

bench(
  '拼音 缓存命中路径 · 1 万条匹配',
  () => {
    let hit = 0
    for (const l of labels) if (matcher.match(l, 'cs')) hit++
    if (hit === 0) throw new Error('拼音匹配全落空')
  },
  { iterations: 5 },
)

bench('拼音 裸转换路径 · 500 条（无缓存 matchPinyin）', () => {
  for (let i = 0; i < 500; i++) matchPinyin(`长沙${i}号店`, 'cs')
})

// ══════════ cell-input · 列类型归一化 ══════════
bench(
  '归一化 number（含全角/千分位）×3',
  () => {
    normalizeCellInput('１,２３４.５６', { type: 'number' })
    normalizeCellInput('1,234.56', { type: 'number' })
    normalizeCellInput('-42', { type: 'number' })
  },
  { iterations: 2000 },
)
bench(
  '归一化 date（MDY 两段数字）×2',
  () => {
    normalizeCellInput('9/24', { type: 'date', dateOrder: 'MDY' })
    normalizeCellInput('2025-9-24', { type: 'date' })
  },
  { iterations: 2000 },
)

// ══════════ route-planner · planRoute（60 门店）══════════
const mkStore = (id, lon, lat) => ({
  id,
  name: `门店${id}`,
  address: '某路1号',
  province: '湖南省',
  city: '长沙市',
  district: '岳麓区',
  town: '',
  contact: '',
  phone: '',
  longitude: lon,
  latitude: lat,
  coordSource: 'original',
  skipped: false,
})
const stores = Array.from({ length: 60 }, (_, i) =>
  mkStore(`s${i}`, 112.5 + ((i * 7) % 30) / 25, 27.8 + ((i * 11) % 25) / 25),
)
const routeOptions = {
  stores,
  dailyLimitHours: 8,
  maxStoresPerDay: 8,
  maxSegmentKm: 80,
  maxDetourKm: 50,
  roadFactor: 1.4,
  avgSpeedKmh: 50,
  clusterRadiusKm: 30,
  defaultVisitMinutes: 30,
  maxDrivingMinutesPerDay: 240,
}
bench(
  '路线规划 聚类+2-opt+分天（60 门店）',
  () => {
    planRoute(routeOptions)
  },
  { iterations: 5 },
)

// ══════════ 输出 ══════════
//
// 两种附加模式（2026-10-19 加，对应审查 R5-C10「性能基准只有测量没有守护」）：
//   --json   只输出机器可读 JSON（写基线用：`npm run bench -- --json > bench-baseline.json`）
//   --check  与 bench-baseline.json 比对，超基线 ×RATCHET 即非零退出（接进 quality-check）
//
// 为什么用"基线 × 倍率"而不是绝对毫秒阈值：不同机器（CI/开发机）绝对耗时差异很大，
// 绝对阈值只会天天误报；而"相对自己上一次"能真实反映回归。
const args = process.argv.slice(2)
const jsonOnly = args.includes('--json')
const checkMode = args.includes('--check')

/**
 * 允许的退化倍率。
 *
 * **取值全部来自实测，不是拍脑袋**。两轮测量：
 *   ① 独立连续跑 8 轮（48 个样本）：中位 1.15 / P95 1.55 / 最大 2.03 —— 连续运行本身就会漂移；
 *   ② **链内**跑 4 轮（在 `test:unit` 之后立刻跑，16 个受守护样本）：中位 **1.17** / 最大 **1.92**
 *      —— 整链环境里机器带负载，系统性地比独立跑更慢。
 *
 * 取 **2.2**：在实测最大值 1.92 之上留约 15% 余量。
 *
 * **它抓得住什么、抓不住什么（重要）**：
 *   · 抓得住：**翻倍级及以上的真回归**（如算法从 O(n) 退化到 O(n²)、误加了全量深拷贝）；
 *   · 抓不住：30–50% 的缓慢退化 —— 那需要固定 CPU 频率 + 隔离环境，超出单机开发的现实。
 * 所以这个闸口的定位是"**防止悄悄翻倍**"，不是"保证不退化"。
 * 做性能优化时请直接看 `npm run bench` 的原始数字对比，别依赖这里的阈值。
 */
const RATCHET = 2.2

/**
 * 亚毫秒/小场景的**绝对下限**（毫秒）。
 *
 * 实测教训：`sanitizeHTML 典型富文本` 基线 0.24ms、复跑 0.34ms，比值 ×1.38 直接触发误报 ——
 * 而两者绝对差只有 0.1ms，完全在调度噪声内。**耗时越小的场景，比值越不可信**：
 * 分母接近 0 时任何抖动都会放大成"翻倍"。
 *
 * 因此加一道下限：只有当「当前值 > 基线 × RATCHET」**且**「绝对增量超过下限」时才判回归。
 * 取 1.0ms 的依据：实测中"比值超 1.6 但绝对差 < 1ms"的样本全部来自 1.3ms 以下的场景
 * （拼音缓存命中 1.30→2.08 那类），把它们判为回归没有意义——用户感知不到 0.8ms。
 */
const MIN_ABS_DELTA_MS = 1.0

/**
 * 「可守护」的最小基线（毫秒）。
 *
 * **为什么需要它**：实测 6 轮各场景的比值波动（相对基线）显示，稳定性与基线大小强相关：
 *   · 基线 44.36ms → 比值 0.93–1.04
 *   · 基线 10.28ms → 0.96–1.10
 *   · 基线  6.97ms → 0.95–1.06
 *   · 基线  3.86ms → 0.90–1.12
 *   · 基线  1.30ms → 0.87–**1.30**
 *   · 基线  0.05ms → 0.95–**1.51**
 * 也就是**基线越小，比值越不可信**：分母接近 0 时，一次 GC 或调度抢占就能把比值推到 2 倍。
 * 实测在整链环境里（`test:unit` 刚跑完、机器带负载）就出现过 1.30ms → 2.93ms（×2.26）的假回归。
 *
 * 取 2.0ms：把上述前四个稳定场景纳入守护，后两个只报告不拦截。
 * **这是诚实的选择**：没有 CPU 隔离与固定频率，亚毫秒操作的时间回归本来就测不准 ——
 * 与其用一个会天天误报的闸口，不如明确说"这些场景不守护"，并把它们继续打印出来供人参考。
 */
const MEASURABLE_MS = 2.0

const BASELINE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'bench-baseline.json')

if (jsonOnly) {
  console.log(
    JSON.stringify(
      {
        // 记 node 版本：不同 Node 的 JIT 表现差异足以解释 20% 的漂移
        node: process.version,
        scenarios: results.map((r) => ({
          name: r.name,
          mean: Number(r.mean.toFixed(4)),
          median: Number(r.median.toFixed(4)),
          min: Number(r.min.toFixed(4)),
        })),
      },
      null,
      2,
    ),
  )
} else {
  const nameW = Math.max(...results.map((r) => r.name.length)) + 2
  console.log('\n┌─ 性能基线（mean / min，毫秒）' + '─'.repeat(nameW) + '┐')
  let group = ''
  for (const r of results) {
    const g = r.name.split(' ')[0]
    if (g !== group) {
      group = g
      console.log(`├─ ${'─'.repeat(nameW + 20)}`)
    }
    console.log(
      `│ ${r.name.padEnd(nameW)} ${r.mean.toFixed(2).padStart(9)} / ${r.min.toFixed(2).padStart(9)}  ×${r.iterations}`,
    )
  }
  console.log('└' + '─'.repeat(nameW + 24) + '┘')
}

// ── --check：与基线比对 ──
if (checkMode) {
  let baseline
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    console.error(`\n❌ bench --check 找不到基线 ${BASELINE_PATH}`)
    console.error('   首次生成：npm run bench -- --json > bench-baseline.json')
    process.exit(1)
  }

  const baseByName = new Map((baseline.scenarios ?? []).map((s) => [s.name, s]))
  const regressions = []
  const missing = []
  const noisy = []
  const tooSmall = []
  /** 第一轮判为回归的场景名 —— 需要重测确认 */
  const suspects = new Set()

  for (const r of results) {
    const b = baseByName.get(r.name)
    if (!b) {
      // 新场景没有基线：不算回归，但必须提示——否则"新增的重活"永远不会被守护
      missing.push(r.name)
      continue
    }
    // 用 median 比对：mean 会被长尾（一次 GC / 调度抢占）拉高，实测同代码可差 2–3 倍
    const base = b.median ?? b.mean
    const now = r.median
    if (base < MEASURABLE_MS) {
      // 基线太小，比值不可信：只报告不守护（理由见 MEASURABLE_MS 注释）
      tooSmall.push({ name: r.name, base, now })
      continue
    }
    if (now > base * RATCHET && now - base > MIN_ABS_DELTA_MS) {
      suspects.add(r.name)
      regressions.push({ name: r.name, base, now, ratio: now / base })
    } else if (now > base * RATCHET) {
      // 比值超了但绝对差太小：不判失败，但要说出来，免得"为什么它没红"变成谜
      noisy.push({ name: r.name, base, now, ratio: now / base })
    }
  }

  /**
   * 疑似回归的**二次确认**（2026-10-21 加，实测驱动）。
   *
   * 实测数据：在整链里紧跟 `test:unit` 之后跑，第一个 bench 进程的第一个场景会系统性偏高 ——
   * `表格全局搜索` 连续三次测得 median ×1.89 / ×1.11 / ×1.08，即**首次跑被前序重负载拖慢了近 2 倍**，
   * 而后两次立刻回落到正常。原因是 CPU 频率/缓存/页表在重负载退出后需要时间恢复，
   * 与"代码变慢"无关。
   *
   * 所以：**首轮超阈只算"疑似"，重测一轮；只有两轮都超阈才判失败**。
   * 这是标准的 best-of-2 噪声抑制 —— 真回归（如 O(n)→O(n²)）在两轮里都会超阈，不受影响。
   */
  let confirmed = regressions
  if (suspects.size) {
    console.log(`\n⟳ 首轮 ${suspects.size} 个场景超阈，重测一轮确认（排除"重负载后首个进程偏慢"的假阳性）…`)
    let second
    try {
      // 用子进程跑一次纯测量，避免复用本进程已污染的 JIT/堆状态
      const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      second = JSON.parse(out).scenarios ?? []
    } catch {
      console.log('   ⚠ 重测失败，按首轮结果判定')
      second = []
    }
    const secondByName = new Map(second.map((s) => [s.name, s]))
    confirmed = regressions.filter((reg) => {
      const s2 = secondByName.get(reg.name)
      if (!s2) return true // 拿不到重测值就维持首轮结论（不因工具问题放过疑似回归）
      const ok = s2.median > reg.base * RATCHET && s2.median - reg.base > MIN_ABS_DELTA_MS
      if (ok) {
        reg.now = s2.median
        reg.ratio = s2.median / reg.base
        return true
      }
      console.log(
        `   ✓ ${reg.name}：首轮 ${reg.now.toFixed(2)}ms（×${reg.ratio.toFixed(2)}）→ 重测 ${s2.median.toFixed(2)}ms（×${(s2.median / reg.base).toFixed(2)}），判为噪声`,
      )
      return false
    })
  }


  if (tooSmall.length) {
    console.log(`\nℹ 以下 ${tooSmall.length} 个场景基线 < ${MEASURABLE_MS}ms，**不纳入守护**（比值不可信，仅供人工参考）：`)
    for (const r of tooSmall) {
      console.log(`   · ${r.name}：基线 ${r.base.toFixed(3)}ms → 现在 ${r.now.toFixed(3)}ms`)
    }
  }

  if (missing.length) {
    console.log('\n⚠ 以下场景在基线里没有记录（不判失败，但建议更新基线）：')
    for (const m of missing) console.log(`   · ${m}`)
  }

  if (noisy.length) {
    console.log(`\n⚠ 以下场景比值超 ×${RATCHET}，但绝对增量不足 ${MIN_ABS_DELTA_MS}ms（判为噪声，不拦）：`)
    for (const r of noisy) {
      console.log(
        `   · ${r.name}：${r.base.toFixed(3)}ms → ${r.now.toFixed(3)}ms（×${r.ratio.toFixed(2)}，差 ${(r.now - r.base).toFixed(3)}ms）`,
      )
    }
  }

  if (confirmed.length) {
    console.error(`\n❌ bench --check 未通过 —— ${confirmed.length} 个场景超基线 ×${RATCHET}（已二次确认）：`)
    for (const r of confirmed) {
      console.error(
        `   - ${r.name}\n     基线 ${r.base.toFixed(2)}ms → 现在 ${r.now.toFixed(2)}ms（×${r.ratio.toFixed(2)}）`,
      )
    }
    console.error('\n   若是真优化/环境变化导致，更新基线：npm run bench -- --json > bench-baseline.json')
    process.exit(1)
  }

  const compared = regressions.length + noisy.length + results.filter((r) => {
    const b = baseByName.get(r.name)
    return b && (b.median ?? b.mean) >= MEASURABLE_MS
  }).length - regressions.length - noisy.length
  console.log(
    `\n✅ bench --check 通过 — ${compared} 个场景在守护范围内（基线 ×${RATCHET} 以内），` +
      `${tooSmall.length} 个因基线过小仅报告不守护（基线 Node ${baseline.node ?? '未知'}）`,
  )
}
