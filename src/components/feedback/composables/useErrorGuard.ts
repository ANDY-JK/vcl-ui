import { reportError } from '@/components/_internal/runtime-observer'
/**
 * 全局错误兜底 —— 补齐 ErrorBoundary 覆盖不到的四类逃逸口
 *
 * ErrorBoundary 依赖 Vue 的 onErrorCaptured，只能拦住「组件渲染链上的同步错误」；
 * 以下四类会绕过边界、静默留在 console 或把组件留在半成品状态：
 * 1. 未被任何边界捕获的 Vue 错误      → app.config.errorHandler
 * 2. 异步链错误（setTimeout / promise）→ window error / unhandledrejection
 * 3. 资源加载失败（img/script/link）   → window error 捕获阶段（资源 error 不冒泡）
 * 4. 发版后旧页面懒加载 chunk 失效     → vite:preloadError（可自动整页重载一次）
 *
 * console 策略：只在"默认输出会被我们吃掉"的来源上自己打印（vue 覆写了 Vue 的默认打印、
 * chunk 会 preventDefault 拦住重抛）；window / rejection 浏览器本身就打，不再重复一条刷屏。
 * 零依赖、零平台绑定：只用浏览器标准事件；第 4 类事件仅 Vite 构建产物会派发，
 * 非 Vite 宿主下永不触发；无 window 环境（SSR / node）下自动跳过浏览器监听。
 */
import type { App } from 'vue'

/** 错误来源：组件树 / 全局同步错 / 资源加载失败 / Promise 拒绝 / 懒加载 chunk 失效 */
export type ErrorGuardSource = 'vue' | 'window' | 'resource' | 'rejection' | 'chunk'

export interface ErrorGuardPayload {
  error: unknown
  source: ErrorGuardSource
  /** Vue 错误的位置描述（如 "render function"）、window 错误的 file:line */
  detail?: string
  /** 组件链（仅 source='vue'）：出错组件向上最多 8 层，替代 Vue 默认打印的组件栈 */
  trace?: string
}

export interface ErrorGuardOptions {
  /** 上报钩子：接自家监控/日志。console 由本工具负责，无需在此重复 */
  report?: (payload: ErrorGuardPayload) => void
  /** 懒加载 chunk 失效时是否自动整页重载，默认 true */
  reloadOnChunkError?: boolean
  /** 重载冷却窗口（ms），默认 60000：窗口内不重复重载，避免失败-重载死循环 */
  reloadCooldownMs?: number
  /** 冷却标记的 sessionStorage 键名；同 origin 多 app 共用一份重载预算 */
  reloadFlagKey?: string
}

/** 自动重载的最小间隔：一次发版只自愈一次，连续失败交给降级 UI / 人工 */
const DEFAULT_COOLDOWN_MS = 60_000
const DEFAULT_FLAG_KEY = 'vue-lib:last-chunk-reload'
/** 组件链最多向上走几层 */
const MAX_TRACE_DEPTH = 8

