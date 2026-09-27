// 全站交互深审 — 真实浏览器逐页交互（点按钮/填输入/切下拉/勾选），
// 采集 console error/warn、未捕获异常（pageerror）、错误边界接管文本，并据此判红。
// 噪音按 THIRD_PARTY / BY_DESIGN 两档豁免，两档都要点名到来源，不做凑数式报告。
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.E2E_BASE || 'http://localhost:3721'
const ROOT = process.cwd()

// 从 demoMap 解析路由 key，避免手写清单与源码漂移
const demoSource = fs.readFileSync(path.join(ROOT, 'src/demos/ComponentDemo.vue'), 'utf8')
const ROUTES = [...demoSource.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?:\s*defineAsyncComponent/gm)].map(
  (m) => m[1],
)

// 噪音分两档，两档都不许扩散：
// 1) THIRD_PARTY —— 内核/三方渲染产生的，本库改不掉（WebGL 驱动提示等）。
// 2) BY_DESIGN —— 演示页有意触发的告警。必须点名到具体路由：别的页面冒出同一条文字即判红。
//    此前这里是全局白名单（/lucide 图标未收录/），把「6 个图标名没进子集」的真缺陷无声盖掉了。
const THIRD_PARTY = [
  /GL Driver Message/,
  // 高德地图 SDK 自己反复回读 canvas。本库仅有的两处 getImageData（useBarcodeScanner.ts:390,480）
  // 都已显式开 willReadFrequently，且这条只在挂了地图的 amap / route-planner 两页出现 —— 归三方。
  /willReadFrequently/,
  // @iconify 运行时兜底回源：IconPicker 枚举的图标名未进本地子集时 @iconify/vue 会请求
  // api.unisvg.com 拉取。库代码零引用该域名（grep 证实），离线/限网下超时属三方网络可用性。
  /api\.unisvg\.com/,
  // 高德 markers 主题图：地图 SDK 自请求，超时 / ORB 拒绝均属三方网络，非本库产物。
  /webapi\.amap\.com/,
  // 高德矢量底图数据瓦片（jsapi-data*）：同为 SDK 自发请求。审计离开 amap 页时
  // in-flight 瓦片被浏览器主动 abort（ERR_ABORTED 本义），是否撞上取决于瓦片加载
  // 时序/网络快慢（偶发非稳定回归，与 useCopy 条目同构）——域名归属 SDK，非本库产物。
  /jsapi-data\d*\.amap\.com/,
  // 无头浏览器无剪贴板写权限：任何带复制按钮的页（data-table / form-builder / …）
  // 被审计点到复制时，useCopy 按设计降级 execCommand 并打这条 warning（useCopy.ts:19）。
  // 环境约束非缺陷；且是否点到复制按钮随页面渲染时序漂移（偶发，非稳定回归）——
  // 受影响面是「所有带复制按钮的页」，按页登记列不全，故按文本豁免并注明来源。
  /\[useCopy\] Clipboard API 失败/,
]

const BY_DESIGN: Record<string, RegExp[]> = {
  // IconPicker 面板枚举 lucide 全量名，未进子集的名字必然走 IconSvg 的一次性兜底告警
  icon: [/lucide 图标未收录/],
  // 本页就是错误边界演示：点「触发异常」必然打出捕获日志
  'error-boundary': [/\[ErrorBoundary\] 捕获组件错误/],
  // 无头浏览器里通知权限恒为 denied，演示「发系统通知」只能打出这条
  'beep-voice': [/\[useNotify\] 通知权限已被拒绝/],
}

/** 错误边界接管文本：只有 error-boundary 演示页允许出现，其余页面出现即真故障 */
const BOUNDARY_EXEMPT = new Set(['error-boundary'])

// 破坏性/会跳走的按钮不点
const SKIP_BTN = /删除|移除|登出|退出|注销|卸载|清空全部|关闭全部/

type Msg = { type: string; text: string }

const isBenign = (route: string, t: string) =>
  THIRD_PARTY.some((r) => r.test(t)) || (BY_DESIGN[route] ?? []).some((r) => r.test(t))

