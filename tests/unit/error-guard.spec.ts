// 全局错误兜底：覆盖 ErrorBoundary（onErrorCaptured）拦不到的三类逃逸口
// ① 未被任何边界捕获的 Vue 错误 ② 异步链错误 ③ 发版后懒加载 chunk 失效自愈
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, h, defineComponent, nextTick } from 'vue'
import type { App } from 'vue'
import { installErrorGuard, uninstallErrorGuard } from '@/components/feedback/composables/useErrorGuard'
import type { ErrorGuardPayload } from '@/components/feedback/composables/useErrorGuard'

const pendingRestore: Array<() => void> = []
let reloadSpy: ReturnType<typeof vi.fn>
let errSpy: ReturnType<typeof vi.spyOn>

function stubReload() {
  const original = window.location
  const reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { reload } })
  pendingRestore.push(() =>
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: original }),
  )
  return reload
}

/** 鸭子类型构造事件，避免依赖宿主是否实现 ErrorEvent / PromiseRejectionEvent */
function fire(type: string, props: Record<string, unknown>, cancelable = false) {
  const e = new Event(type, { cancelable }) as Event & Record<string, unknown>
  Object.assign(e, props)
  window.dispatchEvent(e)
  return e
}

/** 以「初始化即抛错」为根组件创建 app，走 Vue 真实错误分发链路（不经 mock） */
function throwApp() {
  const Thrower = defineComponent({
    name: 'Thrower',
    setup() {
      throw new Error('真实初始化错')
    },
    render: () => h('div'),
  })
  return createApp(Thrower)
}

async function mountAndCatch(app: App) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  try {
    app.mount(host)
  } catch {
    // Vue dev 下 handler 被调用后仍会重抛，本用例只关心 handler 是否收到
  }
  await nextTick()
  return () => {
    app.unmount()
    host.remove()
  }
}

beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  reloadSpy = stubReload()
})
afterEach(() => {
  uninstallErrorGuard()
  pendingRestore.splice(0).forEach((fn) => fn())
  errSpy.mockRestore()
  sessionStorage.clear()
})

