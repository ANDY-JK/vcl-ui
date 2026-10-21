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
  feedback: [80, 73, 77], // 2026-09-25 抬升：useBeep/useNotify 17 条（提示音四配方/无 ctx 兜底/closed 重置/解锁幂等 · 通知权限三态/点击行为/autoClose/拒绝路径），73+/65+/72+ → 83.8/76.2/80.4
  data: [64, 50, 63], // 2026-09-25 四批抬升：①useTableColumns 20+useTableTooltip 11 ②cell-clipboard 18+cell-keyboard 19+canvas-screenshot 5 ③filter/extras 补测 25（跨列计数/render 异常/四向排序/externalFilters 同步/CSV 公式注入/Excel 惰性导出/右键菜单/全局事件）；实测 67.6/53.9/66.0；DataTable 主文件交互细节仍靠 e2e
  'form-builder': [55, 46, 48],
  layout: [61, 38, 52],
  // 2026-09-25 抬升：contract-storage 补测 18 条（纯 helper/IndexedDBBackend mock/假 transport 直测 ObjectCloudBackend 对象名解析+墓碑+上传删除/工厂路由+env 默认），51.9/35.6/46.4 → 67.7/57.1/53.6；indexedDB.ts 仍环境死角（happy-dom 无 IDB）靠 e2e
  // 2026-10-21 再抬：unified 门面 18 条（**同步 API / remove 三级全删 / has 降级顺序 / onChange 解包**
  //   此前全未测）。实测 68.3/55.8/52.8 → 70.9/58.9/56.3，地板抬到 68/56/53（留 2-3 点）。
  //   五个负向对照全部生效（不删云端 / 云端失败冒泡 / 不解包 StoreItem / IDB 故障不降级 / setSync 走自动路由）。
  //   ⚠️ indexedDB.ts 仍是最大死角（函数 12/65），但 happy-dom 无真实 IDB，只能靠 mock 打桩；
  //      打桩测的是"门面逻辑"而非"IDB 真行为"，价值有限，暂不硬凑。
  storage: [68, 56, 53],
  // 2026-10-21 抬升：AmapWidget 组件级 18 条（**此前 265 行组件从未被挂载过**，仓里唯一的 widget
  //   测试是读源码锁 setContent 消毒）。补：ensureInit 取 key、ready/getMap、插件挂载两态、
  //   marker 增删（含"先 remove 旧的再 add"）、marker/map-click 回传、infoWindow 消毒与开关、
  //   center/zoom 联动、defineExpose 五个方法的语义。实测 54.8/47.7/52.9 → 71.5/59.7/79.4，
  //   地板抬到 68/56/76（留 3 点）
  amap: [68, 56, 76],
  // 2026-09-24 抬升：三个 composables 编排/持久化测试 22 条（时序 enrich→navLinks/失败兜底/防抖写盘/脏数据清洗），49/39/29 → 61.4/45.7/47.3
  // 2026-10-21 再抬：补两个**纯函数工具文件**（此前几乎零测试）——
  //   · coordinate-resolver.ts 函数覆盖 1/6 → **6/6**（batchResolveCoordinates 三条分支 + 字段透传）
  //   · driving-direction.ts 函数覆盖 0/6 → **6/6**（enrichWithDrivingRoutes 的"失败不覆盖估算值"
  //     /"只有 >0 才写入"/"800ms 配额间隔"/"空天跳过"，加 findNearbyAccommodation）
  //   共 24 条测试，实测 61.5/45.3/48.9 → 68.2/53.1/55.1，地板抬到 65/50/52（留 3 点）
  'route-planner': [65, 50, 52],
  form: [51, 47, 47], // 2026-09-20 晚抬升：date-utils/slider-utils 20 条 + DatePanel 20 条 + CodeCapture 扫码状态机 10 条（去重/emit/自动关闭/finish/连扫暂停/坐标换算），48.3/43.4/43.7 → 53.3/49.1/49.4
  // 2026-09-20 晚抬升：ChartTable 复合容器 11 条（宽度分配/开关/窄容器堆叠/事件透传/RO 清理），43.5/39.3/47.5 → 51.5/43.0/57.1
  // 2026-10-21 再抬：BaseChart 组件级 13 条（**此前两个 400 行组件从未被挂载过**，仓里两个 chart 测试都是读源码文本），
  //   覆盖空态/加载态/实例生命周期/零尺寸跳过/dispose/init 兜底/role=img/toolbar 默认与关闭；
  //   实测 51.4/42.4/57.9 → 61.0/48.1/65.5，地板抬到 58/45/62（留 3 点）
  chart: [58, 45, 62],
  nav: [70, 59, 64], // 2026-09-20 晚抬升：Menu 行为测试 11 条（悬停节流/手风琴/键盘导航/选中回传），41.6/29.5/36.5 → 72.3/61.4/66.7
  // 2026-09-20 晚抬升：行为测试 14 条（失败计数/锁定倒计时/记住我/提交防护），35.0/36.2/28.7 → 51.1/46.2/36.6
  // 2026-10-21 再抬：register 页行为测试 21 条（校验链/载荷语义/可选必填前提/防重复提交），
  //   实测 51.7/46.6/37.3 → 55.9/52.4/42.2，地板抬到 52/49/39（留 3–4 点）
  // 2026-10-21 三抬：补 portal_login(194 行/12 函数，原零测试) 与 forgot-*(215 行/19 函数，原零测试)
  //   两套行为测试共 26 条，实测 55.9/52.4/42.2 → **80.3/70.9/61.2**，地板抬到 77/68/58（留 3 点）。
  //   这是本次最大的单域提升：+24.4 / +18.5 / +19.0 个百分点。
  //   补测过程中发现并修掉一个真缺陷：portal_login 完全没有防重复提交
  //   （login 有 internalLoading+lockUntil、register/forgot 有 _submitting，只有它没有）。
  login: [77, 68, 58],
  shared: [100, 0, 0], // 纯类型/常量模块；分支函数无数值（分母 0 时跳过）
}

