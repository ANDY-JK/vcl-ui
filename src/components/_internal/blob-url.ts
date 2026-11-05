/**
 * 图片引用是否"可跨会话持久化"（#435 收口）
 *
 * ## 为什么需要这个判据
 *
 * `FormTargetCollect` 把上传结果存进 `StoreFile.dataUrl`（`string | Blob`），
 * 契约里写得很清楚：**本地落盘是 Blob 本体，云端引用/兼容旧数据才用字符串**
 * （`data:` 或 `http(s):`）。但实现里有一处 `dataUrl: f.raw ?? f.url`：
 *
 *   - `raw` 缺失时（宿主回填 / Upload 二次 emit 的条目本来就不带 raw），
 *     就把 `f.url` 原样存进去 —— 而 `f.url` 很可能是 `blob:http://…/xxx`；
 *   - `blob:` URL 只在**创建它的文档存活期内**有效。写进后端 → 用户刷新/换设备
 *     → 预览白屏、导出 ZIP 时 `fetch(blob:…)` 失败（`reportWarn` 只记一行日志）；
 *   - 它还绕过 mime 判定：`dataUrl.match(/^data:(image\/\w+);/)` 对 `blob:` 不命中，
 *     一律兜底成 `image/png`，扩展名跟着错。
 *
 * 结论：**"能显示"不等于"能存"**。判据必须显式区分"本文档临时句柄"与"可持久化引用"。
 */

/** 可持久化的字符串引用：`data:`（自包含）与 `http(s):`（云端） */
const PERSISTABLE_STRING = /^(data:|https?:)/i

/**
 * `dataUrl` 这个位置能不能收下这个值。
 *
 * - `Blob` / `File` → 可以（本体落盘，重建页面前已存好）
 * - `data:` / `http(s):` 字符串 → 可以（自包含或云端引用）
 * - `blob:` 字符串 → **不可以**（本文档临时句柄，跨会话必失效）
 * - 其它（相对路径、空串、undefined、对象）→ 不可以（无法判断其生命周期）
 */
export function isPersistableImageRef(value: unknown): boolean {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  return typeof value === 'string' && PERSISTABLE_STRING.test(value.trim())
}
