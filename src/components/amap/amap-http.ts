/**
 * amapHttp — 高德 REST 请求的 HTTP 底座（#462 从 amap-service.ts 拆出）
 *
 * 只封装两件事：**超时**（AbortController + 定时器，避免请求悬挂）与
 * **一次退避重试**（消掉网络抖动；批量路径会把单次失败永久标成 none）。
 * 与高德业务无关 —— 任何 REST 调用都能复用。
 */

const _FETCH_TIMEOUT_MS = 15000

/** 失败后的退避重试间隔：消掉一次网络抖动，避免批量解析把失败项永久标成 none */
const _RETRY_BACKOFF_MS = 800

/** 单次 fetch：_FETCH_TIMEOUT_MS 超时 */
export async function fetchOnce(url: string, timeoutMs = _FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * fetch 封装：超时 + 一次退避重试。
 * 一次网络抖动就让坐标解析失败且批量路径会把失败项永久标成 none（batchResolveCoordinates），
 * 重试一轮能消掉绝大部分瞬时抖动。
 */
export async function safeFetch(url: string): Promise<Response> {
  try {
    return await fetchOnce(url)
  } catch {
    await new Promise((r) => setTimeout(r, _RETRY_BACKOFF_MS))
    return fetchOnce(url)
  }
}

/** 退避间隔（导出给测试与需要"等一拍"的调用方复用，避免两处写同一个数） */
export const RETRY_BACKOFF_MS = _RETRY_BACKOFF_MS