test('全站逐页交互：无 console 报错/告警、无未捕获异常、无错误边界接管', async ({ page }) => {
  test.setTimeout(12 * 60_000)

  const msgs: Msg[] = []
  page.on('console', (m) => {
    const t = m.type()
    if (t === 'error' || t === 'warning') msgs.push({ type: t, text: m.text() })
  })
  page.on('pageerror', (e) => msgs.push({ type: 'pageerror', text: e.message }))
  // 浏览器对失败子资源只打一句 "Failed to load resource"，不带 URL，抓到了也定位不到是谁。
  // 这里补一条带 URL 的采集。只认主帧：上一张页面遗留的请求在导航后超时，
  // 它的 frame 已经不是当前主帧，不按帧归属就会把外站超时记到无辜页面的账上。
  page.on('requestfailed', (r) => {
    if (r.frame() !== page.mainFrame()) return
    msgs.push({ type: 'requestfailed', text: `${r.url()} :: ${r.failure()?.errorText ?? 'failed'}` })
  })
  page.on('dialog', (d) => d.dismiss().catch(() => {}))

  const report: Record<string, { msgs: Msg[]; boundary: boolean; hash: string }> = {}

  for (const key of ROUTES) {
    msgs.length = 0
    await page.goto(`${BASE}/#/${key}`)
    await page.reload()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(250)

    const body = page.locator('.content-body')
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight
    })
    await page.waitForTimeout(150)
    await body.evaluate((el) => {
      el.scrollTop = 0
    })

    // —— 交互：按钮 ——
    const btns = body.locator('button:visible:not([disabled])')
    const n = Math.min(await btns.count(), 30)
    for (let i = 0; i < n; i++) {
      const b = btns.nth(i)
      let label: string
      try {
        label = (await b.innerText({ timeout: 400 })).trim()
      } catch {
        continue
      }
      if (SKIP_BTN.test(label)) continue
      try {
        await b.click({ timeout: 700 })
      } catch {
        continue
      }
      await page.waitForTimeout(90)
      await page.keyboard.press('Escape').catch(() => {})
      // 关掉可能残留的遮罩，避免下一次点击被挡住
      await page
        .evaluate(() => {
          document
            .querySelectorAll('.modal-overlay, .drawer-overlay, .popover-mask, .vcl-modal-mask')
            .forEach((el) => {
              const e = el as HTMLElement
              if (e.style.display !== 'none') e.style.display = 'none'
            })
        })
        .catch(() => {})
    }

    // —— 交互：输入框 ——
    // 只填文本类输入：往 type=color/date/number 里塞「审计测试」不是真实用户操作，
    // 只会触发浏览器对非法取值的告警（如 color 输入的 "does not conform to the required format"），
    // 属于测试工具人为噪音，会污染真实缺陷信号。
    const inputs = body.locator(
      'input:visible:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=color])' +
        ':not([type=range]):not([type=date]):not([type=time]):not([type=datetime-local])' +
        ':not([type=month]):not([type=week])',
    )
    const ni = Math.min(await inputs.count(), 8)
    for (let i = 0; i < ni; i++) {
      try {
        await inputs.nth(i).fill('审计测试', { timeout: 600 })
        await inputs.nth(i).blur()
      } catch {
        /* 只读/受控输入忽略 */
      }
    }

    // —— 交互：勾选/开关 ——
    const checks = body.locator('input[type=checkbox]:visible, .vcl-switch:visible, [role=switch]:visible')
    const nc = Math.min(await checks.count(), 12)
    for (let i = 0; i < nc; i++) {
      try {
        await checks.nth(i).click({ timeout: 500, force: true })
        await page.waitForTimeout(40)
      } catch {
        /* ignore */
      }
    }

    await page.waitForTimeout(250)
    const bodyText = await page.evaluate(() => document.body.innerText)
    const boundaryTaken = /组件异常/.test(bodyText) && !BOUNDARY_EXEMPT.has(key)
    report[key] = {
      msgs: msgs
        .filter((m) => !isBenign(key, m.text))
        .slice(0, 20)
        .map((m) => ({ ...m, text: `${m.text.split('\n')[0].slice(0, 220)}${m.text.length > 220 ? ' …' : ''}` })),
      boundary: boundaryTaken,
      hash: (await page.evaluate(() => location.hash)) || '',
    }
  }

  const out = path.join(ROOT, 'reports/site-audit.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify({ total: ROUTES.length, report }, null, 2))

  // 汇总打印，便于直接读
  const bad = Object.entries(report).filter(([, v]) => v.msgs.length || v.boundary)
  console.log(`\n=== 深审：${ROUTES.length} 页，问题页 ${bad.length} ===`)
  for (const [k, v] of bad) {
    console.log(`\n[${k}]${v.boundary ? ' ⚠ 错误边界接管' : ''} hash=${v.hash}`)
    for (const m of v.msgs) console.log(`  - ${m.type}: ${m.text}`)
  }

  // 只打印不判红的审计等于没有审计：此前本用例零断言，44 页里 4 页有噪音也照样"通过"
  const verdict = bad.map(([k, v]) => `${k}: ${v.boundary ? '错误边界接管 ' : ''}${v.msgs.map((m) => `${m.type}«${m.text}»`).join(' | ')}`)
  expect(verdict, `${bad.length} 页存在非豁免噪音，详见 reports/site-audit.json`).toEqual([])
})
