/**
 * api-url-guard —— schema 驱动的外发请求统一收口（第五轮审查 R5-C3）
 *
 * 背景：低代码表单的 `apiUrl` / `saveUrl` 来自**表单配置**，而配置可以通过分享码
 * （`designer/share.ts` 仅 base64、无签名）跨信任边界流入。此前这些 URL 被直接交给
 * `fetch()`，全库没有任何校验函数——攻击者构造一条分享链接，受害者填表即把输入 POST 到
 * 攻击者域。
 *
 * 本模块给出唯一收口：**默认只允许同源**，跨域必须由宿主显式声明 allowlist。
 * 调用方（useFormEvents / useFormLinkage / useFormRemote）在 fetch 之前必须过这里。
 *
 * 设计取舍：
 * - **默认拒绝**（fail-closed）：拿不到 origin 判定的（如 SSR 无 location）一律拒绝跨域，
 *   避免"环境不确定 → 放行"这种最危险的默认值。
 * - 相对路径（`/api/x`、`api/x`）始终视为同源，允许——这是最常见的合法用法。
 * - 协议白名单只放 http/https：挡掉 `javascript:`、`data:`、`blob:` 之类。
 */

export interface ApiUrlPolicy {
  /** 允许的跨域源，如 `['https://api.example.com']`；同源永远允许 */
  allowlist?: readonly string[]
  /** 是否允许跨域（未给 allowlist 时为 false；给了 allowlist 时按表判定） */
  allowCrossOrigin?: boolean
}

/** 校验结果：ok=false 时 reason 给出可读原因（调用方据此提示，而不是静默失败） */
export type ApiUrlVerdict = { ok: true; url: string } | { ok: false; reason: string; url: string }

/** 取当前 origin；SSR / 非浏览器环境返回 null */
function currentOrigin(): string | null {
  if (typeof window === 'undefined') return null
  const o = window.location?.origin
  return o && o !== 'null' ? o : null
}

/**
 * 判定一个 URL 是否允许被 fetch。
 *
 * @param raw 待判定 URL（可为相对路径）
 * @param policy 宿主策略（默认同源 only）
 * @param base 相对路径的基准（默认当前 origin；测试可注入）
 */
export function checkApiUrl(raw: string, policy: ApiUrlPolicy = {}, base?: string): ApiUrlVerdict {
  const url = String(raw ?? '').trim()
  if (!url) return { ok: false, reason: 'URL 为空', url }

  const origin = base ?? currentOrigin()

  // 相对路径：始终允许（解析基准就是自己）
  const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
  if (!isAbsolute) {
    if (!origin) return { ok: true, url } // 相对路径不涉及跨域判定
    try {
      return { ok: true, url: new URL(url, origin).toString() }
    } catch {
      return { ok: false, reason: 'URL 无法解析', url }
    }
  }

  let parsed: URL
  try {
    parsed = new URL(url, origin ?? undefined)
  } catch {
    return { ok: false, reason: 'URL 无法解析', url }
  }

  // 协议白名单：只允许 http/https（挡掉 javascript: / data: / blob: 等）
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: `协议 ${parsed.protocol} 不被允许（仅 http/https）`, url }
  }

  // 同源：直接放行
  if (origin && parsed.origin === origin) return { ok: true, url: parsed.toString() }

  // 跨域：需要显式策略
  const allow = policy.allowlist ?? []
  if (policy.allowCrossOrigin && allow.includes(parsed.origin)) {
    return { ok: true, url: parsed.toString() }
  }

  if (!origin) {
    return { ok: false, reason: '无法确定当前源，跨域请求被拒绝', url }
  }
  if (allow.length) {
    return { ok: false, reason: `跨域目标 ${parsed.origin} 不在允许清单内`, url }
  }
  return { ok: false, reason: `默认只允许同源请求（目标 ${parsed.origin}）`, url }
}

/** 从宿主的 origin 白名单构造策略（空数组 = 同源 only） */
export function policyFromOrigins(origins: readonly string[] = []): ApiUrlPolicy {
  return { allowCrossOrigin: origins.length > 0, allowlist: origins }
}

/** 便捷判定：只要布尔 */
export function isApiUrlAllowed(raw: string, policy: ApiUrlPolicy = {}, base?: string): boolean {
  return checkApiUrl(raw, policy, base).ok
}
