// 复制工具 — Clipboard API 优先，execCommand 降级，适应 HTTP/HTTPS/移动端

/**
 * 复制文本到剪贴板
 * - HTTPS / localhost：Clipboard API
 * - HTTP 环境 / 旧浏览器：execCommand('copy') 降级
 * - 移动端 WebView：均覆盖
 */
export async function copyText(text: string): Promise<boolean> {
  if (text == null || text === '') return false

  // 方案 1：Clipboard API（需要 HTTPS 或 localhost，但直接 try 不预判）
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) {
    console.warn('[useCopy] Clipboard API 失败，降级到 execCommand:', e)
  }

  // 方案 2：execCommand 降级（HTTP、旧浏览器、部分 WebView 均支持）
  try {
    const ta = document.createElement('textarea')
    try {
      ta.value = text
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange(0, text.length)
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      document.body.removeChild(ta)
    }
  } catch {
    return false
  }
}
