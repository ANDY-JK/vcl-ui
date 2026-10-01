<script setup lang="ts">
import { ref, computed } from 'vue'
import Chart from '@/components/chart/Chart.vue'
import ChartTable from '@/components/chart/ChartTable.vue'
import Card from '@/components/data/Card.vue'

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

// 当前季度倒数13个季度周（Q4-W13 → Q3-W13 → ...）
const RECENT_WEEKS: string[] = []
for (let q = 3; q >= 0 && RECENT_WEEKS.length < 13; q--) {
  for (let w = 13; w >= 1 && RECENT_WEEKS.length < 13; w--) {
    RECENT_WEEKS.unshift(QUARTERS[q] + '-W' + w)
  }
}
// RECENT_WEEKS 现在是从Q1-W1到Q4-W13的最近13周
const STORES = [
  '北京朝阳',
  '北京海淀',
  '上海浦东',
  '上海徐汇',
  '广州天河',
  '广州越秀',
  '深圳福田',
  '深圳南山',
  '成都锦江',
  '成都高新',
  '杭州西湖',
  '杭州滨江',
  '南京鼓楼',
  '武汉武昌',
  '重庆渝中',
  '西安雁塔',
  '长沙岳麓',
  '郑州金水',
  '青岛市南',
  '济南历下',
  '天津和平',
  '苏州园区',
  '厦门思明',
  '福州鼓楼',
  '合肥蜀山',
  '沈阳和平',
  '大连中山',
  '昆明五华',
  '贵阳南明',
  '南宁青秀',
  '南昌东湖',
  '呼和浩特新城',
  '兰州城关',
  '银川兴庆',
  '西宁城中',
  '拉萨城关',
  '乌鲁木齐天山',
  '三亚吉阳',
  '桂林象山',
  '张家界永定',
]
const MODELS = [
  'P10',
  'P10Pro',
  'P10Ultra',
  'P10Lite',
  'S8',
  'S8Plus',
  'S8Ultra',
  'S8FE',
  'A15',
  'A15s',
  'A15Pro',
  'X5',
  'X5Pro',
  'X5Max',
  'Note12',
  'Note12Pro',
  'Note12Ultra',
  'Tab10',
  'Tab10Pro',
  'TabMini',
  'Watch4',
  'Watch4Pro',
  'WatchSE',
  'Buds3',
  'Buds3Pro',
  'BudsLite',
  'Band8',
  'BandPro',
  'Pad10',
  'PadPro',
  'PadAir',
  'Book14',
  'Book14Pro',
  'Book16',
  'BookPro',
  'TV55',
  'TV65',
  'TV75',
  'TV85',
  'RouterX1',
  'RouterPro',
  'RouterMesh',
  'Cam3',
  'CamPro',
  'CamOutdoor',
  'Tag',
  'TagPro',
  'PowerBrick',
  'PowerPro',
  'PowerMax',
  'DockPro',
  'DockMini',
  'DockWireless',
  'Case10',
  'CaseClear',
  'CaseLeather',
  'Film3D',
  'FilmPrivacy',
  'FilmBlue',
  'StandMag',
  'StandFold',
  'StandDesk',
  'Cable5A',
  'Cable10A',
  'CableMag',
  'Charger65W',
  'Charger100W',
  'ChargerGaN',
]
const CAT: Record<string, string> = {
  P10: '手机',
  P10Pro: '手机',
  P10Ultra: '手机',
  P10Lite: '手机',
  S8: '手机',
  S8Plus: '手机',
  S8Ultra: '手机',
  S8FE: '手机',
  A15: '手机',
  A15s: '手机',
  A15Pro: '手机',
  X5: '手机',
  X5Pro: '手机',
  X5Max: '手机',
  Note12: '手机',
  Note12Pro: '手机',
  Note12Ultra: '手机',
  Tab10: '平板',
  Tab10Pro: '平板',
  TabMini: '平板',
  Pad10: '平板',
  PadPro: '平板',
  PadAir: '平板',
  Watch4: '穿戴',
  Watch4Pro: '穿戴',
  WatchSE: '穿戴',
  Buds3: '穿戴',
  Buds3Pro: '穿戴',
  BudsLite: '穿戴',
  Band8: '穿戴',
  BandPro: '穿戴',
  Book14: '笔记本',
  Book14Pro: '笔记本',
  Book16: '笔记本',
  BookPro: '笔记本',
  TV55: '电视',
  TV65: '电视',
  TV75: '电视',
  TV85: '电视',
  RouterX1: '智能设备',
  RouterPro: '智能设备',
  RouterMesh: '智能设备',
  Cam3: '智能设备',
  CamPro: '智能设备',
  CamOutdoor: '智能设备',
  Tag: '智能设备',
  TagPro: '智能设备',
  PowerBrick: '配件',
  PowerPro: '配件',
  PowerMax: '配件',
  DockPro: '配件',
  DockMini: '配件',
  DockWireless: '配件',
  Case10: '配件',
  CaseClear: '配件',
  CaseLeather: '配件',
  Film3D: '配件',
  FilmPrivacy: '配件',
  FilmBlue: '配件',
  StandMag: '配件',
  StandFold: '配件',
  StandDesk: '配件',
  Cable5A: '配件',
  Cable10A: '配件',
  CableMag: '配件',
  Charger65W: '配件',
  Charger100W: '配件',
  ChargerGaN: '配件',
}
const RG: Record<string, string> = {
  北京朝阳: '华北',
  北京海淀: '华北',
  上海浦东: '华东',
  上海徐汇: '华东',
  广州天河: '华南',
  广州越秀: '华南',
  深圳福田: '华南',
  深圳南山: '华南',
  成都锦江: '西南',
  成都高新: '西南',
  杭州西湖: '华东',
  杭州滨江: '华东',
  南京鼓楼: '华东',
  武汉武昌: '华中',
  重庆渝中: '西南',
  西安雁塔: '西北',
  长沙岳麓: '华中',
  郑州金水: '华中',
  青岛市南: '华东',
  济南历下: '华东',
  天津和平: '华北',
  苏州园区: '华东',
  厦门思明: '华东',
  福州鼓楼: '华东',
  合肥蜀山: '华东',
  沈阳和平: '东北',
  大连中山: '东北',
  昆明五华: '西南',
  贵阳南明: '西南',
  南宁青秀: '华南',
  南昌东湖: '华中',
  呼和浩特新城: '华北',
  兰州城关: '西北',
  银川兴庆: '西北',
  西宁城中: '西北',
  拉萨城关: '西南',
  乌鲁木齐天山: '西北',
  三亚吉阳: '华南',
  桂林象山: '华南',
  张家界永定: '华中',
}

