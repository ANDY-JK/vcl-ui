import { createApp } from 'vue'
import App from './App.vue'
import router from './demos/router'
import { installErrorGuard, autoApplyInkCentering } from '@/components'
// 组件库设计令牌（CSS 变量）
import '@/components/tokens.css'
// Demo 站点全局重置 + 工具类
import './demos/site.css'

const app = createApp(App)
app.use(router)

// 动态光学居中：量当前字体墨迹写 --vcl-ink-dy（webfont 晚加载会自动重算）
autoApplyInkCentering()

/* ===== 物理视口驱动 --vcl-scale（2026-09-30）=====
   纯 100vw 等比会把「浏览器缩放」数学抵消：缩小 50% → 同屏容纳 2× CSS 像素 →
   100vw 翻倍 → 因子翻倍 → 再乘 0.5 物理密度 = 物理尺寸恒定，Ctrl+/- 完全失效。
   这里改用「innerWidth × 相对设备像素比」驱动：乘积是 zoom 不变量（≈窗口物理宽），
   因子只随真实窗口宽度变化，浏览器缩放重新变成有效的大小调节（缩小就真的变小）。
   基准 1536、地板 0.75 与封顶 1.0 须与 tokens.css 同源（改基准三处同步）。
   baseDpr 取加载时刻：浏览器恢复的历史缩放被当作新基线，此后相对调整始终有效。
   2026-10-02 用户复判：大屏（1912）等比放大后「各方面都太大」，而 ≤1536 的
   机器观感合适——故加封顶 1.0，>1536 视口与 1536 基准屏同尺寸展示、多容纳内容；
   个体偏好交给浏览器 Ctrl+/-（物理驱动下真实有效），不再全局放大。 */
const SCALE_REF = 1536
const SCALE_FLOOR = 0.75
const SCALE_CEIL = 1
const baseDpr = window.devicePixelRatio || 1
const applyPhysicalScale = () => {
  const zoom = (window.devicePixelRatio || 1) / baseDpr
  const physical = window.innerWidth * zoom
  document.documentElement.style.setProperty(
    '--vcl-scale',
    Math.min(Math.max(physical / SCALE_REF, SCALE_FLOOR), SCALE_CEIL).toFixed(4),
  )
}
applyPhysicalScale()
window.addEventListener('resize', applyPhysicalScale)
window.visualViewport?.addEventListener('resize', applyPhysicalScale)

/** 逃逸错误现场快照：控制台执行 __errorGuard 取最新一条（含组件链 + 堆栈），用于定位「页面加载异常」来源 */
const guardLog: Array<{ source: string; message: string; trace?: string; stack?: string; at: string }> = []
;(window as unknown as Record<string, unknown>).__errorGuard = guardLog

// 全局错误兜底：边界外的 Vue 错误 / 异步错误 / 发版后 chunk 失效（自动重载一次）
installErrorGuard(app, {
  report: (p) => {
    const err = p.error as Error | undefined
    guardLog.unshift({
      source: p.source,
      message: err?.message ?? String(p.error),
      trace: p.trace,
      stack: err?.stack,
      at: new Date().toLocaleTimeString(),
    })
    guardLog.length = Math.min(guardLog.length, 30)
  },
})
/* ===== 产物模式的运行时配置（2026-11-08）=====
   库的 runtimeEnv() 在 DEV=false 时恒返回 {} —— 产物刻意不携带凭证（env-guard 的承诺）。
   演示站要在产物里保持和 dev 一样的体验（地图可用、存储面板能显示云端提示），
   就得像宿主那样在**运行时**把自己的配置给进来。分两步，这个顺序很要紧：

   ① 开机只**取**配置并挂到 window —— 纯 JSON 请求，不触发任何外部 SDK
   ② 只有**进入 amap 相关路由时**才 setAmapKeys —— 因为 setAmapKeys 会通知订阅者，
      amap-loader 收到就立刻去 webapi.amap.com 下 SDK，于是"只是打开首页"也会产生外发请求，
      而 capture 那条 e2e 的契约正是"非 amap 页面零外发"。
   并且必须在 beforeEach 里 await（afterEach 太晚：地图页会先以无 key 初始化并报错）。 */
const AMAP_ROUTES = /(^|\/)(amap|amap-widget|route-planner)(\/|$)/

type DemoRuntimeConfig = { amapKey?: string; amapSecret?: string; s3?: Record<string, string> }

let runtimeConfig: DemoRuntimeConfig | null = null
let runtimeConfigPromise: Promise<DemoRuntimeConfig | null> | null = null

function loadRuntimeConfig(): Promise<DemoRuntimeConfig | null> {
  if (import.meta.env.DEV) return Promise.resolve(null)
  if (runtimeConfigPromise) return runtimeConfigPromise
  runtimeConfigPromise = fetch('/api/demo-config')
    .then((res) => (res.ok ? (res.json() as Promise<DemoRuntimeConfig>) : null))
    .then((cfg) => {
      runtimeConfig = cfg
      if (cfg) (window as unknown as Record<string, unknown>).__demoRuntimeConfig = cfg
      return cfg
    })
    .catch(() => null)
  return runtimeConfigPromise
}

let amapKeyApplied = false
async function ensureAmapKeys() {
  if (import.meta.env.DEV || amapKeyApplied) return
  const cfg = runtimeConfig ?? (await loadRuntimeConfig())
  if (!cfg?.amapKey) return
  amapKeyApplied = true
  const { setAmapKeys } = await import('@/components/amap')
  setAmapKeys({ jsKey: cfg.amapKey, restKey: cfg.amapKey, securityCode: cfg.amapSecret ?? '' })
}

void loadRuntimeConfig()
router.beforeEach(async (to) => {
  if (AMAP_ROUTES.test(to.path)) await ensureAmapKeys()
  return true
})

app.mount('#app')
