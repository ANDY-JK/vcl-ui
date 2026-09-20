// 闸口：按域覆盖防回退（Q4 前半）—— 全局地板（50/42/46/52）掩盖域级洼地。
//
// 2026-09-20 实测：全局 54.69/46.33/51.37/56.9 全绿的同时，login 只有
// 35.0/36.2/28.7、nav 41.6/29.5/36.5、chart 43.5/39.3/47.5——「整体绿、
// 结构死」。本闸口把每个域的语句/分支/函数覆盖钉在当前实测值下方 2~4 点：
//   ① 洼地被看见（每跑一次打印全表，不再被平均掉）；
//   ② 洼地不许继续扩大（掉了即红）；
//   ③ 抬升是显式动作：改 FLOORS 的提交就是「这个域要补测试了」的记录。
// 抬地板必须带新实测值（先跑 test:unit 看数再改），不允许凭感觉上调。
//
// 数据源：vitest v8 覆盖的 json 报告（reports/coverage/coverage-final.json，
// 已 gitignore）。先跑 npm run test:unit 再跑本闸口；文件缺失 = 没跑测试，红。
import fs from 'node:fs'
import path from 'node:path'

const REPORT = path.join(process.cwd(), 'reports/coverage/coverage-final.json')

// 基线 2026-09-20（v8 覆盖，136 spec）。格式：[语句, 分支, 函数]，单位 %。
// 洼地备注写在这里，抬地板时按备注找补测试的切入点。
const FLOORS = {
  _internal: [78, 73, 80], // 工具层，最接近 100 的域
  basic: [78, 68, 84],
  feedback: [73, 65, 72],
  data: [53, 44, 58], // DataTable 3190 行主文件拉低；交互细节靠 e2e
  'form-builder': [55, 46, 48],
  layout: [61, 38, 52],
  storage: [48, 32, 42], // 洼地：indexedDB.ts 环境性死角（happy-dom 无原生 IDB），靠 e2e
  amap: [48, 38, 45],
  'route-planner': [49, 39, 29], // 洼地：composables 11.81%
  form: [47, 43, 42], // 2026-09-20 晚抬升：date-utils/slider-utils 纯函数 20 条（含浮点边缘契约），48.3/43.4/43.7 → 49.6/45.0/44.7；DatePanel/CameraCapture/CodeCapture 仍是缺口
  chart: [49, 41, 55], // 2026-09-20 晚抬升：ChartTable 复合容器 11 条（宽度分配/开关/窄容器堆叠/事件透传/RO 清理），43.5/39.3/47.5 → 51.5/43.0/57.1
  nav: [70, 59, 64], // 2026-09-20 晚抬升：Menu 行为测试 11 条（悬停节流/手风琴/键盘导航/选中回传），41.6/29.5/36.5 → 72.3/61.4/66.7
  login: [49, 44, 34], // 2026-09-20 晚抬升：行为测试 14 条（失败计数/锁定倒计时/记住我/提交防护），35.0/36.2/28.7 → 51.1/46.2/36.6
  shared: [100, 0, 0], // 纯类型/常量模块；分支函数无数值（分母 0 时跳过）
}

if (!fs.existsSync(REPORT)) {
  console.error('❌ 找不到 reports/coverage/coverage-final.json —— 先跑 npm run test:unit 生成覆盖数据')
  process.exit(1)
}

const j = JSON.parse(fs.readFileSync(REPORT, 'utf8'))
const agg = {}
for (const [file, cov] of Object.entries(j)) {
  const f = file.replaceAll('\\', '/')
  const m = /\/src\/components\/([^/]+)\//.exec(f)
  if (!m) continue // src/components 根级文件（index.ts/i18n.ts）归全局地板管
  const a = (agg[m[1]] ??= { s: [0, 0], b: [0, 0], f: [0, 0] })
  for (const hit of Object.values(cov.s)) { a.s[1]++; if (hit > 0) a.s[0]++ }
  for (const arr of Object.values(cov.b)) { for (const hit of arr) { a.b[1]++; if (hit > 0) a.b[0]++ } }
  for (const hit of Object.values(cov.f)) { a.f[1]++; if (hit > 0) a.f[0]++ }
}
const pct = (x) => (x[1] === 0 ? NaN : (x[0] / x[1]) * 100)

const fail = []
console.log('域'.padEnd(16) + '语句'.padStart(14) + '分支'.padStart(14) + '函数'.padStart(14))
for (const [domain, floor] of Object.entries(FLOORS)) {
  const a = agg[domain]
  if (!a) {
    fail.push(`域 ${domain} 在覆盖数据里不存在——barrel 被删/改名了？同步删 FLOORS 条目`)
    continue
  }
  const cur = [pct(a.s), pct(a.b), pct(a.f)]
  const names = ['语句', '分支', '函数']
  const cells = cur.map((c, i) => {
    if (Number.isNaN(c)) return '   —   '.padStart(14)
    const ok = c >= floor[i]
    if (!ok) fail.push(`${domain} ${names[i]} ${c.toFixed(1)}% < 地板 ${floor[i]}%`)
    return `${ok ? '' : '▼'}${c.toFixed(1)}/${floor[i]}`.padStart(14)
  })
  console.log(domain.padEnd(16) + cells.join(''))
}
// 覆盖数据里出现未登记的新域 = 漏设地板，一并红（防止新域裸奔）
for (const d of Object.keys(agg)) {
  if (!(d in FLOORS)) fail.push(`新域 ${d} 没有登记地板——按当前实测值补 FLOORS 条目`)
}

if (fail.length) {
  console.error('\n❌ 按域覆盖地板未通过')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}
console.log(`\n✅ 按域覆盖地板通过（${Object.keys(FLOORS).length} 域，基线 2026-09-20）`)
