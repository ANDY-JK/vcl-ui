/**
 * `supabase-transport` · 配置校验 / URL 构建 / 列表分页 / KV 适配器（第 173 轮）
 *
 * 覆盖率实测语句 72.7% / 分支 63.8%：`validateSupabaseConfig` 的格式分支、
 * `publicUrl`/`objectUrl`、**`listObjects` 整个方法**、KV 的键清洗告警与解析降级都没被执行过。
 * 而已有 spec 只有 `supabase-kv-adapter.spec.ts`（覆盖 KV 语义），列表对账一行没测。
 *
 * 重点怀疑两处（读码所得）：
 *   A. `createdAt: r.created_at ? new Date(...).getTime() : 0` —— 注释写的是
 *      "缺失/**非法**回退 0"，但代码只处理"缺失"，非法日期会得到 **NaN**。
 *      createdAt 会流进 contract-storage 的墓碑比较（`ts > prev.ts`）与导出层。
 *   B. `for (;;)` 翻页**没有页数上限**（同族的 s3-transport 有 MAX_LIST_PAGES=200）：
 *      若服务端忽略 offset 恒返回满页 → 死循环 + 内存无限增长。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  SupabaseTransport,
  validateSupabaseConfig,
  sanitizeObjectKeyPart,
  type SupabaseConfig,
} from '@/components/storage/supabase-transport'

const CFG: SupabaseConfig = {
  url: 'https://demo.supabase.co',
  anonKey: 'anon-key',
  bucket: 'contracts',
} as SupabaseConfig

const PAGE = 1000

/** 造一页 list 响应；full=true 时返回满 PAGE 条（用于逼出下一页） */
function listPage(opts: {
  count?: number
  full?: boolean
  extra?: Array<Record<string, unknown>>
} = {}): Response {
  const n = opts.full ? PAGE : (opts.count ?? 1)
  const rows = Array.from({ length: n }, (_, i) => ({
    name: `obj-${i}.jpg`,
    created_at: '2026-09-05T10:00:00.000Z',
    metadata: { size: 100 + i, mimetype: 'image/jpeg' },
  }))
  return new Response(JSON.stringify([...rows, ...(opts.extra ?? [])]), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

let origFetch: typeof fetch
beforeEach(() => {
  origFetch = globalThis.fetch
})
afterEach(() => {
  globalThis.fetch = origFetch
  vi.restoreAllMocks()
})

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return handler(String(url), init)
  }) as typeof fetch
  return calls
}

/* ═══════════ 配置校验 ═══════════ */

describe('supabase-transport · 配置校验', () => {
  it('URL 为空 → 提示必填', () => {
    expect(validateSupabaseConfig({ ...CFG, url: '   ' })).toBeTruthy()
  })

  it('**URL 协议不合法 → 提示格式错误**（只接受 http/https）', () => {
    expect(validateSupabaseConfig({ ...CFG, url: 'ftp://x.com' })).toBeTruthy()
    expect(validateSupabaseConfig({ ...CFG, url: 'demo.supabase.co' })).toBeTruthy()
  })

  it('anonKey / bucket 为空 → 各自提示', () => {
    expect(validateSupabaseConfig({ ...CFG, anonKey: '' })).toBeTruthy()
    expect(validateSupabaseConfig({ ...CFG, bucket: '' })).toBeTruthy()
  })

  it('合法配置 → null', () => {
    expect(validateSupabaseConfig(CFG)).toBeNull()
  })

  it('**构造函数也校验**：即使调用方跳过 validateStorageConfig，空配置也当场抛', () => {
    expect(() => new SupabaseTransport({ ...CFG, url: '' })).toThrow()
  })
})

/* ═══════════ URL 构建 ═══════════ */

describe('supabase-transport · URL 与请求头', () => {
  it('base 去掉末尾多余斜杠（配置写成 / 结尾也不出现 //storage）', () => {
    const tr = new SupabaseTransport({ ...CFG, url: 'https://demo.supabase.co///' })
    expect(tr.base).toBe('https://demo.supabase.co/storage/v1')
  })

  it('publicUrl / objectUrl 对对象名做 URL 编码', () => {
    const tr = new SupabaseTransport(CFG)
    const url = tr.publicUrl('1-合同 文件.jpg')
    expect(url).toContain('/storage/v1/object/public/contracts/')
    expect(url).toContain(encodeURIComponent('1-合同 文件.jpg'))
    expect(tr.objectUrl('a.jpg'), 'objectUrl 与 publicUrl 同源').toBe(tr.publicUrl('a.jpg'))
  })

  it('headers：默认带 apikey + Authorization；json=true 才加 Content-Type', () => {
    const tr = new SupabaseTransport(CFG)
    expect(tr.headers()).toMatchObject({ apikey: 'anon-key', Authorization: 'Bearer anon-key' })
    expect(tr.headers()['Content-Type']).toBeUndefined()
    expect(tr.headers(true)['Content-Type']).toBe('application/json')
  })
})

