/**
 * `s3-transport` · 上传 / 删除 / 删除重试 / 展示 URL（第 174 轮）
 *
 * 覆盖率实测语句 86% / 分支 **58.1%**（全库最低档）：`putObject`、`deleteObject`、
 * `deleteObjectWithRetry`、`objectUrl` 与 `fetchRaw` 的错误分支**全部没有被执行过**。
 * 已有 `s3-transport.spec.ts` 只覆盖了签名原语与列表解析。
 *
 * 这三个方法恰是"写路径"—— 对账/删除广播/照片位保存全都靠它们落实：
 *   · `putObject` 失败若被吞掉 → 界面显示已保存、云端其实没有（下次加载"消失"）
 *   · `deleteObject` 的 404 必须当成功 → 幂等，否则重试删除一直失败、墓碑不写
 *   · `deleteObjectWithRetry` 的重试次数/退避/最后一次抛出必须钉住 →
 *     重试少了会丢删除，多了或只重试不抛会把失败藏起来
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { S3Transport } from '@/components/storage/s3-transport'

const CFG = {
  endpoint: 'https://test-bucket.s3.example.com',
  region: 'us-east-1',
  bucket: 'test-bucket',
  accessKeyId: 'test-access-key-id',
  secretAccessKey: 'test-secret-access-key',
}

const FIXED = new Date('2026-09-05T12:00:00.000Z')
const mk = () => new S3Transport(CFG, () => FIXED)

let origFetch: typeof fetch
beforeEach(() => {
  origFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = origFetch
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** 记录调用并返回指定状态 */
function stub(status: number, opts: { body?: string; throwName?: string } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (opts.throwName) {
      const e = new Error(opts.throwName)
      e.name = opts.throwName
      throw e
    }
    return new Response(opts.body ?? '', { status })
  }) as typeof fetch
  return calls
}

describe('s3-transport · putObject 上传', () => {
  it('成功：PUT + content-type + UNSIGNED-PAYLOAD（浏览器无预算哈希）', async () => {
    const calls = stub(200)
    await mk().putObject('1-合同.jpg', 'DATA', 'image/jpeg')

    expect(calls).toHaveLength(1)
    expect(calls[0].init?.method).toBe('PUT')
    const h = calls[0].init?.headers as Record<string, string>
    expect(h['content-type']).toBe('image/jpeg')
    expect(h['x-amz-content-sha256'], '有 body 时负载不预哈希').toBe('UNSIGNED-PAYLOAD')
    expect(h.Authorization, '签名头必须在').toContain('AWS4-HMAC-SHA256')
    expect(calls[0].init?.body).toBe('DATA')
  })

  it('**非 2xx 必须抛出**（否则界面显示已保存、云端其实没有）', async () => {
    stub(403)
    await expect(mk().putObject('a.jpg', 'x', 'image/jpeg')).rejects.toThrow(/403/)
  })

  it('201 / 204 也算成功（不误报失败）', async () => {
    stub(201)
    await expect(mk().putObject('a.jpg', 'x', 'image/jpeg')).resolves.toBeUndefined()
    stub(204)
    await expect(mk().putObject('b.jpg', 'x', 'image/jpeg')).resolves.toBeUndefined()
  })
})

describe('s3-transport · deleteObject 删除', () => {
  it('204 成功且不发 body（DELETE 语义）', async () => {
    const calls = stub(204)
    await expect(mk().deleteObject('a.jpg')).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0].init?.method).toBe('DELETE')
    expect(calls[0].init?.body, 'DELETE 不该带 body').toBeUndefined()
  })

  it('**404 视为幂等成功**（对象已不存在 = 目标已达成，否则重试删除永远失败、墓碑不写）', async () => {
    stub(404)
    await expect(mk().deleteObject('a.jpg')).resolves.toBeUndefined()
  })

  it('403 / 500 必须抛出（不能把权限失败当成功）', async () => {
    stub(403)
    await expect(mk().deleteObject('a.jpg')).rejects.toThrow(/403/)
    stub(500)
    await expect(mk().deleteObject('a.jpg')).rejects.toThrow(/500/)
  })
})

describe('s3-transport · deleteObjectWithRetry 删除重试', () => {
  it('首次成功 → 只请求一次，不重试', async () => {
    const calls = stub(204)
    await mk().deleteObjectWithRetry('a.jpg')
    expect(calls).toHaveLength(1)
  })

  it('连续失败 3 次 → 抛最后一次错误（不能悄悄放弃）', async () => {
    const calls = stub(500)
    await expect(mk().deleteObjectWithRetry('a.jpg')).rejects.toThrow(/500/)
    expect(calls, 'attempts 默认 3').toHaveLength(3)
  })

  it('**404 不重试**（幂等：重试只是白占退避时间）', async () => {
    const calls = stub(404)
    await mk().deleteObjectWithRetry('a.jpg')
    expect(calls).toHaveLength(1)
  })

  it('第 2 次成功 → 停止重试并返回', async () => {
    let n = 0
    globalThis.fetch = (async () => {
      n++
      return new Response('', { status: n === 1 ? 500 : 204 })
    }) as typeof fetch
    await expect(mk().deleteObjectWithRetry('a.jpg')).resolves.toBeUndefined()
    expect(n).toBe(2)
  })

  it('attempts 可配 1 → 失败即抛，不重试', async () => {
    const calls = stub(500)
    await expect(mk().deleteObjectWithRetry('a.jpg', 1)).rejects.toThrow(/500/)
    expect(calls).toHaveLength(1)
  })

  it('**attempts=0 不得静默"成功"**（一次都不请求却返回 = 删除从未发生却报成功）', async () => {
    const calls = stub(500)
    // 至少尝试一次：重试次数是"额外重试"的下限保障，不是"允许不执行"
    await expect(mk().deleteObjectWithRetry('a.jpg', 0)).rejects.toThrow(/500/)
    expect(calls.length, '必须真的发出过一次删除请求').toBeGreaterThanOrEqual(1)
  })
})

describe('s3-transport · fetchRaw 错误归类与 URL', () => {
  it('AbortError（超时）→ 提示超时并带秒数', async () => {
    stub(0, { throwName: 'AbortError' })
    await expect(mk().deleteObject('a.jpg')).rejects.toThrow(/超时|timeout/i)
  })

  it('其它异常（断网 / DNS）→ 统一报网络错误，且保留 cause', async () => {
    const calls = stub(0, { throwName: 'TypeError' })
    let caught: Error | null = null
    try {
      await mk().deleteObject('a.jpg')
    } catch (e) {
      caught = e as Error
    }
    expect(caught, '必须抛出而非吞掉').toBeTruthy()
    expect(caught!.message).toMatch(/网络/)
    expect((caught as Error & { cause?: unknown }).cause, 'cause 必须留给上层排查').toBeTruthy()
    expect(calls.length).toBe(1)
  })

  it('objectUrl 即预签名 GET：带 X-Amz-Signature，中文键按 UTF-8 百分号编码', async () => {
    const url = mk().objectUrl('1-合同.jpg')
    expect(url).toContain('https://test-bucket.s3.example.com/')
    expect(url, '必须是预签名而不是公开 URL').toContain('X-Amz-Signature=')
    expect(url, '中文键要编码').toContain('1-%E5%90%88%E5%90%8C.jpg')
    expect(url, '私密桶不该只靠公开读').toContain('X-Amz-Credential=')
  })
})
