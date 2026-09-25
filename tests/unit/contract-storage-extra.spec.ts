// contract-storage 补测（contract-storage.spec.ts 只覆盖 CompositeBackend 对账；本文件补：
// 纯 helper getSlotFile/allSlotsFilled/setSlotFile · IndexedDBBackend（mock indexedDB 模块）·
// ObjectCloudBackend 直测（假 ObjectCloudTransport：对象名解析/墓碑/上传/删除/清空）·
// 工厂路由 createBackend/validateStorageConfig/env 默认配置）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getSlotFile,
  allSlotsFilled,
  setSlotFile,
  IndexedDBBackend,
  ObjectCloudBackend,
  emptyStorageConfig,
  defaultStorageConfigFromEnv,
  validateStorageConfig,
  createBackend,
  TOMBSTONE_MARKER,
  type StoreUploadState,
  type StoreFile,
  type ObjectCloudTransport,
  type S3Config,
} from '@/components/storage/contract-storage'
import { dbPut, dbGetAll, dbClear } from '@/components/storage/indexedDB'
import { envValue } from '@/components/_internal/env-guard'

vi.mock('@/components/storage/indexedDB', () => ({
  dbPut: vi.fn(),
  dbGetAll: vi.fn(),
  dbClear: vi.fn(),
}))
vi.mock('@/components/_internal/env-guard', () => ({ envValue: vi.fn() }))