function srand(s: number) {
  let v = s
  return () => {
    v = (v * 16807) % 2147483647
    return (v - 1) / 2147483646
  }
}
const rng = srand(42)
interface Row {
  quarter: string
  store: string
  model: string
  category: string
  region: string
  sales: number
}
const rawData: Row[] = []
for (const q of QUARTERS)
  for (const s of STORES)
    for (const m of MODELS) {
      rawData.push({
        quarter: q,
        store: s,
        model: m,
        category: CAT[m] || '其他',
        region: RG[s] || '其他',
        sales: Math.round((40 + rng() * 120) * (q === 'Q3' ? 1.3 : q === 'Q4' ? 1.05 : q === 'Q2' ? 0.95 : 0.7)),
      })
    }
function agg(field: string) {
  const m = new Map<string, number>()
  for (const d of rawData)
    m.set((d as Record<string, any>)[field], (m.get((d as Record<string, any>)[field]) || 0) + d.sales)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, value: v }))
}
const totalSales = computed(() => rawData.reduce((s, d) => s + d.sales, 0))

/* ===== 饼图+表格（一体） ===== */
const dims = [
  { k: 'category', l: '产品类别' },
  { k: 'region', l: '区域分布' },
  { k: 'quarter', l: '季度分布' },
  { k: 'model', l: '型号Top12' },
  { k: 'store', l: '门店Top12' },
]
const pieDim = ref(dims[0])
const pieData = computed(() =>
  pieDim.value.k === 'model' || pieDim.value.k === 'store'
    ? agg(pieDim.value.k).slice(0, 12)
    : agg(pieDim.value.k).slice(0, 10),
)
const slice = ref<string | null>(null)

const tblData = computed(() => {
  const f = pieDim.value.k
  if (!slice.value)
    return agg(f).map((d, i) => ({
      rank: i + 1,
      name: d.name,
      sales: d.value,
      pct: totalSales.value > 0 ? ((d.value / totalSales.value) * 100).toFixed(1) + '%' : '0%',
    }))
  const f2 = rawData.filter((d) => (d as Record<string, any>)[f] === slice.value)
  const m = new Map<string, number>()
  for (const d of f2) m.set(d.store, (m.get(d.store) || 0) + d.sales)
  const t = f2.reduce((s, d) => s + d.sales, 0)
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([n, v], i) => ({ rank: i + 1, name: n, sales: v, pct: t > 0 ? ((v / t) * 100).toFixed(1) + '%' : '0%' }))
})
const tblCols = computed(() => [
  { key: 'rank', title: '#', width: 40, align: 'center' as const },
  { key: 'name', title: slice.value ? '门店' : '名称', width: slice.value ? 140 : 160 },
  { key: 'sales', title: '销量', width: 100, align: 'right' as const },
  { key: 'pct', title: '占比', width: 80, align: 'right' as const },
])

