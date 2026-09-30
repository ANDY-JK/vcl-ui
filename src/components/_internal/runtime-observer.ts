/**
 * 运行时可观测性注入口（F10，2026-09-30）——宿主把库内警告/错误接进自己的监控。
 *
 * 默认实现是 console（保持既有行为：未注入时输出与迁移前逐字一致，测试对
 * console.warn/error 的 spy 不受影响）。宿主经 setRuntimeObserver() 注入自有管道
 * （埋点/Sentry 等）后，走 reportWarn/reportError 的点位改投宿主管道。
 *
 * 迁移口径：warnOnce 是中央咽喉（重复警告都经它）已接；console.error 9 处全接；
 * 直接调 console.warn 的零散点位（多为一次性提示）渐进迁移，新代码一律走本模块。
 *
 * observer 抛异常视为宿主管道自身故障：对 console.error 报一次后降级 console 输出，
 * 绝不让可观测性管道打断组件数据流（故障可见，不静默吞）。
 */

export interface RuntimeObserver {
  /** 库内非致命警告（参数语义与 console.warn 一致，原样透传） */
  warn?: (...args: unknown[]) => void
  /** 库内已捕获的组件级错误（参数语义与 console.error 一致） */
  error?: (...args: unknown[]) => void
}

let _observer: RuntimeObserver | null = null

/** 注入运行时观察者（传 null 恢复默认 console）。宿主在应用入口调用一次即可。 */
export function setRuntimeObserver(observer: RuntimeObserver | null): void {
  _observer = observer
}

/** 库内警告统一出口 */
export function reportWarn(...args: unknown[]): void {
  const o = _observer
  if (o?.warn) {
    try {
      o.warn(...args)
      return
    } catch (e) {
      console.error('[vcl-ui] 观察者 warn 管道抛异常，降级 console：', e)
    }
  }
  console.warn(...args)
}

/** 库内已捕获错误的统一出口 */
export function reportError(...args: unknown[]): void {
  const o = _observer
  if (o?.error) {
    try {
      o.error(...args)
      return
    } catch (e) {
      console.error('[vcl-ui] 观察者 error 管道抛异常，降级 console：', e)
    }
  }
  console.error(...args)
}
