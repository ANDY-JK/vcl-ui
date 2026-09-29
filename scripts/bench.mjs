// 关键路径性能基准（自研轻量 harness）。
// 背景：vitest 5.0.1 的 CLI 仍保留 `vitest bench`，但公开入口已不导出 bench()（内部实现
// 在 chunk 里未接线）——基准脱离 vitest 自立：纯 Node + jiti 加载 TS 源码（带 @ 别名）+
// happy-dom 供 sanitize 的 DOM 面。
// 运行：npm run bench；输出 mean/min（毫秒），供优化前后对比。不进 quality-check 链。
// 规模取真实场景：表格 1 万行 × 10 列（审计口径）、树 200 节点、路线 60 门店。
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
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
function bench(name, fn, { iterations = 10, warmup = 3 } = {}) {
  for (let i = 0; i < warmup; i++) fn()
  const times = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  const mean = times.reduce((a, b) => a + b, 0) / iterations
  results.push({ name, mean, min: Math.min(...times), iterations })
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