/** 资源 URL 脱敏：去掉 query 与 fragment —— 签名参数（?token=…）不能随错误上报进日志/监控 */
function sanitizeResourceUrl(raw: string): string {
  const cut = raw.search(/[?#]/)
  return cut >= 0 ? raw.slice(0, cut) : raw
}

/** 当前生效的注销函数；用函数自身身份比对，避免先返回的 off() 抹掉后装实例的注销钩子 */
let activeOff: (() => void) | null = null

/**
 * window 级注销槽位 —— 同页加载多份打包拷贝时，各拷贝的模块级 activeOff 互相不可见，
 * 只有这个共享槽位能让后装实例拆掉先装实例的监听（否则一份错误被两份监听各报一次）。
 */
type ErrorGuardWindow = Window & { __vueLibErrorGuardOff?: () => void }

function sharedOff(): (() => void) | undefined {
  return typeof window !== 'undefined' ? (window as ErrorGuardWindow).__vueLibErrorGuardOff : undefined
}

function setSharedOff(off: (() => void) | undefined): void {
  if (typeof window === 'undefined') return
  ;(window as ErrorGuardWindow).__vueLibErrorGuardOff = off
}

/** report 重入标志：上报钩子内部再触发错误时不再递归上报，破自激循环 */
let inReporting = false

function emit(options: ErrorGuardOptions, payload: ErrorGuardPayload, log: boolean) {
  if (log) reportError(`[ErrorGuard:${payload.source}]`, payload.error, payload.detail ?? '', payload.trace ?? '')
  if (inReporting) return
  inReporting = true
  try {
    const ret: unknown = options.report?.(payload)
    // 异步上报钩子返回 rejected promise 时，不能让拒绝冒到 window.unhandledrejection 再触发一次上报
    if (ret && typeof (ret as PromiseLike<unknown>).then === 'function') {
      void Promise.resolve(ret).catch((reportErr) => {
        reportError('[ErrorGuard] report 钩子异常:', reportErr)
      })
    }
  } catch (reportErr) {
    // 上报钩子自身抛错不能再把兜底链路带崩
    reportError('[ErrorGuard] report 钩子异常:', reportErr)
  } finally {
    inReporting = false
  }
}

/** 从出错组件实例向上拼组件链名（覆写 errorHandler 后 Vue 不再打印组件栈，需自己留痕） */
function componentTrace(instance: unknown): string | undefined {
  type Node = { $?: unknown; type?: { name?: string; __file?: string }; parent?: unknown }
  // errorHandler 传的是公开代理实例（无 type/parent），先经 .$ 解回内部实例；onErrorCaptured 传内部实例
  let cur = ((instance as Node | null)?.$ ?? instance) as Node | null
  const names: string[] = []
  while (cur && names.length < MAX_TRACE_DEPTH) {
    const file = cur.type?.__file
    names.push(cur.type?.name || (file ? file.split(/[\\/]/).pop() || '' : '') || '<anonymous>')
    cur = (cur.parent ?? null) as Node | null
  }
  return names.length ? names.join(' < ') : undefined
}

/**
 * 冷却判定 + 记账合一：窗口内只允许一次自动重载。
 * sessionStorage 不可用（隐私模式 / 非浏览器）时返回 false，交给降级 UI。
 */
function acquireReload(key: string, cooldownMs: number): boolean {
  const now = Date.now()
  try {
    const last = Number(sessionStorage.getItem(key) || 0)
    if (now - last < cooldownMs) return false
    sessionStorage.setItem(key, String(now))
    return true
  } catch {
    return false
  }
}

/**
 * 安装全局错误兜底。
 * @param app 需要接管 errorHandler 的应用实例；传 null 表示只挂浏览器级监听
 * @returns 注销函数：还原宿主原有 errorHandler（而非清空）并移除所有监听器
 */
export function installErrorGuard(app: App | null, options: ErrorGuardOptions = {}): () => void {
  uninstallErrorGuard()
  // 另一份打包拷贝装过：本拷贝的模块级 activeOff 看不到它的监听，用 window 槽位补拆一次
  sharedOff()?.()
  const {
    reloadOnChunkError = true,
    reloadCooldownMs = DEFAULT_COOLDOWN_MS,
    reloadFlagKey = DEFAULT_FLAG_KEY,
  } = options
  const cleanups: Array<() => void> = []

  if (app) {
    // 保存宿主已有 handler：覆写不是接管，链式调用 + 注销时原样还原
    const prev = app.config.errorHandler
    app.config.errorHandler = (err, instance, info) => {
      emit(options, { error: err, source: 'vue', detail: info, trace: componentTrace(instance) }, true)
      prev?.(err, instance, info)
    }
    cleanups.push(() => {
      app.config.errorHandler = prev
    })
  }

  // 无 window 环境（SSR / node）：只保留上面的应用级兜底，不挂浏览器监听
  if (typeof window !== 'undefined') {
    const onWindowError = (e: Event) => {
      const target = e.target as Node | null
      const ev = e as ErrorEvent
      // 资源加载失败（img/script/link）在元素上派发、不冒泡且无 error/message，
      // 只有 window 捕获阶段能收到；nodeType===1 同时排除了 window 自身（无 nodeType）
      if (target && target.nodeType === 1 && !ev.error && !ev.message) {
        const el = target as HTMLElement
        const url = sanitizeResourceUrl(el.getAttribute('src') || el.getAttribute('href') || '')
        const tag = el.tagName.toLowerCase()
        emit(
          options,
          { error: new Error(`资源加载失败：<${tag}> ${url}`), source: 'resource', detail: `${tag}:${url}` },
          false,
        )
        return
      }
      emit(options, { error: ev.error ?? ev.message, source: 'window', detail: `${ev.filename}:${ev.lineno}` }, false)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      emit(options, { error: e.reason, source: 'rejection' }, false)
    }
    const onPreloadError = (e: Event) => {
      const payload = (e as Event & { payload?: unknown }).payload
      emit(options, { error: payload, source: 'chunk' }, true)
      if (!reloadOnChunkError || !acquireReload(reloadFlagKey, reloadCooldownMs)) return
      // 拦住 Vite 的重抛：本帧交给整页重载，不再叠加一次错误 UI
      e.preventDefault()
      window.location.reload()
    }

    // 资源错误不冒泡，必须用捕获阶段；运行时错误在 window 上派发，捕获/冒泡都会到
    window.addEventListener('error', onWindowError, true)
    window.addEventListener('unhandledrejection', onRejection)
    window.addEventListener('vite:preloadError', onPreloadError)
    cleanups.push(() => {
      window.removeEventListener('error', onWindowError, true)
      window.removeEventListener('unhandledrejection', onRejection)
      window.removeEventListener('vite:preloadError', onPreloadError)
    })
  }

  const off = () => {
    if (activeOff !== off) return
    setSharedOff(undefined)
    cleanups.forEach((fn) => fn())
    activeOff = null
  }
  activeOff = off
  setSharedOff(off)
  return off
}

/** 注销当前兜底（幂等）：还原宿主 handler + 移除浏览器监听 */
export function uninstallErrorGuard(): void {
  activeOff?.()
}
