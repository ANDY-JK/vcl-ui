/**
 * 运行时可观测性注入口（F10，2026-09-30）——宿主把库内警告/错误接进自己的监控。
 *
 * 默认实现是 console（保持既有行为：未注入时输出与迁移前逐字一致，测试对
 * console.warn/error 的 spy 不受影响）。宿主经 setRuntimeObserver() 注入自有管道
 * （埋点/Sentry 等）后，走 reportWarn/reportError 的点位改投宿主管道。
 *
 * 迁移口径（2026-09-30 收尾）：warnOnce 中央咽喉与全部 console.error / console.warn 点位
 * 均已接入——src/components 内除本模块自身实现外零 console 直调（回归由 grep 口径的
 * check 闸口外另靠 eslint no-console 允许表兜底）。新代码一律走 reportWarn/reportError。
 *
 * observer 抛异常视为宿主管道自身故障：对 console.error 报一次后降级 console 输出，
 * 绝不让可观测性管道打断组件数据流（故障可见，不静默吞）。
 */

export interface RuntimeObserver {
  /** 库内非致命警告（参数语义与 console.warn 一致，原样透传） */
  warn?: (...args: unknown[]) => void
  /** 库内已捕获的组件级错误（参数语义与 console.error 一致） */
  error?: (...args: unknown[]) => void
  /**
   * **结构化事件出口**（2026-10-18 增补，H.1 第 6 项）。
   *
   * 与 warn/error 的区别：warn/error 是自由文本，宿主只能"存下来给人看"；
   * event 带**稳定事件码**与结构化上下文，宿主可以据此建告警、看板、按表单/租户聚合。
   *
   * 部署后排查的痛点正是这个：用户说"提交没成功"，而自由文本日志里有几百条 warn，
   * 无法回答"哪个表单、失败了几次、什么时候开始的"。
   */
  event?: (e: RuntimeEvent) => void
}

/** 结构化运行期事件 */
export interface RuntimeEvent {
  /** 级别：info 只做记录，warn 需关注，error 需处理 */
  level: 'info' | 'warn' | 'error'
  /**
   * **稳定事件码**（宿主按它建告警规则，故不随文案改动而变）。
   * 约定：`<域>/<动作>`，如 `form-builder/submit-failed`、`form-builder/share-invalid`。
   */
  code: string
  /** 人读消息（可能已本地化；宿主聚合请用 code 而非 message） */
  message: string
  /** 结构化上下文（表单 id / 字段 key / 耗时 / 失败原因等；值须可 JSON 序列化） */
  context?: Record<string, unknown>
  /** 发生时间（ISO） */
  at: string
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

/**
 * 结构化事件出口（H.1 第 6 项）。
 *
 * 路由顺序（**只投一次，不重复上报**）：
 *   1. 宿主实现了 `event` → 只投 event（结构化管道，宿主自己决定要不要再落文本日志）；
 *   2. 否则退到 `warn` / `error`（只实现了文本管道的宿主也能收到，不丢信息）；
 *   3. 再退到 console（未注入 observer 时，行为与既有一致）。
 *
 * 与 reportWarn/reportError 一样：**宿主管道抛异常不得打断组件数据流**——报一次并降级 console。
 */
export function reportEvent(
  code: string,
  message: string,
  context?: Record<string, unknown>,
  level: RuntimeEvent['level'] = 'warn',
): void {
  const e: RuntimeEvent = { level, code, message, context, at: new Date().toISOString() }
  const o = _observer
  if (o?.event) {
    try {
      o.event(e)
      return
    } catch (err) {
      console.error('[vcl-ui] 观察者 event 管道抛异常，降级 console：', err)
    }
  }
  // 退化路径：仍让只接了 warn/error 的宿主收得到
  const line = `[${code}] ${message}`
  if (level === 'error') reportError(line, context ?? '')
  else reportWarn(line, context ?? '')
}