describe('installErrorGuard · Vue 未捕获错误', () => {
  it('接管 app.config.errorHandler：真实未捕获错误带上组件链', async () => {
    const seen: ErrorGuardPayload[] = []
    const app = throwApp()
    installErrorGuard(app, { report: (p) => seen.push(p) })
    const dispose = await mountAndCatch(app)

    expect(seen.length).toBeGreaterThan(0)
    const vueErr = seen.find((p) => p.source === 'vue')
    expect(vueErr?.detail).toBeTruthy()
    // 覆写后 Vue 不再打印组件栈，必须由本工具补上，否则排错能力倒退
    expect(vueErr?.trace).toContain('Thrower')
    expect(errSpy).toHaveBeenCalled()
    dispose()
  })

  it('宿主已有 errorHandler 时链式调用，注销后原样还原而不是清空', async () => {
    const hostHandler = vi.fn()
    const app = throwApp()
    app.config.errorHandler = hostHandler
    const off = installErrorGuard(app, {})

    await mountAndCatch(app)
    expect(hostHandler).toHaveBeenCalled()

    off()
    expect(app.config.errorHandler).toBe(hostHandler)
  })

  it('无宿主 handler 时注销后回到默认（undefined）', () => {
    const app = createApp({ render: () => h('div') })
    const off = installErrorGuard(app, {})
    expect(app.config.errorHandler).toBeTypeOf('function')
    off()
    expect(app.config.errorHandler).toBeUndefined()
  })

  it('report 钩子自身抛错不带崩兜底链路', () => {
    const app = createApp({ render: () => h('div') })
    installErrorGuard(app, {
      report: () => {
        throw new Error('监控挂了')
      },
    })
    expect(() =>
      (app.config.errorHandler as (e: unknown, i: unknown, info: string) => void)(new Error('x'), null, 'watch'),
    ).not.toThrow()
  })

  it('多 app 并存：先返回的注销函数不会拆掉后装实例的监听（红队 D-4）', () => {
    const first = vi.fn()
    const second = vi.fn()
    const offFirst = installErrorGuard(null, { report: first })
    installErrorGuard(null, { report: second })

    offFirst() // 已过时，必须什么都不拆
    fire('error', { error: new Error('still watched') })
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('重复 install 只保留最后一次监听（HMR 不累积）', () => {
    const stale = vi.fn()
    const fresh = vi.fn()
    installErrorGuard(null, { report: stale })
    installErrorGuard(null, { report: fresh })
    fire('error', { error: new Error('once') })
    expect(stale).not.toHaveBeenCalled()
    expect(fresh).toHaveBeenCalledTimes(1)
  })

  it('无 window 环境（SSR / node）不抛错，只保留应用级兜底（红队 A-3）', async () => {
    const seen: ErrorGuardPayload[] = []
    vi.stubGlobal('window', undefined)
    try {
      const app = createApp({ render: () => h('div') })
      expect(() => installErrorGuard(app, { report: (p) => seen.push(p) })).not.toThrow()
      ;(app.config.errorHandler as (e: unknown, i: unknown, info: string) => void)(new Error('ssr'), null, 'render')
      expect(seen[0].source).toBe('vue')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('installErrorGuard · 异步链错误', () => {
  it('window error 与 unhandledrejection 均上报；注销后不再上报', () => {
    const seen: ErrorGuardPayload[] = []
    const off = installErrorGuard(null, { report: (p) => seen.push(p) })

    fire('error', { error: new Error('sync-escape'), filename: 'app.js', lineno: 42 })
    fire('unhandledrejection', { reason: new Error('async-escape') })

    expect(seen.map((p) => p.source)).toEqual(['window', 'rejection'])
    expect(seen[0].detail).toBe('app.js:42')

    off()
    fire('error', { error: new Error('after-uninstall') })
    expect(seen).toHaveLength(2)
  })

  it('浏览器已自行打印的异步错误不再重复刷 console（红队 D-3）', () => {
    const report = vi.fn()
    installErrorGuard(null, { report })
    fire('error', { error: new Error('noisy') })
    fire('unhandledrejection', { reason: new Error('noisy2') })
    expect(report).toHaveBeenCalledTimes(2)
    expect(errSpy).not.toHaveBeenCalled()
  })

  it('error 事件无 error 对象时回落 message', () => {
    const seen: ErrorGuardPayload[] = []
    installErrorGuard(null, { report: (p) => seen.push(p) })
    fire('error', { message: 'Script error.' })
    expect(seen[0].error).toBe('Script error.')
  })
})

describe('installErrorGuard · 懒加载 chunk 失效自愈', () => {
  it('首次失效拦住重抛、整页重载一次并留 console 痕迹', () => {
    installErrorGuard(null, { reloadFlagKey: 'k1' })
    const e = fire('vite:preloadError', { payload: new Error('stale chunk') }, true)
    expect(e.defaultPrevented).toBe(true)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(errSpy).toHaveBeenCalled()
  })

  it('冷却窗口内二次失效不重载、也不拦住重抛（交给降级 UI）', () => {
    installErrorGuard(null, { reloadFlagKey: 'k2' })
    fire('vite:preloadError', { payload: new Error('first') }, true)
    const second = fire('vite:preloadError', { payload: new Error('second') }, true)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(second.defaultPrevented).toBe(false)
  })

  it('冷却窗口过期后允许再次自愈', () => {
    installErrorGuard(null, { reloadFlagKey: 'k3', reloadCooldownMs: 0 })
    fire('vite:preloadError', { payload: new Error('first') }, true)
    fire('vite:preloadError', { payload: new Error('second') }, true)
    expect(reloadSpy).toHaveBeenCalledTimes(2)
  })

  it('reloadOnChunkError:false 只上报不重载', () => {
    const seen: ErrorGuardPayload[] = []
    installErrorGuard(null, { report: (p) => seen.push(p), reloadOnChunkError: false, reloadFlagKey: 'k4' })
    const e = fire('vite:preloadError', { payload: new Error('stale chunk') }, true)
    expect(seen[0].source).toBe('chunk')
    expect(e.defaultPrevented).toBe(false)
    expect(reloadSpy).not.toHaveBeenCalled()
  })

  it('sessionStorage 不可用时不重载（隐私模式不陷入重载循环）', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked')
      },
    })
    try {
      installErrorGuard(null, { reloadFlagKey: 'k5' })
      const e = fire('vite:preloadError', { payload: new Error('stale chunk') }, true)
      expect(reloadSpy).not.toHaveBeenCalled()
      expect(e.defaultPrevented).toBe(false)
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original)
    }
  })

  it('无关事件不受影响', () => {
    const seen: ErrorGuardPayload[] = []
    installErrorGuard(null, { report: (p) => seen.push(p) })
    fire('vite:otherEvent', { payload: new Error('noise') })
    expect(seen).toHaveLength(0)
  })
})