beforeEach(() => {
  vi.mocked(dbPut).mockReset().mockResolvedValue(undefined as never)
  vi.mocked(dbGetAll).mockReset().mockResolvedValue([] as never)
  vi.mocked(dbClear).mockReset().mockResolvedValue(undefined as never)
  vi.mocked(envValue).mockReset().mockReturnValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

// ---------- 纯 helper ----------

const file: StoreFile = { name: 'a.png', dataUrl: 'data:image/png;base64,AA', size: 2, type: 'image/png' }

describe('照片位纯函数', () => {
  it('getSlotFile：slots 优先；contract 位回退旧字段；缺失 undefined', () => {
    const state: StoreUploadState = {
      contract: file,
      slots: { rebate: file },
      ts: 1,
    }
    expect(getSlotFile(state, 'rebate')).toBe(file)
    expect(getSlotFile(state, 'contract')).toBe(file) // 回退旧字段
    expect(getSlotFile(state, 'front')).toBeUndefined()
    expect(getSlotFile(undefined, 'contract')).toBeUndefined()
  })

  it('allSlotsFilled：空 state/空 keys 均 false；全齐 true；缺一 false', () => {
    const state: StoreUploadState = { slots: { a: file, b: file }, ts: 1 }
    expect(allSlotsFilled(undefined, ['a'])).toBe(false)
    expect(allSlotsFilled(state, [])).toBe(false)
    expect(allSlotsFilled(state, ['a', 'b'])).toBe(true)
    expect(allSlotsFilled(state, ['a', 'c'])).toBe(false)
  })

  it('setSlotFile：写入/删除（file undefined）/contract 位镜像旧字段/不可变（不改原对象）', () => {
    const base: StoreUploadState = { contract: file, slots: { contract: file }, ts: 1 }
    const next = setSlotFile(base, 'rebate', file)
    expect(next.slots?.rebate).toBe(file)
    expect(base.slots?.rebate).toBeUndefined() // 原对象不被改

    const del = setSlotFile(next, 'rebate', undefined)
    expect(del.slots?.rebate).toBeUndefined()

    const unset = setSlotFile({ slots: { contract: file }, ts: 1 }, 'contract', undefined)
    expect(unset.contract).toBeUndefined() // 空了 → 镜像字段清空

    const fresh = setSlotFile(undefined, 'front', file)
    expect(fresh.slots?.front).toBe(file)
    expect(typeof fresh.ts).toBe('number')
  })
})

// ---------- IndexedDBBackend（mock indexedDB 模块） ----------

describe('IndexedDBBackend', () => {
  it('loadAll：映射解包行；appleId=0 合法保留；非对象/缺 number 的行跳过；DB 失败 warn 不抛', async () => {
    vi.mocked(dbGetAll).mockResolvedValue([
      { contract: undefined, slots: { a: file }, ts: 1, appleId: 0 },
      { ts: 2 }, // 无 appleId → 跳过
      'garbage' as never,
    ] as never)
    const backend = new IndexedDBBackend()
    const map = await backend.loadAll()
    expect(map.get(0)?.slots?.a).toEqual(file)
    expect(map.size).toBe(1)

    vi.mocked(dbGetAll).mockRejectedValue(new Error('db down'))
    const warnSpy = vi.mocked(console.warn)
    const empty = await backend.loadAll()
    expect(empty.size).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('IndexedDB 加载失败'), expect.any(Error))
  })

  it('saveRecord：dbPut 键=String(appleId)、value 含 appleId 冗余；contract 镜像只在有值时保留', async () => {
    const backend = new IndexedDBBackend()
    await backend.saveRecord(7, { slots: { a: file }, ts: 9 })
    expect(dbPut).toHaveBeenCalledWith('uploads', '7', {
      contract: undefined,
      slots: { a: file },
      ts: 9,
      appleId: 7,
    })

    vi.mocked(dbPut).mockRejectedValue(new Error('quota'))
    await backend.saveRecord(7, { slots: {}, ts: 9 }) // 失败只 warn 不抛
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(expect.stringContaining('IndexedDB 保存失败'), 7, expect.any(Error))
  })

  it('clearAll：dbClear 失败 warn 不抛', async () => {
    vi.mocked(dbClear).mockRejectedValue(new Error('no'))
    await expect(new IndexedDBBackend().clearAll()).resolves.toBeUndefined()
    expect(vi.mocked(console.warn)).toHaveBeenCalledWith(expect.stringContaining('IndexedDB 清空失败'), expect.any(Error))
  })
})

// ---------- ObjectCloudBackend（假 transport 直测对象名解析/墓碑/上传/删除/清空） ----------

class FakeTr implements ObjectCloudTransport {
  objects: { name: string; size: number; mimetype: string; createdAt: number }[] = []
  puts: Array<{ name: string; body: string | Blob; type: string }> = []
  deletes: string[] = []
  failDelete: string[] = []
  async listObjects() {
    return this.objects
  }
  async putObject(name: string, body: Blob | string, contentType: string) {
    this.puts.push({ name, body, type: contentType })
  }
  async deleteObjectWithRetry(name: string) {
    this.deletes.push(name)
    if (this.failDelete.includes(name)) throw new Error('del fail')
  }
  objectUrl(name: string) {
    return `https://cdn.example.com/${name}`
  }
}

const b64 = 'iVBORw0KGgo=' // 任意 base64（= "test"）

describe('ObjectCloudBackend', () => {
  function mk(tr = new FakeTr()) {
    return { backend: new ObjectCloudBackend(tr, 's3') as InstanceType<typeof ObjectCloudBackend>, tr }
  }

  it('loadAll：旧格式 {id}-{ascii} 归 contract 位；slot 名解析；墓碑解析（新/旧格式）；删除后重传清墓碑', async () => {
    const { backend, tr } = mk()
    tr.objects = [
      { name: '1-a.png', size: 1, mimetype: 'image/png', createdAt: 100 }, // 旧格式 → contract
      { name: '2-front-b.png', size: 2, mimetype: 'image/png', createdAt: 200 }, // slot 名
      { name: '2-back-c.png', size: 3, mimetype: 'image/png', createdAt: 201 }, // 同门店多 slot 合并
      { name: '3-__deleted__-999', size: 0, mimetype: 'text/plain', createdAt: 300 }, // 墓碑
      { name: '4-__deleted__', size: 0, mimetype: 'text/plain', createdAt: 301 }, // 旧格式墓碑 → MAX_SAFE_INTEGER
    ]
    const map = await backend.loadAll(['front', 'back'])
    expect(map.get(1)?.contract?.name).toBe('a.png')
    expect(map.get(1)?.slots?.front).toBeUndefined() // 旧格式归 contract，不进 front
    expect(map.get(2)?.slots?.front?.name).toBe('b.png')
    expect(map.get(2)?.slots?.back?.name).toBe('c.png')
    expect(backend.tombstones.get(3)?.ts).toBe(999)
    expect(backend.tombstones.get(4)?.ts).toBe(Number.MAX_SAFE_INTEGER)

    // 删除后重传：3 号既有墓碑又有新对象 → 墓碑作废 + 异步清残留对象
    tr.objects.push({ name: '3-front-d.png', size: 4, mimetype: 'image/png', createdAt: 400 })
    const map2 = await backend.loadAll(['front'])
    expect(map2.get(3)?.slots?.front?.name).toBe('d.png')
    expect(backend.tombstones.has(3)).toBe(false)
    // 墓碑对象删除是异步 fire-and-forget，等一下 microtask
    await new Promise((r) => setTimeout(r, 0))
    expect(tr.deletes).toContain('3-__deleted__-999')
  })

  it('loadAll：对象名 URI 解码失败跳过该条（warn 不崩）；正常编码名解码', async () => {
    const { backend, tr } = mk()
    tr.objects = [
      { name: '5-%zz-e.png', size: 1, mimetype: 'image/png', createdAt: 1 }, // %zz 非法 → 解码失败保留原串
      { name: '6-a%20f.png', size: 1, mimetype: 'image/png', createdAt: 2 }, // %20 合法 → 空格
    ]
    const warnSpy = vi.mocked(console.warn)
    const map = await backend.loadAll()
    expect(map.get(5)?.contract?.name).toBe('%zz-e.png') // 解码失败回退原串
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('URI 解码失败'), expect.anything())
    expect(map.get(6)?.contract?.name).toBe('a f.png')
  })

  it('saveRecord：data: URL 转 Blob 上传（Content-Type 取 blob.type）', async () => {
    const { backend, tr } = mk()
    await backend.saveRecord(1, {
      slots: { contract: { name: 'a.png', dataUrl: `data:image/png;base64,${b64}`, size: 4, type: 'image/png' } },
      ts: 1,
    })
    expect(tr.puts).toHaveLength(1)
    expect(tr.puts[0].name).toBe('1-a.png')
    expect(tr.puts[0].type).toBe('image/png')
    expect(tr.puts[0].body).toBeInstanceOf(Blob)
  })

  it('saveRecord：URL 引用抓取失败（404）→ 抛错不上传损坏对象', async () => {
    const { backend, tr } = mk()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob() }))
    await expect(
      backend.saveRecord(1, {
        slots: { contract: { name: 'a.png', dataUrl: 'https://cdn.example.com/a.png', size: 4, type: 'image/png' } },
        ts: 1,
      }),
    ).rejects.toThrow()
    expect(tr.puts).toHaveLength(0)
  })

  it('saveRecord：URL 引用抓取成功 → 上传抓取到的字节', async () => {
    const { backend, tr } = mk()
    const bytes = new Blob(['real-bytes'])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => bytes }))
    await backend.saveRecord(1, {
      slots: { contract: { name: 'a.png', dataUrl: 'https://cdn.example.com/a.png', size: 4, type: 'image/png' } },
      ts: 1,
    })
    expect(tr.puts[0].body).toBe(bytes)
  })

  it('saveRecord 删除场景：全部 slot 清空 → 按已知路径删对象 + 写墓碑（旧墓碑先清）', async () => {
    const { backend, tr } = mk()
    // 先传一次建立路径映射
    await backend.saveRecord(9, {
      slots: { contract: { name: 'a.png', dataUrl: `data:image/png;base64,${b64}`, size: 1, type: 'image/png' } },
      ts: 1,
    })
    await backend.saveRecord(9, { slots: {}, ts: 2 })
    const tomb = tr.puts.find((p) => p.name.startsWith(`9-${TOMBSTONE_MARKER}-`))
    expect(tomb).toBeDefined()
    // 墓碑名 9-__deleted__-<13位ms时间戳>：ts 合法且大于 2020 年
    expect(Number(tomb!.name.split('-').pop())).toBeGreaterThan(1_577_836_800_000)
    expect(tr.deletes).toContain('9-a.png')
  })

  it('saveRecord 删除场景：路径映射缺失时按 appleId 前缀列云端删除（跨设备/刷新后）', async () => {
    const { backend, tr } = mk()
    tr.objects = [
      { name: '10-x.png', size: 1, mimetype: 'image/png', createdAt: 1 },
      { name: '11-y.png', size: 1, mimetype: 'image/png', createdAt: 1 },
      { name: '10-__deleted__-5', size: 0, mimetype: 'text/plain', createdAt: 1 },
    ]
    await backend.saveRecord(10, { slots: {}, ts: 2 })
    // 自己的非墓碑对象删了；墓碑对象不当普通对象删；11 号不动
    expect(tr.deletes).toContain('10-x.png')
    expect(tr.deletes).not.toContain('10-__deleted__-5')
    expect(tr.deletes).not.toContain('11-y.png')
  })

  it('clearAll：部分删除失败 → warn 收集后整体抛错（不静默）', async () => {
    const { backend, tr } = mk()
    tr.objects = [
      { name: '1-a.png', size: 1, mimetype: 'image/png', createdAt: 1 },
      { name: '2-b.png', size: 1, mimetype: 'image/png', createdAt: 1 },
    ]
    tr.failDelete = ['1-a.png']
    const warnSpy = vi.mocked(console.warn)
    await expect(backend.clearAll()).rejects.toThrow()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('云端删除失败'), '1-a.png', expect.any(Error))
    expect(tr.deletes).toEqual(['1-a.png', '2-b.png']) // 失败的也记录，不中断后续
  })
})