/* ═══════════ listObjects ═══════════ */

describe('supabase-transport · listObjects 分页与字段归一', () => {
  it('单页：解析 name/size/mimetype/createdAt', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify([
          {
            name: 'a.jpg',
            created_at: '2026-09-05T10:00:00.000Z',
            metadata: { size: 123, mimetype: 'image/jpeg' },
          },
        ]),
        { status: 200 },
      ),
    )
    const objs = await new SupabaseTransport(CFG).listObjects()
    expect(objs).toHaveLength(1)
    expect(objs[0]).toMatchObject({ name: 'a.jpg', size: 123, mimetype: 'image/jpeg' })
    expect(objs[0].createdAt).toBe(new Date('2026-09-05T10:00:00.000Z').getTime())
  })

  it('**目录占位行（名字以 / 结尾）被跳过**（不是文件，计入导出会多出空条目）', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify([
          { name: 'sub/', metadata: {} },
          { name: 'b.png', metadata: { size: 1, mimetype: 'image/png' } },
        ]),
        { status: 200 },
      ),
    )
    const objs = await new SupabaseTransport(CFG).listObjects()
    expect(objs.map((o) => o.name)).toEqual(['b.png'])
  })

  it('metadata 缺失 → size 0、mimetype 兜底 octet-stream、createdAt 0', async () => {
    stubFetch(() => new Response(JSON.stringify([{ name: 'c.bin' }]), { status: 200 }))
    const objs = await new SupabaseTransport(CFG).listObjects()
    expect(objs[0]).toMatchObject({ size: 0, mimetype: 'application/octet-stream', createdAt: 0 })
  })

  it('**非法 created_at 必须回退 0，不能是 NaN**（注释承诺"缺失/非法回退 0"）', async () => {
    stubFetch(() =>
      new Response(JSON.stringify([{ name: 'bad.jpg', created_at: 'not-a-date', metadata: { size: 1 } }]), {
        status: 200,
      }),
    )
    const objs = await new SupabaseTransport(CFG).listObjects()
    expect(
      Number.isNaN(objs[0].createdAt),
      'NaN 会流进墓碑比较（ts > prev.ts 恒 false → 删除记录被忽略、旧照片复活）与导出层',
    ).toBe(false)
    expect(objs[0].createdAt).toBe(0)
  })

  it('满页时翻页：第二页 offset=1000，合计两页条数', async () => {
    let call = 0
    const calls = stubFetch(() => {
      call++
      return call === 1 ? listPage({ full: true }) : listPage({ count: 3 })
    })
    const objs = await new SupabaseTransport(CFG).listObjects()
    expect(objs).toHaveLength(PAGE + 3)
    expect(calls).toHaveLength(2)
    const body = JSON.parse(String(calls[1].init?.body ?? '{}'))
    expect(body.offset, '第二页必须带 offset 才能取到后续对象').toBe(PAGE)
  })

  it('**服务端恒返回满页 → 必须有页数上限，不能死循环**（同族 s3 有 MAX_LIST_PAGES）', async () => {
    const calls = stubFetch(() => listPage({ full: true }))
    const objs = await new SupabaseTransport(CFG).listObjects()
    expect(calls.length, '没有上限时这里会无限翻页并把内存吃满').toBeLessThanOrEqual(200)
    expect(objs.length).toBe(PAGE * calls.length)
  })
})

/* ═══════════ KV 适配器与键清洗 ═══════════ */

describe('supabase-transport · 对象键清洗', () => {
  it('中文剔除非 ASCII，敏感字符转下划线，空白转下划线', () => {
    // 清洗链：剔非 ASCII（中文）→ '1- .jpg'；空白转 _ → '1-_.jpg'；清首尾 [_.,-] → '1.jpg'
    expect(sanitizeObjectKeyPart('1-合同 文件.jpg')).toBe('1.jpg')
    expect(sanitizeObjectKeyPart('a/b:c*d.jpg')).toBe('a_b_c_d.jpg')
    expect(sanitizeObjectKeyPart('  x  .png')).toBe('x.png')
  })

  it('主体为空回退 file；超长截断到 60 字符', () => {
    expect(sanitizeObjectKeyPart('中文')).toBe('file')
    expect(sanitizeObjectKeyPart('a'.repeat(80) + '.jpg')).toHaveLength(64) // 60 + '.jpg'
  })
})

describe('supabase-transport · 删除重试次数下限', () => {
  it('**attempts=0 不得静默"成功"**（一次都不请求却返回 = 删除从未发生却报成功）', async () => {
    const calls = stubFetch(() => new Response('', { status: 500 }))
    // 至少尝试一次：attempts 是"重试次数"，不是"允许不执行"
    await expect(new SupabaseTransport(CFG).deleteObjectWithRetry('a.jpg', 0)).rejects.toThrow(/500/)
    expect(calls.length, '必须真的发出过一次 DELETE').toBeGreaterThanOrEqual(1)
  })
})
