// api-url-guard 单测 —— schema 驱动外发请求的收口（第五轮审查 R5-C3）
//
// 立案背景：低代码表单的 apiUrl / saveUrl 来自表单配置，而配置可经**无签名分享码**跨信任
// 边界流入（designer/share.ts 仅 base64）。攻击者构造一条分享链接，受害者填表即把输入 POST
// 到攻击者域。此前全库没有任何 URL 校验函数，这组用例就是那条链的回归锁。
import { describe, it, expect } from 'vitest'
import { checkApiUrl, isApiUrlAllowed } from '@/components/form-builder/api-url-guard'

const BASE = 'https://app.example.com'

describe('checkApiUrl：同源与相对路径放行', () => {
  it('相对路径始终允许（最常见的合法用法）', () => {
    expect(checkApiUrl('/api/store', {}, BASE)).toMatchObject({ ok: true, url: `${BASE}/api/store` })
    expect(checkApiUrl('api/store', {}, BASE)).toMatchObject({ ok: true, url: `${BASE}/api/store` })
  })

  it('同源绝对地址放行', () => {
    expect(isApiUrlAllowed(`${BASE}/api/x`, {}, BASE)).toBe(true)
  })
})

describe('checkApiUrl：跨域默认拒绝（核心防护）', () => {
  it('默认拒绝跨域（攻击者域）', () => {
    const v = checkApiUrl('https://evil.example/submit', {}, BASE)
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.reason).toContain('默认只允许同源')
  })

  it('显式 allowlist 命中才放行', () => {
    const policy = { allowCrossOrigin: true, allowlist: ['https://api.example.com'] }
    expect(isApiUrlAllowed('https://api.example.com/x', policy, BASE)).toBe(true)
    expect(isApiUrlAllowed('https://evil.example/x', policy, BASE)).toBe(false)
  })

  it('allowCrossOrigin=true 但 allowlist 为空 → 仍然拒绝（不允许"开了开关就全放"）', () => {
    expect(isApiUrlAllowed('https://evil.example/x', { allowCrossOrigin: true }, BASE)).toBe(false)
  })

  it('协议相对地址 //evil.example 按跨域处理', () => {
    expect(isApiUrlAllowed('//evil.example/x', {}, BASE)).toBe(false)
  })
})

describe('checkApiUrl：协议与畸形输入', () => {
  it('拒绝 javascript: / data: / blob: 等非 http(s) 协议', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'blob:https://x/y', 'file:///etc/passwd']) {
      const v = checkApiUrl(bad, { allowCrossOrigin: true, allowlist: [] }, BASE)
      expect(v.ok, bad).toBe(false)
    }
  })

  it('空串与纯空白拒绝', () => {
    expect(checkApiUrl('', {}, BASE).ok).toBe(false)
    expect(checkApiUrl('   ', {}, BASE).ok).toBe(false)
  })

  it('无法确定当前源时，跨域请求被拒（fail-closed）', () => {
    expect(isApiUrlAllowed('https://evil.example/x', {}, undefined as unknown as string)).toBe(false)
  })
})

describe('checkApiUrl：真实攻击形态（分享码里的 apiUrl）', () => {
  it('分享码携带的绝对外域地址一律被拦', () => {
    const malicious = [
      'https://attacker.example/collect',
      'http://attacker.example:8080/collect',
      '//attacker.example/collect',
      'https://app.example.com.evil.example/x', // 前缀伪装
    ]
    for (const url of malicious) {
      expect(isApiUrlAllowed(url, {}, BASE), url).toBe(false)
    }
  })

  // #394：URL 规范把反斜杠当正斜杠，于是「看着像相对路径」的串会解析到别的源。
  // 这类绕过最阴险：字符串里没有 //，肉眼看像同源，fetch 却打到攻击者域。
  it('**反斜杠变体不能绕过同源判定**（/\\evil.com 之类）', () => {
    const bypasses = [
      '/\\evil.com/collect',
      '\\\\evil.com/collect',
      '/\\evil.com/collect?a=1',
    ]
    for (const url of bypasses) {
      const v = checkApiUrl(url, {}, BASE)
      expect(v.ok, `绕过成功：${url} → ${v.url}`).toBe(false)
    }
  })

  it('协议白名单：javascript / data / blob 一律拒绝', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://app.example.com/uuid',
      'vbscript:msgbox(1)',
    ]) {
      const v = checkApiUrl(url, {}, BASE)
      expect(v.ok, `危险协议被放行：${url}`).toBe(false)
      expect(v.ok === false && v.reason, '要说明是协议不被允许').toContain('协议')
    }
  })

  it('绝对外域仍走跨域判定（纵深防御同一条通路）', () => {
    const v = checkApiUrl('https://attacker.example/x', {}, BASE)
    expect(v.ok).toBe(false)
    expect(v.ok === false && v.reason, '拒绝理由要能定位到跨域目标').toMatch(/跨域|同源/)
  })

  it('返回的 url 是规范化后的绝对地址（供 fetch 直接用）', () => {
    const v = checkApiUrl('/api/x', {}, BASE)
    expect(v.ok && v.url).toBe(`${BASE}/api/x`)
  })
})