// ---------- 工厂 / 校验 / env 默认 ----------

const validS3: S3Config = {
  endpoint: 'https://bkt.s3.bitiful.net',
  region: 'us-east-1',
  bucket: 'bkt',
  accessKeyId: 'AK',
  secretAccessKey: 'SK',
}

describe('工厂路由与校验', () => {
  it('createBackend：s3/supabase/local 三路由 kind 正确；非法配置在构造期抛错', () => {
    expect(createBackend({ ...emptyStorageConfig(), backend: 's3', ...validS3 } as never).kind).toBe('s3')
    expect(
      createBackend({
        ...emptyStorageConfig(),
        backend: 'supabase',
        url: 'https://x.supabase.co',
        anonKey: 'anon',
        bucket: 'b',
      } as never).kind,
    ).toBe('supabase')
    expect(createBackend(emptyStorageConfig()).kind).toBe('local')

    expect(() => createBackend({ ...emptyStorageConfig(), backend: 's3' } as never)).toThrow() // 缺 s3 必填
    expect(() =>
      createBackend({ ...emptyStorageConfig(), backend: 'supabase', url: '', anonKey: '', bucket: '' } as never),
    ).toThrow() // 缺 supabase 必填
  })

  it('validateStorageConfig：local 直接放行；s3/supabase 按各自必填校验', () => {
    expect(validateStorageConfig(emptyStorageConfig())).toBeNull()
    expect(validateStorageConfig({ ...emptyStorageConfig(), backend: 's3', ...validS3 })).toBeNull()
    expect(validateStorageConfig({ ...emptyStorageConfig(), backend: 's3', ...validS3, endpoint: '' })).toBeTruthy()
    const sb = { ...emptyStorageConfig(), backend: 'supabase' as const, url: 'https://x.supabase.co', anonKey: 'k', bucket: 'b' }
    expect(validateStorageConfig(sb)).toBeNull()
    expect(validateStorageConfig({ ...sb, url: '' })).toBeTruthy()
  })

  it('emptyStorageConfig：全空 local 起点', () => {
    expect(emptyStorageConfig()).toEqual({
      backend: 'local',
      url: '',
      anonKey: '',
      bucket: '',
      endpoint: '',
      region: '',
      accessKeyId: '',
      secretAccessKey: '',
    })
  })

  it('defaultStorageConfigFromEnv：S3 配齐优先 → Supabase 配齐次之 → 本地兜底', () => {
    // 场景 1：S3 五项配齐（supabase 键全部 undefined）
    vi.mocked(envValue).mockImplementation((k) => {
      const s3: Record<string, string> = {
        VITE_S3_ENDPOINT: 'https://e.s3.bitiful.net',
        VITE_S3_REGION: 'us-east-1',
        VITE_S3_BUCKET: 'b',
        VITE_S3_ACCESS_KEY_ID: 'AK',
        VITE_S3_SECRET_ACCESS_KEY: 'SK',
      }
      return s3[k] // 其它键 → undefined
    })
    const c1 = defaultStorageConfigFromEnv()
    expect(c1.backend).toBe('s3')
    expect(c1.endpoint).toBe('https://e.s3.bitiful.net')

    // 场景 2：S3 缺 SK → 回退 supabase（三项配齐）
    vi.mocked(envValue).mockImplementation((k) => {
      if (k === 'VITE_S3_ENDPOINT') return 'https://e' // 只给一项 → S3 不齐
      const sb: Record<string, string> = {
        VITE_SUPABASE_URL: 'https://s.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'k',
        VITE_SUPABASE_BUCKET: 'b',
      }
      return sb[k]
    })
    expect(defaultStorageConfigFromEnv().backend).toBe('supabase')

    // 场景 3：全空 → 本地兜底
    vi.mocked(envValue).mockReturnValue(undefined)
    expect(defaultStorageConfigFromEnv().backend).toBe('local')
  })
})
