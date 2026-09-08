import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './demos/router'
import { installErrorGuard } from '@/components'
// 组件库设计令牌（CSS 变量）
import '@/components/tokens.css'
// Demo 站点全局重置 + 工具类
import './demos/site.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

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
