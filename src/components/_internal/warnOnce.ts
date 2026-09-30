// 统一警告输出 — 同一模块同一消息只打印一次，避免高频循环刷屏
import { reportWarn } from './runtime-observer'

const _warnedKeys = new Set<string>()

/**
 * 统一警告输出：同一模块同一消息只打印一次（避免高频循环刷屏）
 *
 * 生产环境保留（警告应可见），不参与构建裁剪。
 * 经 runtime-observer 出口：宿主注入观察者后接进自有监控，默认 console（F10）。
 *
 * @param module 模块标识，如 'indexedDB'、'Select'
 * @param msg    警告内容
 */
export function warnOnce(module: string, msg: string): void {
  const key = module + '::' + msg
  if (_warnedKeys.has(key)) return
  _warnedKeys.add(key)
  reportWarn(`[组件库][${module}] ${msg}`)
}