if (!fs.existsSync(REPORT)) {
  console.error('❌ 找不到 reports/coverage/coverage-final.json —— 先跑 npm run test:unit 生成覆盖数据')
  process.exit(1)
}

const j = JSON.parse(fs.readFileSync(REPORT, 'utf8'))

// ── 数据完整性守卫（2026-10-21 加）───────────────────────────────────────────
//
// ## 为什么必须加
//
// `npx vitest run <单个spec> --coverage` 会**静默覆盖** coverage-final.json。
// 此时跑本脚本会大面积误报：实测只跑一个 11 用例的 spec 后，
// login 分支掉到 0.0%、shared 语句掉到 0.0%，8 个域同时"低于地板" —— 全是假的。
//
// 更糟的是反过来：想"验证覆盖率有没有提升"时跑几个 spec 带 --coverage，
// 看到数字变好就以为改进了，**其实那是只统计了部分文件的口径**。
// 这个坑补 route-planner 时真的踩了（当时看到的"提升"来自 2 个 spec，
// 而真实提升要靠全量跑才能确认）。
//
// ## 为什么不用「文件数」做判据（试过，不可行）
//
// 第一版想用「coverage 里的文件数 ≥ 200」判断完整性。
// **实测证伪**：vitest 的 v8 provider 会把所有被 import 过的模块都写进报告，
// 未测到的记 0 —— 单独跑 11 个用例的 spec 也产出 **346 个文件**，
// 与全量跑的 346 个**完全相同**。文件数分不出完整与残缺。
//
// ## 改用「全量跑的标记文件」
//
// `npm run test:unit` 结束时写 `reports/coverage/.full-run`（内容为时间戳）。
// 本脚本要求该标记存在，且**不比 coverage-final.json 旧**
// （若有人先全量跑、再单 spec 带 --coverage，coverage 会变新而标记不变旧 → 立刻抓出）。
const FULL_RUN_MARKER = path.join(path.dirname(REPORT), '.full-run')

if (!fs.existsSync(FULL_RUN_MARKER)) {
  console.error(
    '❌ 覆盖数据来源不明：找不到全量跑的标记 reports/coverage/.full-run。\n' +
      '   单跑 `vitest run <spec> --coverage` 也会产出 coverage-final.json，\n' +
      '   但只统计了部分文件——在它上面做按域地板检查会大面积误报。\n' +
      '   请先跑 `npm run test:unit`（它会写这个标记）。',
  )
  process.exit(1)
}

const markerTime = fs.statSync(FULL_RUN_MARKER).mtimeMs
const reportTime = fs.statSync(REPORT).mtimeMs
if (reportTime > markerTime) {
  console.error(
    '❌ 覆盖数据比全量标记更新 —— 说明在全量跑之后又单跑了某个 spec 带 --coverage，\n' +
      '   当前 coverage-final.json 只反映最后那次的部分统计，不是全量口径。\n' +
      `   coverage-final.json: ${new Date(reportTime).toISOString()}\n` +
      `   .full-run 标记:       ${new Date(markerTime).toISOString()}\n` +
      '   请重新跑 `npm run test:unit`。',
  )
  process.exit(1)
}

const agg = {}
for (const [file, cov] of Object.entries(j)) {
  const f = file.replaceAll('\\', '/')
  const m = /\/src\/components\/([^/]+)\//.exec(f)
  if (!m) continue // src/components 根级文件（index.ts/i18n.ts）归全局地板管
  const a = (agg[m[1]] ??= { s: [0, 0], b: [0, 0], f: [0, 0] })
  for (const hit of Object.values(cov.s)) {
    a.s[1]++
    if (hit > 0) a.s[0]++
  }
  for (const arr of Object.values(cov.b)) {
    for (const hit of arr) {
      a.b[1]++
      if (hit > 0) a.b[0]++
    }
  }
  for (const hit of Object.values(cov.f)) {
    a.f[1]++
    if (hit > 0) a.f[0]++
  }
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
