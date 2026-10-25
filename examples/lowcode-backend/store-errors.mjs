/**
 * 存储层共用的错误类型（内存版与 SQLite 版必须抛**同一个**错误，HTTP 层才能统一映射成 409）。
 *
 * 为什么要建这个文件：乐观锁的判据是"写入时携带的 rev 与库里的不一致"，这个判断发生在
 * **存储层**（那里才知道当前值），但**怎么回应**是 HTTP 层的事。两边各定义一套错误类会退化成
 * "看起来都叫冲突、实际互不识别"，所以收在一处、双方 import。
 *
 * 兼容性：HTTP 层同时按 `err.name` 判（跨模块实例、跨 realm 时 `instanceof` 会失效）。
 */
export class ConflictError extends Error {
  /**
   * @param {string} message 人读的说明
   * @param {{ rev?: number, id?: string }} [current] 冲突时的当前状态（回给客户端，便于它重读后重试）
   */
  constructor(message, current = {}) {
    super(message)
    this.name = 'ConflictError'
    /** 冲突时的当前版本号；调用方据此把 `currentRev` 写进 409 响应 */
    this.current = current
  }
}

/** HTTP 层判冲突：instanceof 之外再兜 name（避免不同模块实例导致漏判） */
export function isConflict(err) {
  return err instanceof ConflictError || err?.name === 'ConflictError'
}