function onPie(p: any) {
  slice.value = p.name || null
}
function setPie(d: (typeof dims)[0]) {
  pieDim.value = d
  slice.value = null
}

/* ===== 趋势图（独立导航） ===== */
const tDim = ref('category')
const tTop = ref(6)
const showTable = ref(true)
const tDims = [
  { k: 'category', l: '产品类别' },
  { k: 'region', l: '区域' },
  { k: 'store', l: '门店' },
  { k: 'model', l: '型号' },
]
// 趋势图数据：支持按季度 / 按季度周
const trendGranularity = ref<'quarter' | 'week'>('quarter')
const trendData = computed(() => {
  const items = agg(tDim.value)
    .slice(0, tTop.value)
    .map((d) => d.name)
  if (trendGranularity.value === 'quarter') {
    const map = new Map<string, Map<string, number>>()
    for (const d of rawData) {
      const k = (d as Record<string, any>)[tDim.value]
      if (!items.includes(k)) continue
      if (!map.has(k)) map.set(k, new Map())
      map.get(k)!.set(d.quarter, (map.get(k)!.get(d.quarter) || 0) + d.sales)
    }
    return {
      categories: QUARTERS,
      series: items.map((n) => ({ name: n, data: QUARTERS.map((q) => map.get(n)?.get(q) || 0) })),
    }
  }
  // 按周：最近13个季度周
  const map = new Map<string, Map<string, number>>()
  for (const d of rawData) {
    const k = (d as Record<string, any>)[tDim.value]
    if (!items.includes(k)) continue
    const wk = d.quarter + '-W' + (d as Record<string, any>).week
    if (!map.has(k)) map.set(k, new Map())
    map.get(k)!.set(wk, (map.get(k)!.get(wk) || 0) + d.sales)
  }
  return {
    categories: RECENT_WEEKS,
    series: items.map((n) => ({ name: n, data: RECENT_WEEKS.map((w) => map.get(n)?.get(w) || 0) })),
  }
})
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">ChartTable 图表表格</h1>
    <!-- KPI -->
    <div class="kpi-bar">
      <div class="kpi">
        <b>{{ (totalSales / 10000).toFixed(0) }}万</b><span>总销量</span>
      </div>
      <div class="kpi">
        <b>{{ STORES.length }}</b
        ><span>门店</span>
      </div>
      <div class="kpi">
        <b>{{ MODELS.length }}</b
        ><span>型号</span>
      </div>
      <div class="kpi"><b>4</b><span>季度</span></div>
      <div class="kpi">
        <b>{{ (rawData.length / 10000).toFixed(1) }}万</b><span>数据量</span>
      </div>
    </div>

    <div class="main-row">
      <!-- Card 1: 饼图(左) + 表格(右) -->
      <Card class="card-main">
        <template #header>
          <div class="hdr">
            <span class="hdr-title">📊 维度分布</span>
            <div class="hdr-actions">
              <div class="pills">
                <button v-for="d in dims" :key="d.k" :class="['pill', pieDim.k === d.k && 'on']" @click="setPie(d)">
                  {{ d.l }}
                </button>
              </div>
              <button
                class="tbl-toggle"
                :class="{ off: !showTable }"
                :title="showTable ? '隐藏表格' : '显示表格'"
                @click="showTable = !showTable"
              >
                📋<span>{{ showTable ? '表格开' : '表格关' }}</span>
              </button>
            </div>
          </div>
        </template>
        <div style="height: calc(420px * var(--vcl-scale))">
          <ChartTable
            type="pie"
            :data="{ pieData }"
            :dark-mode="false"
            show-legend
            :columns="tblCols"
            :table-data="tblData"
            row-key="rank"
            :show-table="showTable"
            :chart-ratio="0.45"
            @chart-click="onPie"
          />
        </div>
        <p class="hint">点击饼图扇区 → 右侧表格下钻门店明细</p>
      </Card>

      <!-- Card 2: 趋势图（独立导航） -->
      <Card class="card-main card-right">
        <template #header>
          <div class="hdr">
            <span class="hdr-title"
              >📈 季度走势<button
                class="gr-toggle"
                :class="{ on: trendGranularity === 'week' }"
                @click="trendGranularity = trendGranularity === 'quarter' ? 'week' : 'quarter'"
              >
                {{ trendGranularity === 'quarter' ? '按季度' : '按周(13)' }}
              </button></span
            >
            <div class="pills">
              <button v-for="t in tDims" :key="t.k" :class="['pill', tDim === t.k && 'on']" @click="tDim = t.k">
                {{ t.l }}
              </button>
              <span style="color: var(--vcl-color-border); margin: 0 2px">|</span>
              <button v-for="n in [4, 6, 8, 10]" :key="n" :class="['pill sm', tTop === n && 'on']" @click="tTop = n">
                {{ n }}条
              </button>
            </div>
          </div>
        </template>
        <div style="height: calc(580px * var(--vcl-scale))">
          <Chart
            type="line"
            :categories="trendData.categories"
            :series="trendData.series"
            :dark-mode="false"
            show-data-label
            palette="sunset"
            :mark-line="[{ type: 'average', label: '均值' }]"
            :mark-area="[{ from: 0, to: 999999, label: '区间', color: 'rgba(255,107,53,0.06)' }]"
          />
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.demo {
}
.kpi-bar {
  display: flex;
  gap: calc(8px * var(--vcl-scale));
  margin-bottom: calc(12px * var(--vcl-scale));
}
.kpi {
  flex: 1;
  padding: calc(12px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  text-align: center;
  background: var(--vcl-color-bg);
  border: 1px solid var(--vcl-color-border-light);
  border-radius: calc(8px * var(--vcl-scale));
}
.kpi b {
  display: block;
  font-size: calc(22px * var(--vcl-scale));
  font-weight: 700;
  line-height: 1.2;
}
.kpi span {
  font-size: calc(11px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

.main-row {
  display: flex;
  gap: calc(12px * var(--vcl-scale));
  align-items: flex-start;
}
@container demo (max-width: 1023px) {
  .main-row {
    flex-direction: column;
  }
}
.card-main {
  flex: 1;
  min-width: 0;
}
.card-right {
  width: calc(580px * var(--vcl-scale));
  flex-shrink: 0;
}
@container demo (max-width: 1023px) {
  .card-right {
    width: 100%;
  }
}

.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: calc(12px * var(--vcl-scale));
  flex-wrap: wrap;
  width: 100%;
}
.hdr-title {
  font-size: calc(14px * var(--vcl-scale));
  font-weight: 600;
  white-space: nowrap;
}
.hdr-actions {
  display: flex;
  align-items: center;
  gap: calc(8px * var(--vcl-scale));
}

.pills {
  display: flex;
  gap: calc(3px * var(--vcl-scale));
  align-items: center;
  flex-wrap: wrap;
}
.pill {
  padding: 2px calc(9px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  background: var(--vcl-color-bg);
  color: var(--vcl-color-text);
  font-size: calc(11px * var(--vcl-scale));
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.pill:hover {
  border-color: var(--vcl-color-primary-solid);
  color: var(--vcl-color-primary-on-surface);
}
.pill.on {
  background: var(--vcl-color-primary-solid);
  color: #fff;
  border-color: var(--vcl-color-primary-solid);
  font-weight: 600;
}
.pill.sm {
  padding: 1px calc(7px * var(--vcl-scale));
  font-size: calc(10px * var(--vcl-scale));
  border-radius: calc(8px * var(--vcl-scale));
}

.tbl-toggle {
  display: flex;
  align-items: center;
  gap: calc(3px * var(--vcl-scale));
  padding: 2px calc(8px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  background: var(--vcl-color-bg);
  font-size: calc(11px * var(--vcl-scale));
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.12s;
}
.tbl-toggle:hover {
  border-color: var(--vcl-color-primary-solid);
}
.tbl-toggle.off {
  opacity: 0.4;
}
.tbl-toggle span {
  font-size: calc(10px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

.split-row {
  display: flex;
  gap: calc(12px * var(--vcl-scale));
  align-items: flex-start;
}
@container demo (max-width: 1023px) {
  .split-row {
    flex-direction: column;
  }
}
.split-chart {
  width: calc(340px * var(--vcl-scale));
  flex-shrink: 0;
  height: calc(420px * var(--vcl-scale));
}
.split-chart-full {
  flex: 1;
  height: calc(420px * var(--vcl-scale));
}
@container demo (max-width: 1023px) {
  .split-row {
    height: auto;
  }
  .split-chart,
  .split-chart-full {
    width: 100%;
    height: calc(320px * var(--vcl-scale));
  }
  .split-table {
    height: auto;
  }
}
.split-table {
  flex: 1;
  min-width: 0;
  height: calc(420px * var(--vcl-scale));
  overflow: auto;
}

.hint {
  text-align: center;
  font-size: calc(11px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin: calc(12px * var(--vcl-scale)) 0 0;
}
.gr-toggle {
  margin-left: calc(8px * var(--vcl-scale));
  padding: 1px calc(8px * var(--vcl-scale));
  border-radius: calc(10px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-border);
  background: var(--vcl-color-bg);
  font-size: calc(10px * var(--vcl-scale));
  cursor: pointer;
}
.gr-toggle.on {
  background: var(--vcl-color-primary-solid);
  color: #fff;
}
</style>
