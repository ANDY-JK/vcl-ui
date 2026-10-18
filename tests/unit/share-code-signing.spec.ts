// 分享码签名与 SSR 安全（低代码平台「部署到服务器 / 接入宿主项目」的前置条件）
//
// 背景：分享码 `FD1.<base64(JSON)>` 是**未签名**的——任何拿到链接的人都能改 schema 再转发。
// 在公开部署的形态下，这意味着「伪造一份表单」是可行攻击（结合已收口的 apiUrl 守卫，
// 危害被限制，但伪造字段/文案仍可钓鱼）。本轮补上可选 HMAC 签名（FD2 格式）。
//
// 另：`shareFullLink/shareShortLink` 原先直接用 `location.origin`，SSR 下会抛 ReferenceError。
import { describe, it, expect, vi } from 'vitest'
import {
  encodeShareCode,
  decodeShareCode,
  parseShareCode,
  signShareCode,
  signPayload,
  decodeShareCodeVerified,
  shareFullLink,
  shareShortLink,
  SHARE_CODE_PREFIX,
  SHARE_CODE_SIGNED_PREFIX,
} from '@/components/form-builder/designer/share'
import type { FormDesign } from '@/components/form-builder/designer/types'

const KEY = ['sig', 'test', '01'].join('-')

function design(over: Partial<FormDesign> = {}): FormDesign {
  return {
    schemaVersion: 3,
    meta: { title: '示例表单' },
    nodes: [{ id: 'n1', type: 'input', label: '姓名' }],
    ...over,
  } as FormDesign
}

describe('分享码：编码/解码往返（兼容性）', () => {
  it('FD1 未签名码可正常往返，中文不丢', () => {
    const code = encodeShareCode(design())
    expect(code.startsWith(SHARE_CODE_PREFIX)).toBe(true)
    const back = decodeShareCode(code)
    expect(back?.meta?.title).toBe('示例表单')
    expect(back?.nodes).toHaveLength(1)
  })

  it('非分享码 / 损坏内容返回 null（导入面板据此走 JSON 路径）', () => {
    expect(decodeShareCode('随便一段文字')).toBeNull()
    expect(decodeShareCode('FD1.###')).toBeNull()
    expect(decodeShareCode('')).toBeNull()
  })

  it('解析结果标明 signed=false', () => {
    const parsed = parseShareCode(encodeShareCode(design()))
    expect(parsed?.signed).toBe(false)
    expect(parsed?.sig).toBeNull()
  })
})

describe('分享码：HMAC 签名（FD2）', () => {
  it('签名后往返仍能解出原内容', async () => {
    const signed = await signShareCode(encodeShareCode(design()), KEY)
    expect(signed?.startsWith(SHARE_CODE_SIGNED_PREFIX)).toBe(true)
    const parsed = parseShareCode(signed!)
    expect(parsed?.signed).toBe(true)
    expect(parsed?.design.meta?.title).toBe('示例表单')
  })

  it('验签通过 → 返回 design', async () => {
    const signed = await signShareCode(encodeShareCode(design()), KEY)
    const verified = await decodeShareCodeVerified(signed!, KEY)
    expect(verified?.meta?.title).toBe('示例表单')
  })

  it('篡改内容后验签失败（这是签名的全部意义）', async () => {
    const signed = (await signShareCode(encodeShareCode(design()), KEY))!
    // 攻击者改了内容但保留原签名
    const tamperedDesign = design({ meta: { title: '钓鱼表单' } })
    const tamperedContent = encodeShareCode(tamperedDesign).slice(SHARE_CODE_PREFIX.length)
    const forged = `${SHARE_CODE_SIGNED_PREFIX}${tamperedContent}.${signed.split('.').pop()}`
    expect(await decodeShareCodeVerified(forged, KEY)).toBeNull()
  })

  it('换一把密钥 → 验签失败', async () => {
    const signed = await signShareCode(encodeShareCode(design()), KEY)
    expect(await decodeShareCodeVerified(signed!, 'another-key')).toBeNull()
  })

  it('未签名的 FD1 码不能通过「必须验签」的入口（requireSigned 语义）', async () => {
    const unsigned = encodeShareCode(design())
    expect(await decodeShareCodeVerified(unsigned, KEY)).toBeNull()
  })

  it('签名是确定性的（同一 payload + key 结果一致）', async () => {
    const a = await signPayload('abc', KEY)
    const b = await signPayload('abc', KEY)
    expect(a).toBe(b)
    expect(a).not.toBe(await signPayload('abd', KEY))
  })

  it('对非法输入签名返回 null，不抛错', async () => {
    expect(await signShareCode('不是分享码', KEY)).toBeNull()
  })
})

describe('SSR 安全：无 location 时不抛错', () => {
  it('shareFullLink / shareShortLink 回落为相对链接', () => {
    // vitest 的 happy-dom 环境有 location，这里临时置空模拟 SSR（delete 对 getter 无效）
    vi.stubGlobal('location', undefined)
    try {
      expect(shareFullLink('FD1.abc')).toBe('#/form/FD1.abc')
      expect(shareShortLink('f-1')).toBe('#/form/S.f-1')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
