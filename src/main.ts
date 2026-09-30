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
   基准 1536 与地板 0.75 须与 tokens.css 同源（改基准两处同步）。
   baseDpr 取加载时刻：浏览器恢复的历史缩放被当作新基线，此后相对调整始终有效。 */
const SCALE_REF = 1536
const SCALE_FLOOR = 0.75
const baseDpr = window.devicePixelRatio || 1
const applyPhysicalScale = () => {
  const zoom = (window.devicePixelRatio || 1) / baseDpr
  const physical = window.innerWidth * zoom
  document.documentElement.style.setProperty('--vcl-scale', Math.max(physical / SCALE_REF, SCALE_FLOOR).toFixed(4))
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
app.mount('#app')
