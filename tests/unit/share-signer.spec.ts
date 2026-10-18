// share-signer：分享码签名的可插拔签发者
//
// 背景：分享码 FD1 未签名时，拿到链接的人可以改 schema 再转发。HMAC 签名（FD2）已能防住
// 「手动改 Base64」，但密钥打进前端包就只挡得住这种人。本模块把签发抽象成接口：
//   · createHmacSigner  —— 本地/自用，零后端
//   · createHttpSigner  —— 服务端签发（本项目暂不上服务器，故只有契约与接缝）
// 默认**不启用**（active signer = null），保持既有 FD1 链接可用。
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createHmacSigner,
  createHttpSigner,
  setActiveShareSigner,
  getActiveShareSigner,
  timingSafeEqualStr,
} from '@/components/form-builder/designer/share-signer'
import {
  encodeShareCode,
  signShareCodeWith,
  verifyShareCodeWith,
  SHARE_CODE_PREFIX,
  SHARE_CODE_SIGNED_PREFIX,
} from '@/components/form-builder/designer/share'
import type { FormDesign } from '@/components/form-builder/designer/types'

const KEY = ['sig', 'unit', 'test'].join('-')

function design(title = '签名单'): FormDesign {
  return {
    schemaVersion: 3,
    meta: { title },
    nodes: [{ id: 'n1', type: 'text', label: '姓名', span: 24, key: 'k1' }],
  } as FormDesign
}

afterEach(() => {
  setActiveShareSigner(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('createHmacSigner', () => {
  it('签名确定性 + 验签通过', async () => {
    const s = createHmacSigner(KEY)
    expect(await s.sign('payload-a')).toBe(await s.sign('payload-a'))
    expect(await s.sign('payload-a')).not.toBe(await s.sign('payload-b'))
    expect(await s.verify('payload-a', await s.sign('payload-a'))).toBe(true)
  })

  it('篡改原文或签名 → 验签失败', async () => {
    const s = createHmacSigner(KEY)
    const sig = await s.sign('payload-a')
    expect(await s.verify('payload-TAMPERED', sig)).toBe(false)
    expect(await s.verify('payload-a', sig.slice(0, -1) + 'X')).toBe(false)
    expect(await s.verify('payload-a', '')).toBe(false)
  })

  it('空密钥直接抛错（不允许"没密钥也能签"）', () => {
    expect(() => createHmacSigner('')).toThrow()
  })
})

describe('timingSafeEqualStr', () => {
  it('相等 → true；长度或内容不同 → false', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStr('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStr('', '')).toBe(true)
  })
})

describe('active signer 注册表', () => {
  it('默认未启用（产出未签名码，保持兼容）', () => {
    expect(getActiveShareSigner()).toBeNull()
  })

  it('设置后可读回，传 null 可复位', () => {
    const s = createHmacSigner(KEY)
    setActiveShareSigner(s)
    expect(getActiveShareSigner()).toBe(s)
    setActiveShareSigner(null)
    expect(getActiveShareSigner()).toBeNull()
  })
})

describe('createHttpSigner（服务端签发接缝）', () => {
  const okJson = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response

  it('sign 走 POST 并取回 signature', async () => {
    const fetchImpl = vi.fn(async () => okJson({ signature: 'SIG-FROM-SERVER' }))
    const s = createHttpSigner({ signUrl: '/api/share/sign', fetchImpl: fetchImpl as never })
    expect(await s.sign('payload-a')).toBe('SIG-FROM-SERVER')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/share/sign')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ payload: 'payload-a' })
  })

  it('非 2xx → 抛错（不静默降级为未签名）', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response)
    const s = createHttpSigner({ signUrl: '/x', fetchImpl: fetchImpl as never })
    await expect(s.sign('p')).rejects.toThrow(/HTTP 500/)
  })

  it('返回体缺 signature → 抛错', async () => {
    const fetchImpl = vi.fn(async () => okJson({}))
    const s = createHttpSigner({ signUrl: '/x', fetchImpl: fetchImpl as never })
    await expect(s.sign('p')).rejects.toThrow(/signature/)
  })

  it('未配 verifyUrl 时 verify 返回 false（不允许"没验过就算过"）', async () => {
    const s = createHttpSigner({ signUrl: '/x', fetchImpl: vi.fn() as never })
    expect(await s.verify('p', 'sig')).toBe(false)
  })

  it('配了 verifyUrl 时按服务端结论返回', async () => {
    const fetchImpl = vi.fn(async () => okJson({ valid: true }))
    const s = createHttpSigner({ signUrl: '/s', verifyUrl: '/v', fetchImpl: fetchImpl as never })
    expect(await s.verify('p', 'sig')).toBe(true)
  })
})

describe('与分享码协作：signShareCodeWith / verifyShareCodeWith', () => {
  it('FD1 → FD2 升级，且能验过', async () => {
    const s = createHmacSigner(KEY)
    const fd1 = encodeShareCode(design('升级单'))
    const fd2 = await signShareCodeWith(fd1, s)
    expect(fd2?.startsWith(SHARE_CODE_SIGNED_PREFIX)).toBe(true)

    const r = await verifyShareCodeWith(fd2!, s)
    expect(r.status).toBe('ok')
    expect(r.design?.meta?.title).toBe('升级单')
  })

  it('篡改内容后验签 → bad-signature（这是签名的全部意义）', async () => {
    const s = createHmacSigner(KEY)
    const fd2 = (await signShareCodeWith(encodeShareCode(design('真单')), s))!
    const tamperedContent = encodeShareCode(design('假单')).slice(SHARE_CODE_PREFIX.length)
    const forged = `${SHARE_CODE_SIGNED_PREFIX}${tamperedContent}.${fd2.split('.').pop()}`
    const r = await verifyShareCodeWith(forged, s)
    expect(r.status).toBe('bad-signature')
    expect(r.design).toBeNull()
  })

  it('未签名的 FD1 → status=unsigned（可放行，保持兼容）', async () => {
    const s = createHmacSigner(KEY)
    const r = await verifyShareCodeWith(encodeShareCode(design('未签单')), s)
    expect(r.status).toBe('unsigned')
    expect(r.design?.meta?.title).toBe('未签单')
  })

  it('非法码 → bad-signature（不静默当作未签名放行）', async () => {
    const s = createHmacSigner(KEY)
    expect((await verifyShareCodeWith('随手一段文字', s)).status).toBe('bad-signature')
  })

  it('换一把密钥 → 验签不过', async () => {
    const fd2 = (await signShareCodeWith(encodeShareCode(design()), createHmacSigner(KEY)))!
    const r = await verifyShareCodeWith(fd2, createHmacSigner('another-key'))
    expect(r.status).toBe('bad-signature')
  })
})
