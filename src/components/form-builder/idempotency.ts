/**
 * idempotency —— 提交幂等键（H.1 第 3 项）
 *
 * 问题：`FormBuilder` 已有客户端 `submitting` 守卫防双击，但它有**硬上限**——
 *   · 3 秒后自动重置（防父组件不处理导致永久 loading）；
 *   · 网络超时/断线时请求可能**已经到达服务端**，客户端却当失败。
 * 两种情况都会让"同一次提交"被服务端记成两条记录。客户端再稳也堵不住这个洞，
 * 必须让**服务端能识别出这是同一次提交** → 幂等键。
 *
 * 做法：一次「逻辑提交」期间复用同一个键；**提交成功后才换新的**。
 * 于是「失败后重试 / 用户再点一次」都带同一个键（服务端可去重），
 * 而下一次真正的提交拿到新键（不会被误判成重复）。
 *
 * 传输：走 `Idempotency-Key` 请求头（业界惯例），不动 body 结构——
 * 避免给宿主的服务端加"多一个未知字段"的解析负担。
 * 本项目当前不上服务器，故客户端只负责**稳定地生成与复用**；去重由将来的服务端实现。
 */

/** 生成幂等键。优先 randomUUID（安全上下文），否则退化为时间戳 + 强随机。 */
export function createIdempotencyKey(): string {
  try {
    const c = globalThis.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
    if (c && typeof c.getRandomValues === 'function') {
      const buf = new Uint8Array(16)
      c.getRandomValues(buf)
      return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    /* 落下方兜底 */
  }
  // 最后的兜底：时间戳 + Math.random。**仅**用于没有 WebCrypto 的极端环境；
  // 幂等键不要求密码学强度，但要求"不同提交不撞车"，故仍拼两段随机。
  const t = Date.now().toString(36)
  const r1 = Math.random().toString(36).slice(2, 10)
  const r2 = Math.random().toString(36).slice(2, 10)
  return `${t}-${r1}${r2}`
}

/** 请求头名（宿主要在服务端读同名头） */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key'

/** 宿主可替换的键生成器（例如接入统一 traceId / 租户前缀） */
let factory: (() => string) | null = null

/** 设置自定义幂等键生成器；传 null 恢复默认（randomUUID） */
export function setIdempotencyKeyFactory(fn: (() => string) | null): void {
  factory = fn
}

/** 取一个幂等键：配了自定义生成器就用它，否则用默认实现 */
export function makeIdempotencyKey(): string {
  return factory ? factory() : createIdempotencyKey()
}
